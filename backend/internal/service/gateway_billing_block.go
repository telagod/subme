package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/tidwall/gjson"
)

// Fingerprint salt aligned with the real Claude Code CLI derivation.
const fingerprintSalt = "59cf53e54c78"

// computeClaudeCodeFingerprint reproduces the Claude Code CLI cc_version fingerprint:
//  1. Extract first user-role plain text from messages
//  2. Pick characters at positions 4, 7, 20 (pad with '0' if shorter)
//  3. SHA256(salt + picked_chars + version), take first 3 hex chars
func computeClaudeCodeFingerprint(reqBody []byte, ver string) string {
	userText := extractFirstUserText(reqBody)
	pickPositions := [3]int{4, 7, 20}
	picked := make([]byte, 0, 3)
	for _, p := range pickPositions {
		if p < len(userText) {
			picked = append(picked, userText[p])
		} else {
			picked = append(picked, '0')
		}
	}
	digest := sha256.Sum256([]byte(fingerprintSalt + string(picked) + ver))
	return hex.EncodeToString(digest[:])[:3]
}

// extractFirstUserText locates the first user message and returns its leading
// text content. Handles both string and block-array content formats.
func extractFirstUserText(reqBody []byte) string {
	msgArray := gjson.GetBytes(reqBody, "messages")
	if !msgArray.IsArray() {
		return ""
	}
	var found string
	msgArray.ForEach(func(_, entry gjson.Result) bool {
		if entry.Get("role").String() != "user" {
			return true
		}
		body := entry.Get("content")
		if body.Type == gjson.String {
			found = body.String()
			return false
		}
		if body.IsArray() {
			body.ForEach(func(_, part gjson.Result) bool {
				if part.Get("type").String() == "text" {
					found = part.Get("text").String()
					return false
				}
				return true
			})
			return false
		}
		return false
	})
	return found
}

// buildBillingAttributionText produces the textual billing attribution header used
// inside the first Claude Code-shaped system block. The cch=00000 placeholder is
// later replaced with the actual xxhash64 digest of the full body.
func buildBillingAttributionText(reqBody []byte, cliVer string) (string, error) {
	if cliVer == "" {
		return "", fmt.Errorf("CLI version must be provided")
	}
	fp := computeClaudeCodeFingerprint(reqBody, cliVer)
	return fmt.Sprintf(
		"x-anthropic-billing-header: cc_version=%s.%s; cc_entrypoint=cli; cch=00000;",
		cliVer, fp,
	), nil
}

// buildBillingAttributionBlockJSON produces a system-array billing attribution
// block matching the real Claude Code CLI format. The cch=00000 placeholder is
// later replaced with the actual xxhash64 digest of the full body.
func buildBillingAttributionBlockJSON(reqBody []byte, cliVer string) ([]byte, error) {
	text, err := buildBillingAttributionText(reqBody, cliVer)
	if err != nil {
		return nil, err
	}
	return json.Marshal(map[string]string{
		"type": "text",
		"text": text,
	})
}
