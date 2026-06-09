package apicompat

import "encoding/json"

// MarshalJSON renders a ResponsesStreamEvent into its wire form.
//
// The OpenAI Responses streaming protocol mandates certain fields even at zero
// value: output_index/content_index/summary_index are meaningful at 0, a
// function_call item must always carry call_id/name/arguments (arguments may
// be ""), and a message item must carry content:[] with each output_text part
// including text/annotations/logprobs. Go's omitempty drops exactly those zero
// values, and strict clients (Codex CLI) reject items/deltas missing required
// fields.
//
// Instead of marshalling with omitempty and patching afterwards, each streamed
// event type is built explicitly here -- the Go equivalent of the reference
// gateways' per-event object construction. This is the single source of truth
// for Responses SSE field presence and applies to every emitter (Chat-to-
// Responses bridge and Anthropic-to-Responses converter).
//
// Event types not listed below fall through to default struct marshalling,
// bounding the blast radius to the streamed item/part/text/tool events.
func (e ResponsesStreamEvent) MarshalJSON() ([]byte, error) {
	switch e.Type {
	case "response.output_text.delta", "response.output_text.done":
		payload := e.basePayload()
		e.attachItemID(payload)
		payload["output_index"] = e.OutputIndex
		payload["content_index"] = e.ContentIndex
		if e.Type == "response.output_text.done" {
			payload["text"] = e.Text
		} else {
			payload["delta"] = e.Delta
		}
		return json.Marshal(payload)

	case "response.content_part.added", "response.content_part.done":
		payload := e.basePayload()
		e.attachItemID(payload)
		payload["output_index"] = e.OutputIndex
		payload["content_index"] = e.ContentIndex
		payload["part"] = buildOutputTextPart(e.Part)
		return json.Marshal(payload)

	case "response.reasoning_summary_text.delta", "response.reasoning_summary_text.done":
		payload := e.basePayload()
		e.attachItemID(payload)
		payload["output_index"] = e.OutputIndex
		payload["summary_index"] = e.SummaryIndex
		if e.Type == "response.reasoning_summary_text.done" {
			payload["text"] = e.Text
		} else {
			payload["delta"] = e.Delta
		}
		return json.Marshal(payload)

	case "response.reasoning_summary_part.added", "response.reasoning_summary_part.done":
		payload := e.basePayload()
		e.attachItemID(payload)
		payload["output_index"] = e.OutputIndex
		payload["summary_index"] = e.SummaryIndex
		payload["part"] = buildSummaryTextPart(e.Part)
		return json.Marshal(payload)

	case "response.output_item.added", "response.output_item.done":
		payload := e.basePayload()
		payload["output_index"] = e.OutputIndex
		payload["item"] = buildItemPayload(e.Item)
		return json.Marshal(payload)

	case "response.function_call_arguments.delta", "response.function_call_arguments.done":
		payload := e.basePayload()
		e.attachItemID(payload)
		payload["output_index"] = e.OutputIndex
		if e.CallID != "" {
			payload["call_id"] = e.CallID
		}
		if e.Name != "" {
			payload["name"] = e.Name
		}
		if e.Type == "response.function_call_arguments.done" {
			payload["arguments"] = e.Arguments
		} else {
			payload["delta"] = e.Delta
		}
		return json.Marshal(payload)

	default:
		// response.created / completed / done / failed / incomplete and any
		// event type not handled above keep the default struct marshalling.
		type alias ResponsesStreamEvent
		return json.Marshal(alias(e))
	}
}

func (e ResponsesStreamEvent) basePayload() map[string]any {
	return map[string]any{
		"type":            e.Type,
		"sequence_number": e.SequenceNumber,
	}
}

func (e ResponsesStreamEvent) attachItemID(dst map[string]any) {
	if e.ItemID != "" {
		dst["item_id"] = e.ItemID
	}
}

// buildOutputTextPart renders a content part for output_text, always carrying
// text/annotations/logprobs (matching the reference gateway's push_text_delta).
func buildOutputTextPart(part *ResponsesContentPart) map[string]any {
	partText := ""
	if part != nil {
		partText = part.Text
	}
	return map[string]any{
		"type":        "output_text",
		"text":        partText,
		"annotations": []any{},
		"logprobs":    []any{},
	}
}

// buildSummaryTextPart renders a reasoning summary part.
func buildSummaryTextPart(part *ResponsesContentPart) map[string]any {
	partText := ""
	if part != nil {
		partText = part.Text
	}
	return map[string]any{
		"type": "summary_text",
		"text": partText,
	}
}

// buildItemPayload renders an output_item with every field its type requires,
// including empty arrays/strings that omitempty would otherwise drop. Mirrors
// the reference gateway's response_function_call_item and the message/reasoning
// item shapes that Codex expects.
func buildItemPayload(item *ResponsesOutput) map[string]any {
	if item == nil {
		return map[string]any{}
	}

	out := map[string]any{
		"type": item.Type,
		"id":   item.ID,
	}
	if item.Status != "" {
		out["status"] = item.Status
	}

	switch item.Type {
	case "message":
		assignedRole := item.Role
		if assignedRole == "" {
			assignedRole = "assistant"
		}
		out["role"] = assignedRole
		out["content"] = buildMessageParts(item.Content)

	case "reasoning":
		out["summary"] = buildReasoningSummaryParts(item.Summary)
		if item.EncryptedContent != "" {
			out["encrypted_content"] = item.EncryptedContent
		}

	case "function_call":
		out["call_id"] = item.CallID
		out["name"] = item.Name
		out["arguments"] = item.Arguments
	}

	return out
}

// buildMessageParts renders a message item's content array; always an array
// (never null), with each output_text part carrying its text.
func buildMessageParts(parts []ResponsesContentPart) []map[string]any {
	result := make([]map[string]any, 0, len(parts))
	for _, p := range parts {
		partType := p.Type
		if partType == "" {
			partType = "output_text"
		}
		result = append(result, map[string]any{"type": partType, "text": p.Text})
	}
	return result
}

// buildReasoningSummaryParts renders a reasoning item's summary array; always an array.
func buildReasoningSummaryParts(entries []ResponsesSummary) []map[string]any {
	result := make([]map[string]any, 0, len(entries))
	for _, entry := range entries {
		entryType := entry.Type
		if entryType == "" {
			entryType = "summary_text"
		}
		result = append(result, map[string]any{"type": entryType, "text": entry.Text})
	}
	return result
}
