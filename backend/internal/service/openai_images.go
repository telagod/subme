package service

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/imroc/req/v3"
	"github.com/telagod/subme/internal/pkg/logger"
	"github.com/telagod/subme/internal/util/responseheaders"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

const (
	openAIImagesGenerationsEndpoint = "/v1/images/generations"
	openAIImagesEditsEndpoint       = "/v1/images/edits"

	openAIImagesGenerationsURL = "https://api.openai.com/v1/images/generations"
	openAIImagesEditsURL       = "https://api.openai.com/v1/images/edits"

	openAIChatGPTStartURL          = "https://chatgpt.com/"
	openAIChatGPTFilesURL          = "https://chatgpt.com/backend-api/files"
	openAIImageBackendUserAgent    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
	openAIImageMaxDownloadBytes    = 20 << 20 // 20MB ceiling per image download
	openAIImageMaxUploadPartSize   = 20 << 20 // 20MB ceiling per multipart upload part
	openAIImagesResponsesMainModel = "gpt-5.4-mini"
)

type OpenAIImagesCapability string

const (
	OpenAIImagesCapabilityBasic  OpenAIImagesCapability = "images-basic"
	OpenAIImagesCapabilityNative OpenAIImagesCapability = "images-native"
)

type OpenAIImagesUpload struct {
	FieldName   string
	FileName    string
	ContentType string
	Data        []byte
	Width       int
	Height      int
}

type OpenAIImagesRequest struct {
	Endpoint           string
	ContentType        string
	Multipart          bool
	Model              string
	ExplicitModel      bool
	Prompt             string
	Stream             bool
	N                  int
	Size               string
	ExplicitSize       bool
	SizeTier           string
	ResponseFormat     string
	Quality            string
	Background         string
	OutputFormat       string
	Moderation         string
	InputFidelity      string
	Style              string
	OutputCompression  *int
	PartialImages      *int
	HasMask            bool
	HasNativeOptions   bool
	RequiredCapability OpenAIImagesCapability
	InputImageURLs     []string
	MaskImageURL       string
	Uploads            []OpenAIImagesUpload
	MaskUpload         *OpenAIImagesUpload
	Body               []byte
	bodyHash           string
}

func (r *OpenAIImagesRequest) ModerationBody() []byte {
	if r == nil {
		return nil
	}
	envelope := map[string]any{}
	trimmedPrompt := strings.TrimSpace(r.Prompt)
	if trimmedPrompt != "" {
		envelope["prompt"] = trimmedPrompt
	}
	imgEntries := r.gatherModerationImages()
	if len(imgEntries) > 0 {
		envelope["images"] = imgEntries
	}
	if len(envelope) == 0 {
		return nil
	}
	encoded, encodeErr := json.Marshal(envelope)
	if encodeErr != nil {
		return nil
	}
	return encoded
}

func (r *OpenAIImagesRequest) gatherModerationImages() []map[string]string {
	if r == nil {
		return nil
	}
	collected := make([]map[string]string, 0, len(r.InputImageURLs)+len(r.Uploads)+1)
	for _, imgURL := range r.InputImageURLs {
		trimmedURL := strings.TrimSpace(imgURL)
		if trimmedURL != "" {
			collected = append(collected, map[string]string{"image_url": trimmedURL})
		}
	}
	for idx := range r.Uploads {
		dataURI := r.Uploads[idx].ModerationDataURL()
		if dataURI != "" {
			collected = append(collected, map[string]string{"image_url": dataURI})
		}
	}
	if trimmedMask := strings.TrimSpace(r.MaskImageURL); trimmedMask != "" {
		collected = append(collected, map[string]string{"image_url": trimmedMask})
	}
	if r.MaskUpload != nil {
		if maskURI := r.MaskUpload.ModerationDataURL(); maskURI != "" {
			collected = append(collected, map[string]string{"image_url": maskURI})
		}
	}
	return collected
}

func (u OpenAIImagesUpload) ModerationDataURL() string {
	if len(u.Data) == 0 {
		return ""
	}
	ct := strings.TrimSpace(u.ContentType)
	if ct == "" {
		ct = http.DetectContentType(u.Data)
	}
	if !strings.HasPrefix(strings.ToLower(ct), "image/") {
		return ""
	}
	return fmt.Sprintf("data:%s;base64,%s", ct, base64.StdEncoding.EncodeToString(u.Data))
}

func (r *OpenAIImagesRequest) IsEdits() bool {
	return r != nil && r.Endpoint == openAIImagesEditsEndpoint
}

func (r *OpenAIImagesRequest) StickySessionSeed() string {
	if r == nil {
		return ""
	}
	segments := []string{
		"openai-images",
		strings.TrimSpace(r.Endpoint),
		strings.TrimSpace(r.Model),
		strings.TrimSpace(r.Size),
		strings.TrimSpace(r.Prompt),
	}
	combined := strings.Join(segments, "|")
	if strings.TrimSpace(r.Prompt) == "" && r.bodyHash != "" {
		combined += "|body=" + r.bodyHash
	}
	return combined
}

func (s *OpenAIGatewayService) ParseOpenAIImagesRequest(c *gin.Context, body []byte) (*OpenAIImagesRequest, error) {
	if c == nil || c.Request == nil {
		return nil, fmt.Errorf("request context is absent")
	}
	resolvedEndpoint := resolveImagesEndpointPath(c.Request.URL.Path)
	if resolvedEndpoint == "" {
		return nil, fmt.Errorf("unrecognized images endpoint path")
	}

	rawCT := strings.TrimSpace(c.GetHeader("Content-Type"))
	parsed := &OpenAIImagesRequest{
		Endpoint:    resolvedEndpoint,
		ContentType: rawCT,
		N:           1,
		Body:        body,
	}
	if len(body) > 0 {
		digest := sha256.Sum256(body)
		parsed.bodyHash = hex.EncodeToString(digest[:8])
	}

	detectedMedia, _, parseMediaErr := mime.ParseMediaType(rawCT)
	if parseMediaErr == nil && strings.EqualFold(detectedMedia, "multipart/form-data") {
		parsed.Multipart = true
		if mpErr := decodeImagesMultipartPayload(body, rawCT, parsed); mpErr != nil {
			return nil, mpErr
		}
	} else {
		if len(body) == 0 {
			return nil, fmt.Errorf("empty request body")
		}
		if !gjson.ValidBytes(body) {
			return nil, fmt.Errorf("unable to parse request body as JSON")
		}
		if jsonErr := decodeImagesJSONPayload(body, parsed); jsonErr != nil {
			return nil, jsonErr
		}
	}

	fillImagesDefaults(parsed)
	if validErr := checkImagesModel(parsed.Model); validErr != nil {
		return nil, validErr
	}
	parsed.SizeTier = deriveImageSizeTier(parsed.Size)
	parsed.RequiredCapability = determineImagesCapability(parsed)
	return parsed, nil
}

func decodeImagesJSONPayload(raw []byte, dst *OpenAIImagesRequest) error {
	if modelField := gjson.GetBytes(raw, "model"); modelField.Exists() {
		dst.Model = strings.TrimSpace(modelField.String())
		dst.ExplicitModel = dst.Model != ""
	}
	dst.Prompt = strings.TrimSpace(gjson.GetBytes(raw, "prompt").String())

	if streamField := gjson.GetBytes(raw, "stream"); streamField.Exists() {
		if streamField.Type != gjson.True && streamField.Type != gjson.False {
			return fmt.Errorf("stream field must be a boolean")
		}
		dst.Stream = streamField.Bool()
	}

	if nField := gjson.GetBytes(raw, "n"); nField.Exists() {
		if nField.Type != gjson.Number {
			return fmt.Errorf("n field must be a number")
		}
		dst.N = int(nField.Int())
		if dst.N <= 0 {
			return fmt.Errorf("n must be a positive integer")
		}
	}

	if sizeField := gjson.GetBytes(raw, "size"); sizeField.Exists() {
		dst.Size = strings.TrimSpace(sizeField.String())
		dst.ExplicitSize = dst.Size != ""
	}
	dst.ResponseFormat = strings.ToLower(strings.TrimSpace(gjson.GetBytes(raw, "response_format").String()))
	dst.Quality = strings.TrimSpace(gjson.GetBytes(raw, "quality").String())
	dst.Background = strings.TrimSpace(gjson.GetBytes(raw, "background").String())
	dst.OutputFormat = strings.TrimSpace(gjson.GetBytes(raw, "output_format").String())
	dst.Moderation = strings.TrimSpace(gjson.GetBytes(raw, "moderation").String())
	dst.InputFidelity = strings.TrimSpace(gjson.GetBytes(raw, "input_fidelity").String())
	dst.Style = strings.TrimSpace(gjson.GetBytes(raw, "style").String())
	dst.HasMask = gjson.GetBytes(raw, "mask").Exists()
	if compField := gjson.GetBytes(raw, "output_compression"); compField.Exists() {
		if compField.Type != gjson.Number {
			return fmt.Errorf("output_compression must be a number")
		}
		compVal := int(compField.Int())
		dst.OutputCompression = &compVal
	}
	if partialField := gjson.GetBytes(raw, "partial_images"); partialField.Exists() {
		if partialField.Type != gjson.Number {
			return fmt.Errorf("partial_images must be a number")
		}
		partialVal := int(partialField.Int())
		dst.PartialImages = &partialVal
	}
	if dst.IsEdits() {
		imagesField := gjson.GetBytes(raw, "images")
		if imagesField.Exists() {
			if !imagesField.IsArray() {
				return fmt.Errorf("images field must be an array")
			}
			for _, element := range imagesField.Array() {
				if imgURL := strings.TrimSpace(element.Get("image_url").String()); imgURL != "" {
					dst.InputImageURLs = append(dst.InputImageURLs, imgURL)
					continue
				}
				if element.Get("file_id").Exists() {
					return fmt.Errorf("images[].file_id is unsupported; use images[].image_url")
				}
			}
		}
		if maskURL := strings.TrimSpace(gjson.GetBytes(raw, "mask.image_url").String()); maskURL != "" {
			dst.MaskImageURL = maskURL
			dst.HasMask = true
		}
		if gjson.GetBytes(raw, "mask.file_id").Exists() {
			return fmt.Errorf("mask.file_id is unsupported; use mask.image_url")
		}
		if len(dst.InputImageURLs) == 0 {
			return fmt.Errorf("at least one images[].image_url is required")
		}
	}
	dst.HasNativeOptions = probeNativeImageFields(func(fieldPath string) bool {
		return gjson.GetBytes(raw, fieldPath).Exists()
	})
	return nil
}

func decodeImagesMultipartPayload(raw []byte, contentType string, dst *OpenAIImagesRequest) error {
	_, mediaParams, parseErr := mime.ParseMediaType(contentType)
	if parseErr != nil {
		return fmt.Errorf("malformed multipart content-type: %w", parseErr)
	}
	sep := strings.TrimSpace(mediaParams["boundary"])
	if sep == "" {
		return fmt.Errorf("multipart boundary not found")
	}

	mr := multipart.NewReader(bytes.NewReader(raw), sep)
	for {
		section, readErr := mr.NextPart()
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return fmt.Errorf("error reading multipart section: %w", readErr)
		}
		fieldName := strings.TrimSpace(section.FormName())
		if fieldName == "" {
			_ = section.Close()
			continue
		}

		sectionData, dataErr := io.ReadAll(io.LimitReader(section, openAIImageMaxUploadPartSize))
		_ = section.Close()
		if dataErr != nil {
			return fmt.Errorf("error reading multipart field %s: %w", fieldName, dataErr)
		}

		attachmentName := strings.TrimSpace(section.FileName())
		if attachmentName != "" {
			sectionCT := strings.TrimSpace(section.Header.Get("Content-Type"))
			if fieldName == "mask" && len(sectionData) > 0 {
				dst.HasMask = true
				w, h := extractImageDims(section.Header)
				mu := OpenAIImagesUpload{
					FieldName:   fieldName,
					FileName:    attachmentName,
					ContentType: sectionCT,
					Data:        sectionData,
					Width:       w,
					Height:      h,
				}
				dst.MaskUpload = &mu
			}
			if fieldName == "image" || strings.HasPrefix(fieldName, "image[") {
				w, h := extractImageDims(section.Header)
				dst.Uploads = append(dst.Uploads, OpenAIImagesUpload{
					FieldName:   fieldName,
					FileName:    attachmentName,
					ContentType: sectionCT,
					Data:        sectionData,
					Width:       w,
					Height:      h,
				})
			}
			continue
		}

		textVal := strings.TrimSpace(string(sectionData))
		switch fieldName {
		case "model":
			dst.Model = textVal
			dst.ExplicitModel = textVal != ""
		case "prompt":
			dst.Prompt = textVal
		case "size":
			dst.Size = textVal
			dst.ExplicitSize = textVal != ""
		case "response_format":
			dst.ResponseFormat = strings.ToLower(textVal)
		case "stream":
			boolVal, boolErr := strconv.ParseBool(textVal)
			if boolErr != nil {
				return fmt.Errorf("stream must be a boolean value")
			}
			dst.Stream = boolVal
		case "n":
			intVal, intErr := strconv.Atoi(textVal)
			if intErr != nil || intVal <= 0 {
				return fmt.Errorf("n must be a positive integer value")
			}
			dst.N = intVal
		case "quality":
			dst.Quality = textVal
			dst.HasNativeOptions = true
		case "background":
			dst.Background = textVal
			dst.HasNativeOptions = true
		case "output_format":
			dst.OutputFormat = textVal
			dst.HasNativeOptions = true
		case "moderation":
			dst.Moderation = textVal
			dst.HasNativeOptions = true
		case "input_fidelity":
			dst.InputFidelity = textVal
			dst.HasNativeOptions = true
		case "style":
			dst.Style = textVal
			dst.HasNativeOptions = true
		case "output_compression":
			compVal, compErr := strconv.Atoi(textVal)
			if compErr != nil {
				return fmt.Errorf("output_compression must be an integer")
			}
			dst.OutputCompression = &compVal
			dst.HasNativeOptions = true
		case "partial_images":
			piVal, piErr := strconv.Atoi(textVal)
			if piErr != nil {
				return fmt.Errorf("partial_images must be an integer")
			}
			dst.PartialImages = &piVal
			dst.HasNativeOptions = true
		default:
			if matchesNativeImageFieldName(fieldName) && textVal != "" {
				dst.HasNativeOptions = true
			}
		}
	}

	if len(dst.Uploads) == 0 && dst.IsEdits() {
		return fmt.Errorf("at least one image file upload is required for edits")
	}
	return nil
}

func extractImageDims(_ textproto.MIMEHeader) (int, int) {
	return 0, 0
}

func fillImagesDefaults(dst *OpenAIImagesRequest) {
	if dst == nil {
		return
	}
	if dst.N <= 0 {
		dst.N = 1
	}
	if trimmed := strings.TrimSpace(dst.Model); trimmed != "" {
		dst.Model = trimmed
		return
	}
	dst.Model = "gpt-image-2"
}

func isOpenAIImageGenerationModel(model string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(model)), "gpt-image-")
}

func checkImagesModel(model string) error {
	model = strings.TrimSpace(model)
	if isOpenAIImageGenerationModel(model) {
		return nil
	}
	if model == "" {
		return fmt.Errorf("an image model is required for images endpoints")
	}
	return fmt.Errorf("an image model is required for images endpoints, received %q", model)
}

// validateOpenAIImagesModel is the exported validation entry point.

func resolveImagesEndpointPath(urlPath string) string {
	cleaned := strings.TrimSpace(urlPath)
	switch {
	case strings.Contains(cleaned, "/images/generations"):
		return openAIImagesGenerationsEndpoint
	case strings.Contains(cleaned, "/images/edits"):
		return openAIImagesEditsEndpoint
	default:
		return ""
	}
}

// normalizeOpenAIImagesEndpointPath keeps backward compat with callers.

func determineImagesCapability(req *OpenAIImagesRequest) OpenAIImagesCapability {
	if req == nil {
		return OpenAIImagesCapabilityNative
	}
	if req.ExplicitModel || req.ExplicitSize {
		return OpenAIImagesCapabilityNative
	}
	lowerModel := strings.ToLower(strings.TrimSpace(req.Model))
	if !strings.HasPrefix(lowerModel, "gpt-image-") {
		return OpenAIImagesCapabilityNative
	}
	if req.Stream || req.N != 1 || req.HasMask || req.HasNativeOptions {
		return OpenAIImagesCapabilityNative
	}
	if req.IsEdits() && !req.Multipart {
		return OpenAIImagesCapabilityNative
	}
	if req.ResponseFormat != "" && req.ResponseFormat != "b64_json" {
		return OpenAIImagesCapabilityNative
	}
	return OpenAIImagesCapabilityBasic
}

// classifyOpenAIImagesCapability is retained for external callers.

func probeNativeImageFields(existsFn func(path string) bool) bool {
	fieldPaths := []string{
		"background",
		"quality",
		"style",
		"output_format",
		"output_compression",
		"moderation",
		"input_fidelity",
		"partial_images",
	}
	for _, fp := range fieldPaths {
		if existsFn(fp) {
			return true
		}
	}
	return false
}

// hasOpenAINativeImageOptions is retained for external callers.

func matchesNativeImageFieldName(name string) bool {
	switch strings.TrimSpace(strings.ToLower(name)) {
	case "background", "quality", "style", "output_format", "output_compression", "moderation", "input_fidelity", "partial_images":
		return true
	default:
		return false
	}
}

// isOpenAINativeImageOption is retained for external callers.

func deriveImageSizeTier(size string) string {
	return NormalizeImageBillingTierOrDefault(size)
}

// normalizeOpenAIImageSizeTier is retained for external callers.
func normalizeOpenAIImageSizeTier(size string) string {
	return deriveImageSizeTier(size)
}

// applyOpenAIImagesDefaults is retained for external callers.
func applyOpenAIImagesDefaults(req *OpenAIImagesRequest) {
	fillImagesDefaults(req)
}

func (s *OpenAIGatewayService) ForwardImages(
	ctx context.Context,
	c *gin.Context,
	account *Account,
	body []byte,
	parsed *OpenAIImagesRequest,
	channelMappedModel string,
) (*OpenAIForwardResult, error) {
	if parsed == nil {
		return nil, fmt.Errorf("a parsed images request must be provided")
	}
	switch account.Type {
	case AccountTypeAPIKey:
		return s.dispatchImagesViaAPIKey(ctx, c, account, body, parsed, channelMappedModel)
	case AccountTypeOAuth:
		return s.dispatchImagesViaOAuth(ctx, c, account, parsed, channelMappedModel)
	default:
		return nil, fmt.Errorf("account type %s is not supported for images", account.Type)
	}
}

func (s *OpenAIGatewayService) dispatchImagesViaAPIKey(
	ctx context.Context,
	c *gin.Context,
	account *Account,
	body []byte,
	parsed *OpenAIImagesRequest,
	channelMappedModel string,
) (*OpenAIForwardResult, error) {
	began := time.Now()
	resolvedModel := strings.TrimSpace(parsed.Model)
	if override := strings.TrimSpace(channelMappedModel); override != "" {
		resolvedModel = override
	}
	if validErr := checkImagesModel(resolvedModel); validErr != nil {
		return nil, validErr
	}
	targetModel := account.GetMappedModel(resolvedModel)
	if validErr := checkImagesModel(targetModel); validErr != nil {
		return nil, validErr
	}
	logger.LegacyPrintf(
		"service.openai_gateway",
		"[OpenAI] Images request routing request_model=%s upstream_model=%s endpoint=%s account_type=%s",
		strings.TrimSpace(parsed.Model),
		targetModel,
		parsed.Endpoint,
		account.Type,
	)
	rewrittenBody, rewrittenCT, rewriteErr := recomposeImagesModelField(body, parsed.ContentType, targetModel)
	if rewriteErr != nil {
		return nil, rewriteErr
	}
	upCtx, releaseUpCtx := detachStreamUpstreamContext(ctx, parsed.Stream)
	defer releaseUpCtx()

	accessTok, _, tokenErr := s.GetAccessToken(upCtx, account)
	if tokenErr != nil {
		return nil, tokenErr
	}
	upReq, buildErr := s.assembleImagesHTTPRequest(upCtx, c, account, rewrittenBody, rewrittenCT, accessTok, parsed.Endpoint)
	if buildErr != nil {
		return nil, buildErr
	}

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
			s.handleFailoverSideEffects(upCtx, resp, account, targetModel)
			return nil, &UpstreamFailoverError{
				StatusCode:             resp.StatusCode,
				ResponseBody:           errBody,
				RetryableOnSameAccount: account.IsPoolMode() && account.IsPoolModeRetryableStatus(resp.StatusCode),
			}
		}
		return s.handleOpenAIImagesErrorResponse(upCtx, resp, c, account, targetModel)
	}
	defer func() { _ = resp.Body.Close() }()

	var consumedUsage OpenAIUsage
	outputCount := parsed.N
	var ttfMs *int
	if parsed.Stream && isEventStreamResponse(resp.Header) {
		stUsage, stCount, stSizes, stTTF, stErr := s.relayImagesStreamToClient(resp, c, began)
		if stErr != nil {
			if stCount > 0 {
				return &OpenAIForwardResult{
					RequestID:        resp.Header.Get("x-request-id"),
					Usage:            stUsage,
					Model:            resolvedModel,
					UpstreamModel:    targetModel,
					Stream:           parsed.Stream,
					ResponseHeaders:  resp.Header.Clone(),
					Duration:         time.Since(began),
					FirstTokenMs:     stTTF,
					ImageCount:       stCount,
					ImageSize:        parsed.SizeTier,
					ImageInputSize:   parsed.Size,
					ImageOutputSizes: stSizes,
				}, stErr
			}
			return nil, stErr
		}
		consumedUsage = stUsage
		outputCount = stCount
		return &OpenAIForwardResult{
			RequestID:        resp.Header.Get("x-request-id"),
			Usage:            consumedUsage,
			Model:            resolvedModel,
			UpstreamModel:    targetModel,
			Stream:           parsed.Stream,
			ResponseHeaders:  resp.Header.Clone(),
			Duration:         time.Since(began),
			FirstTokenMs:     stTTF,
			ImageCount:       outputCount,
			ImageSize:        parsed.SizeTier,
			ImageInputSize:   parsed.Size,
			ImageOutputSizes: stSizes,
		}, nil
	}

	syncUsage, syncCount, syncSizes, syncErr := s.relayImagesBodyToClient(resp, c)
	if syncErr != nil {
		return nil, syncErr
	}
	consumedUsage = syncUsage
	if syncCount > 0 {
		outputCount = syncCount
	}
	return &OpenAIForwardResult{
		RequestID:        resp.Header.Get("x-request-id"),
		Usage:            consumedUsage,
		Model:            resolvedModel,
		UpstreamModel:    targetModel,
		Stream:           parsed.Stream,
		ResponseHeaders:  resp.Header.Clone(),
		Duration:         time.Since(began),
		FirstTokenMs:     ttfMs,
		ImageCount:       outputCount,
		ImageSize:        parsed.SizeTier,
		ImageInputSize:   parsed.Size,
		ImageOutputSizes: syncSizes,
	}, nil
}

// forwardOpenAIImagesAPIKey is kept as an alias for backward compat.

func (s *OpenAIGatewayService) assembleImagesHTTPRequest(
	ctx context.Context,
	c *gin.Context,
	account *Account,
	payload []byte,
	contentType string,
	bearerToken string,
	endpoint string,
) (*http.Request, error) {
	dest := openAIImagesGenerationsURL
	if endpoint == openAIImagesEditsEndpoint {
		dest = openAIImagesEditsURL
	}
	customBase := account.GetOpenAIBaseURL()
	if customBase != "" {
		validBase, validErr := s.validateUpstreamBaseURL(customBase)
		if validErr != nil {
			return nil, validErr
		}
		dest = constructImagesFullURL(validBase, endpoint)
	}

	httpReq, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, dest, bytes.NewReader(payload))
	if reqErr != nil {
		return nil, reqErr
	}
	httpReq = httpReq.WithContext(WithHTTPUpstreamProfile(httpReq.Context(), HTTPUpstreamProfileOpenAI))
	httpReq.Header.Set("Authorization", "Bearer "+bearerToken)
	for hdr, vals := range c.Request.Header {
		if !openaiPassthroughAllowedHeaders[strings.ToLower(hdr)] {
			continue
		}
		for _, v := range vals {
			httpReq.Header.Add(hdr, v)
		}
	}
	if ua := account.GetOpenAIUserAgent(); ua != "" {
		httpReq.Header.Set("User-Agent", ua)
	}
	if strings.TrimSpace(contentType) != "" {
		httpReq.Header.Set("Content-Type", contentType)
	}
	return httpReq, nil
}

// buildOpenAIImagesRequest is kept as an alias for backward compat.

func constructImagesFullURL(baseURL string, endpoint string) string {
	return buildOpenAIEndpointURL(baseURL, endpoint)
}

// buildOpenAIImagesURL is kept for backward compat.
func buildOpenAIImagesURL(base string, endpoint string) string {
	return constructImagesFullURL(base, endpoint)
}

func recomposeImagesModelField(body []byte, contentType string, model string) ([]byte, string, error) {
	model = strings.TrimSpace(model)
	if model == "" {
		return body, contentType, nil
	}
	detectedMedia, _, parseErr := mime.ParseMediaType(contentType)
	if parseErr == nil && strings.EqualFold(detectedMedia, "multipart/form-data") {
		return patchMultipartModelField(body, contentType, model)
	}
	patched, setErr := sjson.SetBytes(body, "model", model)
	if setErr != nil {
		return nil, "", fmt.Errorf("failed to set model in image request JSON: %w", setErr)
	}
	return patched, contentType, nil
}

// rewriteOpenAIImagesModel is kept as an alias for backward compat.

func patchMultipartModelField(body []byte, contentType string, model string) ([]byte, string, error) {
	_, mediaParams, parseErr := mime.ParseMediaType(contentType)
	if parseErr != nil {
		return nil, "", fmt.Errorf("cannot parse multipart content-type header: %w", parseErr)
	}
	sep := strings.TrimSpace(mediaParams["boundary"])
	if sep == "" {
		return nil, "", fmt.Errorf("missing multipart boundary")
	}

	mr := multipart.NewReader(bytes.NewReader(body), sep)
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	modelEmitted := false

	for {
		section, readErr := mr.NextPart()
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return nil, "", fmt.Errorf("error iterating multipart parts: %w", readErr)
		}

		fld := strings.TrimSpace(section.FormName())
		hdrCopy := duplicateMIMEHeader(section.Header)
		dest, createErr := mw.CreatePart(hdrCopy)
		if createErr != nil {
			_ = section.Close()
			return nil, "", fmt.Errorf("error creating output multipart part: %w", createErr)
		}

		if fld == "model" && section.FileName() == "" {
			if _, wErr := dest.Write([]byte(model)); wErr != nil {
				_ = section.Close()
				return nil, "", fmt.Errorf("error writing model value into multipart: %w", wErr)
			}
			modelEmitted = true
			_ = section.Close()
			continue
		}
		if _, cpErr := io.Copy(dest, section); cpErr != nil {
			_ = section.Close()
			return nil, "", fmt.Errorf("error copying multipart part data: %w", cpErr)
		}
		_ = section.Close()
	}

	if !modelEmitted {
		if wfErr := mw.WriteField("model", model); wfErr != nil {
			return nil, "", fmt.Errorf("error appending model field to multipart: %w", wfErr)
		}
	}
	if closeErr := mw.Close(); closeErr != nil {
		return nil, "", fmt.Errorf("error finalizing multipart output: %w", closeErr)
	}
	return buf.Bytes(), mw.FormDataContentType(), nil
}

// rewriteOpenAIImagesMultipartModel is kept for backward compat.

func duplicateMIMEHeader(orig textproto.MIMEHeader) textproto.MIMEHeader {
	dup := make(textproto.MIMEHeader, len(orig))
	for k, vs := range orig {
		cpy := make([]string, len(vs))
		copy(cpy, vs)
		dup[k] = cpy
	}
	return dup
}

// cloneMultipartHeader is kept for backward compat.

func (s *OpenAIGatewayService) relayImagesBodyToClient(resp *http.Response, c *gin.Context) (OpenAIUsage, int, []string, error) {
	respData, readErr := ReadUpstreamResponseBody(resp.Body, s.cfg, c, openAITooLargeError)
	if readErr != nil {
		return OpenAIUsage{}, 0, nil, readErr
	}
	responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, s.responseHeaderFilter)
	ct := "application/json"
	if s.cfg != nil && !s.cfg.Security.ResponseHeaders.Enabled {
		if upCT := resp.Header.Get("Content-Type"); upCT != "" {
			ct = upCT
		}
	}
	c.Data(resp.StatusCode, ct, respData)

	parsedUsage, _ := extractOpenAIUsageFromJSONBytes(respData)
	return parsedUsage, tallyImageOutputCount(respData), gatherResponseImageSizes(respData), nil
}

// handleOpenAIImagesNonStreamingResponse is kept for backward compat.

func (s *OpenAIGatewayService) relayImagesStreamToClient(
	resp *http.Response,
	c *gin.Context,
	began time.Time,
) (OpenAIUsage, int, []string, *int, error) {
	responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, s.responseHeaderFilter)
	ct := strings.TrimSpace(resp.Header.Get("Content-Type"))
	if ct == "" {
		ct = "text/event-stream"
	}
	c.Status(resp.StatusCode)
	c.Header("Content-Type", ct)

	fl, flOK := c.Writer.(http.Flusher)
	if !flOK {
		return OpenAIUsage{}, 0, nil, nil, fmt.Errorf("response writer does not support streaming")
	}

	accUsage := OpenAIUsage{}
	imgTracker := newOpenAIImageOutputCounter()
	var ttfMs *int
	disconnected := false
	lastWriteTime := time.Now()
	var nonSSEBuf bytes.Buffer
	nonSSEBytes := int64(0)
	readCap := resolveUpstreamResponseReadLimit(s.cfg)
	receivedSSE := false
	nonSSEOverflow := false
	var accumulator openAISSEDataAccumulator

	handleSSEPayload := func(payload []byte) {
		receivedSSE = true
		nonSSEBuf.Reset()
		nonSSEBytes = 0
		mergeOpenAIUsage(&accUsage, payload)
		imgTracker.AddSSEData(payload)
	}

	drainAccumulator := func() {
		accumulator.Flush(handleSSEPayload)
	}

	handleLine := func(ln []byte) {
		if len(ln) == 0 {
			return
		}
		if ttfMs == nil {
			elapsed := int(time.Since(began).Milliseconds())
			ttfMs = &elapsed
		}
		if !disconnected {
			if _, wErr := c.Writer.Write(ln); wErr != nil {
				disconnected = true
				logger.LegacyPrintf("service.openai_gateway", "[OpenAI] Images stream: client gone, draining upstream for billing accuracy")
			} else {
				fl.Flush()
				lastWriteTime = time.Now()
			}
		}

		stripped := strings.TrimRight(string(ln), "\r\n")
		if _, isData := extractOpenAISSEDataLine(stripped); isData || strings.TrimSpace(stripped) == "" {
			accumulator.AddLine(stripped, handleSSEPayload)
			return
		}
		if !receivedSSE && !nonSSEOverflow {
			nonSSEBytes += int64(len(ln))
			if nonSSEBytes <= readCap {
				_, _ = nonSSEBuf.Write(ln)
			} else {
				nonSSEOverflow = true
				nonSSEBuf.Reset()
			}
		}
	}

	handleNonSSEFallback := func() {
		if receivedSSE || nonSSEBuf.Len() == 0 {
			return
		}
		trimmed := bytes.TrimSpace(nonSSEBuf.Bytes())
		if len(trimmed) == 0 {
			return
		}
		mergeOpenAIUsage(&accUsage, trimmed)
		imgTracker.AddJSONResponse(trimmed)
	}

	idleLimit := s.openAIImageStreamDataInterval()
	keepAlive := s.openAIImageStreamKeepaliveInterval()
	if idleLimit <= 0 && keepAlive <= 0 {
		scanner := bufio.NewReader(resp.Body)
		for {
			ln, rdErr := scanner.ReadBytes('\n')
			handleLine(ln)
			if rdErr == io.EOF {
				break
			}
			if rdErr != nil {
				drainAccumulator()
				return accUsage, imgTracker.Count(), imgTracker.Sizes(), ttfMs, rdErr
			}
		}
		drainAccumulator()
		handleNonSSEFallback()
		return accUsage, imgTracker.Count(), imgTracker.Sizes(), ttfMs, nil
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
				drainAccumulator()
				handleNonSSEFallback()
				return accUsage, imgTracker.Count(), imgTracker.Sizes(), ttfMs, nil
			}
			if ev.err != nil {
				drainAccumulator()
				return accUsage, imgTracker.Count(), imgTracker.Sizes(), ttfMs, ev.err
			}
			handleLine(ev.data)
		case <-idleCh:
			lastRd := time.Unix(0, atomic.LoadInt64(&atomicReadTs))
			if time.Since(lastRd) < idleLimit {
				continue
			}
			if disconnected {
				return accUsage, imgTracker.Count(), imgTracker.Sizes(), ttfMs, fmt.Errorf("stream terminated: idle timeout while client disconnected")
			}
			logger.LegacyPrintf("service.openai_gateway", "[OpenAI] Images stream idle timeout exceeded: interval=%s", idleLimit)
			_ = s.writeOpenAIImagesStreamEvent(c, fl, "error", buildOpenAIImagesStreamErrorBody(fmt.Sprintf("upstream image stream idle for %s", idleLimit)))
			return accUsage, imgTracker.Count(), imgTracker.Sizes(), ttfMs, fmt.Errorf("image stream idle timeout")
		case <-kaCh:
			if disconnected || time.Since(lastWriteTime) < keepAlive {
				continue
			}
			if _, pingErr := io.WriteString(c.Writer, ":\n\n"); pingErr != nil {
				disconnected = true
				logger.LegacyPrintf("service.openai_gateway", "[OpenAI] Images stream: client gone during keepalive, continuing upstream drain for billing")
				continue
			}
			fl.Flush()
			lastWriteTime = time.Now()
		}
	}
}

// handleOpenAIImagesStreamingResponse is kept for backward compat.

func (s *OpenAIGatewayService) openAIImageStreamDataInterval() time.Duration {
	if s == nil || s.cfg == nil || s.cfg.Gateway.ImageStreamDataIntervalTimeout <= 0 {
		return 0
	}
	return time.Duration(s.cfg.Gateway.ImageStreamDataIntervalTimeout) * time.Second
}

func (s *OpenAIGatewayService) openAIImageStreamKeepaliveInterval() time.Duration {
	if s == nil || s.cfg == nil || s.cfg.Gateway.ImageStreamKeepaliveInterval <= 0 {
		return 0
	}
	return time.Duration(s.cfg.Gateway.ImageStreamKeepaliveInterval) * time.Second
}

func extractOpenAIImagesBillableCountFromJSONBytes(body []byte) int {
	if n := tallyImageOutputCount(body); n > 0 {
		return n
	}
	if len(body) == 0 || !gjson.ValidBytes(body) {
		return 0
	}
	if n := int(gjson.GetBytes(body, "usage.images").Int()); n > 0 {
		return n
	}
	if n := int(gjson.GetBytes(body, "tool_usage.image_gen.images").Int()); n > 0 {
		return n
	}
	evType := strings.TrimSpace(gjson.GetBytes(body, "type").String())
	if evType == "" || !strings.HasSuffix(evType, ".completed") {
		return 0
	}
	if gjson.GetBytes(body, "b64_json").Exists() || gjson.GetBytes(body, "url").Exists() {
		return 1
	}
	return 0
}

func mergeOpenAIUsage(target *OpenAIUsage, payload []byte) {
	if target == nil {
		return
	}
	if u, ok := extractOpenAIUsageFromJSONBytes(payload); ok {
		if u.InputTokens > 0 {
			target.InputTokens = u.InputTokens
		}
		if u.OutputTokens > 0 {
			target.OutputTokens = u.OutputTokens
		}
		if u.CacheReadInputTokens > 0 {
			target.CacheReadInputTokens = u.CacheReadInputTokens
		}
		if u.ImageOutputTokens > 0 {
			target.ImageOutputTokens = u.ImageOutputTokens
		}
	}
}

func tallyImageOutputCount(body []byte) int {
	return countOpenAIResponseImageOutputsFromJSONBytes(body)
}

// extractOpenAIImageCountFromJSONBytes is retained for backward compat.

type openAIImagePointerInfo struct {
	Pointer     string
	DownloadURL string
	B64JSON     string
	MimeType    string
	Prompt      string
}

func collectOpenAIImagePointers(body []byte) []openAIImagePointerInfo {
	if len(body) == 0 {
		return nil
	}
	// Extract the revised prompt from known paths.
	revisedPrompt := ""
	promptPaths := []string{
		"message.metadata.dalle.prompt",
		"metadata.dalle.prompt",
		"revised_prompt",
	}
	for _, pp := range promptPaths {
		if candidate := strings.TrimSpace(gjson.GetBytes(body, pp).String()); candidate != "" {
			revisedPrompt = candidate
			break
		}
	}
	rawPtrs := scanImagePointerStrings(body)
	entries := make([]openAIImagePointerInfo, 0, len(rawPtrs))
	for _, ptr := range rawPtrs {
		entries = append(entries, openAIImagePointerInfo{Pointer: ptr, Prompt: revisedPrompt})
	}
	return reconcileImagePointerLists(entries, extractInlineImageAssets(body, revisedPrompt))
}

func scanImagePointerStrings(body []byte) []string {
	text := string(body)
	found := make([]string, 0, 4)
	prefixes := []string{"file-service://", "sediment://"}
	for _, pfx := range prefixes {
		cursor := 0
		for {
			pos := strings.Index(text[cursor:], pfx)
			if pos < 0 {
				break
			}
			pos += cursor
			tail := pos + len(pfx)
			for tail < len(text) {
				b := text[tail]
				isAlnum := (b >= '0' && b <= '9') || (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z')
				if !isAlnum && b != '-' && b != '_' {
					break
				}
				tail++
			}
			found = append(found, text[pos:tail])
			cursor = tail
		}
	}
	return removeDuplicateStrings(found)
}

// openAIImagePointerMatches is retained for backward compat.

func reconcileImagePointerLists(base []openAIImagePointerInfo, extra []openAIImagePointerInfo) []openAIImagePointerInfo {
	if len(extra) == 0 {
		return base
	}
	registry := make(map[string]openAIImagePointerInfo, len(base)+len(extra))
	merged := make([]openAIImagePointerInfo, 0, len(base)+len(extra))
	for _, entry := range base {
		if ik := entry.identityKey(); ik != "" {
			registry[ik] = entry
		}
		merged = append(merged, entry)
	}
	for _, entry := range extra {
		ik := entry.identityKey()
		if ik == "" {
			continue
		}
		if prev, exists := registry[ik]; exists {
			combined := blendPointerInfo(prev, entry)
			if combined != prev {
				for idx := range merged {
					if merged[idx].identityKey() == ik {
						merged[idx] = combined
						break
					}
				}
				registry[ik] = combined
			}
			continue
		}
		registry[ik] = entry
		merged = append(merged, entry)
	}
	return merged
}

// mergeOpenAIImagePointerInfos is retained for backward compat.

func (info openAIImagePointerInfo) identityKey() string {
	switch {
	case strings.TrimSpace(info.Pointer) != "":
		return "pointer:" + strings.TrimSpace(info.Pointer)
	case strings.TrimSpace(info.DownloadURL) != "":
		return "download:" + strings.TrimSpace(info.DownloadURL)
	case strings.TrimSpace(info.B64JSON) != "":
		b64Prefix := strings.TrimSpace(info.B64JSON)
		if len(b64Prefix) > 64 {
			b64Prefix = b64Prefix[:64]
		}
		return "b64:" + b64Prefix
	default:
		return ""
	}
}

func blendPointerInfo(base, overlay openAIImagePointerInfo) openAIImagePointerInfo {
	result := base
	if strings.TrimSpace(result.Pointer) == "" {
		result.Pointer = overlay.Pointer
	}
	if strings.TrimSpace(result.DownloadURL) == "" {
		result.DownloadURL = overlay.DownloadURL
	}
	if strings.TrimSpace(result.B64JSON) == "" {
		result.B64JSON = overlay.B64JSON
	}
	if strings.TrimSpace(result.MimeType) == "" {
		result.MimeType = overlay.MimeType
	}
	if strings.TrimSpace(result.Prompt) == "" {
		result.Prompt = overlay.Prompt
	}
	return result
}

// mergeOpenAIImagePointerInfo is retained for backward compat.

func resolveOpenAIImageBytes(
	ctx context.Context,
	client *req.Client,
	headers http.Header,
	conversationID string,
	pointer openAIImagePointerInfo,
	errorBodyReadLimit int64,
) ([]byte, error) {
	if cleaned := sanitizeBase64ImageData(pointer.B64JSON); cleaned != "" {
		return base64.StdEncoding.DecodeString(cleaned)
	}
	if dlURL := strings.TrimSpace(pointer.DownloadURL); dlURL != "" {
		return fetchImageBytesFromURL(ctx, client, headers, dlURL, errorBodyReadLimit)
	}
	if strings.TrimSpace(pointer.Pointer) == "" {
		return nil, fmt.Errorf("image asset has no pointer, URL, or base64 data")
	}
	dlURL, resolveErr := resolveImageDownloadLink(ctx, client, headers, conversationID, pointer.Pointer, errorBodyReadLimit)
	if resolveErr != nil {
		return nil, resolveErr
	}
	return fetchImageBytesFromURL(ctx, client, headers, dlURL, errorBodyReadLimit)
}

func sanitizeBase64ImageData(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(raw), "data:") {
		if commaPos := strings.Index(raw, ","); commaPos >= 0 && commaPos+1 < len(raw) {
			raw = raw[commaPos+1:]
		}
	}
	raw = strings.TrimSpace(raw)
	paddingNeeded := (4 - len(raw)%4) % 4
	raw = strings.TrimRight(raw, "=") + strings.Repeat("=", paddingNeeded)
	if raw == "" {
		return ""
	}
	if _, decErr := base64.StdEncoding.DecodeString(raw); decErr != nil {
		return ""
	}
	return raw
}

// normalizeOpenAIImageBase64 is retained for backward compat.

func extractInlineImageAssets(body []byte, fallbackPrompt string) []openAIImagePointerInfo {
	if len(body) == 0 || !gjson.ValidBytes(body) {
		return nil
	}
	var parsed any
	if unmarshalErr := json.Unmarshal(body, &parsed); unmarshalErr != nil {
		return nil
	}
	var result []openAIImagePointerInfo
	traverseForImageAssets(parsed, strings.TrimSpace(fallbackPrompt), &result)
	return result
}

// collectOpenAIImageInlineAssets is retained for backward compat.

func traverseForImageAssets(node any, promptContext string, out *[]openAIImagePointerInfo) {
	switch val := node.(type) {
	case map[string]any:
		localPrompt := promptContext
		for _, promptKey := range []string{"revised_prompt", "image_gen_title", "prompt"} {
			if s, ok := val[promptKey].(string); ok && strings.TrimSpace(s) != "" {
				localPrompt = strings.TrimSpace(s)
				break
			}
		}
		candidate := openAIImagePointerInfo{
			Prompt:      localPrompt,
			Pointer:     firstNonEmptyString(val["asset_pointer"], val["pointer"]),
			DownloadURL: firstNonEmptyString(val["download_url"], val["url"], val["image_url"]),
			B64JSON:     firstNonEmptyString(val["b64_json"], val["base64"], val["image_base64"]),
			MimeType:    firstNonEmptyString(val["mime_type"], val["mimeType"], val["content_type"]),
		}
		switch {
		case strings.HasPrefix(strings.TrimSpace(candidate.Pointer), "file-service://"),
			strings.HasPrefix(strings.TrimSpace(candidate.Pointer), "sediment://"),
			looksLikeImageDownloadURL(candidate.DownloadURL),
			sanitizeBase64ImageData(candidate.B64JSON) != "":
			*out = append(*out, candidate)
		}
		for _, child := range val {
			traverseForImageAssets(child, localPrompt, out)
		}
	case []any:
		for _, child := range val {
			traverseForImageAssets(child, promptContext, out)
		}
	}
}

// walkOpenAIImageInlineAssets is retained for backward compat.

func firstNonEmptyString(values ...any) string {
	for _, v := range values {
		if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
			return strings.TrimSpace(s)
		}
	}
	return ""
}

func looksLikeImageDownloadURL(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false
	}
	lower := strings.ToLower(raw)
	if strings.HasPrefix(lower, "data:image/") {
		return true
	}
	if !strings.HasPrefix(lower, "http://") && !strings.HasPrefix(lower, "https://") {
		return false
	}
	return strings.Contains(lower, "/download") ||
		strings.Contains(lower, ".png") ||
		strings.Contains(lower, ".jpg") ||
		strings.Contains(lower, ".jpeg") ||
		strings.Contains(lower, ".webp")
}

// isLikelyOpenAIImageDownloadURL is retained for backward compat.

func resolveImageDownloadLink(
	ctx context.Context,
	client *req.Client,
	headers http.Header,
	conversationID string,
	pointer string,
	errorBodyReadLimit int64,
) (string, error) {
	targetURL := ""
	retryConversation := false
	switch {
	case strings.HasPrefix(pointer, "file-service://"):
		fileID := strings.TrimPrefix(pointer, "file-service://")
		targetURL = fmt.Sprintf("%s/%s/download", openAIChatGPTFilesURL, fileID)
	case strings.HasPrefix(pointer, "sediment://"):
		attachID := strings.TrimPrefix(pointer, "sediment://")
		targetURL = fmt.Sprintf("https://chatgpt.com/backend-api/conversation/%s/attachment/%s/download", conversationID, attachID)
		retryConversation = true
	default:
		return "", fmt.Errorf("unrecognized image pointer scheme: %s", pointer)
	}

	var lastError error
	maxAttempts := 8
	for round := 0; round < maxAttempts; round++ {
		var linkResp struct {
			DownloadURL string `json:"download_url"`
		}
		httpResp, httpErr := client.R().
			SetContext(ctx).
			SetHeaders(flattenHTTPHeader(headers)).
			SetSuccessResult(&linkResp).
			Get(targetURL)
		if httpErr != nil {
			lastError = httpErr
		} else if httpResp.IsSuccessState() && strings.TrimSpace(linkResp.DownloadURL) != "" {
			return strings.TrimSpace(linkResp.DownloadURL), nil
		} else {
			statusErr := buildImageStatusError(httpResp, "could not resolve image download link", errorBodyReadLimit)
			if !retryConversation || !isTransientConversationNotFound(statusErr) {
				return "", statusErr
			}
			lastError = statusErr
		}
		if round == maxAttempts-1 {
			break
		}
		backoff := time.NewTimer(750 * time.Millisecond)
		select {
		case <-ctx.Done():
			if !backoff.Stop() {
				<-backoff.C
			}
			return "", ctx.Err()
		case <-backoff.C:
		}
	}
	if lastError == nil {
		lastError = fmt.Errorf("failed to resolve image download link after retries")
	}
	return "", lastError
}

// fetchOpenAIImageDownloadURL is retained for backward compat.

func fetchImageBytesFromURL(ctx context.Context, client *req.Client, headers http.Header, downloadURL string, errorBodyReadLimit int64) ([]byte, error) {
	r := client.R().
		SetContext(ctx).
		DisableAutoReadResponse()

	if strings.HasPrefix(downloadURL, openAIChatGPTStartURL) {
		hdrs := copyHTTPHeaders(headers)
		hdrs.Set("Accept", "image/*,*/*;q=0.8")
		hdrs.Del("Content-Type")
		r.SetHeaders(flattenHTTPHeader(hdrs))
	} else {
		ua := strings.TrimSpace(headers.Get("User-Agent"))
		if ua == "" {
			ua = openAIImageBackendUserAgent
		}
		r.SetHeader("User-Agent", ua)
	}

	httpResp, httpErr := r.Get(downloadURL)
	if httpErr != nil {
		return nil, httpErr
	}
	defer func() {
		if httpResp != nil && httpResp.Body != nil {
			_ = httpResp.Body.Close()
		}
	}()
	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		return nil, buildImageStatusError(httpResp, "image download returned non-success status", errorBodyReadLimit)
	}
	return io.ReadAll(io.LimitReader(httpResp.Body, openAIImageMaxDownloadBytes))
}

// downloadOpenAIImageBytes is retained for backward compat.

type openAIImageStatusError struct {
	StatusCode      int
	Message         string
	ResponseBody    []byte
	ResponseHeaders http.Header
	RequestID       string
	URL             string
}

func (e *openAIImageStatusError) Error() string {
	if e == nil {
		return "image backend request error"
	}
	if e.Message != "" {
		return e.Message
	}
	if e.StatusCode > 0 {
		return fmt.Sprintf("image backend request returned status %d", e.StatusCode)
	}
	return "image backend request error"
}

func buildImageStatusError(resp *req.Response, fallbackMsg string, errorBodyReadLimit int64) error {
	if resp == nil {
		if strings.TrimSpace(fallbackMsg) == "" {
			fallbackMsg = "image backend request error"
		}
		return fmt.Errorf("%s", fallbackMsg)
	}

	code := resp.StatusCode
	hdrs := http.Header(nil)
	reqID := ""
	reqURL := ""
	var bodyBytes []byte

	if resp.Response != nil {
		hdrs = resp.Header.Clone()
		reqID = strings.TrimSpace(resp.Header.Get("x-request-id"))
		if resp.Request != nil && resp.Request.URL != nil {
			reqURL = resp.Request.URL.String()
		}
		if resp.Body != nil {
			if errorBodyReadLimit <= 0 {
				errorBodyReadLimit = openAIUpstreamErrorBodyReadLimit
			}
			bodyBytes, _ = io.ReadAll(io.LimitReader(resp.Body, errorBodyReadLimit))
			_ = resp.Body.Close()
		}
	}

	msg := sanitizeUpstreamErrorMessage(extractUpstreamErrorMessage(bodyBytes))
	if msg == "" {
		prefix := strings.TrimSpace(fallbackMsg)
		if prefix == "" {
			prefix = "image backend request error"
		}
		msg = fmt.Sprintf("%s: status %d", prefix, code)
	}

	return &openAIImageStatusError{
		StatusCode:      code,
		Message:         msg,
		ResponseBody:    bodyBytes,
		ResponseHeaders: hdrs,
		RequestID:       reqID,
		URL:             reqURL,
	}
}

// newOpenAIImageStatusError is retained for backward compat.
func newOpenAIImageStatusError(resp *req.Response, fallback string, errorBodyReadLimit int64) error {
	return buildImageStatusError(resp, fallback, errorBodyReadLimit)
}

func isTransientConversationNotFound(err error) bool {
	se, ok := err.(*openAIImageStatusError)
	if !ok || se == nil || se.StatusCode != http.StatusNotFound {
		return false
	}
	lower := strings.ToLower(strings.TrimSpace(se.Message))
	if strings.Contains(lower, "conversation_not_found") {
		return true
	}
	if strings.Contains(lower, "conversation") && strings.Contains(lower, "not found") {
		return true
	}
	bodyLower := strings.ToLower(strings.TrimSpace(extractUpstreamErrorMessage(se.ResponseBody)))
	if strings.Contains(bodyLower, "conversation_not_found") {
		return true
	}
	return strings.Contains(bodyLower, "conversation") && strings.Contains(bodyLower, "not found")
}

// isOpenAIImageTransientConversationNotFoundError is retained for backward compat.

func copyHTTPHeaders(src http.Header) http.Header {
	dup := make(http.Header, len(src))
	for k, vs := range src {
		cpy := make([]string, len(vs))
		copy(cpy, vs)
		dup[k] = cpy
	}
	return dup
}

// cloneHTTPHeader is retained for backward compat.

func flattenHTTPHeader(hdr http.Header) map[string]string {
	if len(hdr) == 0 {
		return nil
	}
	flat := make(map[string]string, len(hdr))
	for k, vs := range hdr {
		if len(vs) == 0 {
			continue
		}
		flat[k] = vs[0]
	}
	return flat
}

// headerToMap is retained for backward compat.

func removeDuplicateStrings(items []string) []string {
	if len(items) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(items))
	unique := make([]string, 0, len(items))
	for _, s := range items {
		if _, already := seen[s]; already {
			continue
		}
		seen[s] = struct{}{}
		unique = append(unique, s)
	}
	return unique
}

// dedupeStrings is retained for backward compat.

// gatherResponseImageSizes is a helper wrapping the upstream counter.
func gatherResponseImageSizes(body []byte) []string {
	return collectOpenAIResponseImageOutputSizesFromJSONBytes(body)
}
