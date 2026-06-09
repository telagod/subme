package service

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/telagod/subme/internal/pkg/logger"
	"github.com/telagod/subme/internal/util/responseheaders"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

type openAIResponsesImageResult struct {
	Result        string
	RevisedPrompt string
	OutputFormat  string
	Size          string
	Background    string
	Quality       string
	Model         string
}

type OpenAIImagesUpstreamError struct {
	StatusCode        int
	ErrorType         string
	Code              string
	Message           string
	Param             string
	UpstreamRequestID string
}

func (e *OpenAIImagesUpstreamError) Error() string {
	if e == nil {
		return ""
	}
	errorCode := strings.TrimSpace(e.Code)
	if errorCode == "" {
		errorCode = strings.TrimSpace(e.ErrorType)
	}
	errorMsg := strings.TrimSpace(e.Message)
	if errorCode != "" && errorMsg != "" {
		return fmt.Sprintf("images upstream error: %s: %s", errorCode, errorMsg)
	}
	if errorMsg != "" {
		return "images upstream error: " + errorMsg
	}
	if errorCode != "" {
		return "images upstream error: " + errorCode
	}
	return "images upstream error"
}

func (e *OpenAIImagesUpstreamError) clientStatusCode() int {
	if e == nil {
		return http.StatusBadGateway
	}
	if e.StatusCode > 0 {
		return e.StatusCode
	}
	return http.StatusBadGateway
}

func (e *OpenAIImagesUpstreamError) clientErrorType() string {
	if e == nil {
		return "upstream_error"
	}
	if t := strings.TrimSpace(e.ErrorType); t != "" {
		return t
	}
	return "upstream_error"
}

func (e *OpenAIImagesUpstreamError) clientMessage() string {
	if e == nil {
		return "Upstream request failed"
	}
	if m := strings.TrimSpace(e.Message); m != "" {
		return m
	}
	if c := strings.TrimSpace(e.Code); c != "" {
		return c
	}
	return "Upstream request failed"
}

func imageResultDedupKey(itemID string, img openAIResponsesImageResult) string {
	if strings.TrimSpace(img.Result) != "" {
		return strings.TrimSpace(img.OutputFormat) + "|" + strings.TrimSpace(img.Result)
	}
	return "item:" + strings.TrimSpace(itemID)
}

// openAIResponsesImageResultKey is retained for backward compat.

func appendImageResultIfUnique(results *[]openAIResponsesImageResult, visited map[string]struct{}, itemID string, img openAIResponsesImageResult) bool {
	if results == nil {
		return false
	}
	dk := imageResultDedupKey(itemID, img)
	if dk != "" {
		if _, dup := visited[dk]; dup {
			return false
		}
		visited[dk] = struct{}{}
	}
	*results = append(*results, img)
	return true
}

// appendOpenAIResponsesImageResultDedup is retained for backward compat.

func overlayImageMeta(dst *openAIResponsesImageResult, src openAIResponsesImageResult) {
	if dst == nil {
		return
	}
	if f := strings.TrimSpace(src.OutputFormat); f != "" {
		dst.OutputFormat = f
	}
	if s := strings.TrimSpace(src.Size); s != "" {
		dst.Size = s
	}
	if b := strings.TrimSpace(src.Background); b != "" {
		dst.Background = b
	}
	if q := strings.TrimSpace(src.Quality); q != "" {
		dst.Quality = q
	}
	if m := strings.TrimSpace(src.Model); m != "" {
		dst.Model = m
	}
}

// mergeOpenAIResponsesImageMeta is retained for backward compat.

func collectImageResultSizes(imgs []openAIResponsesImageResult) []string {
	if len(imgs) == 0 {
		return nil
	}
	collected := make([]string, 0, len(imgs))
	for _, img := range imgs {
		if s := strings.TrimSpace(img.Size); s != "" {
			collected = append(collected, s)
		}
	}
	if len(collected) == 0 {
		return nil
	}
	return collected
}

// openAIResponsesImageResultSizes is retained for backward compat.

func parseImageMetaFromLifecycleEvent(payload []byte) (openAIResponsesImageResult, int64, bool) {
	evType := gjson.GetBytes(payload, "type").String()
	switch evType {
	case "response.created", "response.in_progress", "response.completed":
		// expected lifecycle events
	default:
		return openAIResponsesImageResult{}, 0, false
	}

	respField := gjson.GetBytes(payload, "response")
	if !respField.Exists() {
		return openAIResponsesImageResult{}, 0, false
	}

	meta := openAIResponsesImageResult{
		OutputFormat: strings.TrimSpace(respField.Get("tools.0.output_format").String()),
		Size:         strings.TrimSpace(respField.Get("tools.0.size").String()),
		Background:   strings.TrimSpace(respField.Get("tools.0.background").String()),
		Quality:      strings.TrimSpace(respField.Get("tools.0.quality").String()),
		Model:        strings.TrimSpace(respField.Get("tools.0.model").String()),
	}
	return meta, respField.Get("created_at").Int(), true
}

// extractOpenAIResponsesImageMetaFromLifecycleEvent is retained for backward compat.

func buildOpenAIImagesStreamPartialPayload(
	eventType string,
	b64 string,
	partialImageIndex int64,
	responseFormat string,
	createdAt int64,
	meta openAIResponsesImageResult,
) []byte {
	if createdAt <= 0 {
		createdAt = time.Now().Unix()
	}

	out := []byte(`{"type":"","created_at":0,"partial_image_index":0,"b64_json":""}`)
	out, _ = sjson.SetBytes(out, "type", eventType)
	out, _ = sjson.SetBytes(out, "created_at", createdAt)
	out, _ = sjson.SetBytes(out, "partial_image_index", partialImageIndex)
	out, _ = sjson.SetBytes(out, "b64_json", b64)
	if strings.EqualFold(strings.TrimSpace(responseFormat), "url") {
		out, _ = sjson.SetBytes(out, "url", "data:"+resolveImageMIME(meta.OutputFormat)+";base64,"+b64)
	}
	if meta.Background != "" {
		out, _ = sjson.SetBytes(out, "background", meta.Background)
	}
	if meta.OutputFormat != "" {
		out, _ = sjson.SetBytes(out, "output_format", meta.OutputFormat)
	}
	if meta.Quality != "" {
		out, _ = sjson.SetBytes(out, "quality", meta.Quality)
	}
	if meta.Size != "" {
		out, _ = sjson.SetBytes(out, "size", meta.Size)
	}
	if meta.Model != "" {
		out, _ = sjson.SetBytes(out, "model", meta.Model)
	}
	return out
}

func buildOpenAIImagesStreamCompletedPayload(
	eventType string,
	img openAIResponsesImageResult,
	responseFormat string,
	createdAt int64,
	usageRaw []byte,
) []byte {
	if createdAt <= 0 {
		createdAt = time.Now().Unix()
	}

	out := []byte(`{"type":"","created_at":0,"b64_json":""}`)
	out, _ = sjson.SetBytes(out, "type", eventType)
	out, _ = sjson.SetBytes(out, "created_at", createdAt)
	out, _ = sjson.SetBytes(out, "b64_json", img.Result)
	if strings.EqualFold(strings.TrimSpace(responseFormat), "url") {
		out, _ = sjson.SetBytes(out, "url", "data:"+resolveImageMIME(img.OutputFormat)+";base64,"+img.Result)
	}
	if img.Background != "" {
		out, _ = sjson.SetBytes(out, "background", img.Background)
	}
	if img.OutputFormat != "" {
		out, _ = sjson.SetBytes(out, "output_format", img.OutputFormat)
	}
	if img.Quality != "" {
		out, _ = sjson.SetBytes(out, "quality", img.Quality)
	}
	if img.Size != "" {
		out, _ = sjson.SetBytes(out, "size", img.Size)
	}
	if img.Model != "" {
		out, _ = sjson.SetBytes(out, "model", img.Model)
	}
	if len(usageRaw) > 0 && gjson.ValidBytes(usageRaw) {
		out, _ = sjson.SetRawBytes(out, "usage", usageRaw)
	}
	return out
}

func resolveImageMIME(format string) string {
	if format == "" {
		return "image/png"
	}
	if strings.Contains(format, "/") {
		return format
	}
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "png":
		return "image/png"
	case "jpg", "jpeg":
		return "image/jpeg"
	case "webp":
		return "image/webp"
	default:
		return "image/png"
	}
}

// openAIImageOutputMIMEType is retained for backward compat.
func openAIImageOutputMIMEType(outputFormat string) string {
	return resolveImageMIME(outputFormat)
}

func convertUploadToDataURL(upload OpenAIImagesUpload) (string, error) {
	if len(upload.Data) == 0 {
		return "", fmt.Errorf("upload %q contains no data", strings.TrimSpace(upload.FileName))
	}
	ct := strings.TrimSpace(upload.ContentType)
	if ct == "" {
		ct = http.DetectContentType(upload.Data)
	}
	return "data:" + ct + ";base64," + base64.StdEncoding.EncodeToString(upload.Data), nil
}

// openAIImageUploadToDataURL is retained for backward compat.

func buildOpenAIImagesResponsesRequest(parsed *OpenAIImagesRequest, toolModel string) ([]byte, error) {
	if parsed == nil {
		return nil, fmt.Errorf("a parsed images request is required")
	}
	text := strings.TrimSpace(parsed.Prompt)
	if text == "" {
		return nil, fmt.Errorf("prompt must not be empty")
	}

	// Collect image URLs from both URL references and file uploads.
	imgURLs := make([]string, 0, len(parsed.InputImageURLs)+len(parsed.Uploads))
	for _, u := range parsed.InputImageURLs {
		if trimmed := strings.TrimSpace(u); trimmed != "" {
			imgURLs = append(imgURLs, trimmed)
		}
	}
	for idx := range parsed.Uploads {
		du, duErr := convertUploadToDataURL(parsed.Uploads[idx])
		if duErr != nil {
			return nil, duErr
		}
		imgURLs = append(imgURLs, du)
	}
	if parsed.IsEdits() && len(imgURLs) == 0 {
		return nil, fmt.Errorf("at least one image is required for edits")
	}

	envelope := []byte(`{"instructions":"","stream":true,"reasoning":{"effort":"medium","summary":"auto"},"parallel_tool_calls":true,"include":["reasoning.encrypted_content"],"model":"","store":false,"tool_choice":{"type":"image_generation"}}`)
	envelope, _ = sjson.SetBytes(envelope, "model", openAIImagesResponsesMainModel)

	inputArr := []byte(`[{"type":"message","role":"user","content":[{"type":"input_text","text":""}]}]`)
	inputArr, _ = sjson.SetBytes(inputArr, "0.content.0.text", text)
	for pos, imgURL := range imgURLs {
		part := []byte(`{"type":"input_image","image_url":""}`)
		part, _ = sjson.SetBytes(part, "image_url", imgURL)
		inputArr, _ = sjson.SetRawBytes(inputArr, fmt.Sprintf("0.content.%d", pos+1), part)
	}
	envelope, _ = sjson.SetRawBytes(envelope, "input", inputArr)

	action := "generate"
	if parsed.IsEdits() {
		action = "edit"
	}
	toolDef := []byte(`{"type":"image_generation","action":"","model":""}`)
	toolDef, _ = sjson.SetBytes(toolDef, "action", action)
	toolDef, _ = sjson.SetBytes(toolDef, "model", strings.TrimSpace(toolModel))
	if shouldEmitImagesN(toolModel, parsed.N) {
		toolDef, _ = sjson.SetBytes(toolDef, "n", parsed.N)
	}

	optionalFields := []struct {
		key string
		val string
	}{
		{key: "size", val: parsed.Size},
		{key: "quality", val: parsed.Quality},
		{key: "background", val: parsed.Background},
		{key: "output_format", val: parsed.OutputFormat},
		{key: "moderation", val: parsed.Moderation},
		{key: "style", val: parsed.Style},
	}
	for _, of := range optionalFields {
		if trimmed := strings.TrimSpace(of.val); trimmed != "" {
			toolDef, _ = sjson.SetBytes(toolDef, of.key, trimmed)
		}
	}
	if parsed.OutputCompression != nil {
		toolDef, _ = sjson.SetBytes(toolDef, "output_compression", *parsed.OutputCompression)
	}
	if parsed.PartialImages != nil {
		toolDef, _ = sjson.SetBytes(toolDef, "partial_images", *parsed.PartialImages)
	}

	maskURL := strings.TrimSpace(parsed.MaskImageURL)
	if parsed.MaskUpload != nil {
		du, duErr := convertUploadToDataURL(*parsed.MaskUpload)
		if duErr != nil {
			return nil, duErr
		}
		maskURL = du
	}
	if maskURL != "" {
		toolDef, _ = sjson.SetBytes(toolDef, "input_image_mask.image_url", maskURL)
	}

	envelope, _ = sjson.SetRawBytes(envelope, "tools", []byte(`[]`))
	envelope, _ = sjson.SetRawBytes(envelope, "tools.-1", toolDef)
	return envelope, nil
}

func shouldEmitImagesN(model string, count int) bool {
	if count <= 1 {
		return false
	}
	return !strings.EqualFold(strings.TrimSpace(model), "dall-e-3")
}

// shouldPassOpenAIImagesN is retained for backward compat.

func extractOpenAIImagesFromResponsesCompleted(payload []byte) ([]openAIResponsesImageResult, int64, []byte, openAIResponsesImageResult, error) {
	if gjson.GetBytes(payload, "type").String() != "response.completed" {
		return nil, 0, nil, openAIResponsesImageResult{}, fmt.Errorf("event type is not response.completed")
	}

	ts := gjson.GetBytes(payload, "response.created_at").Int()
	if ts <= 0 {
		ts = time.Now().Unix()
	}

	var (
		images   []openAIResponsesImageResult
		leadMeta openAIResponsesImageResult
	)
	outputArr := gjson.GetBytes(payload, "response.output")
	if outputArr.IsArray() {
		for _, element := range outputArr.Array() {
			if element.Get("type").String() != "image_generation_call" {
				continue
			}
			b64Data := strings.TrimSpace(element.Get("result").String())
			if b64Data == "" {
				continue
			}
			entry := openAIResponsesImageResult{
				Result:        b64Data,
				RevisedPrompt: strings.TrimSpace(element.Get("revised_prompt").String()),
				OutputFormat:  strings.TrimSpace(element.Get("output_format").String()),
				Size:          strings.TrimSpace(element.Get("size").String()),
				Background:    strings.TrimSpace(element.Get("background").String()),
				Quality:       strings.TrimSpace(element.Get("quality").String()),
			}
			if len(images) == 0 {
				leadMeta = entry
			}
			images = append(images, entry)
		}
	}

	var rawUsage []byte
	if usageNode := gjson.GetBytes(payload, "response.tool_usage.image_gen"); usageNode.Exists() && usageNode.IsObject() {
		rawUsage = []byte(usageNode.Raw)
	}
	return images, ts, rawUsage, leadMeta, nil
}

func extractOpenAIImageFromResponsesOutputItemDone(payload []byte) (openAIResponsesImageResult, string, bool, error) {
	if gjson.GetBytes(payload, "type").String() != "response.output_item.done" {
		return openAIResponsesImageResult{}, "", false, fmt.Errorf("event type is not response.output_item.done")
	}

	itemNode := gjson.GetBytes(payload, "item")
	if !itemNode.Exists() || itemNode.Get("type").String() != "image_generation_call" {
		return openAIResponsesImageResult{}, "", false, nil
	}

	b64Data := strings.TrimSpace(itemNode.Get("result").String())
	if b64Data == "" {
		return openAIResponsesImageResult{}, "", false, nil
	}

	entry := openAIResponsesImageResult{
		Result:        b64Data,
		RevisedPrompt: strings.TrimSpace(itemNode.Get("revised_prompt").String()),
		OutputFormat:  strings.TrimSpace(itemNode.Get("output_format").String()),
		Size:          strings.TrimSpace(itemNode.Get("size").String()),
		Background:    strings.TrimSpace(itemNode.Get("background").String()),
		Quality:       strings.TrimSpace(itemNode.Get("quality").String()),
	}
	return entry, strings.TrimSpace(itemNode.Get("id").String()), true, nil
}

func collectOpenAIImagesFromResponsesBody(body []byte) ([]openAIResponsesImageResult, int64, []byte, openAIResponsesImageResult, bool, error) {
	var (
		pendingImgs   []openAIResponsesImageResult
		pendingVisit  = make(map[string]struct{})
		finalImgs     []openAIResponsesImageResult
		finalLeadMeta openAIResponsesImageResult
		parseErr      error
		ts            int64
		rawUsage      []byte
		sawFinal      bool
		runningMeta   openAIResponsesImageResult
	)

	forEachOpenAISSEDataPayload(string(body), func(data []byte) {
		if parseErr != nil || len(finalImgs) > 0 {
			return
		}
		if !gjson.ValidBytes(data) {
			return
		}
		if meta, evTS, ok := parseImageMetaFromLifecycleEvent(data); ok {
			overlayImageMeta(&runningMeta, meta)
			if evTS > 0 {
				ts = evTS
			}
		}

		switch gjson.GetBytes(data, "type").String() {
		case "response.output_item.done":
			img, itemID, ok, err := extractOpenAIImageFromResponsesOutputItemDone(data)
			if err != nil {
				parseErr = err
				return
			}
			if ok {
				overlayImageMeta(&img, runningMeta)
				appendImageResultIfUnique(&pendingImgs, pendingVisit, itemID, img)
			}
		case "response.completed":
			imgs, completedTS, completedUsage, lead, err := extractOpenAIImagesFromResponsesCompleted(data)
			if err != nil {
				parseErr = err
				return
			}
			sawFinal = true
			if completedTS > 0 {
				ts = completedTS
			}
			if len(completedUsage) > 0 {
				rawUsage = completedUsage
			}
			if len(imgs) > 0 {
				overlayImageMeta(&lead, runningMeta)
				finalImgs = imgs
				finalLeadMeta = lead
				return
			}
			if len(pendingImgs) > 0 {
				lead = pendingImgs[0]
				overlayImageMeta(&lead, runningMeta)
				finalImgs = pendingImgs
				finalLeadMeta = lead
				return
			}
		}
	})
	if parseErr != nil {
		return nil, 0, nil, openAIResponsesImageResult{}, false, parseErr
	}
	if len(finalImgs) > 0 {
		return finalImgs, ts, rawUsage, finalLeadMeta, true, nil
	}

	if len(pendingImgs) > 0 {
		lead := pendingImgs[0]
		overlayImageMeta(&lead, runningMeta)
		return pendingImgs, ts, rawUsage, lead, sawFinal, nil
	}
	return nil, ts, rawUsage, openAIResponsesImageResult{}, sawFinal, nil
}

func extractOpenAIImagesUpstreamError(body []byte) *OpenAIImagesUpstreamError {
	var found *OpenAIImagesUpstreamError
	forEachOpenAISSEDataPayload(string(body), func(data []byte) {
		if found != nil || !gjson.ValidBytes(data) {
			return
		}
		found = parseUpstreamErrorFromSSE(data)
	})
	return found
}

func parseUpstreamErrorFromSSE(data []byte) *OpenAIImagesUpstreamError {
	if !gjson.ValidBytes(data) {
		return nil
	}
	switch gjson.GetBytes(data, "type").String() {
	case "error":
		return buildUpstreamErrorFromGJSON(gjson.GetBytes(data, "error"), "")
	case "response.failed":
		respNode := gjson.GetBytes(data, "response")
		return buildUpstreamErrorFromGJSON(respNode.Get("error"), respNode.Get("id").String())
	default:
		return nil
	}
}

// openAIImagesUpstreamErrorFromSSEPayload is retained for backward compat.

func buildUpstreamErrorFromGJSON(errNode gjson.Result, upstreamReqID string) *OpenAIImagesUpstreamError {
	if !errNode.Exists() {
		return nil
	}
	code := strings.TrimSpace(errNode.Get("code").String())
	errType := strings.TrimSpace(errNode.Get("type").String())
	msg := strings.TrimSpace(errNode.Get("message").String())
	param := strings.TrimSpace(errNode.Get("param").String())
	httpStatus := http.StatusBadGateway
	if strings.EqualFold(code, "moderation_blocked") || strings.EqualFold(errType, "image_generation_user_error") {
		httpStatus = http.StatusBadRequest
	}
	if msg == "" {
		msg = "Upstream request failed"
	}
	return &OpenAIImagesUpstreamError{
		StatusCode:        httpStatus,
		ErrorType:         errType,
		Code:              code,
		Message:           sanitizeUpstreamErrorMessage(msg),
		Param:             param,
		UpstreamRequestID: strings.TrimSpace(upstreamReqID),
	}
}

// openAIImagesUpstreamErrorFromGJSON is retained for backward compat.
func openAIImagesUpstreamErrorFromGJSON(errorObj gjson.Result, upstreamRequestID string) *OpenAIImagesUpstreamError {
	return buildUpstreamErrorFromGJSON(errorObj, upstreamRequestID)
}

// openAIImagesErrorTypeForStatus maps an HTTP status to an OpenAI-style error type
// when the upstream body does not provide its own.
func openAIImagesErrorTypeForStatus(status int) string {
	switch {
	case status == http.StatusBadRequest:
		return "invalid_request_error"
	case status == http.StatusUnauthorized:
		return "authentication_error"
	case status == http.StatusForbidden:
		return "permission_error"
	case status == http.StatusNotFound:
		return "not_found_error"
	case status == http.StatusTooManyRequests:
		return "rate_limit_error"
	case status >= 500:
		return "api_error"
	default:
		return "upstream_error"
	}
}

// openAIImagesUpstreamErrorFromHTTP constructs an OpenAIImagesUpstreamError from a
// non-2xx upstream HTTP response, preserving the real status code, type, code,
// message and param so the client sees the actual upstream error.
func openAIImagesUpstreamErrorFromHTTP(statusCode int, header http.Header, body []byte) *OpenAIImagesUpstreamError {
	errType := strings.TrimSpace(gjson.GetBytes(body, "error.type").String())
	code := strings.TrimSpace(extractUpstreamErrorCode(body))
	param := strings.TrimSpace(gjson.GetBytes(body, "error.param").String())
	msg := sanitizeUpstreamErrorMessage(strings.TrimSpace(extractUpstreamErrorMessage(body)))
	if msg == "" {
		msg = fmt.Sprintf("Upstream request failed (status %d)", statusCode)
	}
	if errType == "" {
		errType = openAIImagesErrorTypeForStatus(statusCode)
	}
	reqID := ""
	if header != nil {
		reqID = strings.TrimSpace(header.Get("x-request-id"))
	}
	return &OpenAIImagesUpstreamError{
		StatusCode:        statusCode,
		ErrorType:         errType,
		Code:              code,
		Message:           msg,
		Param:             param,
		UpstreamRequestID: reqID,
	}
}

// handleOpenAIImagesErrorResponse handles non-failover errors for the images
// endpoints (/v1/images/generations and /v1/images/edits). Unlike the generic
// handler that collapses errors into 502, it surfaces the real upstream status
// code and error details.
func (s *OpenAIGatewayService) handleOpenAIImagesErrorResponse(
	ctx context.Context,
	resp *http.Response,
	c *gin.Context,
	account *Account,
	requestedModel ...string,
) (*OpenAIForwardResult, error) {
	errBody := s.readUpstreamErrorBody(resp)

	upMsg := sanitizeUpstreamErrorMessage(strings.TrimSpace(extractUpstreamErrorMessage(errBody)))
	upDetail := ""
	if s.cfg != nil && s.cfg.Gateway.LogUpstreamErrorBody {
		maxLen := s.cfg.Gateway.LogUpstreamErrorBodyMaxBytes
		if maxLen <= 0 {
			maxLen = 2048
		}
		upDetail = truncateString(string(errBody), maxLen)
	}
	setOpsUpstreamError(c, resp.StatusCode, upMsg, upDetail)

	if s.cfg != nil && s.cfg.Gateway.LogUpstreamErrorBody {
		logger.LegacyPrintf("service.openai_gateway",
			"OpenAI images upstream error %d (account=%d platform=%s type=%s): %s",
			resp.StatusCode,
			account.ID,
			account.Platform,
			account.Type,
			truncateForLog(errBody, s.cfg.Gateway.LogUpstreamErrorBodyMaxBytes),
		)
	}

	// Check admin-configured error passthrough rules first.
	if status, eType, eMsg, matched := applyErrorPassthroughRule(
		c,
		account.Platform,
		resp.StatusCode,
		errBody,
		http.StatusBadGateway,
		"upstream_error",
		"Upstream request failed",
	); matched {
		ue := &OpenAIImagesUpstreamError{
			StatusCode:        status,
			ErrorType:         eType,
			Message:           eMsg,
			UpstreamRequestID: strings.TrimSpace(resp.Header.Get("x-request-id")),
		}
		emitImagesUpstreamErrorJSON(c, ue)
		return nil, ue
	}

	// If the account does not handle this status code, return a generic error.
	if !account.ShouldHandleErrorCode(resp.StatusCode) {
		appendOpsUpstreamError(c, OpsUpstreamErrorEvent{
			Platform:           account.Platform,
			AccountID:          account.ID,
			AccountName:        account.Name,
			UpstreamStatusCode: resp.StatusCode,
			UpstreamRequestID:  resp.Header.Get("x-request-id"),
			Kind:               "http_error",
			Message:            upMsg,
			Detail:             upDetail,
		})
		ue := &OpenAIImagesUpstreamError{
			StatusCode:        http.StatusInternalServerError,
			ErrorType:         "upstream_error",
			Message:           "Upstream gateway error",
			UpstreamRequestID: strings.TrimSpace(resp.Header.Get("x-request-id")),
		}
		emitImagesUpstreamErrorJSON(c, ue)
		return nil, ue
	}

	// Track rate limits / decide whether to disable the account.
	var cooldownModel string
	if len(requestedModel) > 0 {
		cooldownModel = strings.TrimSpace(requestedModel[0])
	}
	shouldDisable := s.handleOpenAIAccountUpstreamError(ctx, account, resp.StatusCode, resp.Header, errBody, cooldownModel)
	evKind := "http_error"
	if shouldDisable {
		evKind = "failover"
	}
	appendOpsUpstreamError(c, OpsUpstreamErrorEvent{
		Platform:           account.Platform,
		AccountID:          account.ID,
		AccountName:        account.Name,
		UpstreamStatusCode: resp.StatusCode,
		UpstreamRequestID:  resp.Header.Get("x-request-id"),
		Kind:               evKind,
		Message:            upMsg,
		Detail:             upDetail,
	})
	if shouldDisable {
		return nil, &UpstreamFailoverError{
			StatusCode:             resp.StatusCode,
			ResponseBody:           errBody,
			RetryableOnSameAccount: account.IsPoolMode() && account.IsPoolModeRetryableStatus(resp.StatusCode),
		}
	}

	// Surface the real upstream error to the client.
	ue := openAIImagesUpstreamErrorFromHTTP(resp.StatusCode, resp.Header, errBody)
	emitImagesUpstreamErrorJSON(c, ue)
	return nil, ue
}

func buildOpenAIImagesAPIResponse(
	images []openAIResponsesImageResult,
	createdAt int64,
	usageRaw []byte,
	leadMeta openAIResponsesImageResult,
	responseFormat string,
) ([]byte, error) {
	if createdAt <= 0 {
		createdAt = time.Now().Unix()
	}
	envelope := []byte(`{"created":0,"data":[]}`)
	envelope, _ = sjson.SetBytes(envelope, "created", createdAt)

	fmt_ := strings.ToLower(strings.TrimSpace(responseFormat))
	if fmt_ == "" {
		fmt_ = "b64_json"
	}
	for _, img := range images {
		entry := []byte(`{}`)
		if fmt_ == "url" {
			entry, _ = sjson.SetBytes(entry, "url", "data:"+resolveImageMIME(img.OutputFormat)+";base64,"+img.Result)
		} else {
			entry, _ = sjson.SetBytes(entry, "b64_json", img.Result)
		}
		if img.RevisedPrompt != "" {
			entry, _ = sjson.SetBytes(entry, "revised_prompt", img.RevisedPrompt)
		}
		envelope, _ = sjson.SetRawBytes(envelope, "data.-1", entry)
	}
	if leadMeta.Background != "" {
		envelope, _ = sjson.SetBytes(envelope, "background", leadMeta.Background)
	}
	if leadMeta.OutputFormat != "" {
		envelope, _ = sjson.SetBytes(envelope, "output_format", leadMeta.OutputFormat)
	}
	if leadMeta.Quality != "" {
		envelope, _ = sjson.SetBytes(envelope, "quality", leadMeta.Quality)
	}
	if leadMeta.Size != "" {
		envelope, _ = sjson.SetBytes(envelope, "size", leadMeta.Size)
	}
	if leadMeta.Model != "" {
		envelope, _ = sjson.SetBytes(envelope, "model", leadMeta.Model)
	}
	if len(usageRaw) > 0 && gjson.ValidBytes(usageRaw) {
		envelope, _ = sjson.SetRawBytes(envelope, "usage", usageRaw)
	}
	return envelope, nil
}

func deriveImagesStreamPrefix(parsed *OpenAIImagesRequest) string {
	if parsed != nil && parsed.IsEdits() {
		return "image_edit"
	}
	return "image_generation"
}

// openAIImagesStreamPrefix is retained for backward compat.
func openAIImagesStreamPrefix(parsed *OpenAIImagesRequest) string {
	return deriveImagesStreamPrefix(parsed)
}

func buildOpenAIImagesStreamErrorBody(message string) []byte {
	out := []byte(`{"type":"error","error":{"type":"upstream_error","message":""}}`)
	if strings.TrimSpace(message) == "" {
		message = "upstream request failed"
	}
	out, _ = sjson.SetBytes(out, "error.message", message)
	return out
}

func buildOpenAIImagesStreamErrorBodyFromUpstream(err *OpenAIImagesUpstreamError) []byte {
	if err == nil {
		return buildOpenAIImagesStreamErrorBody("")
	}
	out := buildOpenAIImagesStreamErrorBody(err.clientMessage())
	out, _ = sjson.SetBytes(out, "error.type", err.clientErrorType())
	if c := strings.TrimSpace(err.Code); c != "" {
		out, _ = sjson.SetBytes(out, "error.code", c)
	}
	if p := strings.TrimSpace(err.Param); p != "" {
		out, _ = sjson.SetBytes(out, "error.param", p)
	}
	return out
}

func emitImagesUpstreamErrorJSON(c *gin.Context, err *OpenAIImagesUpstreamError) bool {
	if c == nil || c.Writer == nil || c.Writer.Written() || err == nil {
		return false
	}
	errObj := gin.H{
		"type":    err.clientErrorType(),
		"message": err.clientMessage(),
	}
	if code := strings.TrimSpace(err.Code); code != "" {
		errObj["code"] = code
	}
	if param := strings.TrimSpace(err.Param); param != "" {
		errObj["param"] = param
	}
	c.JSON(err.clientStatusCode(), gin.H{
		"error": errObj,
	})
	return true
}

// writeOpenAIImagesUpstreamErrorResponse is retained for backward compat.
func writeOpenAIImagesUpstreamErrorResponse(c *gin.Context, err *OpenAIImagesUpstreamError) bool {
	return emitImagesUpstreamErrorJSON(c, err)
}

func (s *OpenAIGatewayService) writeOpenAIImagesStreamEvent(c *gin.Context, flusher http.Flusher, eventName string, payload []byte) error {
	if strings.TrimSpace(eventName) != "" {
		if _, wErr := fmt.Fprintf(c.Writer, "event: %s\n", eventName); wErr != nil {
			return wErr
		}
	}
	if _, wErr := fmt.Fprintf(c.Writer, "data: %s\n\n", payload); wErr != nil {
		return wErr
	}
	flusher.Flush()
	return nil
}

func (s *OpenAIGatewayService) attemptWriteStreamEvent(
	c *gin.Context,
	fl http.Flusher,
	disconnected *bool,
	lastWrite *time.Time,
	eventName string,
	payload []byte,
) bool {
	if disconnected != nil && *disconnected {
		return false
	}
	if wErr := s.writeOpenAIImagesStreamEvent(c, fl, eventName, payload); wErr != nil {
		if disconnected != nil {
			*disconnected = true
		}
		logger.LegacyPrintf("service.openai_gateway", "[OpenAI] Images stream: client gone, continuing upstream drain for billing")
		return false
	}
	if lastWrite != nil {
		*lastWrite = time.Now()
	}
	return true
}

// tryWriteOpenAIImagesStreamEvent is retained for backward compat.
func (s *OpenAIGatewayService) tryWriteOpenAIImagesStreamEvent(
	c *gin.Context,
	flusher http.Flusher,
	clientDisconnected *bool,
	lastWriteAt *time.Time,
	eventName string,
	payload []byte,
) bool {
	return s.attemptWriteStreamEvent(c, flusher, clientDisconnected, lastWriteAt, eventName, payload)
}

func (s *OpenAIGatewayService) handleOpenAIImagesOAuthNonStreamingResponse(
	resp *http.Response,
	c *gin.Context,
	responseFormat string,
	fallbackModel string,
) (OpenAIUsage, int, []string, error) {
	rawBody, readErr := ReadUpstreamResponseBody(resp.Body, s.cfg, c, openAITooLargeError)
	if readErr != nil {
		return OpenAIUsage{}, 0, nil, readErr
	}

	var accUsage OpenAIUsage
	forEachOpenAISSEDataPayload(string(rawBody), func(chunk []byte) {
		s.parseSSEUsageBytes(chunk, &accUsage)
	})
	imgs, ts, rawUsage, lead, _, collectErr := collectOpenAIImagesFromResponsesBody(rawBody)
	if collectErr != nil {
		return OpenAIUsage{}, 0, nil, collectErr
	}
	if len(imgs) == 0 {
		if upErr := extractOpenAIImagesUpstreamError(rawBody); upErr != nil {
			setOpsUpstreamError(c, upErr.clientStatusCode(), upErr.clientMessage(), "")
			emitImagesUpstreamErrorJSON(c, upErr)
			return OpenAIUsage{}, 0, nil, upErr
		}
		return OpenAIUsage{}, 0, nil, fmt.Errorf("upstream produced no image output")
	}
	if strings.TrimSpace(lead.Model) == "" {
		lead.Model = strings.TrimSpace(fallbackModel)
	}

	apiBody, buildErr := buildOpenAIImagesAPIResponse(imgs, ts, rawUsage, lead, responseFormat)
	if buildErr != nil {
		return OpenAIUsage{}, 0, nil, buildErr
	}
	responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, s.responseHeaderFilter)
	c.Data(resp.StatusCode, "application/json; charset=utf-8", apiBody)
	return accUsage, len(imgs), collectImageResultSizes(imgs), nil
}

func (s *OpenAIGatewayService) handleOpenAIImagesOAuthStreamingResponse(
	resp *http.Response,
	c *gin.Context,
	startTime time.Time,
	responseFormat string,
	streamPrefix string,
	fallbackModel string,
) (OpenAIUsage, int, []string, *int, error) {
	responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, s.responseHeaderFilter)
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Status(resp.StatusCode)

	fl, flOK := c.Writer.(http.Flusher)
	if !flOK {
		return OpenAIUsage{}, 0, nil, nil, fmt.Errorf("response writer does not support streaming")
	}

	fmt_ := strings.ToLower(strings.TrimSpace(responseFormat))
	if fmt_ == "" {
		fmt_ = "b64_json"
	}

	accUsage := OpenAIUsage{}
	imgCount := 0
	var imgSizes []string
	var ttfMs *int
	emittedKeys := make(map[string]struct{})
	pendingImgs := make([]openAIResponsesImageResult, 0, 1)
	pendingVisited := make(map[string]struct{})
	runningMeta := openAIResponsesImageResult{Model: strings.TrimSpace(fallbackModel)}
	var ts int64
	disconnected := false
	lastWrite := time.Now()
	var accumulator openAISSEDataAccumulator
	var dataErr error
	dataDone := false

	handleData := func(chunk []byte) {
		if dataDone || dataErr != nil {
			return
		}
		if ttfMs == nil {
			elapsed := int(time.Since(startTime).Milliseconds())
			ttfMs = &elapsed
		}
		s.parseSSEUsageBytes(chunk, &accUsage)
		if !gjson.ValidBytes(chunk) {
			return
		}
		if meta, evTS, ok := parseImageMetaFromLifecycleEvent(chunk); ok {
			overlayImageMeta(&runningMeta, meta)
			if evTS > 0 {
				ts = evTS
			}
		}
		switch gjson.GetBytes(chunk, "type").String() {
		case "response.image_generation_call.partial_image":
			b64Part := strings.TrimSpace(gjson.GetBytes(chunk, "partial_image_b64").String())
			if b64Part == "" {
				return
			}
			evName := streamPrefix + ".partial_image"
			partMeta := runningMeta
			overlayImageMeta(&partMeta, openAIResponsesImageResult{
				OutputFormat: strings.TrimSpace(gjson.GetBytes(chunk, "output_format").String()),
				Background:   strings.TrimSpace(gjson.GetBytes(chunk, "background").String()),
			})
			pl := buildOpenAIImagesStreamPartialPayload(
				evName,
				b64Part,
				gjson.GetBytes(chunk, "partial_image_index").Int(),
				fmt_,
				ts,
				partMeta,
			)
			s.attemptWriteStreamEvent(c, fl, &disconnected, &lastWrite, evName, pl)
		case "response.output_item.done":
			img, itemID, ok, err := extractOpenAIImageFromResponsesOutputItemDone(chunk)
			if err != nil {
				s.attemptWriteStreamEvent(c, fl, &disconnected, &lastWrite, "error", buildOpenAIImagesStreamErrorBody(err.Error()))
				dataErr = err
				dataDone = true
				return
			}
			if !ok {
				return
			}
			overlayImageMeta(&runningMeta, img)
			overlayImageMeta(&img, runningMeta)
			dk := imageResultDedupKey(itemID, img)
			if _, dup := emittedKeys[dk]; dup {
				return
			}
			if _, dup := pendingVisited[dk]; dup {
				return
			}
			pendingVisited[dk] = struct{}{}
			pendingImgs = append(pendingImgs, img)
		case "response.completed":
			imgs, _, rawUsage, lead, err := extractOpenAIImagesFromResponsesCompleted(chunk)
			if err != nil {
				s.attemptWriteStreamEvent(c, fl, &disconnected, &lastWrite, "error", buildOpenAIImagesStreamErrorBody(err.Error()))
				dataErr = err
				dataDone = true
				return
			}
			overlayImageMeta(&runningMeta, lead)
			allImgs := make([]openAIResponsesImageResult, 0, len(imgs)+len(pendingImgs))
			allVisited := make(map[string]struct{})
			for _, img := range imgs {
				overlayImageMeta(&img, runningMeta)
				appendImageResultIfUnique(&allImgs, allVisited, "", img)
			}
			for _, img := range pendingImgs {
				overlayImageMeta(&img, runningMeta)
				appendImageResultIfUnique(&allImgs, allVisited, "", img)
			}
			if len(allImgs) == 0 {
				noOutputErr := fmt.Errorf("upstream produced no image output")
				s.attemptWriteStreamEvent(c, fl, &disconnected, &lastWrite, "error", buildOpenAIImagesStreamErrorBody(noOutputErr.Error()))
				dataErr = noOutputErr
				dataDone = true
				return
			}
			evName := streamPrefix + ".completed"
			for _, img := range allImgs {
				dk := imageResultDedupKey("", img)
				if _, dup := emittedKeys[dk]; dup {
					continue
				}
				pl := buildOpenAIImagesStreamCompletedPayload(evName, img, fmt_, ts, rawUsage)
				emittedKeys[dk] = struct{}{}
				s.attemptWriteStreamEvent(c, fl, &disconnected, &lastWrite, evName, pl)
			}
			imgCount = len(emittedKeys)
			imgSizes = collectImageResultSizes(allImgs)
			dataDone = true
		case "error", "response.failed":
			if upErr := parseUpstreamErrorFromSSE(chunk); upErr != nil {
				if !disconnected {
					s.attemptWriteStreamEvent(c, fl, &disconnected, &lastWrite, "error", buildOpenAIImagesStreamErrorBodyFromUpstream(upErr))
				}
				setOpsUpstreamError(c, upErr.clientStatusCode(), upErr.clientMessage(), "")
				dataErr = upErr
				dataDone = true
				return
			}
		}
	}

	handleLine := func(ln []byte) (bool, error) {
		if len(ln) == 0 {
			return false, nil
		}
		accumulator.AddLine(string(ln), handleData)
		if dataErr != nil {
			return true, dataErr
		}
		return dataDone, nil
	}

	drainAccumulator := func() (bool, error) {
		accumulator.Flush(handleData)
		if dataErr != nil {
			return true, dataErr
		}
		return dataDone, nil
	}

	emitPending := func() error {
		if imgCount > 0 {
			return nil
		}
		if len(pendingImgs) > 0 {
			evName := streamPrefix + ".completed"
			for _, img := range pendingImgs {
				overlayImageMeta(&img, runningMeta)
				dk := imageResultDedupKey("", img)
				if _, dup := emittedKeys[dk]; dup {
					continue
				}
				pl := buildOpenAIImagesStreamCompletedPayload(evName, img, fmt_, ts, nil)
				emittedKeys[dk] = struct{}{}
				s.attemptWriteStreamEvent(c, fl, &disconnected, &lastWrite, evName, pl)
			}
			imgCount = len(emittedKeys)
			imgSizes = collectImageResultSizes(pendingImgs)
			return nil
		}

		earlyEnd := fmt.Errorf("stream ended before image generation completed")
		s.attemptWriteStreamEvent(c, fl, &disconnected, &lastWrite, "error", buildOpenAIImagesStreamErrorBody(earlyEnd.Error()))
		return earlyEnd
	}

	idleLimit := s.openAIImageStreamDataInterval()
	keepAlive := s.openAIImageStreamKeepaliveInterval()
	if idleLimit <= 0 && keepAlive <= 0 {
		scanner := bufio.NewReader(resp.Body)
		for {
			ln, rdErr := scanner.ReadBytes('\n')
			finished, pErr := handleLine(ln)
			if pErr != nil {
				return accUsage, imgCount, imgSizes, ttfMs, pErr
			}
			if finished {
				return accUsage, imgCount, imgSizes, ttfMs, nil
			}
			if rdErr == io.EOF {
				break
			}
			if rdErr != nil {
				if finished, pErr := drainAccumulator(); pErr != nil {
					return accUsage, imgCount, imgSizes, ttfMs, pErr
				} else if finished {
					return accUsage, imgCount, imgSizes, ttfMs, nil
				}
				s.attemptWriteStreamEvent(c, fl, &disconnected, &lastWrite, "error", buildOpenAIImagesStreamErrorBody(rdErr.Error()))
				return accUsage, imgCount, imgSizes, ttfMs, rdErr
			}
		}
		if finished, pErr := drainAccumulator(); pErr != nil {
			return accUsage, imgCount, imgSizes, ttfMs, pErr
		} else if finished {
			return accUsage, imgCount, imgSizes, ttfMs, nil
		}
		if pendErr := emitPending(); pendErr != nil {
			return accUsage, imgCount, imgSizes, ttfMs, pendErr
		}
		return accUsage, imgCount, imgSizes, ttfMs, nil
	}

	type lineEvent struct {
		data []byte
		err  error
	}
	ch := make(chan lineEvent, 16)
	stopCh := make(chan struct{})
	dispatch := func(ev lineEvent) bool {
		select {
		case ch <- ev:
			return true
		case <-stopCh:
			return false
		}
	}
	var atomicReadTs int64
	atomic.StoreInt64(&atomicReadTs, time.Now().UnixNano())
	go func() {
		defer close(ch)
		scanner := bufio.NewReader(resp.Body)
		for {
			ln, rdErr := scanner.ReadBytes('\n')
			if len(ln) > 0 {
				atomic.StoreInt64(&atomicReadTs, time.Now().UnixNano())
			}
			if len(ln) > 0 && !dispatch(lineEvent{data: ln}) {
				return
			}
			if rdErr == io.EOF {
				return
			}
			if rdErr != nil {
				_ = dispatch(lineEvent{err: rdErr})
				return
			}
		}
	}()
	defer close(stopCh)

	var idleTicker *time.Ticker
	if idleLimit > 0 {
		idleTicker = time.NewTicker(idleLimit)
		defer idleTicker.Stop()
	}
	var idleCh <-chan time.Time
	if idleTicker != nil {
		idleCh = idleTicker.C
	}

	var kaTicker *time.Ticker
	if keepAlive > 0 {
		kaTicker = time.NewTicker(keepAlive)
		defer kaTicker.Stop()
	}
	var kaCh <-chan time.Time
	if kaTicker != nil {
		kaCh = kaTicker.C
	}

	for {
		select {
		case ev, open := <-ch:
			if !open {
				if finished, pErr := drainAccumulator(); pErr != nil {
					return accUsage, imgCount, imgSizes, ttfMs, pErr
				} else if finished {
					return accUsage, imgCount, imgSizes, ttfMs, nil
				}
				if pendErr := emitPending(); pendErr != nil {
					return accUsage, imgCount, imgSizes, ttfMs, pendErr
				}
				return accUsage, imgCount, imgSizes, ttfMs, nil
			}
			if ev.err != nil {
				if finished, pErr := drainAccumulator(); pErr != nil {
					return accUsage, imgCount, imgSizes, ttfMs, pErr
				} else if finished {
					return accUsage, imgCount, imgSizes, ttfMs, nil
				}
				s.attemptWriteStreamEvent(c, fl, &disconnected, &lastWrite, "error", buildOpenAIImagesStreamErrorBody(ev.err.Error()))
				return accUsage, imgCount, imgSizes, ttfMs, ev.err
			}
			finished, pErr := handleLine(ev.data)
			if pErr != nil {
				return accUsage, imgCount, imgSizes, ttfMs, pErr
			}
			if finished {
				return accUsage, imgCount, imgSizes, ttfMs, nil
			}
		case <-idleCh:
			lastRd := time.Unix(0, atomic.LoadInt64(&atomicReadTs))
			if time.Since(lastRd) < idleLimit {
				continue
			}
			if disconnected {
				return accUsage, imgCount, imgSizes, ttfMs, fmt.Errorf("stream terminated: idle timeout while client disconnected")
			}
			logger.LegacyPrintf("service.openai_gateway", "[OpenAI] Images responses stream idle timeout exceeded: interval=%s", idleLimit)
			s.attemptWriteStreamEvent(c, fl, &disconnected, &lastWrite, "error", buildOpenAIImagesStreamErrorBody(fmt.Sprintf("upstream image stream idle for %s", idleLimit)))
			return accUsage, imgCount, imgSizes, ttfMs, fmt.Errorf("image stream idle timeout")
		case <-kaCh:
			if disconnected || time.Since(lastWrite) < keepAlive {
				continue
			}
			if _, pingErr := io.WriteString(c.Writer, ":\n\n"); pingErr != nil {
				disconnected = true
				logger.LegacyPrintf("service.openai_gateway", "[OpenAI] Images responses stream: client gone during keepalive, continuing drain for billing")
				continue
			}
			fl.Flush()
			lastWrite = time.Now()
		}
	}
}

func (s *OpenAIGatewayService) dispatchImagesViaOAuth(
	ctx context.Context,
	c *gin.Context,
	account *Account,
	parsed *OpenAIImagesRequest,
	channelMappedModel string,
) (*OpenAIForwardResult, error) {
	began := time.Now()
	resolvedModel := strings.TrimSpace(parsed.Model)
	if override := strings.TrimSpace(channelMappedModel); override != "" {
		resolvedModel = override
	}
	if resolvedModel == "" {
		resolvedModel = "gpt-image-2"
	}
	if validErr := checkImagesModel(resolvedModel); validErr != nil {
		return nil, validErr
	}
	logger.LegacyPrintf(
		"service.openai_gateway",
		"[OpenAI] Images request routing request_model=%s endpoint=%s account_type=%s uploads=%d",
		resolvedModel,
		parsed.Endpoint,
		account.Type,
		len(parsed.Uploads),
	)
	upCtx, releaseUpCtx := decoupleUpstreamContext(ctx)
	defer releaseUpCtx()

	accessTok, _, tokenErr := s.GetAccessToken(upCtx, account)
	if tokenErr != nil {
		return nil, tokenErr
	}

	responsesPayload, buildErr := buildOpenAIImagesResponsesRequest(parsed, resolvedModel)
	if buildErr != nil {
		return nil, buildErr
	}
	upReq, reqErr := s.buildUpstreamRequest(upCtx, c, account, responsesPayload, accessTok, true, parsed.StickySessionSeed(), false)
	if reqErr != nil {
		return nil, reqErr
	}
	upReq.Header.Set("Content-Type", "application/json")
	upReq.Header.Set("Accept", "text/event-stream")

	proxyAddr := ""
	if account.ProxyID != nil && account.Proxy != nil {
		proxyAddr = account.Proxy.URL()
	}
	upStart := time.Now()
	resp, doErr := s.httpUpstream.Do(upReq, proxyAddr, account.ID, account.Concurrency)
	SetOpsLatencyMs(c, OpsUpstreamLatencyMsKey, time.Since(upStart).Milliseconds())
	if doErr != nil {
		cleanMsg := sanitizeUpstreamErrorMessage(doErr.Error())
		setOpsUpstreamError(c, 0, cleanMsg, "")
		appendOpsUpstreamError(c, OpsUpstreamErrorEvent{
			Platform:           account.Platform,
			AccountID:          account.ID,
			AccountName:        account.Name,
			UpstreamStatusCode: 0,
			UpstreamURL:        safeUpstreamURL(upReq.URL.String()),
			Kind:               "request_error",
			Message:            cleanMsg,
		})
		return nil, fmt.Errorf("upstream call failed: %s", cleanMsg)
	}
	if resp.StatusCode >= 400 {
		errBody := s.readUpstreamErrorBody(resp)
		_ = resp.Body.Close()
		resp.Body = io.NopCloser(bytes.NewReader(errBody))
		errText := sanitizeUpstreamErrorMessage(strings.TrimSpace(extractUpstreamErrorMessage(errBody)))
		if s.shouldFailoverOpenAIUpstreamResponse(resp.StatusCode, errText, errBody) {
			appendOpsUpstreamError(c, OpsUpstreamErrorEvent{
				Platform:           account.Platform,
				AccountID:          account.ID,
				AccountName:        account.Name,
				UpstreamStatusCode: resp.StatusCode,
				UpstreamRequestID:  resp.Header.Get("x-request-id"),
				UpstreamURL:        safeUpstreamURL(upReq.URL.String()),
				Kind:               "failover",
				Message:            errText,
			})
			s.handleFailoverSideEffects(upCtx, resp, account, resolvedModel)
			return nil, &UpstreamFailoverError{
				StatusCode:             resp.StatusCode,
				ResponseBody:           errBody,
				RetryableOnSameAccount: account.IsPoolMode() && account.IsPoolModeRetryableStatus(resp.StatusCode),
			}
		}
		return s.handleOpenAIImagesErrorResponse(upCtx, resp, c, account, resolvedModel)
	}
	defer func() { _ = resp.Body.Close() }()

	var (
		accUsage OpenAIUsage
		imgCount int
		imgSizes []string
		ttfMs    *int
	)
	if parsed.Stream {
		var stErr error
		accUsage, imgCount, imgSizes, ttfMs, stErr = s.handleOpenAIImagesOAuthStreamingResponse(resp, c, began, parsed.ResponseFormat, deriveImagesStreamPrefix(parsed), resolvedModel)
		if stErr != nil {
			if imgCount > 0 {
				return &OpenAIForwardResult{
					RequestID:        resp.Header.Get("x-request-id"),
					Usage:            accUsage,
					Model:            resolvedModel,
					UpstreamModel:    resolvedModel,
					Stream:           parsed.Stream,
					ResponseHeaders:  resp.Header.Clone(),
					Duration:         time.Since(began),
					FirstTokenMs:     ttfMs,
					ImageCount:       imgCount,
					ImageSize:        parsed.SizeTier,
					ImageInputSize:   parsed.Size,
					ImageOutputSizes: imgSizes,
				}, stErr
			}
			return nil, stErr
		}
	} else {
		var syncErr error
		accUsage, imgCount, imgSizes, syncErr = s.handleOpenAIImagesOAuthNonStreamingResponse(resp, c, parsed.ResponseFormat, resolvedModel)
		if syncErr != nil {
			return nil, syncErr
		}
	}
	if imgCount <= 0 {
		imgCount = parsed.N
	}
	return &OpenAIForwardResult{
		RequestID:        resp.Header.Get("x-request-id"),
		Usage:            accUsage,
		Model:            resolvedModel,
		UpstreamModel:    resolvedModel,
		Stream:           parsed.Stream,
		ResponseHeaders:  resp.Header.Clone(),
		Duration:         time.Since(began),
		FirstTokenMs:     ttfMs,
		ImageCount:       imgCount,
		ImageSize:        parsed.SizeTier,
		ImageInputSize:   parsed.Size,
		ImageOutputSizes: imgSizes,
	}, nil
}

// forwardOpenAIImagesOAuth is retained for backward compat.
func (s *OpenAIGatewayService) forwardOpenAIImagesOAuth(
	ctx context.Context,
	c *gin.Context,
	account *Account,
	parsed *OpenAIImagesRequest,
	channelMappedModel string,
) (*OpenAIForwardResult, error) {
	return s.dispatchImagesViaOAuth(ctx, c, account, parsed, channelMappedModel)
}
