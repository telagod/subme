package service

import (
	"testing"
)

// fixture 构造 catalog，不依赖网络。
func catalogFixture() []CatalogModel {
	return []CatalogModel{
		{ID: "anthropic/claude-sonnet-4-5"},
		{ID: "anthropic/claude-sonnet-4.5"}, // 点号版本（同模型另一 ID，用于测试去重逻辑）
		{ID: "anthropic/claude-3-5-sonnet"},
		{ID: "anthropic/claude-opus-4"},
		{ID: "anthropic/claude-haiku-3"},
		{ID: "openai/gpt-4o"},
		{ID: "openai/gpt-4o-mini"},
		{ID: "openai/o3"},
		{ID: "google/gemini-2.0-flash"},
		{ID: "google/gemini-pro"},
		{ID: "meta-llama/llama-3.1-70b-instruct"},
	}
}

func TestMatchModelSlug_DirectExact(t *testing.T) {
	catalog := catalogFixture()
	slug, ok := MatchModelSlug("anthropic/claude-opus-4", "", catalog)
	if !ok || slug != "anthropic/claude-opus-4" {
		t.Fatalf("want (anthropic/claude-opus-4, true), got (%q, %v)", slug, ok)
	}
}

func TestMatchModelSlug_NormExact_DotDash(t *testing.T) {
	// "claude-sonnet-4.6" 里的 . 应归一化为 -，与 catalog 中同模型匹配
	catalog := []CatalogModel{
		{ID: "anthropic/claude-sonnet-4-6"},
	}
	slug, ok := MatchModelSlug("claude-sonnet-4.6", "", catalog)
	if !ok || slug != "anthropic/claude-sonnet-4-6" {
		t.Fatalf("want (anthropic/claude-sonnet-4-6, true), got (%q, %v)", slug, ok)
	}
}

func TestMatchModelSlug_NormExact_ProviderPrefix(t *testing.T) {
	// 本地名带 anthropic/ 前缀，catalog 里也有
	catalog := catalogFixture()
	slug, ok := MatchModelSlug("anthropic/claude-haiku-3", "", catalog)
	if !ok || slug != "anthropic/claude-haiku-3" {
		t.Fatalf("want (anthropic/claude-haiku-3, true), got (%q, %v)", slug, ok)
	}
}

func TestMatchModelSlug_StripLatest(t *testing.T) {
	catalog := []CatalogModel{
		{ID: "openai/gpt-4o"},
	}
	slug, ok := MatchModelSlug("gpt-4o-latest", "openai", catalog)
	if !ok || slug != "openai/gpt-4o" {
		t.Fatalf("want (openai/gpt-4o, true), got (%q, %v)", slug, ok)
	}
}

func TestMatchModelSlug_StripDateSuffix(t *testing.T) {
	catalog := []CatalogModel{
		{ID: "anthropic/claude-opus-4"},
	}
	// 带 8 位日期
	slug, ok := MatchModelSlug("anthropic/claude-opus-4-20250601", "", catalog)
	if !ok || slug != "anthropic/claude-opus-4" {
		t.Fatalf("want (anthropic/claude-opus-4, true), got (%q, %v)", slug, ok)
	}
}

func TestMatchModelSlug_StripDateSuffix6Digit(t *testing.T) {
	catalog := []CatalogModel{
		{ID: "openai/gpt-4o-mini"},
	}
	slug, ok := MatchModelSlug("openai/gpt-4o-mini-202506", "", catalog)
	if !ok || slug != "openai/gpt-4o-mini" {
		t.Fatalf("want (openai/gpt-4o-mini, true), got (%q, %v)", slug, ok)
	}
}

func TestMatchModelSlug_PlatformDisambig_Anthropic(t *testing.T) {
	// 本地只有短名，依赖 platform 消歧
	catalog := catalogFixture()
	slug, ok := MatchModelSlug("claude-opus-4", "anthropic", catalog)
	if !ok || slug != "anthropic/claude-opus-4" {
		t.Fatalf("want (anthropic/claude-opus-4, true), got (%q, %v)", slug, ok)
	}
}

func TestMatchModelSlug_PlatformDisambig_OpenAI(t *testing.T) {
	catalog := catalogFixture()
	slug, ok := MatchModelSlug("gpt-4o", "openai", catalog)
	if !ok || slug != "openai/gpt-4o" {
		t.Fatalf("want (openai/gpt-4o, true), got (%q, %v)", slug, ok)
	}
}

func TestMatchModelSlug_PlatformDisambig_Google(t *testing.T) {
	catalog := catalogFixture()
	slug, ok := MatchModelSlug("gemini-pro", "google", catalog)
	if !ok || slug != "google/gemini-pro" {
		t.Fatalf("want (google/gemini-pro, true), got (%q, %v)", slug, ok)
	}
}

func TestMatchModelSlug_NoMatch_UnknownModel(t *testing.T) {
	catalog := catalogFixture()
	slug, ok := MatchModelSlug("totally-unknown-model-xyz", "", catalog)
	if ok {
		t.Fatalf("want (false), got slug=%q ok=%v", slug, ok)
	}
}

func TestMatchModelSlug_NoMatch_WrongPlatform(t *testing.T) {
	// claude 模型但 platform 给的是 openai，不应匹配
	catalog := catalogFixture()
	slug, ok := MatchModelSlug("claude-opus-4", "openai", catalog)
	// claude-opus-4 归一化后在 openai/ 前缀下找不到
	if ok {
		t.Fatalf("should not match claude under openai platform, got slug=%q", slug)
	}
}

func TestMatchModelSlug_NoMatch_EmptyInput(t *testing.T) {
	catalog := catalogFixture()
	slug, ok := MatchModelSlug("", "", catalog)
	if ok {
		t.Fatalf("empty input should return false, got slug=%q", slug)
	}
}

func TestMatchModelSlug_NoMatch_EmptyCatalog(t *testing.T) {
	slug, ok := MatchModelSlug("gpt-4o", "openai", nil)
	if ok {
		t.Fatalf("empty catalog should return false, got slug=%q", slug)
	}
}

func TestMatchModelSlug_ShortestSlugWins(t *testing.T) {
	// 多候选时取最短 slug
	catalog := []CatalogModel{
		{ID: "anthropic/claude-opus-4-extended"},
		{ID: "anthropic/claude-opus-4"},
		{ID: "anthropic/claude-opus-4-preview"},
	}
	slug, ok := MatchModelSlug("claude-opus-4", "anthropic", catalog)
	if !ok || slug != "anthropic/claude-opus-4" {
		t.Fatalf("want shortest slug (anthropic/claude-opus-4), got (%q, %v)", slug, ok)
	}
}

func TestMatchModelSlug_DotDashNormExact_BothDirections(t *testing.T) {
	// catalog 里是 "claude-sonnet-4.5"（带点），本地给 "claude-sonnet-4-5"（横线）
	catalog := []CatalogModel{
		{ID: "anthropic/claude-sonnet-4.5"},
	}
	slug, ok := MatchModelSlug("anthropic/claude-sonnet-4-5", "", catalog)
	if !ok || slug != "anthropic/claude-sonnet-4.5" {
		t.Fatalf("want (anthropic/claude-sonnet-4.5, true), got (%q, %v)", slug, ok)
	}
}

func TestNormalizeModelName(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"anthropic/claude-opus-4", "claude-opus-4"},
		{"openai/gpt-4o-latest", "gpt-4o"},
		{"google/gemini-2.0-flash", "gemini-2-0-flash"},
		{"claude-sonnet-4.6", "claude-sonnet-4-6"},
		{"claude-opus-4-20250601", "claude-opus-4"},
		{"gpt-4o:latest", "gpt-4o"},
		{"Claude-Opus-4", "claude-opus-4"},
		{"openai/GPT-4O", "gpt-4o"},
	}
	for _, tc := range cases {
		got := normalizeModelName(tc.input)
		if got != tc.want {
			t.Errorf("normalizeModelName(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}
