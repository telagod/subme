package moderation

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Result struct {
	Flagged         bool
	CategoryScores  map[string]float64
	HighestCategory string
	HighestScore    float64
}

type CheckInput struct {
	Text     string
	ImageURL string
}

type Client struct {
	httpClient *http.Client
}

func NewClient(httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	return &Client{httpClient: httpClient}
}

func (c *Client) Check(ctx context.Context, baseURL, apiKey, model string, input CheckInput) (*Result, int, error) {
	body := buildRequest(model, input)
	payload, _ := json.Marshal(body)

	endpoint := strings.TrimRight(baseURL, "/") + "/v1/moderations"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = resp.Body.Close() }()
	raw, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(raw))
		if len(msg) > 200 {
			msg = msg[:200]
		}
		return nil, resp.StatusCode, fmt.Errorf("moderation api: status %d: %s", resp.StatusCode, msg)
	}

	var apiResp apiResponse
	if err := json.Unmarshal(raw, &apiResp); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("moderation api: decode: %w", err)
	}
	if len(apiResp.Results) == 0 {
		return &Result{CategoryScores: map[string]float64{}}, resp.StatusCode, nil
	}

	scores := apiResp.Results[0].CategoryScores
	return &Result{
		Flagged:        apiResp.Results[0].Flagged,
		CategoryScores: scores,
	}, resp.StatusCode, nil
}

func buildRequest(model string, input CheckInput) map[string]any {
	req := map[string]any{}
	if model != "" {
		req["model"] = model
	}
	if input.ImageURL != "" {
		parts := []map[string]any{
			{"type": "text", "text": input.Text},
			{"type": "image_url", "image_url": map[string]string{"url": input.ImageURL}},
		}
		req["input"] = parts
	} else {
		req["input"] = input.Text
	}
	return req
}

type apiResponse struct {
	Results []apiResult `json:"results"`
}

type apiResult struct {
	Flagged        bool               `json:"flagged"`
	CategoryScores map[string]float64 `json:"category_scores"`
}

func EvaluateScores(scores map[string]float64, thresholds map[string]float64) (flagged bool, highestCategory string, highestScore float64) {
	for cat, score := range scores {
		if score > highestScore {
			highestScore = score
			highestCategory = cat
		}
		thresh, ok := thresholds[cat]
		if !ok {
			thresh = 0.5
		}
		if score >= thresh {
			flagged = true
		}
	}
	return
}

var DefaultThresholds = map[string]float64{
	"harassment":            0.95,
	"harassment/threatening": 0.90,
	"hate":                  0.65,
	"hate/threatening":      0.95,
	"illicit":               0.95,
	"illicit/violent":       0.95,
	"self-harm":            0.65,
	"self-harm/intent":     0.85,
	"self-harm/instructions": 0.95,
	"sexual":               0.65,
	"sexual/minors":        0.65,
	"violence":             0.95,
	"violence/graphic":     0.95,
}

var Categories = []string{
	"harassment", "harassment/threatening",
	"hate", "hate/threatening",
	"illicit", "illicit/violent",
	"self-harm", "self-harm/intent", "self-harm/instructions",
	"sexual", "sexual/minors",
	"violence", "violence/graphic",
}
