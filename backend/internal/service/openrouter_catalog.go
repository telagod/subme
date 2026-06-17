package service

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/telagod/subme/internal/config"
	"github.com/telagod/subme/internal/pkg/logger"
)

// ── OpenRouter 数据源 ──
//
// 单一源拿齐「价格 + 描述 + 能力 + 多供应商拆价」：
//   - GET /api/v1/models                         全量目录（代表价 + 描述 + 能力）
//   - GET /api/v1/models/{author}/{slug}/endpoints  单模型按供应商拆价
//
// 取舍（一模型多供应商价差）：官方价基准默认取「各供应商最低价」。
// 首方前沿模型各家通常同价；开源模型各家价差大，最低价 = 最保守的成本锚。
const (
	openRouterModelsURL    = "https://openrouter.ai/api/v1/models"
	openRouterEndpointsFmt = "https://openrouter.ai/api/v1/models/%s/endpoints"
)

// CatalogProviderPrice 单个供应商对某模型的报价（每 token，USD）。
type CatalogProviderPrice struct {
	Provider   string  `json:"provider"`    // "Anthropic" / "Amazon Bedrock"
	Tag        string  `json:"tag"`         // "anthropic" / "amazon-bedrock"
	Input      float64 `json:"input"`       // per-token
	Output     float64 `json:"output"`      // per-token
	CacheRead  float64 `json:"cache_read"`  // per-token
	CacheWrite float64 `json:"cache_write"` // per-token
	Uptime1d   float64 `json:"uptime_1d"`   // 0..100
	Quant      string  `json:"quant,omitempty"`
}

// CatalogModel 模型目录条目（来自 OpenRouter）。
type CatalogModel struct {
	ID           string                 `json:"id"` // openrouter slug, e.g. "anthropic/claude-sonnet-4.5"
	Name         string                 `json:"name"`
	Description  string                 `json:"description"`
	ContextLen   int                    `json:"context_len"`
	Modalities   []string               `json:"modalities,omitempty"`
	Capabilities []string               `json:"capabilities,omitempty"`
	Providers    []CatalogProviderPrice `json:"providers,omitempty"` // 来自 /endpoints；空表示仅有代表价
	Repr         CatalogProviderPrice   `json:"repr"`                // /models 的代表价（providers 为空时的兜底）
	Updated      time.Time              `json:"updated"`
}

// BaselinePrice 按「最低价」取舍计算官方价基准；providers 为空时回退代表价。
// 返回所选供应商 tag（来源，供前端核对）。
func (m *CatalogModel) BaselinePrice() (input, output, cacheRead, cacheWrite float64, sourceTag string) {
	if len(m.Providers) == 0 {
		return m.Repr.Input, m.Repr.Output, m.Repr.CacheRead, m.Repr.CacheWrite, m.Repr.Tag
	}
	best := -1
	bestSum := math.MaxFloat64
	for i, p := range m.Providers {
		// 以 input+output 之和判定最低（缓存价多数同步浮动）；跳过缺价项。
		if p.Input <= 0 && p.Output <= 0 {
			continue
		}
		sum := p.Input + p.Output
		if sum < bestSum {
			bestSum = sum
			best = i
		}
	}
	if best < 0 {
		return m.Repr.Input, m.Repr.Output, m.Repr.CacheRead, m.Repr.CacheWrite, m.Repr.Tag
	}
	p := m.Providers[best]
	return p.Input, p.Output, p.CacheRead, p.CacheWrite, p.Tag
}

// ── OpenRouter 原始 JSON 结构 ──

type orPricing struct {
	Prompt          string `json:"prompt"`
	Completion      string `json:"completion"`
	InputCacheRead  string `json:"input_cache_read"`
	InputCacheWrite string `json:"input_cache_write"`
}

func (p orPricing) f(s string) float64 {
	v, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil || v < 0 {
		return 0
	}
	return v
}

type orArchitecture struct {
	InputModalities  []string `json:"input_modalities"`
	OutputModalities []string `json:"output_modalities"`
}

type orModel struct {
	ID                  string         `json:"id"`
	Name                string         `json:"name"`
	Description         string         `json:"description"`
	ContextLength       int            `json:"context_length"`
	Architecture        orArchitecture `json:"architecture"`
	Pricing             orPricing      `json:"pricing"`
	SupportedParameters []string       `json:"supported_parameters"`
}

type orModelsResponse struct {
	Data []orModel `json:"data"`
}

type orEndpoint struct {
	ProviderName string    `json:"provider_name"`
	Tag          string    `json:"tag"`
	Pricing      orPricing `json:"pricing"`
	Quantization string    `json:"quantization"`
	UptimeLast1d float64   `json:"uptime_last_1d"`
}

type orEndpointsResponse struct {
	Data struct {
		ID          string       `json:"id"`
		Name        string       `json:"name"`
		Description string       `json:"description"`
		Endpoints   []orEndpoint `json:"endpoints"`
	} `json:"data"`
}

// ── 目录服务 ──

// OpenRouterCatalogService 拉取并缓存 OpenRouter 模型目录。
// 复用 PricingRemoteClient 的 SSRF 安全 HTTP 拉取；缓存到 data 目录 + 内存。
type OpenRouterCatalogService struct {
	cfg          *config.Config
	remoteClient PricingRemoteClient

	mu          sync.RWMutex
	models      map[string]*CatalogModel // key = slug
	lastUpdated time.Time
}

// NewOpenRouterCatalogService 创建目录服务（不自动拉取，由 Sync 触发）。
func NewOpenRouterCatalogService(cfg *config.Config, remoteClient PricingRemoteClient) *OpenRouterCatalogService {
	return &OpenRouterCatalogService{
		cfg:          cfg,
		remoteClient: remoteClient,
		models:       make(map[string]*CatalogModel),
	}
}

func (s *OpenRouterCatalogService) catalogFilePath() string {
	dir := "data"
	if s.cfg != nil && strings.TrimSpace(s.cfg.Pricing.DataDir) != "" {
		dir = s.cfg.Pricing.DataDir
	}
	return filepath.Join(dir, "model_catalog.json")
}

// Initialize 从本地缓存加载（若存在）；远程同步由调用方/调度按需触发。
func (s *OpenRouterCatalogService) Initialize() error {
	if err := s.loadFromDisk(); err != nil {
		logger.LegacyPrintf("service.catalog", "[Catalog] no local cache yet: %v", err)
	}
	return nil
}

// SyncModels 拉取 OpenRouter /models 全量目录（代表价 + 描述 + 能力），不含多供应商明细。
func (s *OpenRouterCatalogService) SyncModels(ctx context.Context) (int, error) {
	body, err := s.remoteClient.FetchPricingJSON(ctx, openRouterModelsURL)
	if err != nil {
		return 0, fmt.Errorf("fetch openrouter models: %w", err)
	}
	var resp orModelsResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return 0, fmt.Errorf("parse openrouter models: %w", err)
	}
	now := nowUTC()

	s.mu.Lock()
	for _, m := range resp.Data {
		if strings.TrimSpace(m.ID) == "" {
			continue
		}
		// OpenRouter slug 形如 "anthropic/claude-sonnet-4"——slug 第一段就是
		// provider tag。SyncModels 拉的是聚合代表价，没有单一 provider 明细，
		// 取 slug 前缀作为 Repr.Tag 既稳定又对前端展示「最低价供应商」友好。
		// SyncModelEndpoints 后续会用真实 providers 列表覆盖。
		reprTag := ""
		if idx := strings.Index(m.ID, "/"); idx > 0 {
			reprTag = m.ID[:idx]
		}
		repr := CatalogProviderPrice{
			Tag:        reprTag,
			Input:      m.Pricing.f(m.Pricing.Prompt),
			Output:     m.Pricing.f(m.Pricing.Completion),
			CacheRead:  m.Pricing.f(m.Pricing.InputCacheRead),
			CacheWrite: m.Pricing.f(m.Pricing.InputCacheWrite),
		}
		modalities := append([]string{}, m.Architecture.InputModalities...)
		existing := s.models[m.ID]
		entry := &CatalogModel{
			ID:           m.ID,
			Name:         m.Name,
			Description:  m.Description,
			ContextLen:   m.ContextLength,
			Modalities:   modalities,
			Capabilities: capabilitiesFromParams(m.SupportedParameters),
			Repr:         repr,
			Updated:      now,
		}
		// 保留已拉取的多供应商明细，避免被 /models 同步覆盖清空。
		if existing != nil {
			entry.Providers = existing.Providers
		}
		s.models[m.ID] = entry
	}
	s.lastUpdated = now
	count := len(s.models)
	s.mu.Unlock()

	if err := s.saveToDisk(); err != nil {
		logger.LegacyPrintf("service.catalog", "[Catalog] save failed: %v", err)
	}
	return count, nil
}

// SyncModelEndpoints 拉取单模型按供应商拆价（懒加载：仅对在用模型调用）。
func (s *OpenRouterCatalogService) SyncModelEndpoints(ctx context.Context, slug string) error {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return fmt.Errorf("empty model slug")
	}
	url := fmt.Sprintf(openRouterEndpointsFmt, slug)
	body, err := s.remoteClient.FetchPricingJSON(ctx, url)
	if err != nil {
		return fmt.Errorf("fetch endpoints %s: %w", slug, err)
	}
	var resp orEndpointsResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return fmt.Errorf("parse endpoints %s: %w", slug, err)
	}
	providers := make([]CatalogProviderPrice, 0, len(resp.Data.Endpoints))
	for _, e := range resp.Data.Endpoints {
		providers = append(providers, CatalogProviderPrice{
			Provider:   e.ProviderName,
			Tag:        e.Tag,
			Input:      e.Pricing.f(e.Pricing.Prompt),
			Output:     e.Pricing.f(e.Pricing.Completion),
			CacheRead:  e.Pricing.f(e.Pricing.InputCacheRead),
			CacheWrite: e.Pricing.f(e.Pricing.InputCacheWrite),
			Uptime1d:   e.UptimeLast1d,
			Quant:      e.Quantization,
		})
	}

	s.mu.Lock()
	entry := s.models[slug]
	if entry == nil {
		entry = &CatalogModel{ID: slug, Name: resp.Data.Name, Description: resp.Data.Description, Updated: nowUTC()}
		s.models[slug] = entry
	}
	entry.Providers = providers
	if entry.Description == "" {
		entry.Description = resp.Data.Description
	}
	s.mu.Unlock()

	if err := s.saveToDisk(); err != nil {
		logger.LegacyPrintf("service.catalog", "[Catalog] save failed: %v", err)
	}
	return nil
}

// Get 返回单模型目录条目（拷贝）；slug 未命中返回 nil。
func (s *OpenRouterCatalogService) Get(slug string) *CatalogModel {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if m, ok := s.models[strings.TrimSpace(slug)]; ok {
		cp := *m
		return &cp
	}
	return nil
}

// List 返回全量目录条目（按 ID 排序的拷贝）。
func (s *OpenRouterCatalogService) List() []CatalogModel {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]CatalogModel, 0, len(s.models))
	for _, m := range s.models {
		out = append(out, *m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// LastUpdated 返回上次同步时间。
func (s *OpenRouterCatalogService) LastUpdated() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.lastUpdated
}

// ── 持久化 ──

type catalogDisk struct {
	Models      []CatalogModel `json:"models"`
	LastUpdated time.Time      `json:"last_updated"`
}

func (s *OpenRouterCatalogService) saveToDisk() error {
	s.mu.RLock()
	disk := catalogDisk{Models: make([]CatalogModel, 0, len(s.models)), LastUpdated: s.lastUpdated}
	for _, m := range s.models {
		disk.Models = append(disk.Models, *m)
	}
	s.mu.RUnlock()

	path := s.catalogFilePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(disk)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (s *OpenRouterCatalogService) loadFromDisk() error {
	data, err := os.ReadFile(s.catalogFilePath())
	if err != nil {
		return err
	}
	var disk catalogDisk
	if err := json.Unmarshal(data, &disk); err != nil {
		return err
	}
	s.mu.Lock()
	for i := range disk.Models {
		m := disk.Models[i]
		s.models[m.ID] = &m
	}
	s.lastUpdated = disk.LastUpdated
	s.mu.Unlock()
	return nil
}

// ── 工具 ──

// capabilitiesFromParams 从 OpenRouter supported_parameters 提炼能力标签。
func capabilitiesFromParams(params []string) []string {
	want := map[string]string{
		"reasoning":          "reasoning",
		"include_reasoning":  "reasoning",
		"tools":              "tools",
		"tool_choice":        "tools",
		"structured_outputs": "structured_outputs",
		"response_format":    "structured_outputs",
	}
	seen := map[string]bool{}
	out := []string{}
	for _, p := range params {
		if cap, ok := want[strings.ToLower(strings.TrimSpace(p))]; ok && !seen[cap] {
			seen[cap] = true
			out = append(out, cap)
		}
	}
	return out
}

func nowUTC() time.Time { return time.Now().UTC() }
