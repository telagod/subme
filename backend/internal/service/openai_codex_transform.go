package service

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/telagod/subme/internal/pkg/openai"
)

var codexModelMap = map[string]string{
	"gpt-5.5":                    "gpt-5.5",
	"codex-auto-review":          "codex-auto-review",
	"gpt-5.4":                    "gpt-5.4",
	"gpt-5.4-mini":               "gpt-5.4-mini",
	"gpt-5.4-none":               "gpt-5.4",
	"gpt-5.4-low":                "gpt-5.4",
	"gpt-5.4-medium":             "gpt-5.4",
	"gpt-5.4-high":               "gpt-5.4",
	"gpt-5.4-xhigh":              "gpt-5.4",
	"gpt-5.4-chat-latest":        "gpt-5.4",
	"gpt-5.3":                    "gpt-5.3-codex",
	"gpt-5.3-none":               "gpt-5.3-codex",
	"gpt-5.3-low":                "gpt-5.3-codex",
	"gpt-5.3-medium":             "gpt-5.3-codex",
	"gpt-5.3-high":               "gpt-5.3-codex",
	"gpt-5.3-xhigh":              "gpt-5.3-codex",
	"gpt-5.3-codex":              "gpt-5.3-codex",
	"gpt-5.3-codex-spark":        "gpt-5.3-codex-spark",
	"gpt-5.3-codex-spark-low":    "gpt-5.3-codex-spark",
	"gpt-5.3-codex-spark-medium": "gpt-5.3-codex-spark",
	"gpt-5.3-codex-spark-high":   "gpt-5.3-codex-spark",
	"gpt-5.3-codex-spark-xhigh":  "gpt-5.3-codex-spark",
	"gpt-5.3-codex-low":          "gpt-5.3-codex",
	"gpt-5.3-codex-medium":       "gpt-5.3-codex",
	"gpt-5.3-codex-high":         "gpt-5.3-codex",
	"gpt-5.3-codex-xhigh":        "gpt-5.3-codex",
	"gpt-5.2":                    "gpt-5.2",
	"gpt-5.2-none":               "gpt-5.2",
	"gpt-5.2-low":                "gpt-5.2",
	"gpt-5.2-medium":             "gpt-5.2",
	"gpt-5.2-high":               "gpt-5.2",
	"gpt-5.2-xhigh":              "gpt-5.2",
	"gpt-5":                      "gpt-5.4",
	"gpt-5-mini":                 "gpt-5.4",
	"gpt-5-nano":                 "gpt-5.4",
	"gpt-5.1":                    "gpt-5.4",
	"gpt-5.1-codex":              "gpt-5.3-codex",
	"gpt-5.1-codex-max":          "gpt-5.3-codex",
	"gpt-5.1-codex-mini":         "gpt-5.3-codex",
	"gpt-5.2-codex":              "gpt-5.2",
	"codex-mini-latest":          "gpt-5.3-codex",
	"gpt-5-codex":                "gpt-5.3-codex",
}

var codexVersionModelPrefixes = []struct {
	prefix string
	target string
}{
	{prefix: "gpt-5.3-codex-spark", target: "gpt-5.3-codex-spark"},
	{prefix: "gpt-5.3-codex", target: "gpt-5.3-codex"},
	{prefix: "gpt-5.4-mini", target: "gpt-5.4-mini"},
	{prefix: "gpt-5.4-nano", target: "gpt-5.4-nano"},
	{prefix: "gpt-5.5", target: "gpt-5.5"},
	{prefix: "gpt-5.4", target: "gpt-5.4"},
	{prefix: "gpt-5.2", target: "gpt-5.2"},
}

type codexTransformResult struct {
	Modified        bool
	NormalizedModel string
	PromptCacheKey  string
}

type codexOAuthTransformOptions struct {
	IsCodexCLI              bool
	IsCompact               bool
	SkipDefaultInstructions bool
	PreserveToolCallIDs     bool
}

const (
	codexImageGenerationBridgeMarker = "<sub2api-codex-image-generation>"
	codexImageGenerationBridgeText   = codexImageGenerationBridgeMarker + "\nWhen the user asks for raster image generation or editing, use the OpenAI Responses native `image_generation` tool attached to this request. The local Codex client may not expose an `image_gen` namespace, but that does not mean image generation is unavailable. Do not ask the user to switch to CLI fallback solely because `image_gen` is absent.\n</sub2api-codex-image-generation>"
	codexSparkImageUnsupportedMarker = "<sub2api-codex-spark-image-unsupported>"
	codexSparkImageUnsupportedText   = codexSparkImageUnsupportedMarker + "\nThe current model is gpt-5.3-codex-spark, which does not support image generation, image editing, image input, the `image_generation` tool, or Codex `image_gen`/`$imagegen` workflows. If the user asks for image generation or image editing, clearly explain this model limitation and ask them to switch to a non-Spark Codex model such as gpt-5.3-codex or gpt-5.4. Do not claim that the local environment merely lacks image_gen tooling, and do not suggest CLI fallback as the primary fix while the model remains Spark.\n</sub2api-codex-spark-image-unsupported>"
)

var openAIChatGPTInternalUnsupportedFields = []string{
	"user",
	"metadata",
	"prompt_cache_retention",
	"safety_identifier",
	"stream_options",
}

var openAICodexOAuthUnsupportedFields = append([]string{
	"max_output_tokens",
	"max_completion_tokens",
	"temperature",
	"top_p",
	"frequency_penalty",
	"presence_penalty",
}, openAIChatGPTInternalUnsupportedFields...)

func applyCodexOAuthTransform(reqBody map[string]any, isCodexCLI bool, isCompact bool) codexTransformResult {
	return codexOAuthTransform(reqBody, codexOAuthTransformOptions{
		IsCodexCLI: isCodexCLI,
		IsCompact:  isCompact,
	})
}

func codexOAuthTransform(reqBody map[string]any, opts codexOAuthTransformOptions) codexTransformResult {
	outcome := codexTransformResult{}
	// Check whether tool continuation is needed (affects store policy and input filtering).
	wantsToolContinuation := NeedsToolContinuation(reqBody)

	rawModel := ""
	if s, ok := reqBody["model"].(string); ok {
		rawModel = s
	}
	cleanModel := strings.TrimSpace(rawModel)
	if cleanModel != "" {
		if rawModel != cleanModel {
			reqBody["model"] = cleanModel
			outcome.Modified = true
		}
		outcome.NormalizedModel = cleanModel
	}

	if opts.IsCompact {
		if _, exists := reqBody["store"]; exists {
			delete(reqBody, "store")
			outcome.Modified = true
		}
		if _, exists := reqBody["stream"]; exists {
			delete(reqBody, "stream")
			outcome.Modified = true
		}
	} else {
		// OAuth through the ChatGPT internal API requires store=false; any explicit
		// true value is overridden to prevent "Store must be set to false" errors.
		if flag, ok := reqBody["store"].(bool); !ok || flag {
			reqBody["store"] = false
			outcome.Modified = true
		}
		if flag, ok := reqBody["stream"].(bool); !ok || !flag {
			reqBody["stream"] = true
			outcome.Modified = true
		}
	}

	// Remove parameters the ChatGPT internal Codex endpoint does not accept.
	for _, unsupported := range openAICodexOAuthUnsupportedFields {
		if _, exists := reqBody[unsupported]; exists {
			delete(reqBody, unsupported)
			outcome.Modified = true
		}
	}

	// When the request includes reasoning, inject include:["reasoning.encrypted_content"]
	// to match real Codex behavior (compact format is handled separately).
	if !opts.IsCompact && injectReasoningEncryptedContent(reqBody) {
		outcome.Modified = true
	}

	// Convert legacy functions/function_call into tools/tool_choice.
	if legacyFuncs, ok := reqBody["functions"]; ok {
		if funcsArr, isArr := legacyFuncs.([]any); isArr {
			converted := make([]any, 0, len(funcsArr))
			for _, fn := range funcsArr {
				converted = append(converted, map[string]any{
					"type":     "function",
					"function": fn,
				})
			}
			reqBody["tools"] = converted
		}
		delete(reqBody, "functions")
		outcome.Modified = true
	}

	if legacyFC, ok := reqBody["function_call"]; ok {
		if fcName, isStr := legacyFC.(string); isStr {
			reqBody["tool_choice"] = fcName
		} else if fcObj, isMap := legacyFC.(map[string]any); isMap {
			if fnName, ok := fcObj["name"].(string); ok && strings.TrimSpace(fnName) != "" {
				reqBody["tool_choice"] = map[string]any{
					"type": "function",
					"name": fnName,
				}
			}
		}
		delete(reqBody, "function_call")
		outcome.Modified = true
	}

	if unifyCodexTools(reqBody) {
		outcome.Modified = true
	}
	if rectifyCodexToolChoice(reqBody) {
		outcome.Modified = true
	}

	if cacheKey, ok := reqBody["prompt_cache_key"].(string); ok {
		outcome.PromptCacheKey = strings.TrimSpace(cacheKey)
		if isOpenAICompatMessagesBridgeRequestBody(reqBody) {
			delete(reqBody, "prompt_cache_key")
			outcome.Modified = true
		}
	}

	// Extract system-role messages from input into instructions (OAuth upstream
	// does not support the system role directly).
	if hoistSystemMessagesToInstructions(reqBody) {
		outcome.Modified = true
	}

	// Fill in default instructions when absent.
	if !opts.SkipDefaultInstructions && ensureInstructions(reqBody, opts.IsCodexCLI) {
		outcome.Modified = true
	}
	if isSparkModel(cleanModel) && appendSparkImageWarning(reqBody) {
		outcome.Modified = true
	}

	// Normalize tool-role messages and sanitize content text in input items.
	// Continuation scenarios preserve item_reference and id for call-id context.
	if inputSlice, ok := reqBody["input"].([]any); ok {
		if cleaned, changed := normalizeToolRoleItems(inputSlice); changed {
			inputSlice = cleaned
			outcome.Modified = true
		}
		if cleaned, changed := coerceContentTextToString(inputSlice); changed {
			inputSlice = cleaned
			outcome.Modified = true
		}
		inputSlice = filterInputItemsV2(inputSlice, codexInputFilterOptions{
			PreserveReferences: wantsToolContinuation,
			PreserveCallIDs:    opts.PreserveToolCallIDs,
		})
		reqBody["input"] = inputSlice
		outcome.Modified = true
	} else if inputText, ok := reqBody["input"].(string); ok {
		// The ChatGPT codex endpoint requires input to be an array, not a string.
		trimmed := strings.TrimSpace(inputText)
		if trimmed != "" {
			reqBody["input"] = []any{
				map[string]any{
					"type":    "message",
					"role":    "user",
					"content": inputText,
				},
			}
		} else {
			reqBody["input"] = []any{}
		}
		outcome.Modified = true
	}

	return outcome
}

func rectifyCodexToolChoice(reqBody map[string]any) bool {
	raw, exists := reqBody["tool_choice"]
	if !exists || raw == nil {
		return false
	}
	choiceMap, isMap := raw.(map[string]any)
	if !isMap {
		return false
	}
	choiceType := strings.TrimSpace(firstNonEmptyString(choiceMap["type"]))
	if choiceType == "" {
		return false
	}
	changed := false
	if choiceType == "function" {
		fnName := strings.TrimSpace(firstNonEmptyString(choiceMap["name"]))
		if fnName == "" {
			if fnDef, ok := choiceMap["function"].(map[string]any); ok {
				fnName = strings.TrimSpace(firstNonEmptyString(fnDef["name"]))
			}
		}
		if fnName == "" {
			reqBody["tool_choice"] = "auto"
			return true
		}
		if strings.TrimSpace(firstNonEmptyString(choiceMap["name"])) != fnName {
			choiceMap["name"] = fnName
			changed = true
		}
		if _, hasFn := choiceMap["function"]; hasFn {
			delete(choiceMap, "function")
			changed = true
		}
		if !toolsContainFunctionByName(reqBody["tools"], fnName) {
			reqBody["tool_choice"] = "auto"
			return true
		}
		return changed
	}
	if toolsContainByType(reqBody["tools"], choiceType) {
		return changed
	}
	reqBody["tool_choice"] = "auto"
	return true
}

// sanitizeCodexToolChoice is retained for backward compat.

func toolsContainByType(rawTools any, targetType string) bool {
	toolsArr, ok := rawTools.([]any)
	if !ok || strings.TrimSpace(targetType) == "" {
		return false
	}
	for _, raw := range toolsArr {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(firstNonEmptyString(m["type"])) == targetType {
			return true
		}
	}
	return false
}

// codexToolsContainTypeV2 is retained for backward compat.

func toolsContainFunctionByName(rawTools any, targetName string) bool {
	toolsArr, ok := rawTools.([]any)
	if !ok || strings.TrimSpace(targetName) == "" {
		return false
	}
	normalizedTarget := strings.TrimSpace(targetName)
	for _, raw := range toolsArr {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(firstNonEmptyString(m["type"])) != "function" {
			continue
		}
		candidate := strings.TrimSpace(firstNonEmptyString(m["name"]))
		if candidate == "" {
			if fnDef, ok := m["function"].(map[string]any); ok {
				candidate = strings.TrimSpace(firstNonEmptyString(fnDef["name"]))
			}
		}
		if candidate == normalizedTarget {
			return true
		}
	}
	return false
}

// codexToolsContainFunctionNameV2 is retained for backward compat.

func normalizeToolRoleItems(items []any) ([]any, bool) {
	if len(items) == 0 {
		return items, false
	}

	changed := false
	out := make([]any, 0, len(items))
	for _, raw := range items {
		m, ok := raw.(map[string]any)
		if !ok {
			out = append(out, raw)
			continue
		}
		role, _ := m["role"].(string)
		if strings.TrimSpace(role) != "tool" {
			out = append(out, raw)
			continue
		}

		callID := firstNonEmptyString(m["call_id"], m["tool_call_id"], m["id"])
		callID = strings.TrimSpace(callID)
		if callID == "" {
			// The Responses API does not accept role:"tool". Without a call id
			// we re-tag the message as user role to avoid invalid input.
			retagged := make(map[string]any, len(m))
			for k, v := range m {
				retagged[k] = v
			}
			retagged["role"] = "user"
			delete(retagged, "tool_call_id")
			out = append(out, retagged)
			changed = true
			continue
		}

		body := extractTextFromContent(m["content"])
		if body == "" {
			if s, ok := m["output"].(string); ok {
				body = s
			}
		}
		if body == "" && m["content"] != nil {
			if encoded, encErr := json.Marshal(m["content"]); encErr == nil {
				body = string(encoded)
			}
		}

		out = append(out, map[string]any{
			"type":    "function_call_output",
			"call_id": callID,
			"output":  body,
		})
		changed = true
	}
	if !changed {
		return items, false
	}
	return out, true
}

// sanitizeCodexToolRoleMessages is retained for backward compat.

func coerceContentTextToString(items []any) ([]any, bool) {
	if len(items) == 0 {
		return items, false
	}

	changed := false
	out := make([]any, 0, len(items))
	for _, raw := range items {
		m, ok := raw.(map[string]any)
		if !ok || strings.TrimSpace(firstNonEmptyString(m["type"])) != "message" {
			out = append(out, raw)
			continue
		}
		contentParts, ok := m["content"].([]any)
		if !ok {
			out = append(out, raw)
			continue
		}

		var clonedItem map[string]any
		var clonedParts []any
		lazyClone := func() {
			if clonedItem != nil {
				return
			}
			clonedItem = make(map[string]any, len(m))
			for k, v := range m {
				clonedItem[k] = v
			}
			clonedParts = make([]any, len(contentParts))
			copy(clonedParts, contentParts)
		}

		for idx, rawPart := range contentParts {
			partMap, ok := rawPart.(map[string]any)
			if !ok {
				continue
			}
			textVal, hasText := partMap["text"]
			if !hasText {
				continue
			}
			if _, isStr := textVal.(string); isStr {
				continue
			}

			lazyClone()
			patchedPart := make(map[string]any, len(partMap))
			for k, v := range partMap {
				patchedPart[k] = v
			}
			patchedPart["text"] = coerceToString(textVal)
			clonedParts[idx] = patchedPart
			changed = true
		}

		if clonedItem != nil {
			clonedItem["content"] = clonedParts
			out = append(out, clonedItem)
			continue
		}
		out = append(out, raw)
	}
	if !changed {
		return items, false
	}
	return out, true
}

// sanitizeCodexMessageContentText is retained for backward compat.

func coerceToString(val any) string {
	switch typed := val.(type) {
	case string:
		return typed
	case nil:
		return ""
	default:
		if encoded, encErr := json.Marshal(typed); encErr == nil {
			return string(encoded)
		}
		return fmt.Sprint(typed)
	}
}

// stringifyCodexContentTextV2 is retained for backward compat.

func normalizeCodexModel(model string) string {
	model = strings.TrimSpace(model)
	if model == "" {
		return "gpt-5.4"
	}
	if resolved, ok := resolveKnownCodexModel(model); ok {
		return resolved
	}
	return model
}

func resolveKnownCodexModel(model string) (string, bool) {
	model = strings.TrimSpace(model)
	if model == "" {
		return "", false
	}
	if isOpenAIImageGenerationModel(model) {
		return model, true
	}

	modelID := lastOpenAIModelSegment(model)

	if canonical := canonicalizeOpenAIModelAliasSpelling(modelID); canonical != "" {
		modelID = canonical
	}
	if resolved := normalizeKnownOpenAICodexModel(modelID); resolved != "" {
		return resolved, true
	}
	lookupKey := buildCodexLookupKey(modelID)
	if lookupKey == "" {
		return "", false
	}
	if resolved := lookupCodexModelByKey(lookupKey); resolved != "" {
		return resolved, true
	}
	for _, entry := range codexVersionModelPrefixes {
		if lookupKey == entry.prefix {
			return entry.target, true
		}
		remainder, matched := strings.CutPrefix(lookupKey, entry.prefix+"-")
		if matched && isRecognizedCodexSuffix(remainder) {
			return entry.target, true
		}
	}
	return "", false
}

// sanitizeKnownCodexModel is retained for backward compat.

func buildCodexLookupKey(modelID string) string {
	modelID = strings.TrimSpace(modelID)
	if modelID == "" {
		return ""
	}
	if slashIdx := strings.LastIndex(modelID, "/"); slashIdx >= 0 {
		modelID = modelID[slashIdx+1:]
	}
	return strings.ToLower(strings.Join(strings.Fields(modelID), "-"))
}

// codexModelLookupKeyV2 is retained for backward compat.

func isRecognizedCodexSuffix(suffix string) bool {
	switch suffix {
	case "none", "minimal", "low", "medium", "high", "xhigh":
		return true
	}
	return isDateLikeSuffix(suffix)
}

// checkKnownCodexModelSuffix is retained for backward compat.

func isDateLikeSuffix(suffix string) bool {
	segments := strings.Split(suffix, "-")
	if len(segments) != 3 || len(segments[0]) != 4 || len(segments[1]) != 2 || len(segments[2]) != 2 {
		return false
	}
	for _, seg := range segments {
		for _, ch := range seg {
			if ch < '0' || ch > '9' {
				return false
			}
		}
	}
	return true
}

// checkCodexDateSuffix is retained for backward compat.

func isSparkModel(model string) bool {
	return normalizeCodexModel(model) == "gpt-5.3-codex-spark"
}

// checkCodexSparkModel is retained for backward compat.
func checkCodexSparkModel(model string) bool {
	return isSparkModel(model)
}

func containsImageGenerationTool(reqBody map[string]any) bool {
	rawTools, ok := reqBody["tools"]
	if !ok || rawTools == nil {
		return false
	}
	toolsArr, ok := rawTools.([]any)
	if !ok {
		return false
	}
	for _, raw := range toolsArr {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(firstNonEmptyString(m["type"])) == "image_generation" {
			return true
		}
	}
	return false
}

// hasOpenAIImageGenerationToolV2 is retained for backward compat.
func hasOpenAIImageGenerationToolV2(reqBody map[string]any) bool {
	return containsImageGenerationTool(reqBody)
}

func inputContainsImage(reqBody map[string]any) bool {
	if reqBody == nil {
		return false
	}
	return valueContainsImage(reqBody["input"]) || valueContainsImage(reqBody["messages"])
}

// hasOpenAIInputImageV2 is retained for backward compat.

func valueContainsImage(val any) bool {
	switch typed := val.(type) {
	case []any:
		for _, element := range typed {
			if valueContainsImage(element) {
				return true
			}
		}
	case map[string]any:
		if strings.TrimSpace(firstNonEmptyString(typed["type"])) == "input_image" {
			return true
		}
		if _, hasImgURL := typed["image_url"]; hasImgURL {
			return true
		}
		return valueContainsImage(typed["content"])
	}
	return false
}

// hasOpenAIInputImageValueV2 is retained for backward compat.

func verifyCodexSparkInput(reqBody map[string]any, model string) error {
	if !isSparkModel(model) || !inputContainsImage(reqBody) {
		return nil
	}
	return fmt.Errorf("model %q does not support image input", strings.TrimSpace(model))
}

func sanitizeOpenAIResponsesImageGenerationTools(reqBody map[string]any) bool {
	rawTools, ok := reqBody["tools"]
	if !ok || rawTools == nil {
		return false
	}
	toolsArr, ok := rawTools.([]any)
	if !ok {
		return false
	}

	changed := false
	for _, raw := range toolsArr {
		m, ok := raw.(map[string]any)
		if !ok || strings.TrimSpace(firstNonEmptyString(m["type"])) != "image_generation" {
			continue
		}
		if _, has := m["output_format"]; !has {
			if v := strings.TrimSpace(firstNonEmptyString(m["format"])); v != "" {
				m["output_format"] = v
				changed = true
			}
		}
		if _, has := m["output_compression"]; !has {
			if v, exists := m["compression"]; exists && v != nil {
				m["output_compression"] = v
				changed = true
			}
		}
		if _, has := m["format"]; has {
			delete(m, "format")
			changed = true
		}
		if _, has := m["compression"]; has {
			delete(m, "compression")
			changed = true
		}
	}
	return changed
}

func requireOpenAIResponsesImageGenerationTool(reqBody map[string]any) bool {
	if len(reqBody) == 0 {
		return false
	}
	if isSparkModel(firstNonEmptyString(reqBody["model"])) {
		return false
	}

	defaultTool := map[string]any{
		"type":          "image_generation",
		"output_format": "png",
	}

	rawTools, ok := reqBody["tools"]
	if !ok || rawTools == nil {
		reqBody["tools"] = []any{defaultTool}
		return true
	}

	toolsArr, ok := rawTools.([]any)
	if !ok {
		reqBody["tools"] = []any{defaultTool}
		return true
	}
	for _, raw := range toolsArr {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(firstNonEmptyString(m["type"])) == "image_generation" {
			return false
		}
	}

	reqBody["tools"] = append(toolsArr, defaultTool)
	return true
}

func injectCodexImageBridge(reqBody map[string]any) bool {
	if len(reqBody) == 0 || !containsImageGenerationTool(reqBody) {
		return false
	}
	if isSparkModel(firstNonEmptyString(reqBody["model"])) {
		return false
	}

	current, _ := reqBody["instructions"].(string)
	if strings.Contains(current, codexImageGenerationBridgeMarker) {
		return false
	}

	current = strings.TrimRight(current, " \t\r\n")
	if strings.TrimSpace(current) == "" {
		reqBody["instructions"] = codexImageGenerationBridgeText
		return true
	}

	reqBody["instructions"] = current + "\n\n" + codexImageGenerationBridgeText
	return true
}

func appendSparkImageWarning(reqBody map[string]any) bool {
	if len(reqBody) == 0 {
		return false
	}
	current, _ := reqBody["instructions"].(string)
	if strings.Contains(current, codexSparkImageUnsupportedMarker) {
		return false
	}
	current = strings.TrimRight(current, " \t\r\n")
	if strings.TrimSpace(current) == "" {
		reqBody["instructions"] = codexSparkImageUnsupportedText
		return true
	}
	reqBody["instructions"] = current + "\n\n" + codexSparkImageUnsupportedText
	return true
}

// injectCodexSparkBlock is retained for backward compat.

func verifyOpenAIResponsesImageModel(reqBody map[string]any, model string) error {
	if !containsImageGenerationTool(reqBody) {
		return nil
	}
	model = strings.TrimSpace(model)
	if !isOpenAIImageGenerationModel(model) {
		return nil
	}
	return fmt.Errorf("/v1/responses image_generation requests require a Responses-capable text model; image-only model %q is not allowed", model)
}

func sanitizeOpenAIResponsesImageOnlyModel(reqBody map[string]any) bool {
	if len(reqBody) == 0 {
		return false
	}
	imgModel := strings.TrimSpace(firstNonEmptyString(reqBody["model"]))
	if !isOpenAIImageGenerationModel(imgModel) {
		return false
	}

	changed := false
	toolsArr, _ := reqBody["tools"].([]any)
	imgToolIdx := -1
	for idx, raw := range toolsArr {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(firstNonEmptyString(m["type"])) == "image_generation" {
			imgToolIdx = idx
			break
		}
	}
	if imgToolIdx < 0 {
		toolsArr = append(toolsArr, map[string]any{
			"type":  "image_generation",
			"model": imgModel,
		})
		imgToolIdx = len(toolsArr) - 1
		reqBody["tools"] = toolsArr
		changed = true
	}

	if m, ok := toolsArr[imgToolIdx].(map[string]any); ok {
		if strings.TrimSpace(firstNonEmptyString(m["model"])) == "" {
			m["model"] = imgModel
			changed = true
		}
		migrateKeys := []string{
			"size",
			"quality",
			"background",
			"output_format",
			"output_compression",
			"moderation",
			"style",
			"partial_images",
		}
		for _, k := range migrateKeys {
			if v, exists := reqBody[k]; exists && v != nil {
				if _, toolHas := m[k]; !toolHas {
					m[k] = v
				}
				delete(reqBody, k)
				changed = true
			}
		}
	}

	if promptText := strings.TrimSpace(firstNonEmptyString(reqBody["prompt"])); promptText != "" {
		if _, hasInput := reqBody["input"]; !hasInput {
			reqBody["input"] = promptText
		}
		delete(reqBody, "prompt")
		changed = true
	}

	if _, hasChoice := reqBody["tool_choice"]; !hasChoice {
		reqBody["tool_choice"] = map[string]any{"type": "image_generation"}
		changed = true
	}
	if imgModel != openAIImagesResponsesMainModel {
		changed = true
	}
	reqBody["model"] = openAIImagesResponsesMainModel
	return changed
}

func normalizeOpenAIModelForUpstream(account *Account, model string) string {
	if account == nil || account.Type == AccountTypeOAuth {
		return normalizeCodexModel(model)
	}
	return strings.TrimSpace(model)
}

func SupportsVerbosity(model string) bool {
	if !strings.HasPrefix(model, "gpt-") {
		return true
	}

	var majorVer, minorVer int
	n, _ := fmt.Sscanf(model, "gpt-%d.%d", &majorVer, &minorVer)

	if majorVer > 5 {
		return true
	}
	if majorVer < 5 {
		return false
	}

	// gpt-5 (no minor version)
	if n == 1 {
		return true
	}

	return minorVer >= 3
}

func lookupCodexModelByKey(key string) string {
	normalizedKey := buildCodexLookupKey(key)
	if normalizedKey == "" {
		return ""
	}
	if resolved, ok := codexModelMap[normalizedKey]; ok {
		return resolved
	}
	return ""
}

// getNormalizedCodexModel is retained for backward compat.
func getNormalizedCodexModel(modelID string) string {
	return lookupCodexModelByKey(modelID)
}

// extractTextFromContent pulls plain text from a content value that is either
// a Go string or a []any of text-like content-part maps.
func extractTextFromContent(content any) string {
	switch typed := content.(type) {
	case string:
		return typed
	case []any:
		var fragments []string
		for _, part := range typed {
			m, ok := part.(map[string]any)
			if !ok {
				continue
			}
			switch t, _ := m["type"].(string); t {
			case "text", "input_text", "output_text":
				if text, ok := m["text"].(string); ok {
					fragments = append(fragments, text)
				}
			}
		}
		return strings.Join(fragments, "")
	default:
		return ""
	}
}

// extractSystemMessagesFromInput scans the input array for items with role=="system",
// removes them, and merges their content into reqBody["instructions"].
func extractSystemMessagesFromInput(reqBody map[string]any) bool {
	return hoistSystemMessagesToInstructions(reqBody)
}

func hoistSystemMessagesToInstructions(reqBody map[string]any) bool {
	inputSlice, ok := reqBody["input"].([]any)
	if !ok || len(inputSlice) == 0 {
		return false
	}

	var systemFragments []string
	kept := make([]any, 0, len(inputSlice))

	for _, raw := range inputSlice {
		m, ok := raw.(map[string]any)
		if !ok {
			kept = append(kept, raw)
			continue
		}
		if role, _ := m["role"].(string); role != "system" {
			kept = append(kept, raw)
			continue
		}
		if text := extractTextFromContent(m["content"]); text != "" {
			systemFragments = append(systemFragments, text)
		}
	}

	if len(systemFragments) == 0 {
		return false
	}

	joined := strings.Join(systemFragments, "\n\n")
	if current, ok := reqBody["instructions"].(string); ok && strings.TrimSpace(current) != "" {
		reqBody["instructions"] = joined + "\n\n" + current
	} else {
		reqBody["instructions"] = joined
	}
	reqBody["input"] = kept
	return true
}

func pullPromptLikeInstructionsFromInput(reqBody map[string]any) string {
	inputSlice, ok := reqBody["input"].([]any)
	if !ok || len(inputSlice) == 0 {
		return ""
	}
	var fragments []string
	for _, raw := range inputSlice {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		role, _ := m["role"].(string)
		switch role {
		case "developer", "system":
			if text := strings.TrimSpace(extractTextFromContent(m["content"])); text != "" {
				fragments = append(fragments, text)
			}
		}
	}
	return strings.Join(fragments, "\n\n")
}

// fallbackCodexSynthInstructions returns the default instructions to use when
// the synth path has an empty instructions field. It selects the appropriate
// Codex CLI base instructions by model family.
func fallbackCodexSynthInstructions(model string) string {
	if text := strings.TrimSpace(openai.CodexBaseInstructionsForModel(model)); text != "" {
		return text
	}
	return "You are a helpful coding assistant."
}

// injectReasoningEncryptedContent ensures the include array contains
// "reasoning.encrypted_content" when the request carries a reasoning field.
// Additive and idempotent.
func injectReasoningEncryptedContent(reqBody map[string]any) bool {
	return requireCodexReasoningInclude(reqBody)
}

func requireCodexReasoningInclude(reqBody map[string]any) bool {
	reasoningMap, ok := reqBody["reasoning"].(map[string]any)
	if !ok || len(reasoningMap) == 0 {
		return false
	}
	const encryptedKey = "reasoning.encrypted_content"
	switch existing := reqBody["include"].(type) {
	case nil:
		reqBody["include"] = []any{encryptedKey}
		return true
	case []any:
		for _, elem := range existing {
			if s, ok := elem.(string); ok && s == encryptedKey {
				return false
			}
		}
		reqBody["include"] = append(existing, encryptedKey)
		return true
	default:
		// Non-array include is left untouched to avoid breaking caller intent.
		return false
	}
}

// injectCodexMeta injects client_metadata["x-codex-installation-id"] using the
// account's device ID. Additive and idempotent.
func injectCodexMeta(reqBody map[string]any, account *Account) bool {
	if account == nil {
		return false
	}
	devID := strings.TrimSpace(account.GetOpenAIDeviceID())
	if devID == "" {
		return false
	}
	const metaKey = "x-codex-installation-id"
	switch existing := reqBody["client_metadata"].(type) {
	case map[string]any:
		if s, ok := existing[metaKey].(string); ok && strings.TrimSpace(s) != "" {
			return false
		}
		existing[metaKey] = devID
		reqBody["client_metadata"] = existing
		return true
	case map[string]string:
		if strings.TrimSpace(existing[metaKey]) != "" {
			return false
		}
		upgraded := make(map[string]any, len(existing)+1)
		for k, v := range existing {
			upgraded[k] = v
		}
		upgraded[metaKey] = devID
		reqBody["client_metadata"] = upgraded
		return true
	case nil:
		reqBody["client_metadata"] = map[string]any{metaKey: devID}
		return true
	default:
		return false
	}
}

// ensureInstructions fills in default instructions when the field is absent or blank.
func ensureInstructions(reqBody map[string]any, isCodexCLI bool) bool {
	if !instructionsAreBlank(reqBody) {
		return false
	}
	model, _ := reqBody["model"].(string)
	reqBody["instructions"] = fallbackCodexSynthInstructions(model)
	return true
}

// applyInstructions is retained for backward compat.

func instructionsAreBlank(reqBody map[string]any) bool {
	raw, exists := reqBody["instructions"]
	if !exists || raw == nil {
		return true
	}
	s, ok := raw.(string)
	if !ok {
		return true
	}
	return strings.TrimSpace(s) == ""
}

// isInstructionsEmpty is retained for backward compat.
func isInstructionsEmpty(reqBody map[string]any) bool {
	return instructionsAreBlank(reqBody)
}

type codexInputFilterOptions struct {
	PreserveReferences bool
	PreserveCallIDs    bool
}

// filterCodexInput filters item_reference and id based on context needs.
func filterCodexInput(input []any, preserveReferences bool) []any {
	return filterInputItemsV2(input, codexInputFilterOptions{
		PreserveReferences: preserveReferences,
	})
}

func filterInputItemsV2(items []any, opts codexInputFilterOptions) []any {
	filtered := make([]any, 0, len(items))
	for _, raw := range items {
		m, ok := raw.(map[string]any)
		if !ok {
			filtered = append(filtered, raw)
			continue
		}
		itemType, _ := m["type"].(string)

		// The OAuth path forces store=false, so reasoning items cannot be
		// replayed upstream (rs_* references will 404). Drop them.
		if itemType == "reasoning" {
			continue
		}

		// Normalize call IDs: convert call_* prefix to fc_* unless preservation
		// is requested. Only applies to tool/function call items, not generic
		// messages whose id happens to start with call_.
		rewriteCallID := func(id string) string {
			if opts.PreserveCallIDs {
				return id
			}
			if id == "" || strings.HasPrefix(id, "fc") {
				return id
			}
			if strings.HasPrefix(id, "call_") {
				return "fc_" + strings.TrimPrefix(id, "call_")
			}
			return "fc_" + id
		}

		if itemType == "item_reference" {
			if !opts.PreserveReferences {
				continue
			}
			dup := make(map[string]any, len(m))
			for k, v := range m {
				dup[k] = v
			}
			if refID, ok := dup["id"].(string); ok && strings.HasPrefix(refID, "call_") {
				dup["id"] = rewriteCallID(refID)
			}
			filtered = append(filtered, dup)
			continue
		}

		current := m
		cloned := false
		lazyClone := func() {
			if cloned {
				return
			}
			current = make(map[string]any, len(m))
			for k, v := range m {
				current[k] = v
			}
			cloned = true
		}

		if isToolCallItemType(itemType) {
			cid, ok := m["call_id"].(string)
			if !ok || strings.TrimSpace(cid) == "" {
				if id, ok := m["id"].(string); ok && strings.TrimSpace(id) != "" {
					cid = id
					lazyClone()
					current["call_id"] = cid
				}
			}

			if cid != "" {
				rewritten := rewriteCallID(cid)
				if rewritten != cid {
					lazyClone()
					current["call_id"] = rewritten
				}
			}
		}

		if !isToolCallItemType(itemType) {
			lazyClone()
			delete(current, "call_id")
		}

		if itemTypeNeedsName(itemType) {
			if strings.TrimSpace(firstNonEmptyString(m["name"])) == "" {
				candidate := firstNonEmptyString(m["tool_name"])
				if candidate == "" {
					if fnDef, ok := m["function"].(map[string]any); ok {
						candidate = firstNonEmptyString(fnDef["name"])
					}
				}
				if candidate == "" {
					candidate = "tool"
				}
				lazyClone()
				current["name"] = candidate
			}
		}

		if !opts.PreserveReferences {
			lazyClone()
			delete(current, "id")
		}

		filtered = append(filtered, current)
	}
	return filtered
}

// filterCodexInputWithOptionsV2 is retained for backward compat.

func isToolCallItemType(typ string) bool {
	switch typ {
	case "function_call",
		"tool_call",
		"local_shell_call",
		"tool_search_call",
		"custom_tool_call",
		"mcp_tool_call",
		"function_call_output",
		"mcp_tool_call_output",
		"custom_tool_call_output",
		"tool_search_output":
		return true
	default:
		return false
	}
}

// isCodexToolCallItemType is retained for backward compat.
func isCodexToolCallItemType(typ string) bool {
	return isToolCallItemType(typ)
}

func itemTypeNeedsName(typ string) bool {
	switch strings.TrimSpace(typ) {
	case "function_call", "custom_tool_call", "mcp_tool_call":
		return true
	default:
		return false
	}
}

// codexInputItemRequiresNameV2 is retained for backward compat.
func codexInputItemRequiresNameV2(typ string) bool {
	return itemTypeNeedsName(typ)
}

func unifyCodexTools(reqBody map[string]any) bool {
	rawTools, ok := reqBody["tools"]
	if !ok || rawTools == nil {
		return false
	}
	toolsArr, ok := rawTools.([]any)
	if !ok {
		return false
	}

	changed := false
	kept := make([]any, 0, len(toolsArr))

	for _, raw := range toolsArr {
		m, ok := raw.(map[string]any)
		if !ok {
			// Unknown structure kept as-is to avoid breaking upstream behavior.
			kept = append(kept, raw)
			continue
		}

		tType, _ := m["type"].(string)
		tType = strings.TrimSpace(tType)
		if tType != "function" {
			kept = append(kept, m)
			continue
		}

		// Responses-style: top-level name/parameters already present.
		if topName, ok := m["name"].(string); ok && strings.TrimSpace(topName) != "" {
			kept = append(kept, m)
			continue
		}

		// ChatCompletions-style: {type:"function", function:{...}}.
		fnVal, hasFn := m["function"]
		fnMap, fnOK := fnVal.(map[string]any)
		if !hasFn || fnVal == nil || !fnOK || fnMap == nil {
			// Invalid function tools are dropped.
			changed = true
			continue
		}

		if _, ok := m["name"]; !ok {
			if n, ok := fnMap["name"].(string); ok && strings.TrimSpace(n) != "" {
				m["name"] = n
				changed = true
			}
		}
		if _, ok := m["description"]; !ok {
			if d, ok := fnMap["description"].(string); ok && strings.TrimSpace(d) != "" {
				m["description"] = d
				changed = true
			}
		}
		if _, ok := m["parameters"]; !ok {
			if p, ok := fnMap["parameters"]; ok {
				m["parameters"] = p
				changed = true
			}
		}
		if _, ok := m["strict"]; !ok {
			if s, ok := fnMap["strict"]; ok {
				m["strict"] = s
				changed = true
			}
		}

		kept = append(kept, m)
	}

	if changed {
		reqBody["tools"] = kept
	}

	return changed
}

// normalizeCodexTools is retained for backward compat.
