package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	infraerrors "github.com/telagod/subme/internal/pkg/errors"
	"github.com/telagod/subme/internal/pkg/pagination"
)

const (
	ContentModerationModeOff      = "off"
	ContentModerationModeObserve  = "observe"
	ContentModerationModePreBlock = "pre_block"

	contentModerationAPIKeysModeAppend  = "append"
	contentModerationAPIKeysModeReplace = "replace"

	ContentModerationActionAllow        = "allow"
	ContentModerationActionBlock        = "block"
	ContentModerationActionHashBlock    = "hash_block"
	ContentModerationActionKeywordBlock = "keyword_block"
	ContentModerationActionError        = "error"

	contentModerationKeywordCategory = "keyword"

	ContentModerationKeywordModeKeywordOnly   = "keyword_only"
	ContentModerationKeywordModeKeywordAndAPI = "keyword_and_api"
	ContentModerationKeywordModeAPIOnly       = "api_only"

	ContentModerationModelFilterAll     = "all"
	ContentModerationModelFilterInclude = "include"
	ContentModerationModelFilterExclude = "exclude"

	ContentModerationProtocolAnthropicMessages = "anthropic_messages"
	ContentModerationProtocolOpenAIResponses   = "openai_responses"
	ContentModerationProtocolOpenAIChat        = "openai_chat_completions"
	ContentModerationProtocolGemini            = "gemini"
	ContentModerationProtocolOpenAIImages      = "openai_images"

	defaultContentModerationBaseURL   = "https://api.openai.com"
	defaultContentModerationModel     = "omni-moderation-latest"
	defaultContentModerationTimeoutMS = 3000
	maxContentModerationTimeoutMS     = 30000
	maxModerationInputRunes           = 12000
	maxModerationExcerptRunes         = 240

	defaultContentModerationWorkerCount          = 4
	maxContentModerationWorkerCount              = 32
	defaultContentModerationQueueSize            = 32768
	maxContentModerationQueueSize                = 100000
	defaultContentModerationBanThreshold         = 10
	defaultContentModerationViolationWindowHours = 720
	defaultContentModerationBlockHTTPStatus      = http.StatusForbidden
	defaultContentModerationBlockMessage         = "内容审计命中风险规则，请调整输入后重试"
	defaultContentModerationRetryCount           = 2
	maxContentModerationRetryCount               = 5
	defaultContentModerationHitRetentionDays     = 180
	defaultContentModerationNonHitRetentionDays  = 3
	maxContentModerationRetentionDays            = 3650
	maxContentModerationNonHitRetentionDays      = 3
	contentModerationKeyRateLimitFreezeDuration  = time.Minute
	contentModerationKeyAuthFreezeDuration       = 10 * time.Minute
	contentModerationKeyHTTPErrorFreezeDuration  = 10 * time.Second
	maxContentModerationInputImages              = 1
	maxContentModerationTestImages               = maxContentModerationInputImages
	maxContentModerationTestImageBytes           = 8 * 1024 * 1024
	maxContentModerationTestImageDataURLBytes    = 12 * 1024 * 1024
	maxContentModerationBlockedKeywords          = 10000
	maxContentModerationBlockedKeywordRunes      = 200
	maxContentModerationModelFilterModels        = 1000
	maxContentModerationModelFilterRunes         = 200

	contentModerationCleanupInterval = 24 * time.Hour
	contentModerationCleanupTimeout  = 30 * time.Minute
	contentModerationCleanupDelay    = 5 * time.Minute
)

// orderedModerationCategories defines the canonical ordering for category evaluation.
var contentModerationCategoryOrder = []string{
	"harassment",
	"harassment/threatening",
	"hate",
	"hate/threatening",
	"illicit",
	"illicit/violent",
	"self-harm",
	"self-harm/intent",
	"self-harm/instructions",
	"sexual",
	"sexual/minors",
	"violence",
	"violence/graphic",
}

func ContentModerationDefaultThresholds() map[string]float64 {
	return map[string]float64{
		"harassment":             0.98,
		"harassment/threatening": 0.90,
		"hate":                   0.65,
		"hate/threatening":       0.65,
		"illicit":                0.95,
		"illicit/violent":        0.95,
		"self-harm":              0.65,
		"self-harm/intent":       0.85,
		"self-harm/instructions": 0.65,
		"sexual":                 0.65,
		"sexual/minors":          0.65,
		"violence":               0.95,
		"violence/graphic":       0.95,
	}
}

func ContentModerationCategories() []string {
	result := make([]string, len(contentModerationCategoryOrder))
	copy(result, contentModerationCategoryOrder)
	return result
}

type ContentModerationConfig struct {
	Enabled              bool                         `json:"enabled"`
	Mode                 string                       `json:"mode"`
	BaseURL              string                       `json:"base_url"`
	Model                string                       `json:"model"`
	APIKey               string                       `json:"api_key,omitempty"`
	APIKeys              []string                     `json:"api_keys,omitempty"`
	TimeoutMS            int                          `json:"timeout_ms"`
	SampleRate           int                          `json:"sample_rate"`
	AllGroups            bool                         `json:"all_groups"`
	GroupIDs             []int64                      `json:"group_ids"`
	RecordNonHits        bool                         `json:"record_non_hits"`
	Thresholds           map[string]float64           `json:"thresholds"`
	WorkerCount          int                          `json:"worker_count"`
	QueueSize            int                          `json:"queue_size"`
	BlockStatus          int                          `json:"block_status"`
	BlockMessage         string                       `json:"block_message"`
	EmailOnHit           bool                         `json:"email_on_hit"`
	AutoBanEnabled       bool                         `json:"auto_ban_enabled"`
	BanThreshold         int                          `json:"ban_threshold"`
	ViolationWindowHours int                          `json:"violation_window_hours"`
	RetryCount           int                          `json:"retry_count"`
	HitRetentionDays     int                          `json:"hit_retention_days"`
	NonHitRetentionDays  int                          `json:"non_hit_retention_days"`
	PreHashCheckEnabled  bool                         `json:"pre_hash_check_enabled"`
	BlockedKeywords      []string                     `json:"blocked_keywords"`
	KeywordBlockingMode  string                       `json:"keyword_blocking_mode"`
	ModelFilter          ContentModerationModelFilter `json:"model_filter"`
}

type ContentModerationConfigView struct {
	Enabled              bool                            `json:"enabled"`
	Mode                 string                          `json:"mode"`
	BaseURL              string                          `json:"base_url"`
	Model                string                          `json:"model"`
	APIKeyConfigured     bool                            `json:"api_key_configured"`
	APIKeyMasked         string                          `json:"api_key_masked"`
	APIKeyCount          int                             `json:"api_key_count"`
	APIKeyMasks          []string                        `json:"api_key_masks"`
	APIKeyStatuses       []ContentModerationAPIKeyStatus `json:"api_key_statuses"`
	TimeoutMS            int                             `json:"timeout_ms"`
	SampleRate           int                             `json:"sample_rate"`
	AllGroups            bool                            `json:"all_groups"`
	GroupIDs             []int64                         `json:"group_ids"`
	RecordNonHits        bool                            `json:"record_non_hits"`
	Thresholds           map[string]float64              `json:"thresholds"`
	WorkerCount          int                             `json:"worker_count"`
	QueueSize            int                             `json:"queue_size"`
	BlockStatus          int                             `json:"block_status"`
	BlockMessage         string                          `json:"block_message"`
	EmailOnHit           bool                            `json:"email_on_hit"`
	AutoBanEnabled       bool                            `json:"auto_ban_enabled"`
	BanThreshold         int                             `json:"ban_threshold"`
	ViolationWindowHours int                             `json:"violation_window_hours"`
	RetryCount           int                             `json:"retry_count"`
	HitRetentionDays     int                             `json:"hit_retention_days"`
	NonHitRetentionDays  int                             `json:"non_hit_retention_days"`
	PreHashCheckEnabled  bool                            `json:"pre_hash_check_enabled"`
	BlockedKeywords      []string                        `json:"blocked_keywords"`
	KeywordBlockingMode  string                          `json:"keyword_blocking_mode"`
	ModelFilter          ContentModerationModelFilter    `json:"model_filter"`
}

type ContentModerationAPIKeyStatus struct {
	Index          int        `json:"index"`
	KeyHash        string     `json:"key_hash"`
	Masked         string     `json:"masked"`
	Status         string     `json:"status"`
	FailureCount   int        `json:"failure_count"`
	SuccessCount   int64      `json:"success_count"`
	LastError      string     `json:"last_error"`
	LastCheckedAt  *time.Time `json:"last_checked_at,omitempty"`
	FrozenUntil    *time.Time `json:"frozen_until,omitempty"`
	LastLatencyMS  int        `json:"last_latency_ms"`
	LastHTTPStatus int        `json:"last_http_status"`
	LastTested     bool       `json:"last_tested"`
	Configured     bool       `json:"configured"`
}

type ContentModerationAPIKeyLoad struct {
	Index          int    `json:"index"`
	KeyHash        string `json:"key_hash"`
	Masked         string `json:"masked"`
	Status         string `json:"status"`
	Active         int64  `json:"active"`
	Total          int64  `json:"total"`
	Success        int64  `json:"success"`
	Errors         int64  `json:"errors"`
	AvgLatencyMS   int64  `json:"avg_latency_ms"`
	LastLatencyMS  int    `json:"last_latency_ms"`
	LastHTTPStatus int    `json:"last_http_status"`
}

type TestContentModerationAPIKeysInput struct {
	APIKeys   []string `json:"api_keys"`
	BaseURL   string   `json:"base_url"`
	Model     string   `json:"model"`
	TimeoutMS int      `json:"timeout_ms"`
	Prompt    string   `json:"prompt"`
	Images    []string `json:"images"`
}

type TestContentModerationAPIKeysResult struct {
	Items       []ContentModerationAPIKeyStatus   `json:"items"`
	AuditResult *ContentModerationTestAuditResult `json:"audit_result,omitempty"`
	ImageCount  int                               `json:"image_count"`
}

type ContentModerationTestAuditResult struct {
	Flagged         bool               `json:"flagged"`
	HighestCategory string             `json:"highest_category"`
	HighestScore    float64            `json:"highest_score"`
	CompositeScore  float64            `json:"composite_score"`
	CategoryScores  map[string]float64 `json:"category_scores"`
	Thresholds      map[string]float64 `json:"thresholds"`
}

type UpdateContentModerationConfigInput struct {
	Enabled              *bool                         `json:"enabled"`
	Mode                 *string                       `json:"mode"`
	BaseURL              *string                       `json:"base_url"`
	Model                *string                       `json:"model"`
	APIKey               *string                       `json:"api_key"`
	APIKeys              *[]string                     `json:"api_keys"`
	APIKeysMode          string                        `json:"api_keys_mode"`
	DeleteAPIKeyHashes   *[]string                     `json:"delete_api_key_hashes"`
	ClearAPIKey          bool                          `json:"clear_api_key"`
	TimeoutMS            *int                          `json:"timeout_ms"`
	SampleRate           *int                          `json:"sample_rate"`
	AllGroups            *bool                         `json:"all_groups"`
	GroupIDs             *[]int64                      `json:"group_ids"`
	RecordNonHits        *bool                         `json:"record_non_hits"`
	Thresholds           *map[string]float64           `json:"thresholds"`
	WorkerCount          *int                          `json:"worker_count"`
	QueueSize            *int                          `json:"queue_size"`
	BlockStatus          *int                          `json:"block_status"`
	BlockMessage         *string                       `json:"block_message"`
	EmailOnHit           *bool                         `json:"email_on_hit"`
	AutoBanEnabled       *bool                         `json:"auto_ban_enabled"`
	BanThreshold         *int                          `json:"ban_threshold"`
	ViolationWindowHours *int                          `json:"violation_window_hours"`
	RetryCount           *int                          `json:"retry_count"`
	HitRetentionDays     *int                          `json:"hit_retention_days"`
	NonHitRetentionDays  *int                          `json:"non_hit_retention_days"`
	PreHashCheckEnabled  *bool                         `json:"pre_hash_check_enabled"`
	BlockedKeywords      *[]string                     `json:"blocked_keywords"`
	KeywordBlockingMode  *string                       `json:"keyword_blocking_mode"`
	ModelFilter          *ContentModerationModelFilter `json:"model_filter"`
}

type ContentModerationModelFilter struct {
	Type   string   `json:"type"`
	Models []string `json:"models"`
}

type ContentModerationCheckInput struct {
	RequestID  string
	UserID     int64
	UserEmail  string
	APIKeyID   int64
	APIKeyName string
	GroupID    *int64
	GroupName  string
	Endpoint   string
	Provider   string
	Model      string
	Protocol   string
	Body       []byte
}

type ContentModerationInput struct {
	Text   string
	Images []string
}

func (inp *ContentModerationInput) Normalize() {
	if inp == nil {
		return
	}
	inp.Text = truncateByRunes(collapseWhitespace(inp.Text), maxModerationInputRunes)
	inp.Images = deduplicateImages(inp.Images)
}

func (inp ContentModerationInput) IsEmpty() bool {
	return strings.TrimSpace(inp.Text) == "" && len(inp.Images) == 0
}

func (inp ContentModerationInput) ModerationInput() any {
	cappedImgs := capModerationImages(inp.Images)
	if len(cappedImgs) == 0 {
		return inp.Text
	}
	segments := make([]moderationAPIInputPart, 0, len(cappedImgs)+1)
	if strings.TrimSpace(inp.Text) != "" {
		segments = append(segments, moderationAPIInputPart{Type: "text", Text: inp.Text})
	}
	for _, imgURL := range cappedImgs {
		segments = append(segments, moderationAPIInputPart{
			Type:     "image_url",
			ImageURL: &moderationAPIImageURLRef{URL: imgURL},
		})
	}
	return segments
}

func (inp ContentModerationInput) ExcerptText() string {
	return inp.Text
}

func (inp ContentModerationInput) Hash() string {
	hasher := sha256.New()
	_, _ = hasher.Write([]byte("text:"))
	_, _ = hasher.Write([]byte(inp.Text))
	for _, imgRef := range inp.Images {
		digest := sha256.Sum256([]byte(imgRef))
		_, _ = hasher.Write([]byte("\nimage:"))
		_, _ = hasher.Write([]byte(hex.EncodeToString(digest[:])))
	}
	return hex.EncodeToString(hasher.Sum(nil))
}

type ContentModerationDecision struct {
	Allowed         bool               `json:"allowed"`
	Blocked         bool               `json:"blocked"`
	Flagged         bool               `json:"flagged"`
	Message         string             `json:"message"`
	StatusCode      int                `json:"status_code"`
	InputHash       string             `json:"input_hash,omitempty"`
	HighestCategory string             `json:"highest_category"`
	HighestScore    float64            `json:"highest_score"`
	CategoryScores  map[string]float64 `json:"category_scores"`
	Action          string             `json:"action"`
}

type ContentModerationLog struct {
	ID                int64              `json:"id"`
	RequestID         string             `json:"request_id"`
	UserID            *int64             `json:"user_id,omitempty"`
	UserEmail         string             `json:"user_email"`
	APIKeyID          *int64             `json:"api_key_id,omitempty"`
	APIKeyName        string             `json:"api_key_name"`
	GroupID           *int64             `json:"group_id,omitempty"`
	GroupName         string             `json:"group_name"`
	Endpoint          string             `json:"endpoint"`
	Provider          string             `json:"provider"`
	Model             string             `json:"model"`
	Mode              string             `json:"mode"`
	Action            string             `json:"action"`
	Flagged           bool               `json:"flagged"`
	HighestCategory   string             `json:"highest_category"`
	HighestScore      float64            `json:"highest_score"`
	CategoryScores    map[string]float64 `json:"category_scores"`
	ThresholdSnapshot map[string]float64 `json:"threshold_snapshot"`
	InputExcerpt      string             `json:"input_excerpt"`
	UpstreamLatencyMS *int               `json:"upstream_latency_ms,omitempty"`
	Error             string             `json:"error"`
	ViolationCount    int                `json:"violation_count"`
	AutoBanned        bool               `json:"auto_banned"`
	EmailSent         bool               `json:"email_sent"`
	UserStatus        string             `json:"user_status"`
	QueueDelayMS      *int               `json:"queue_delay_ms,omitempty"`
	CreatedAt         time.Time          `json:"created_at"`
}

type ContentModerationLogFilter struct {
	Pagination pagination.PaginationParams
	Result     string
	GroupID    *int64
	Endpoint   string
	Search     string
	From       *time.Time
	To         *time.Time
}

type ContentModerationCleanupResult struct {
	DeletedHit    int64     `json:"deleted_hit"`
	DeletedNonHit int64     `json:"deleted_non_hit"`
	FinishedAt    time.Time `json:"finished_at"`
}

type ContentModerationRuntimeStatus struct {
	Enabled                      bool                            `json:"enabled"`
	RiskControlEnabled           bool                            `json:"risk_control_enabled"`
	Mode                         string                          `json:"mode"`
	WorkerCount                  int                             `json:"worker_count"`
	MaxWorkers                   int                             `json:"max_workers"`
	ActiveWorkers                int                             `json:"active_workers"`
	IdleWorkers                  int                             `json:"idle_workers"`
	QueueSize                    int                             `json:"queue_size"`
	QueueLength                  int                             `json:"queue_length"`
	QueueUsagePercent            float64                         `json:"queue_usage_percent"`
	Enqueued                     int64                           `json:"enqueued"`
	Dropped                      int64                           `json:"dropped"`
	Processed                    int64                           `json:"processed"`
	Errors                       int64                           `json:"errors"`
	PreBlockActive               int                             `json:"pre_block_active"`
	PreBlockChecked              int64                           `json:"pre_block_checked"`
	PreBlockAllowed              int64                           `json:"pre_block_allowed"`
	PreBlockBlocked              int64                           `json:"pre_block_blocked"`
	PreBlockErrors               int64                           `json:"pre_block_errors"`
	PreBlockAvgLatencyMS         int64                           `json:"pre_block_avg_latency_ms"`
	PreBlockAPIKeyActive         int64                           `json:"pre_block_api_key_active"`
	PreBlockAPIKeyAvailableCount int64                           `json:"pre_block_api_key_available_count"`
	PreBlockAPIKeyTotalCalls     int64                           `json:"pre_block_api_key_total_calls"`
	PreBlockAPIKeyLoads          []ContentModerationAPIKeyLoad   `json:"pre_block_api_key_loads"`
	APIKeyStatuses               []ContentModerationAPIKeyStatus `json:"api_key_statuses"`
	FlaggedHashCount             int64                           `json:"flagged_hash_count"`
	LastCleanupAt                *time.Time                      `json:"last_cleanup_at,omitempty"`
	LastCleanupDeletedHit        int64                           `json:"last_cleanup_deleted_hit"`
	LastCleanupDeletedNonHit     int64                           `json:"last_cleanup_deleted_non_hit"`
}

type ContentModerationUnbanUserResult struct {
	UserID int64  `json:"user_id"`
	Status string `json:"status"`
}

type ContentModerationDeleteHashResult struct {
	InputHash string `json:"input_hash"`
	Deleted   bool   `json:"deleted"`
}

type ContentModerationClearHashesResult struct {
	Deleted int64 `json:"deleted"`
}

type ContentModerationRepository interface {
	CreateLog(ctx context.Context, log *ContentModerationLog) error
	ListLogs(ctx context.Context, filter ContentModerationLogFilter) ([]ContentModerationLog, *pagination.PaginationResult, error)
	CountFlaggedByUserSince(ctx context.Context, userID int64, since time.Time) (int, error)
	CleanupExpiredLogs(ctx context.Context, hitBefore time.Time, nonHitBefore time.Time) (*ContentModerationCleanupResult, error)
}

type ContentModerationHashCache interface {
	RecordFlaggedInputHash(ctx context.Context, inputHash string) error
	HasFlaggedInputHash(ctx context.Context, inputHash string) (bool, error)
	DeleteFlaggedInputHash(ctx context.Context, inputHash string) (bool, error)
	ClearFlaggedInputHashes(ctx context.Context) (int64, error)
	CountFlaggedInputHashes(ctx context.Context) (int64, error)
}

type ContentModerationService struct {
	settingRepo              SettingRepository
	repo                     ContentModerationRepository
	hashCache                ContentModerationHashCache
	groupRepo                GroupRepository
	userRepo                 UserRepository
	authCacheInvalidator     APIKeyAuthCacheInvalidator
	emailService             *EmailService
	httpClient               *http.Client
	asyncQueue               chan contentModerationTask
	workerCount              int
	apiKeyCursor             atomic.Uint64
	asyncActive              atomic.Int64
	asyncEnqueued            atomic.Int64
	asyncDropped             atomic.Int64
	asyncProcessed           atomic.Int64
	asyncErrors              atomic.Int64
	preBlockActive           atomic.Int64
	preBlockChecked          atomic.Int64
	preBlockAllowed          atomic.Int64
	preBlockBlocked          atomic.Int64
	preBlockErrors           atomic.Int64
	preBlockLatencyTotalMS   atomic.Int64
	lastCleanupUnix          atomic.Int64
	lastCleanupDeletedHit    atomic.Int64
	lastCleanupDeletedNonHit atomic.Int64
	keyHealthMu              sync.Mutex
	keyHealth                map[string]*contentModerationKeyHealth
}

// contentModerationTask represents a unit of async moderation work.
type contentModerationTask struct {
	input            ContentModerationCheckInput
	content          ContentModerationInput
	inputHash        string
	log              *ContentModerationLog
	config           *ContentModerationConfig
	recordHash       bool
	applySideEffects bool
	enqueuedAt       time.Time
}

// contentModerationKeyHealth tracks per-key health metrics.
type contentModerationKeyHealth struct {
	Hash           string
	Masked         string
	FailureCount   int
	SuccessCount   int64
	LastError      string
	LastCheckedAt  time.Time
	FrozenUntil    time.Time
	LastLatencyMS  int
	LastHTTPStatus int
	LastTested     bool
	SyncActive     int64
	SyncTotal      int64
	SyncSuccess    int64
	SyncErrors     int64
	SyncLatencyMS  int64
}

func NewContentModerationService(
	settingRepo SettingRepository,
	repo ContentModerationRepository,
	hashCache ContentModerationHashCache,
	groupRepo GroupRepository,
	userRepo UserRepository,
	authCacheInvalidator APIKeyAuthCacheInvalidator,
	emailService *EmailService,
) *ContentModerationService {
	svc := &ContentModerationService{
		settingRepo:          settingRepo,
		repo:                 repo,
		hashCache:            hashCache,
		groupRepo:            groupRepo,
		userRepo:             userRepo,
		authCacheInvalidator: authCacheInvalidator,
		emailService:         emailService,
		httpClient:           &http.Client{},
		workerCount:          maxContentModerationWorkerCount,
		asyncQueue:           make(chan contentModerationTask, maxContentModerationQueueSize),
		keyHealth:            make(map[string]*contentModerationKeyHealth),
	}
	if settingRepo != nil && repo != nil {
		for workerIdx := 0; workerIdx < svc.workerCount; workerIdx++ {
			go svc.worker(workerIdx)
		}
		go svc.cleanupWorker()
	}
	return svc
}

func (s *ContentModerationService) GetConfig(ctx context.Context) (*ContentModerationConfigView, error) {
	conf, loadErr := s.fetchConfig(ctx)
	if loadErr != nil {
		return nil, loadErr
	}
	return s.toConfigView(conf), nil
}

func (s *ContentModerationService) UpdateConfig(ctx context.Context, input UpdateContentModerationConfigInput) (*ContentModerationConfigView, error) {
	conf, loadErr := s.fetchConfig(ctx)
	if loadErr != nil {
		return nil, loadErr
	}
	if input.Enabled != nil {
		conf.Enabled = *input.Enabled
	}
	if input.Mode != nil {
		conf.Mode = strings.TrimSpace(*input.Mode)
	}
	if input.BaseURL != nil {
		conf.BaseURL = strings.TrimSpace(*input.BaseURL)
	}
	if input.Model != nil {
		conf.Model = strings.TrimSpace(*input.Model)
	}
	if input.TimeoutMS != nil {
		conf.TimeoutMS = *input.TimeoutMS
	}
	if input.SampleRate != nil {
		conf.SampleRate = *input.SampleRate
	}
	if input.WorkerCount != nil {
		conf.WorkerCount = *input.WorkerCount
	}
	if input.QueueSize != nil {
		conf.QueueSize = *input.QueueSize
	}
	if input.BlockStatus != nil {
		conf.BlockStatus = *input.BlockStatus
	}
	if input.BlockMessage != nil {
		conf.BlockMessage = strings.TrimSpace(*input.BlockMessage)
	}
	if input.EmailOnHit != nil {
		conf.EmailOnHit = *input.EmailOnHit
	}
	if input.AutoBanEnabled != nil {
		conf.AutoBanEnabled = *input.AutoBanEnabled
	}
	if input.BanThreshold != nil {
		conf.BanThreshold = *input.BanThreshold
	}
	if input.ViolationWindowHours != nil {
		conf.ViolationWindowHours = *input.ViolationWindowHours
	}
	if input.RetryCount != nil {
		conf.RetryCount = *input.RetryCount
	}
	if input.HitRetentionDays != nil {
		conf.HitRetentionDays = *input.HitRetentionDays
	}
	if input.NonHitRetentionDays != nil {
		conf.NonHitRetentionDays = *input.NonHitRetentionDays
	}
	if input.PreHashCheckEnabled != nil {
		conf.PreHashCheckEnabled = *input.PreHashCheckEnabled
	}
	if input.BlockedKeywords != nil {
		conf.BlockedKeywords = sanitizeKeywordList(*input.BlockedKeywords)
	}
	if input.KeywordBlockingMode != nil {
		conf.KeywordBlockingMode = strings.TrimSpace(*input.KeywordBlockingMode)
	}
	if input.ModelFilter != nil {
		conf.ModelFilter = *input.ModelFilter
	}
	if input.AllGroups != nil {
		conf.AllGroups = *input.AllGroups
	}
	if input.GroupIDs != nil {
		conf.GroupIDs = deduplicateInt64s(*input.GroupIDs)
	}
	if input.RecordNonHits != nil {
		conf.RecordNonHits = *input.RecordNonHits
	}
	if input.Thresholds != nil {
		conf.Thresholds = overlayThresholds(ContentModerationDefaultThresholds(), *input.Thresholds)
	}
	if input.ClearAPIKey {
		conf.APIKey = ""
		conf.APIKeys = []string{}
	} else {
		keysMergeStrategy := resolveAPIKeysMode(input.APIKeysMode)
		if input.DeleteAPIKeyHashes != nil && keysMergeStrategy != contentModerationAPIKeysModeReplace {
			conf.APIKeys = removeKeysByHash(conf.apiKeys(), *input.DeleteAPIKeyHashes)
			conf.APIKey = ""
		}
		if input.APIKeys != nil {
			if keysMergeStrategy == contentModerationAPIKeysModeReplace {
				conf.APIKeys = deduplicateAPIKeys(*input.APIKeys)
			} else {
				conf.APIKeys = deduplicateAPIKeys(append(conf.apiKeys(), *input.APIKeys...))
			}
			conf.APIKey = ""
		}
		if input.APIKey != nil && strings.TrimSpace(*input.APIKey) != "" {
			conf.APIKeys = deduplicateAPIKeys(append(conf.APIKeys, *input.APIKey))
			conf.APIKey = ""
		}
	}
	if validationErr := s.checkConfigValidity(ctx, conf); validationErr != nil {
		return nil, validationErr
	}
	conf.normalize()
	encoded, marshalErr := json.Marshal(conf)
	if marshalErr != nil {
		return nil, fmt.Errorf("failed to encode content moderation config: %w", marshalErr)
	}
	if saveErr := s.settingRepo.Set(ctx, SettingKeyContentModerationConfig, string(encoded)); saveErr != nil {
		return nil, fmt.Errorf("failed to persist content moderation config: %w", saveErr)
	}
	return s.toConfigView(conf), nil
}

func (s *ContentModerationService) TestAPIKeys(ctx context.Context, input TestContentModerationAPIKeysInput) (*TestContentModerationAPIKeysResult, error) {
	conf, loadErr := s.fetchConfig(ctx)
	if loadErr != nil {
		return nil, loadErr
	}
	candidateKeys := deduplicateAPIKeys(input.APIKeys)
	isConfigured := false
	if len(candidateKeys) == 0 {
		candidateKeys = conf.apiKeys()
		isConfigured = true
	}
	if strings.TrimSpace(input.BaseURL) != "" {
		conf.BaseURL = input.BaseURL
	}
	if strings.TrimSpace(input.Model) != "" {
		conf.Model = input.Model
	}
	if input.TimeoutMS > 0 {
		conf.TimeoutMS = input.TimeoutMS
	}
	conf.normalize()
	probePayload, imgCount, buildErr := assembleTestModerationPayload(input.Prompt, input.Images)
	if buildErr != nil {
		return nil, buildErr
	}
	wantsAudit := hasAuditableTestContent(input.Prompt, input.Images)
	if isConfigured && wantsAudit {
		selectedKey, available := s.pickAvailableKey(conf)
		if !available {
			return &TestContentModerationAPIKeysResult{
				Items:      s.collectKeyStatuses(candidateKeys),
				ImageCount: imgCount,
			}, nil
		}
		candidateKeys = []string{selectedKey}
	}
	if len(candidateKeys) == 0 {
		return &TestContentModerationAPIKeysResult{Items: []ContentModerationAPIKeyStatus{}, ImageCount: imgCount}, nil
	}
	statusItems := make([]ContentModerationAPIKeyStatus, 0, len(candidateKeys))
	var auditOutcome *ContentModerationTestAuditResult
	for pos, apiKey := range candidateKeys {
		callStart := time.Now()
		respCode := 0
		apiResult, callErr := s.invokeModerationEndpoint(ctx, conf, apiKey, probePayload, &respCode)
		elapsed := int(time.Since(callStart).Milliseconds())
		keyDigest := computeKeyDigest(apiKey)
		if callErr != nil {
			s.recordKeyFailure(apiKey, callErr.Error(), elapsed, respCode)
		} else {
			s.recordKeySuccess(apiKey, elapsed, respCode)
			if auditOutcome == nil {
				auditOutcome = compileTestAuditResult(apiResult, conf.Thresholds)
			}
		}
		keyStatus := s.resolveKeyStatus(pos, keyDigest, maskSecretTail(apiKey), isConfigured)
		keyStatus.LastTested = true
		statusItems = append(statusItems, keyStatus)
	}
	return &TestContentModerationAPIKeysResult{Items: statusItems, AuditResult: auditOutcome, ImageCount: imgCount}, nil
}

func (s *ContentModerationService) Check(ctx context.Context, input ContentModerationCheckInput) (*ContentModerationDecision, error) {
	passDecision := &ContentModerationDecision{Allowed: true, Action: ContentModerationActionAllow}
	if s == nil || s.settingRepo == nil || s.repo == nil {
		slog.Info("content_moderation.skip_unavailable",
			"user_id", input.UserID,
			"api_key_id", input.APIKeyID,
			"group_id", resolveGroupIDForLog(input.GroupID),
			"endpoint", input.Endpoint,
			"protocol", input.Protocol)
		return passDecision, nil
	}
	if !s.checkRiskControlActive(ctx) {
		slog.Info("content_moderation.skip_feature_disabled",
			"user_id", input.UserID,
			"api_key_id", input.APIKeyID,
			"group_id", resolveGroupIDForLog(input.GroupID),
			"endpoint", input.Endpoint,
			"protocol", input.Protocol)
		return passDecision, nil
	}
	conf, loadErr := s.fetchConfig(ctx)
	if loadErr != nil {
		slog.Warn("content_moderation.skip_config_load_failed",
			"user_id", input.UserID,
			"api_key_id", input.APIKeyID,
			"group_id", resolveGroupIDForLog(input.GroupID),
			"endpoint", input.Endpoint,
			"protocol", input.Protocol,
			"error", loadErr)
		return passDecision, nil
	}
	groupMatch := conf.includesGroup(input.GroupID)
	modelMatch := conf.includesModel(input.Model)
	slog.Info("content_moderation.config_loaded",
		"user_id", input.UserID,
		"api_key_id", input.APIKeyID,
		"group_id", resolveGroupIDForLog(input.GroupID),
		"group_name", input.GroupName,
		"endpoint", input.Endpoint,
		"provider", input.Provider,
		"protocol", input.Protocol,
		"model", input.Model,
		"enabled", conf.Enabled,
		"mode", conf.Mode,
		"all_groups", conf.AllGroups,
		"configured_group_ids", conf.GroupIDs,
		"in_group_scope", groupMatch,
		"model_filter_type", conf.ModelFilter.Type,
		"configured_models", conf.ModelFilter.Models,
		"in_model_scope", modelMatch,
		"sample_rate", conf.SampleRate,
		"api_key_count", len(conf.apiKeys()),
		"pre_hash_check_enabled", conf.PreHashCheckEnabled,
		"record_non_hits", conf.RecordNonHits)
	if !conf.Enabled {
		slog.Info("content_moderation.skip_config_disabled",
			"user_id", input.UserID,
			"api_key_id", input.APIKeyID,
			"group_id", resolveGroupIDForLog(input.GroupID),
			"endpoint", input.Endpoint,
			"protocol", input.Protocol)
		return passDecision, nil
	}
	if conf.Mode == ContentModerationModeOff {
		slog.Info("content_moderation.skip_mode_off",
			"user_id", input.UserID,
			"api_key_id", input.APIKeyID,
			"group_id", resolveGroupIDForLog(input.GroupID),
			"endpoint", input.Endpoint,
			"protocol", input.Protocol)
		return passDecision, nil
	}
	if !groupMatch {
		slog.Info("content_moderation.skip_group_out_of_scope",
			"user_id", input.UserID,
			"api_key_id", input.APIKeyID,
			"group_id", resolveGroupIDForLog(input.GroupID),
			"group_name", input.GroupName,
			"endpoint", input.Endpoint,
			"protocol", input.Protocol,
			"all_groups", conf.AllGroups,
			"configured_group_ids", conf.GroupIDs)
		return passDecision, nil
	}
	if !modelMatch {
		slog.Info("content_moderation.skip_model_out_of_scope",
			"user_id", input.UserID,
			"api_key_id", input.APIKeyID,
			"group_id", resolveGroupIDForLog(input.GroupID),
			"group_name", input.GroupName,
			"endpoint", input.Endpoint,
			"protocol", input.Protocol,
			"model", input.Model,
			"model_filter_type", conf.ModelFilter.Type,
			"configured_models", conf.ModelFilter.Models)
		return passDecision, nil
	}
	extracted := ExtractContentModerationInput(input.Protocol, input.Body)
	if extracted.IsEmpty() {
		slog.Info("content_moderation.skip_empty_input",
			"user_id", input.UserID,
			"api_key_id", input.APIKeyID,
			"group_id", resolveGroupIDForLog(input.GroupID),
			"endpoint", input.Endpoint,
			"protocol", input.Protocol,
			"body_bytes", len(input.Body))
		return passDecision, nil
	}
	extracted.Normalize()
	slog.Info("content_moderation.input_extracted",
		"user_id", input.UserID,
		"api_key_id", input.APIKeyID,
		"group_id", resolveGroupIDForLog(input.GroupID),
		"endpoint", input.Endpoint,
		"protocol", input.Protocol,
		"text_runes", len([]rune(extracted.Text)),
		"image_count", len(extracted.Images))
	contentDigest := extracted.Hash()
	if conf.Mode == ContentModerationModePreBlock {
		if conf.KeywordBlockingMode != ContentModerationKeywordModeAPIOnly && len(conf.BlockedKeywords) > 0 {
			if matchedKW, found := findBlockedKeyword(extracted.Text, conf.BlockedKeywords); found {
				s.trackPreBlockMetric(0, ContentModerationActionKeywordBlock)
				slog.Info("content_moderation.keyword_block",
					"user_id", input.UserID,
					"api_key_id", input.APIKeyID,
					"group_id", resolveGroupIDForLog(input.GroupID),
					"endpoint", input.Endpoint,
					"protocol", input.Protocol,
					"keyword_blocking_mode", conf.KeywordBlockingMode,
					"keyword", matchedKW)
				catScores := map[string]float64{contentModerationKeywordCategory: 1.0}
				entry := s.assembleLogEntry(input, conf, ContentModerationActionKeywordBlock, true, contentModerationKeywordCategory, 1.0, catScores, extracted.ExcerptText(), nil, nil, "")
				s.submitRecordTask(input, conf, entry, contentDigest, false, true)
				return &ContentModerationDecision{
					Allowed:         false,
					Blocked:         true,
					Flagged:         true,
					Message:         conf.BlockMessage,
					StatusCode:      conf.BlockStatus,
					HighestCategory: contentModerationKeywordCategory,
					HighestScore:    1.0,
					CategoryScores:  catScores,
					Action:          ContentModerationActionKeywordBlock,
				}, nil
			}
		}
		if conf.KeywordBlockingMode == ContentModerationKeywordModeKeywordOnly {
			s.trackPreBlockMetric(0, ContentModerationActionAllow)
			slog.Info("content_moderation.skip_api_keyword_only",
				"user_id", input.UserID,
				"api_key_id", input.APIKeyID,
				"group_id", resolveGroupIDForLog(input.GroupID),
				"endpoint", input.Endpoint,
				"protocol", input.Protocol)
			return passDecision, nil
		}
	}
	if conf.PreHashCheckEnabled && s.hashCache != nil {
		hashExists, hashErr := s.hashCache.HasFlaggedInputHash(ctx, contentDigest)
		if hashErr != nil {
			slog.Warn("content_moderation.hash_check_failed", "user_id", input.UserID, "endpoint", input.Endpoint, "error", hashErr)
		}
		if hashExists {
			if conf.Mode == ContentModerationModePreBlock {
				s.trackPreBlockMetric(0, ContentModerationActionHashBlock)
			}
			slog.Info("content_moderation.hash_block",
				"user_id", input.UserID,
				"api_key_id", input.APIKeyID,
				"group_id", resolveGroupIDForLog(input.GroupID),
				"endpoint", input.Endpoint,
				"protocol", input.Protocol,
				"input_hash", contentDigest)
			blockMsg := conf.BlockMessage
			if blockMsg != "" {
				blockMsg = fmt.Sprintf("%s（hash: %s）", blockMsg, contentDigest)
			}
			catScores := map[string]float64{"hash": 1.0}
			entry := s.assembleLogEntry(input, conf, ContentModerationActionHashBlock, true, "hash", 1.0, catScores, extracted.ExcerptText(), nil, nil, "")
			s.submitRecordTask(input, conf, entry, contentDigest, false, false)
			return &ContentModerationDecision{
				Allowed:    false,
				Blocked:    true,
				Flagged:    true,
				Message:    blockMsg,
				StatusCode: conf.BlockStatus,
				InputHash:  contentDigest,
				Action:     ContentModerationActionHashBlock,
			}, nil
		}
	}
	if !conf.shouldSample(contentDigest) {
		if conf.Mode == ContentModerationModePreBlock {
			s.trackPreBlockMetric(0, ContentModerationActionAllow)
		}
		slog.Info("content_moderation.skip_sample_rate",
			"user_id", input.UserID,
			"api_key_id", input.APIKeyID,
			"group_id", resolveGroupIDForLog(input.GroupID),
			"endpoint", input.Endpoint,
			"protocol", input.Protocol,
			"sample_rate", conf.SampleRate)
		return passDecision, nil
	}
	if len(conf.apiKeys()) == 0 {
		if conf.Mode == ContentModerationModePreBlock {
			s.trackPreBlockMetric(0, ContentModerationActionError)
		}
		slog.Warn("content_moderation.skip_no_audit_api_keys",
			"user_id", input.UserID,
			"api_key_id", input.APIKeyID,
			"group_id", resolveGroupIDForLog(input.GroupID),
			"endpoint", input.Endpoint,
			"protocol", input.Protocol)
		return passDecision, nil
	}
	if conf.Mode == ContentModerationModeObserve {
		slog.Info("content_moderation.enqueue_observe",
			"user_id", input.UserID,
			"api_key_id", input.APIKeyID,
			"group_id", resolveGroupIDForLog(input.GroupID),
			"endpoint", input.Endpoint,
			"protocol", input.Protocol,
			"queue_len", len(s.asyncQueue))
		s.dispatchAsync(input, conf, extracted, contentDigest)
		return passDecision, nil
	}

	return s.executeSynchronousCheck(ctx, input, conf, extracted, contentDigest, nil, true), nil
}

// executeSynchronousCheck performs a blocking moderation API call and returns the decision.
func (s *ContentModerationService) executeSynchronousCheck(ctx context.Context, input ContentModerationCheckInput, conf *ContentModerationConfig, content ContentModerationInput, contentDigest string, waitDuration *int, blockEnabled bool) *ContentModerationDecision {
	passDecision := &ContentModerationDecision{Allowed: true, Action: ContentModerationActionAllow}
	instrumentPreBlock := waitDuration == nil && blockEnabled && conf != nil && conf.Mode == ContentModerationModePreBlock
	if instrumentPreBlock {
		s.preBlockActive.Add(1)
		defer s.preBlockActive.Add(-1)
	}
	callStart := time.Now()
	apiResult, callErr := s.invokeWithRetry(ctx, conf, content.ModerationInput(), instrumentPreBlock)
	elapsed := int(time.Since(callStart).Milliseconds())
	if callErr != nil {
		if instrumentPreBlock {
			s.trackPreBlockMetric(elapsed, ContentModerationActionError)
		}
		slog.Warn("content_moderation.audit_api_failed",
			"user_id", input.UserID,
			"api_key_id", input.APIKeyID,
			"group_id", resolveGroupIDForLog(input.GroupID),
			"endpoint", input.Endpoint,
			"protocol", input.Protocol,
			"mode", conf.Mode,
			"allow_block", blockEnabled,
			"queue_delay_ms", waitDuration,
			"latency_ms", elapsed,
			"error", callErr)
		if waitDuration != nil {
			s.asyncErrors.Add(1)
		}
		if conf.RecordNonHits {
			entry := s.assembleLogEntry(input, conf, ContentModerationActionError, false, "", 0, nil, content.ExcerptText(), &elapsed, waitDuration, callErr.Error())
			_ = s.repo.CreateLog(ctx, entry)
		}
		return passDecision
	}

	wasFlagged, topCategory, topScore := assessModerationScores(apiResult.CategoryScores, conf.Thresholds)
	resolvedAction := ContentModerationActionAllow
	wasBlocked := false
	if blockEnabled && wasFlagged && conf.Mode == ContentModerationModePreBlock {
		resolvedAction = ContentModerationActionBlock
		wasBlocked = true
	}
	if instrumentPreBlock {
		s.trackPreBlockMetric(elapsed, resolvedAction)
	}
	slog.Info("content_moderation.audit_result",
		"user_id", input.UserID,
		"api_key_id", input.APIKeyID,
		"group_id", resolveGroupIDForLog(input.GroupID),
		"group_name", input.GroupName,
		"endpoint", input.Endpoint,
		"protocol", input.Protocol,
		"mode", conf.Mode,
		"allow_block", blockEnabled,
		"flagged", wasFlagged,
		"blocked", wasBlocked,
		"action", resolvedAction,
		"highest_category", topCategory,
		"highest_score", topScore,
		"latency_ms", elapsed,
		"queue_delay_ms", waitDuration)
	if wasFlagged || conf.RecordNonHits {
		entry := s.assembleLogEntry(input, conf, resolvedAction, wasFlagged, topCategory, topScore, apiResult.CategoryScores, content.ExcerptText(), &elapsed, waitDuration, "")
		if waitDuration == nil && conf.Mode == ContentModerationModePreBlock {
			s.submitRecordTask(input, conf, entry, contentDigest, wasFlagged, wasFlagged)
		} else {
			s.writeLogAndSideEffects(ctx, conf, entry, contentDigest, wasFlagged, wasFlagged)
		}
	}
	if wasBlocked {
		return &ContentModerationDecision{
			Allowed:         false,
			Blocked:         true,
			Flagged:         true,
			Message:         conf.BlockMessage,
			StatusCode:      conf.BlockStatus,
			HighestCategory: topCategory,
			HighestScore:    topScore,
			CategoryScores:  apiResult.CategoryScores,
			Action:          resolvedAction,
		}
	}
	return &ContentModerationDecision{
		Allowed:         true,
		Flagged:         wasFlagged,
		Message:         "",
		HighestCategory: topCategory,
		HighestScore:    topScore,
		CategoryScores:  apiResult.CategoryScores,
		Action:          resolvedAction,
	}
}

// trackPreBlockMetric updates the pre-block counters after a synchronous check.
func (s *ContentModerationService) trackPreBlockMetric(elapsedMS int, resolvedAction string) {
	if s == nil {
		return
	}
	s.preBlockChecked.Add(1)
	if elapsedMS < 0 {
		elapsedMS = 0
	}
	s.preBlockLatencyTotalMS.Add(int64(elapsedMS))
	switch resolvedAction {
	case ContentModerationActionBlock, ContentModerationActionHashBlock, ContentModerationActionKeywordBlock:
		s.preBlockBlocked.Add(1)
	case ContentModerationActionError:
		s.preBlockErrors.Add(1)
	default:
		s.preBlockAllowed.Add(1)
	}
}

// dispatchAsync enqueues a moderation check for asynchronous processing.
func (s *ContentModerationService) dispatchAsync(input ContentModerationCheckInput, conf *ContentModerationConfig, content ContentModerationInput, contentDigest string) {
	if s == nil || s.asyncQueue == nil {
		return
	}
	maxQueue := defaultContentModerationQueueSize
	if conf != nil && conf.QueueSize > 0 {
		maxQueue = conf.QueueSize
	}
	if len(s.asyncQueue) >= maxQueue {
		slog.Warn("content_moderation.async_queue_full", "user_id", input.UserID, "endpoint", input.Endpoint, "queue_size", maxQueue)
		s.asyncDropped.Add(1)
		return
	}
	job := contentModerationTask{
		input:      input,
		content:    content,
		inputHash:  contentDigest,
		enqueuedAt: time.Now(),
	}
	select {
	case s.asyncQueue <- job:
		s.asyncEnqueued.Add(1)
	default:
		slog.Warn("content_moderation.async_queue_full", "user_id", input.UserID, "endpoint", input.Endpoint)
		s.asyncDropped.Add(1)
	}
}

// submitRecordTask enqueues a pre-built log record for async persistence and side effects.
func (s *ContentModerationService) submitRecordTask(input ContentModerationCheckInput, conf *ContentModerationConfig, entry *ContentModerationLog, contentDigest string, storeHash bool, runSideEffects bool) {
	if s == nil || s.asyncQueue == nil || entry == nil {
		return
	}
	maxQueue := defaultContentModerationQueueSize
	if conf != nil && conf.QueueSize > 0 {
		maxQueue = conf.QueueSize
	}
	if len(s.asyncQueue) >= maxQueue {
		slog.Warn("content_moderation.record_queue_full",
			"user_id", input.UserID,
			"endpoint", input.Endpoint,
			"action", entry.Action,
			"queue_size", maxQueue)
		s.asyncDropped.Add(1)
		return
	}
	job := contentModerationTask{
		input:            input,
		inputHash:        contentDigest,
		log:              entry,
		config:           duplicateConfig(conf),
		recordHash:       storeHash,
		applySideEffects: runSideEffects,
		enqueuedAt:       time.Now(),
	}
	select {
	case s.asyncQueue <- job:
		s.asyncEnqueued.Add(1)
	default:
		slog.Warn("content_moderation.record_queue_full",
			"user_id", input.UserID,
			"endpoint", input.Endpoint,
			"action", entry.Action)
		s.asyncDropped.Add(1)
	}
}

func (s *ContentModerationService) worker(workerID int) {
	for {
		workerCtx, cancelFn := context.WithTimeout(context.Background(), maxContentModerationTimeoutMS*time.Millisecond+10*time.Second)
		conf, loadErr := s.fetchConfig(workerCtx)
		if loadErr != nil || workerID >= conf.WorkerCount {
			cancelFn()
			time.Sleep(time.Second)
			continue
		}
		job, received := s.pullAsyncJob(workerCtx, time.Second)
		if !received {
			cancelFn()
			continue
		}
		func() {
			defer cancelFn()
			defer func() {
				if recovered := recover(); recovered != nil {
					slog.Error("content_moderation.worker_panic", "worker_id", workerID, "recover", recovered)
				}
			}()
			if job.log != nil {
				s.asyncActive.Add(1)
				defer s.asyncActive.Add(-1)
				waitMS := int(time.Since(job.enqueuedAt).Milliseconds())
				job.log.QueueDelayMS = &waitMS
				effectiveConf := job.config
				if effectiveConf == nil {
					effectiveConf = conf
				}
				s.writeLogAndSideEffects(workerCtx, effectiveConf, job.log, job.inputHash, job.recordHash, job.applySideEffects)
				s.asyncProcessed.Add(1)
				return
			}
			if !conf.Enabled || conf.Mode == ContentModerationModeOff || len(conf.apiKeys()) == 0 {
				return
			}
			if !conf.includesGroup(job.input.GroupID) {
				return
			}
			if !conf.includesModel(job.input.Model) {
				return
			}
			s.asyncActive.Add(1)
			defer s.asyncActive.Add(-1)
			waitMS := int(time.Since(job.enqueuedAt).Milliseconds())
			_ = s.executeSynchronousCheck(workerCtx, job.input, conf, job.content, job.inputHash, &waitMS, false)
			s.asyncProcessed.Add(1)
		}()
	}
}

// pullAsyncJob attempts to dequeue a task from the async channel with an idle timeout.
func (s *ContentModerationService) pullAsyncJob(ctx context.Context, idleTimeout time.Duration) (contentModerationTask, bool) {
	var empty contentModerationTask
	if s == nil || s.asyncQueue == nil {
		return empty, false
	}
	if idleTimeout <= 0 {
		idleTimeout = time.Second
	}
	idleTimer := time.NewTimer(idleTimeout)
	defer idleTimer.Stop()
	select {
	case job, ok := <-s.asyncQueue:
		return job, ok
	case <-ctx.Done():
		return empty, false
	case <-idleTimer.C:
		return empty, false
	}
}

func (s *ContentModerationService) ListLogs(ctx context.Context, filter ContentModerationLogFilter) ([]ContentModerationLog, *pagination.PaginationResult, error) {
	if filter.Pagination.Page <= 0 {
		filter.Pagination.Page = 1
	}
	if filter.Pagination.PageSize <= 0 {
		filter.Pagination.PageSize = 20
	}
	if filter.Pagination.PageSize > 100 {
		filter.Pagination.PageSize = 100
	}
	if filter.Pagination.SortOrder == "" {
		filter.Pagination.SortOrder = pagination.SortOrderDesc
	}
	return s.repo.ListLogs(ctx, filter)
}

func (s *ContentModerationService) UnbanUser(ctx context.Context, userID int64) (*ContentModerationUnbanUserResult, error) {
	if s == nil || s.userRepo == nil {
		return nil, infraerrors.InternalServer("CONTENT_MODERATION_USER_REPOSITORY_UNAVAILABLE", "user repository is unavailable")
	}
	if userID <= 0 {
		return nil, infraerrors.BadRequest("INVALID_USER_ID", "user ID is invalid")
	}
	account, fetchErr := s.userRepo.GetByID(ctx, userID)
	if fetchErr != nil {
		if errors.Is(fetchErr, ErrUserNotFound) {
			return nil, infraerrors.NotFound("USER_NOT_FOUND", "user does not exist")
		}
		return nil, fmt.Errorf("failed to fetch user for moderation unban: %w", fetchErr)
	}
	if account.Status != StatusActive {
		account.Status = StatusActive
		if updateErr := s.userRepo.Update(ctx, account); updateErr != nil {
			return nil, fmt.Errorf("failed to reactivate user for moderation unban: %w", updateErr)
		}
	}
	if s.authCacheInvalidator != nil {
		s.authCacheInvalidator.InvalidateAuthCacheByUserID(ctx, userID)
	}
	return &ContentModerationUnbanUserResult{
		UserID: userID,
		Status: StatusActive,
	}, nil
}

func (s *ContentModerationService) DeleteFlaggedInputHash(ctx context.Context, inputHash string) (*ContentModerationDeleteHashResult, error) {
	inputHash = sanitizeHexHash(inputHash)
	if inputHash == "" {
		return nil, infraerrors.BadRequest("INVALID_CONTENT_MODERATION_HASH", "flagged input hash is invalid")
	}
	if s == nil || s.hashCache == nil {
		return nil, infraerrors.InternalServer("CONTENT_MODERATION_HASH_CACHE_UNAVAILABLE", "content moderation hash cache is unavailable")
	}
	removed, removeErr := s.hashCache.DeleteFlaggedInputHash(ctx, inputHash)
	if removeErr != nil {
		return nil, fmt.Errorf("failed to delete flagged content hash: %w", removeErr)
	}
	return &ContentModerationDeleteHashResult{
		InputHash: inputHash,
		Deleted:   removed,
	}, nil
}

func (s *ContentModerationService) ClearFlaggedInputHashes(ctx context.Context) (*ContentModerationClearHashesResult, error) {
	if s == nil || s.hashCache == nil {
		return nil, infraerrors.InternalServer("CONTENT_MODERATION_HASH_CACHE_UNAVAILABLE", "content moderation hash cache is unavailable")
	}
	purged, purgeErr := s.hashCache.ClearFlaggedInputHashes(ctx)
	if purgeErr != nil {
		return nil, fmt.Errorf("failed to purge all flagged content hashes: %w", purgeErr)
	}
	return &ContentModerationClearHashesResult{Deleted: purged}, nil
}

func (s *ContentModerationService) GetStatus(ctx context.Context) (*ContentModerationRuntimeStatus, error) {
	if s == nil {
		return &ContentModerationRuntimeStatus{}, nil
	}
	conf, loadErr := s.fetchConfig(ctx)
	if loadErr != nil {
		return nil, loadErr
	}
	riskActive := s.checkRiskControlActive(ctx)
	busyCount := int(s.asyncActive.Load())
	if busyCount < 0 {
		busyCount = 0
	}
	if busyCount > conf.WorkerCount {
		busyCount = conf.WorkerCount
	}
	syncActive := int(s.preBlockActive.Load())
	if syncActive < 0 {
		syncActive = 0
	}
	checkedTotal := s.preBlockChecked.Load()
	avgPreBlockLatency := int64(0)
	if checkedTotal > 0 {
		avgPreBlockLatency = s.preBlockLatencyTotalMS.Load() / checkedTotal
	}
	pendingLen := 0
	if s.asyncQueue != nil {
		pendingLen = len(s.asyncQueue)
	}
	usagePct := 0.0
	if conf.QueueSize > 0 {
		usagePct = float64(pendingLen) * 100 / float64(conf.QueueSize)
	}
	var cachedHashCount int64
	if s.hashCache != nil {
		if counted, countErr := s.hashCache.CountFlaggedInputHashes(ctx); countErr == nil {
			cachedHashCount = counted
		} else {
			slog.Warn("content_moderation.hash_count_failed", "error", countErr)
		}
	}
	var lastPurgeTime *time.Time
	if unixTS := s.lastCleanupUnix.Load(); unixTS > 0 {
		ts := time.Unix(unixTS, 0)
		lastPurgeTime = &ts
	}
	return &ContentModerationRuntimeStatus{
		Enabled:                      conf.Enabled,
		RiskControlEnabled:           riskActive,
		Mode:                         conf.Mode,
		WorkerCount:                  conf.WorkerCount,
		MaxWorkers:                   maxContentModerationWorkerCount,
		ActiveWorkers:                busyCount,
		IdleWorkers:                  conf.WorkerCount - busyCount,
		QueueSize:                    conf.QueueSize,
		QueueLength:                  pendingLen,
		QueueUsagePercent:            usagePct,
		Enqueued:                     s.asyncEnqueued.Load(),
		Dropped:                      s.asyncDropped.Load(),
		Processed:                    s.asyncProcessed.Load(),
		Errors:                       s.asyncErrors.Load(),
		PreBlockActive:               syncActive,
		PreBlockChecked:              checkedTotal,
		PreBlockAllowed:              s.preBlockAllowed.Load(),
		PreBlockBlocked:              s.preBlockBlocked.Load(),
		PreBlockErrors:               s.preBlockErrors.Load(),
		PreBlockAvgLatencyMS:         avgPreBlockLatency,
		PreBlockAPIKeyActive:         s.countActiveKeyCalls(conf.apiKeys()),
		PreBlockAPIKeyAvailableCount: s.countAvailableKeys(conf.apiKeys()),
		PreBlockAPIKeyTotalCalls:     s.countTotalKeyCalls(conf.apiKeys()),
		PreBlockAPIKeyLoads:          s.collectKeyLoadMetrics(conf.apiKeys()),
		APIKeyStatuses:               s.collectKeyStatuses(conf.apiKeys()),
		FlaggedHashCount:             cachedHashCount,
		LastCleanupAt:                lastPurgeTime,
		LastCleanupDeletedHit:        s.lastCleanupDeletedHit.Load(),
		LastCleanupDeletedNonHit:     s.lastCleanupDeletedNonHit.Load(),
	}, nil
}

func (s *ContentModerationService) cleanupWorker() {
	startDelay := time.NewTimer(contentModerationCleanupDelay)
	defer startDelay.Stop()
	for {
		<-startDelay.C
		s.performCleanupCycle()
		startDelay.Reset(contentModerationCleanupInterval)
	}
}

// performCleanupCycle runs one retention cleanup pass.
func (s *ContentModerationService) performCleanupCycle() {
	if s == nil || s.repo == nil || s.settingRepo == nil {
		return
	}
	cleanupCtx, cancelFn := context.WithTimeout(context.Background(), contentModerationCleanupTimeout)
	defer cancelFn()
	conf, loadErr := s.fetchConfig(cleanupCtx)
	if loadErr != nil {
		slog.Warn("content_moderation.cleanup_load_config_failed", "error", loadErr)
		return
	}
	currentTime := time.Now()
	hitCutoff := currentTime.AddDate(0, 0, -conf.HitRetentionDays)
	nonHitCutoff := currentTime.AddDate(0, 0, -conf.NonHitRetentionDays)
	outcome, cleanErr := s.repo.CleanupExpiredLogs(cleanupCtx, hitCutoff, nonHitCutoff)
	if cleanErr != nil {
		slog.Warn("content_moderation.cleanup_failed", "error", cleanErr)
		return
	}
	if outcome == nil {
		return
	}
	s.lastCleanupUnix.Store(outcome.FinishedAt.Unix())
	s.lastCleanupDeletedHit.Store(outcome.DeletedHit)
	s.lastCleanupDeletedNonHit.Store(outcome.DeletedNonHit)
}

// fetchConfig loads and normalizes the content moderation configuration from settings.
func (s *ContentModerationService) fetchConfig(ctx context.Context) (*ContentModerationConfig, error) {
	conf := buildDefaultConfig()
	rawJSON, fetchErr := s.settingRepo.GetValue(ctx, SettingKeyContentModerationConfig)
	if fetchErr != nil {
		if errors.Is(fetchErr, ErrSettingNotFound) {
			conf.normalize()
			return conf, nil
		}
		return nil, fmt.Errorf("failed to load content moderation config: %w", fetchErr)
	}
	if strings.TrimSpace(rawJSON) == "" {
		conf.normalize()
		return conf, nil
	}
	if parseErr := json.Unmarshal([]byte(rawJSON), conf); parseErr != nil {
		return nil, infraerrors.BadRequest("INVALID_CONTENT_MODERATION_CONFIG", "content moderation config is not valid JSON")
	}
	conf.normalize()
	return conf, nil
}

// checkRiskControlActive determines if the global risk control feature flag is enabled.
func (s *ContentModerationService) checkRiskControlActive(ctx context.Context) bool {
	val, fetchErr := s.settingRepo.GetValue(ctx, SettingKeyRiskControlEnabled)
	if fetchErr != nil {
		return false
	}
	return val == "true"
}

// checkConfigValidity validates the moderation config before persisting.
func (s *ContentModerationService) checkConfigValidity(ctx context.Context, conf *ContentModerationConfig) error {
	if conf == nil {
		return infraerrors.BadRequest("INVALID_CONTENT_MODERATION_CONFIG", "content moderation config must not be nil")
	}
	conf.normalize()
	switch conf.Mode {
	case ContentModerationModeOff, ContentModerationModeObserve, ContentModerationModePreBlock:
	default:
		return infraerrors.BadRequest("INVALID_CONTENT_MODERATION_MODE", "unrecognized content moderation mode")
	}
	if _, parseErr := url.ParseRequestURI(conf.BaseURL); parseErr != nil {
		return infraerrors.BadRequest("INVALID_CONTENT_MODERATION_BASE_URL", "base URL is not a valid URI")
	}
	if conf.BlockStatus < 400 || conf.BlockStatus > 599 {
		return infraerrors.BadRequest("INVALID_CONTENT_MODERATION_BLOCK_STATUS", "block HTTP status must be between 400 and 599")
	}
	if conf.ModelFilter.Type != ContentModerationModelFilterAll && len(conf.ModelFilter.Models) == 0 {
		return infraerrors.BadRequest("INVALID_CONTENT_MODERATION_MODEL_FILTER", "include/exclude model filter requires at least one model")
	}
	if !conf.AllGroups && len(conf.GroupIDs) > 0 && s.groupRepo != nil {
		for _, gid := range conf.GroupIDs {
			if _, lookupErr := s.groupRepo.GetByIDLite(ctx, gid); lookupErr != nil {
				return infraerrors.BadRequest("INVALID_CONTENT_MODERATION_GROUP", fmt.Sprintf("audit group does not exist: %d", gid))
			}
		}
	}
	return nil
}

// invokeWithRetry calls the moderation API with retry logic.
func (s *ContentModerationService) invokeWithRetry(ctx context.Context, conf *ContentModerationConfig, payload any, instrumentLoad ...bool) (*moderationAPIResult, error) {
	maxAttempts := conf.RetryCount + 1
	if maxAttempts <= 0 {
		maxAttempts = 1
	}
	if maxAttempts > maxContentModerationRetryCount+1 {
		maxAttempts = maxContentModerationRetryCount + 1
	}
	trackKeyMetrics := len(instrumentLoad) > 0 && instrumentLoad[0]
	var lastFailure error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		selectedKey, available := s.pickAvailableKey(conf)
		if !available {
			lastFailure = errors.New("no moderation API keys available for use")
			break
		}
		if trackKeyMetrics {
			s.startKeyCall(selectedKey)
		}
		callStart := time.Now()
		respCode := 0
		apiResp, callErr := s.invokeModerationEndpoint(ctx, conf, selectedKey, payload, &respCode)
		elapsed := int(time.Since(callStart).Milliseconds())
		if callErr == nil {
			if trackKeyMetrics {
				s.endKeyCall(selectedKey, elapsed, true)
			}
			s.recordKeySuccess(selectedKey, elapsed, respCode)
			return apiResp, nil
		}
		if trackKeyMetrics {
			s.endKeyCall(selectedKey, elapsed, false)
		}
		s.recordKeyFailure(selectedKey, callErr.Error(), elapsed, respCode)
		lastFailure = callErr
		if respCode == http.StatusBadRequest {
			break
		}
		if attempt == maxAttempts-1 {
			break
		}
		backoff := time.Duration(100*(attempt+1)) * time.Millisecond
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(backoff):
		}
	}
	return nil, lastFailure
}

// invokeModerationEndpoint performs a single HTTP call to the moderation API.
func (s *ContentModerationService) invokeModerationEndpoint(ctx context.Context, conf *ContentModerationConfig, apiKey string, payload any, outStatus *int) (*moderationAPIResult, error) {
	baseAddr := strings.TrimRight(conf.BaseURL, "/")
	endpointURL, joinErr := url.JoinPath(baseAddr, "/v1/moderations")
	if joinErr != nil {
		return nil, joinErr
	}
	reqBody := moderationAPIRequest{
		Model: conf.Model,
		Input: payload,
	}
	encoded, marshalErr := json.Marshal(reqBody)
	if marshalErr != nil {
		return nil, marshalErr
	}
	deadline := time.Duration(conf.TimeoutMS) * time.Millisecond
	callCtx, cancelFn := context.WithTimeout(ctx, deadline)
	defer cancelFn()

	httpReq, buildErr := http.NewRequestWithContext(callCtx, http.MethodPost, endpointURL, bytes.NewReader(encoded))
	if buildErr != nil {
		return nil, buildErr
	}
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	transport := s.httpClient
	if transport == nil {
		transport = http.DefaultClient
	}
	httpResp, doErr := transport.Do(httpReq)
	if doErr != nil {
		return nil, doErr
	}
	defer func() { _ = httpResp.Body.Close() }()
	if outStatus != nil {
		*outStatus = httpResp.StatusCode
	}

	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		respSnippet, _ := io.ReadAll(io.LimitReader(httpResp.Body, 512))
		return nil, fmt.Errorf("moderation endpoint returned status %d: %s", httpResp.StatusCode, strings.TrimSpace(string(respSnippet)))
	}
	var envelope moderationAPIResponse
	if decodeErr := json.NewDecoder(httpResp.Body).Decode(&envelope); decodeErr != nil {
		return nil, decodeErr
	}
	if len(envelope.Results) == 0 {
		return nil, errors.New("moderation endpoint returned no results")
	}
	return &envelope.Results[0], nil
}

// assembleLogEntry constructs a ContentModerationLog from check parameters.
func (s *ContentModerationService) assembleLogEntry(input ContentModerationCheckInput, conf *ContentModerationConfig, action string, flagged bool, topCategory string, topScore float64, scores map[string]float64, excerpt string, latencyMS *int, waitMS *int, errMsg string) *ContentModerationLog {
	var uid *int64
	if input.UserID > 0 {
		uid = &input.UserID
	}
	var keyID *int64
	if input.APIKeyID > 0 {
		keyID = &input.APIKeyID
	}
	return &ContentModerationLog{
		RequestID:         input.RequestID,
		UserID:            uid,
		UserEmail:         input.UserEmail,
		APIKeyID:          keyID,
		APIKeyName:        input.APIKeyName,
		GroupID:           copyInt64Ptr(input.GroupID),
		GroupName:         input.GroupName,
		Endpoint:          input.Endpoint,
		Provider:          input.Provider,
		Model:             input.Model,
		Mode:              conf.Mode,
		Action:            action,
		Flagged:           flagged,
		HighestCategory:   topCategory,
		HighestScore:      topScore,
		CategoryScores:    duplicateFloatMap(scores),
		ThresholdSnapshot: duplicateFloatMap(conf.Thresholds),
		InputExcerpt:      truncateByRunes(redactContentModerationSecrets(excerpt), maxModerationExcerptRunes),
		UpstreamLatencyMS: latencyMS,
		QueueDelayMS:      waitMS,
		Error:             errMsg,
	}
}

// writeLogAndSideEffects persists a moderation log and triggers associated side effects.
func (s *ContentModerationService) writeLogAndSideEffects(ctx context.Context, conf *ContentModerationConfig, entry *ContentModerationLog, contentDigest string, storeHash bool, runSideEffects bool) {
	if s == nil || entry == nil {
		return
	}
	if storeHash && s.hashCache != nil {
		if cacheErr := s.hashCache.RecordFlaggedInputHash(ctx, contentDigest); cacheErr != nil {
			slog.Warn("content_moderation.record_hash_failed", "user_id", extractLogUserID(entry), "endpoint", entry.Endpoint, "error", cacheErr)
		}
	}
	banApplied := false
	if runSideEffects {
		banApplied = s.enforceAccountBan(ctx, conf, entry)
		s.dispatchNotifications(ctx, conf, entry, banApplied)
	}
	if s.repo != nil {
		if writeErr := s.repo.CreateLog(ctx, entry); writeErr != nil {
			slog.Warn("content_moderation.create_log_failed", "user_id", extractLogUserID(entry), "endpoint", entry.Endpoint, "action", entry.Action, "error", writeErr)
			return
		}
	}
}

// enforceAccountBan applies auto-ban logic when violation threshold is exceeded.
func (s *ContentModerationService) enforceAccountBan(ctx context.Context, conf *ContentModerationConfig, entry *ContentModerationLog) bool {
	if s == nil || conf == nil || entry == nil || !entry.Flagged || entry.UserID == nil || *entry.UserID <= 0 {
		return false
	}
	totalViolations := 1
	if s.repo != nil && conf.ViolationWindowHours > 0 {
		windowStart := time.Now().Add(-time.Duration(conf.ViolationWindowHours) * time.Hour)
		if prior, countErr := s.repo.CountFlaggedByUserSince(ctx, *entry.UserID, windowStart); countErr == nil {
			totalViolations = prior + 1
		}
	}
	entry.ViolationCount = totalViolations
	banJustApplied := false
	if conf.AutoBanEnabled && conf.BanThreshold > 0 && totalViolations >= conf.BanThreshold && s.userRepo != nil {
		account, fetchErr := s.userRepo.GetByID(ctx, *entry.UserID)
		if fetchErr != nil {
			slog.Warn("content_moderation.ban_get_user_failed", "user_id", *entry.UserID, "error", fetchErr)
			return false
		}
		if account.IsAdmin() {
			slog.Warn("content_moderation.autoban_skipped_admin", "user_id", *entry.UserID, "role", account.Role, "count", totalViolations, "threshold", conf.BanThreshold)
			// Deferred: granular API-key auto-disable for admin violators requires
			// injecting APIKeyRepository into ContentModerationService (constructor,
			// Wire bindings, and all call sites). Tracked as a follow-up since the
			// loophole is bounded by manual admin review and audit log retention.
			return false
		}
		if account.Status != StatusDisabled {
			account.Status = StatusDisabled
			if updateErr := s.userRepo.Update(ctx, account); updateErr != nil {
				slog.Warn("content_moderation.ban_update_user_failed", "user_id", *entry.UserID, "error", updateErr)
				return false
			}
			if s.authCacheInvalidator != nil {
				s.authCacheInvalidator.InvalidateAuthCacheByUserID(ctx, *entry.UserID)
			}
			banJustApplied = true
		}
		entry.AutoBanned = true
	}
	return banJustApplied
}

// dispatchNotifications sends violation and/or account-disabled emails as appropriate.
func (s *ContentModerationService) dispatchNotifications(ctx context.Context, conf *ContentModerationConfig, entry *ContentModerationLog, banJustApplied bool) {
	if s == nil || conf == nil || entry == nil || !entry.Flagged {
		return
	}
	if s.emailService == nil || strings.TrimSpace(entry.UserEmail) == "" {
		return
	}
	emailWasSent := false
	if conf.EmailOnHit {
		if mailErr := s.sendViolationEmail(ctx, conf, entry); mailErr != nil {
			slog.Warn("content_moderation.email_failed", "user_id", *entry.UserID, "email", entry.UserEmail, "error", mailErr)
		} else {
			emailWasSent = true
		}
	}
	if banJustApplied {
		if mailErr := s.sendAccountDisabledEmail(ctx, conf, entry); mailErr != nil {
			slog.Warn("content_moderation.ban_email_failed", "user_id", *entry.UserID, "email", entry.UserEmail, "error", mailErr)
		} else {
			emailWasSent = true
		}
	}
	entry.EmailSent = emailWasSent
}

func (s *ContentModerationService) sendViolationEmail(ctx context.Context, conf *ContentModerationConfig, entry *ContentModerationLog) error {
	platformName := s.resolveSiteName(ctx)
	if s.emailService.notificationEmailService != nil {
		if sendErr := s.emailService.notificationEmailService.Send(ctx, NotificationEmailSendInput{
			Event:          NotificationEmailEventContentModerationViolation,
			RecipientEmail: entry.UserEmail,
			RecipientName:  emailRecipientNameV2(entry.UserEmail),
			UserID:         extractLogUserID(entry),
			SourceType:     "content_moderation",
			SourceID:       formatLogSourceID(entry),
			Variables:      buildNotificationVars(entry, conf),
		}); sendErr == nil {
			return nil
		} else {
			if !shouldFallbackNotificationEmail(sendErr) {
				return sendErr
			}
			slog.Warn("template content moderation violation email failed; falling back to built-in body", "log_id", entry.ID, "recipient_hash", notificationEmailHash(entry.UserEmail), "err", sendErr.Error())
		}
	}
	subject := fmt.Sprintf("[%s] 账户风控提醒 / Risk Control Notice", sanitizeEmailHeader(platformName))
	body := buildContentModerationViolationEmailBody(platformName, entry, conf)
	return s.emailService.SendEmail(ctx, entry.UserEmail, subject, body)
}

func (s *ContentModerationService) sendAccountDisabledEmail(ctx context.Context, conf *ContentModerationConfig, entry *ContentModerationLog) error {
	platformName := s.resolveSiteName(ctx)
	if s.emailService.notificationEmailService != nil {
		if sendErr := s.emailService.notificationEmailService.Send(ctx, NotificationEmailSendInput{
			Event:          NotificationEmailEventContentModerationDisabled,
			RecipientEmail: entry.UserEmail,
			RecipientName:  emailRecipientNameV2(entry.UserEmail),
			UserID:         extractLogUserID(entry),
			SourceType:     "content_moderation",
			SourceID:       formatLogSourceID(entry),
			Variables:      buildNotificationVars(entry, conf),
		}); sendErr == nil {
			return nil
		} else {
			if !shouldFallbackNotificationEmail(sendErr) {
				return sendErr
			}
			slog.Warn("template content moderation disabled email failed; falling back to built-in body", "log_id", entry.ID, "recipient_hash", notificationEmailHash(entry.UserEmail), "err", sendErr.Error())
		}
	}
	subject := fmt.Sprintf("[%s] 账户已被禁用 / Account Disabled", sanitizeEmailHeader(platformName))
	body := buildContentModerationAccountDisabledEmailBody(platformName, entry, conf)
	return s.emailService.SendEmail(ctx, entry.UserEmail, subject, body)
}

// extractLogUserID safely extracts the user ID from a moderation log entry.
func extractLogUserID(entry *ContentModerationLog) int64 {
	if entry == nil || entry.UserID == nil {
		return 0
	}
	return *entry.UserID
}

// formatLogSourceID formats the log ID as a string source identifier.
func formatLogSourceID(entry *ContentModerationLog) string {
	if entry == nil || entry.ID <= 0 {
		return ""
	}
	return fmt.Sprintf("%d", entry.ID)
}

// buildNotificationVars constructs the template variables for notification emails.
func buildNotificationVars(entry *ContentModerationLog, conf *ContentModerationConfig) map[string]string {
	vars := map[string]string{
		"triggered_at":        time.Now().UTC().Format(time.RFC3339),
		"group_name":          "-",
		"moderation_category": "-",
		"moderation_score":    "0.000",
		"violation_count":     "0",
		"ban_threshold":       "0",
	}
	if entry != nil {
		if !entry.CreatedAt.IsZero() {
			vars["triggered_at"] = entry.CreatedAt.UTC().Format(time.RFC3339)
		}
		if strings.TrimSpace(entry.GroupName) != "" {
			vars["group_name"] = strings.TrimSpace(entry.GroupName)
		}
		if strings.TrimSpace(entry.HighestCategory) != "" {
			vars["moderation_category"] = strings.TrimSpace(entry.HighestCategory)
		}
		vars["moderation_score"] = fmt.Sprintf("%.3f", entry.HighestScore)
		vars["violation_count"] = fmt.Sprintf("%d", entry.ViolationCount)
	}
	if conf != nil {
		vars["ban_threshold"] = fmt.Sprintf("%d", conf.BanThreshold)
	}
	return vars
}

// resolveSiteName retrieves the configured site name, falling back to a default.
func (s *ContentModerationService) resolveSiteName(ctx context.Context) string {
	if s == nil || s.settingRepo == nil {
		return "subme"
	}
	val, fetchErr := s.settingRepo.GetValue(ctx, SettingKeySiteName)
	if fetchErr != nil || strings.TrimSpace(val) == "" {
		return "subme"
	}
	return strings.TrimSpace(val)
}

// buildDefaultConfig returns a config populated with all default values.
func buildDefaultConfig() *ContentModerationConfig {
	return &ContentModerationConfig{
		Enabled:              false,
		Mode:                 ContentModerationModePreBlock,
		BaseURL:              defaultContentModerationBaseURL,
		Model:                defaultContentModerationModel,
		TimeoutMS:            defaultContentModerationTimeoutMS,
		SampleRate:           100,
		AllGroups:            true,
		GroupIDs:             []int64{},
		RecordNonHits:        false,
		Thresholds:           ContentModerationDefaultThresholds(),
		WorkerCount:          defaultContentModerationWorkerCount,
		QueueSize:            defaultContentModerationQueueSize,
		BlockStatus:          defaultContentModerationBlockHTTPStatus,
		BlockMessage:         defaultContentModerationBlockMessage,
		EmailOnHit:           true,
		AutoBanEnabled:       true,
		BanThreshold:         defaultContentModerationBanThreshold,
		ViolationWindowHours: defaultContentModerationViolationWindowHours,
		RetryCount:           defaultContentModerationRetryCount,
		HitRetentionDays:     defaultContentModerationHitRetentionDays,
		NonHitRetentionDays:  defaultContentModerationNonHitRetentionDays,
		PreHashCheckEnabled:  false,
		BlockedKeywords:      []string{},
		KeywordBlockingMode:  ContentModerationKeywordModeKeywordAndAPI,
		ModelFilter: ContentModerationModelFilter{
			Type:   ContentModerationModelFilterAll,
			Models: []string{},
		},
	}
}

// duplicateConfig creates a deep copy of a ContentModerationConfig.
func duplicateConfig(conf *ContentModerationConfig) *ContentModerationConfig {
	if conf == nil {
		return nil
	}
	dup := *conf
	dup.APIKeys = append([]string(nil), conf.APIKeys...)
	dup.GroupIDs = append([]int64(nil), conf.GroupIDs...)
	dup.BlockedKeywords = append([]string(nil), conf.BlockedKeywords...)
	dup.Thresholds = duplicateFloatMap(conf.Thresholds)
	dup.ModelFilter = ContentModerationModelFilter{
		Type:   conf.ModelFilter.Type,
		Models: append([]string(nil), conf.ModelFilter.Models...),
	}
	return &dup
}

func (cfg *ContentModerationConfig) normalize() {
	if cfg.APIKey != "" {
		cfg.APIKeys = deduplicateAPIKeys(append(cfg.APIKeys, cfg.APIKey))
		cfg.APIKey = ""
	} else {
		cfg.APIKeys = deduplicateAPIKeys(cfg.APIKeys)
	}
	if cfg.Mode == "" {
		cfg.Mode = ContentModerationModePreBlock
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = defaultContentModerationBaseURL
	}
	cfg.BaseURL = strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if cfg.Model == "" {
		cfg.Model = defaultContentModerationModel
	}
	cfg.Model = strings.TrimSpace(cfg.Model)
	if cfg.TimeoutMS <= 0 {
		cfg.TimeoutMS = defaultContentModerationTimeoutMS
	}
	if cfg.TimeoutMS > maxContentModerationTimeoutMS {
		cfg.TimeoutMS = maxContentModerationTimeoutMS
	}
	if cfg.SampleRate < 0 {
		cfg.SampleRate = 0
	}
	if cfg.SampleRate > 100 {
		cfg.SampleRate = 100
	}
	if cfg.WorkerCount <= 0 {
		cfg.WorkerCount = defaultContentModerationWorkerCount
	}
	if cfg.WorkerCount > maxContentModerationWorkerCount {
		cfg.WorkerCount = maxContentModerationWorkerCount
	}
	if cfg.QueueSize <= 0 {
		cfg.QueueSize = defaultContentModerationQueueSize
	}
	if cfg.QueueSize > maxContentModerationQueueSize {
		cfg.QueueSize = maxContentModerationQueueSize
	}
	if strings.TrimSpace(cfg.BlockMessage) == "" {
		cfg.BlockMessage = defaultContentModerationBlockMessage
	}
	cfg.BlockMessage = strings.TrimSpace(cfg.BlockMessage)
	if cfg.BlockStatus <= 0 {
		cfg.BlockStatus = defaultContentModerationBlockHTTPStatus
	}
	if cfg.BanThreshold <= 0 {
		cfg.BanThreshold = defaultContentModerationBanThreshold
	}
	if cfg.ViolationWindowHours <= 0 {
		cfg.ViolationWindowHours = defaultContentModerationViolationWindowHours
	}
	if cfg.RetryCount < 0 {
		cfg.RetryCount = 0
	}
	if cfg.RetryCount > maxContentModerationRetryCount {
		cfg.RetryCount = maxContentModerationRetryCount
	}
	if cfg.HitRetentionDays <= 0 {
		cfg.HitRetentionDays = defaultContentModerationHitRetentionDays
	}
	if cfg.HitRetentionDays > maxContentModerationRetentionDays {
		cfg.HitRetentionDays = maxContentModerationRetentionDays
	}
	if cfg.NonHitRetentionDays <= 0 {
		cfg.NonHitRetentionDays = defaultContentModerationNonHitRetentionDays
	}
	if cfg.NonHitRetentionDays > maxContentModerationNonHitRetentionDays {
		cfg.NonHitRetentionDays = maxContentModerationNonHitRetentionDays
	}
	cfg.GroupIDs = deduplicateInt64s(cfg.GroupIDs)
	cfg.Thresholds = overlayThresholds(ContentModerationDefaultThresholds(), cfg.Thresholds)
	cfg.BlockedKeywords = sanitizeKeywordList(cfg.BlockedKeywords)
	cfg.KeywordBlockingMode = resolveKeywordMode(cfg.KeywordBlockingMode)
	cfg.ModelFilter = sanitizeModelFilter(cfg.ModelFilter)
}

func (cfg *ContentModerationConfig) includesGroup(groupID *int64) bool {
	if cfg.AllGroups {
		return true
	}
	if groupID == nil {
		return false
	}
	for _, gid := range cfg.GroupIDs {
		if gid == *groupID {
			return true
		}
	}
	return false
}

func (cfg *ContentModerationConfig) includesModel(model string) bool {
	if cfg == nil {
		return true
	}
	normalized := sanitizeModelFilter(cfg.ModelFilter)
	switch normalized.Type {
	case ContentModerationModelFilterInclude:
		return modelListHas(normalized.Models, model)
	case ContentModerationModelFilterExclude:
		return !modelListHas(normalized.Models, model)
	default:
		return true
	}
}

// resolveGroupIDForLog returns 0 for nil group IDs (used in structured logging).
func resolveGroupIDForLog(groupID *int64) int64 {
	if groupID == nil {
		return 0
	}
	return *groupID
}

func (cfg *ContentModerationConfig) shouldSample(contentDigest string) bool {
	if cfg.SampleRate >= 100 {
		return true
	}
	if cfg.SampleRate <= 0 {
		return false
	}
	decoded, decodeErr := hex.DecodeString(contentDigest)
	if decodeErr != nil || len(decoded) < 2 {
		return true
	}
	return int(binary.BigEndian.Uint16(decoded[:2])%100) < cfg.SampleRate
}

func (cfg *ContentModerationConfig) apiKeys() []string {
	if cfg == nil {
		return nil
	}
	return deduplicateAPIKeys(cfg.APIKeys)
}

// pickAvailableKey selects the next non-frozen API key using round-robin.
func (s *ContentModerationService) pickAvailableKey(conf *ContentModerationConfig) (string, bool) {
	allKeys := conf.apiKeys()
	if len(allKeys) == 0 {
		return "", false
	}
	currentTime := time.Now()
	for attempts := 0; attempts < len(allKeys); attempts++ {
		position := int(s.apiKeyCursor.Add(1)-1) % len(allKeys)
		candidate := allKeys[position]
		if !s.isKeyCurrentlyFrozen(candidate, currentTime) {
			return candidate, true
		}
	}
	return "", false
}

// isKeyCurrentlyFrozen checks if a key is in its cooldown period.
func (s *ContentModerationService) isKeyCurrentlyFrozen(apiKey string, now time.Time) bool {
	digest := computeKeyDigest(apiKey)
	if digest == "" || s == nil {
		return false
	}
	s.keyHealthMu.Lock()
	defer s.keyHealthMu.Unlock()
	health := s.keyHealth[digest]
	return health != nil && health.FrozenUntil.After(now)
}

// startKeyCall increments the active call counter for a given key.
func (s *ContentModerationService) startKeyCall(apiKey string) {
	digest := computeKeyDigest(apiKey)
	if digest == "" || s == nil {
		return
	}
	s.keyHealthMu.Lock()
	defer s.keyHealthMu.Unlock()
	health := s.getOrCreateKeyHealth(digest, maskSecretTail(apiKey))
	health.SyncActive++
}

// endKeyCall decrements the active call counter and records outcome metrics.
func (s *ContentModerationService) endKeyCall(apiKey string, elapsedMS int, succeeded bool) {
	digest := computeKeyDigest(apiKey)
	if digest == "" || s == nil {
		return
	}
	if elapsedMS < 0 {
		elapsedMS = 0
	}
	s.keyHealthMu.Lock()
	defer s.keyHealthMu.Unlock()
	health := s.getOrCreateKeyHealth(digest, maskSecretTail(apiKey))
	if health.SyncActive > 0 {
		health.SyncActive--
	}
	health.SyncTotal++
	health.SyncLatencyMS += int64(elapsedMS)
	if succeeded {
		health.SyncSuccess++
		return
	}
	health.SyncErrors++
}

// recordKeySuccess resets failure state and marks the key as healthy.
func (s *ContentModerationService) recordKeySuccess(apiKey string, elapsedMS int, httpCode int) {
	digest := computeKeyDigest(apiKey)
	if digest == "" || s == nil {
		return
	}
	s.keyHealthMu.Lock()
	defer s.keyHealthMu.Unlock()
	health := s.getOrCreateKeyHealth(digest, maskSecretTail(apiKey))
	health.FailureCount = 0
	health.SuccessCount++
	health.LastError = ""
	health.LastCheckedAt = time.Now()
	health.FrozenUntil = time.Time{}
	health.LastLatencyMS = elapsedMS
	health.LastHTTPStatus = httpCode
	health.LastTested = true
}

// recordKeyFailure records a failed API call and optionally freezes the key.
func (s *ContentModerationService) recordKeyFailure(apiKey string, errDesc string, elapsedMS int, httpCode int) {
	digest := computeKeyDigest(apiKey)
	if digest == "" || s == nil {
		return
	}
	s.keyHealthMu.Lock()
	defer s.keyHealthMu.Unlock()
	health := s.getOrCreateKeyHealth(digest, maskSecretTail(apiKey))
	if computeFreezeDuration(httpCode) > 0 {
		health.FailureCount++
	}
	health.LastError = truncateByRunes(errDesc, 180)
	health.LastCheckedAt = time.Now()
	health.LastLatencyMS = elapsedMS
	health.LastHTTPStatus = httpCode
	health.LastTested = true
	if cooldown := computeFreezeDuration(httpCode); cooldown > 0 {
		health.FrozenUntil = time.Now().Add(cooldown)
	}
}

// computeFreezeDuration returns the freeze duration for a given HTTP status code.
func computeFreezeDuration(httpCode int) time.Duration {
	switch httpCode {
	case 0, http.StatusBadRequest:
		return 0
	case http.StatusUnauthorized, http.StatusForbidden:
		return contentModerationKeyAuthFreezeDuration
	case http.StatusTooManyRequests, 529:
		return contentModerationKeyRateLimitFreezeDuration
	default:
		return contentModerationKeyHTTPErrorFreezeDuration
	}
}

// getOrCreateKeyHealth returns the health tracker for a key, creating one if needed.
func (s *ContentModerationService) getOrCreateKeyHealth(digest string, maskedKey string) *contentModerationKeyHealth {
	if s.keyHealth == nil {
		s.keyHealth = make(map[string]*contentModerationKeyHealth)
	}
	health := s.keyHealth[digest]
	if health == nil {
		health = &contentModerationKeyHealth{Hash: digest}
		s.keyHealth[digest] = health
	}
	if strings.TrimSpace(maskedKey) != "" {
		health.Masked = maskedKey
	}
	return health
}

// toConfigView converts a config to its redacted view representation.
func (s *ContentModerationService) toConfigView(conf *ContentModerationConfig) *ContentModerationConfigView {
	allKeys := conf.apiKeys()
	maskedKeys := make([]string, 0, len(allKeys))
	for _, k := range allKeys {
		maskedKeys = append(maskedKeys, maskSecretTail(k))
	}
	primaryMask := ""
	if len(maskedKeys) > 0 {
		primaryMask = maskedKeys[0]
	}
	return &ContentModerationConfigView{
		Enabled:              conf.Enabled,
		Mode:                 conf.Mode,
		BaseURL:              conf.BaseURL,
		Model:                conf.Model,
		APIKeyConfigured:     len(allKeys) > 0,
		APIKeyMasked:         primaryMask,
		APIKeyCount:          len(allKeys),
		APIKeyMasks:          maskedKeys,
		APIKeyStatuses:       s.collectKeyStatuses(allKeys),
		TimeoutMS:            conf.TimeoutMS,
		SampleRate:           conf.SampleRate,
		AllGroups:            conf.AllGroups,
		GroupIDs:             append([]int64(nil), conf.GroupIDs...),
		RecordNonHits:        conf.RecordNonHits,
		Thresholds:           duplicateFloatMap(conf.Thresholds),
		WorkerCount:          conf.WorkerCount,
		QueueSize:            conf.QueueSize,
		BlockStatus:          conf.BlockStatus,
		BlockMessage:         conf.BlockMessage,
		EmailOnHit:           conf.EmailOnHit,
		AutoBanEnabled:       conf.AutoBanEnabled,
		BanThreshold:         conf.BanThreshold,
		ViolationWindowHours: conf.ViolationWindowHours,
		RetryCount:           conf.RetryCount,
		HitRetentionDays:     conf.HitRetentionDays,
		NonHitRetentionDays:  conf.NonHitRetentionDays,
		PreHashCheckEnabled:  conf.PreHashCheckEnabled,
		BlockedKeywords:      append([]string(nil), conf.BlockedKeywords...),
		KeywordBlockingMode:  conf.KeywordBlockingMode,
		ModelFilter:          copyModelFilter(conf.ModelFilter),
	}
}

// collectKeyStatuses builds a status report for each configured API key.
func (s *ContentModerationService) collectKeyStatuses(keys []string) []ContentModerationAPIKeyStatus {
	reports := make([]ContentModerationAPIKeyStatus, 0, len(keys))
	for pos, k := range keys {
		reports = append(reports, s.resolveKeyStatus(pos, computeKeyDigest(k), maskSecretTail(k), true))
	}
	return reports
}

// collectKeyLoadMetrics builds load metrics for each configured API key.
func (s *ContentModerationService) collectKeyLoadMetrics(keys []string) []ContentModerationAPIKeyLoad {
	metrics := make([]ContentModerationAPIKeyLoad, 0, len(keys))
	for pos, k := range keys {
		metrics = append(metrics, s.computeKeyLoadEntry(pos, computeKeyDigest(k), maskSecretTail(k)))
	}
	return metrics
}

// countActiveKeyCalls returns the total number of in-flight calls across all keys.
func (s *ContentModerationService) countActiveKeyCalls(keys []string) int64 {
	var sum int64
	for _, entry := range s.collectKeyLoadMetrics(keys) {
		sum += entry.Active
	}
	return sum
}

// countAvailableKeys returns how many keys are not currently frozen.
func (s *ContentModerationService) countAvailableKeys(keys []string) int64 {
	currentTime := time.Now()
	var available int64
	for _, k := range keys {
		if !s.isKeyCurrentlyFrozen(k, currentTime) {
			available++
		}
	}
	return available
}

// countTotalKeyCalls returns the sum of all calls across all keys.
func (s *ContentModerationService) countTotalKeyCalls(keys []string) int64 {
	var sum int64
	for _, entry := range s.collectKeyLoadMetrics(keys) {
		sum += entry.Total
	}
	return sum
}

// computeKeyLoadEntry assembles load metrics for a single API key.
func (s *ContentModerationService) computeKeyLoadEntry(position int, digest string, maskedKey string) ContentModerationAPIKeyLoad {
	loadInfo := ContentModerationAPIKeyLoad{
		Index:   position,
		KeyHash: digest,
		Masked:  maskedKey,
		Status:  "unknown",
	}
	keyReport := s.resolveKeyStatus(position, digest, maskedKey, true)
	loadInfo.Status = keyReport.Status
	loadInfo.LastLatencyMS = keyReport.LastLatencyMS
	loadInfo.LastHTTPStatus = keyReport.LastHTTPStatus
	if digest == "" || s == nil {
		return loadInfo
	}
	s.keyHealthMu.Lock()
	defer s.keyHealthMu.Unlock()
	health := s.keyHealth[digest]
	if health == nil {
		return loadInfo
	}
	loadInfo.Active = health.SyncActive
	loadInfo.Total = health.SyncTotal
	loadInfo.Success = health.SyncSuccess
	loadInfo.Errors = health.SyncErrors
	if health.SyncTotal > 0 {
		loadInfo.AvgLatencyMS = health.SyncLatencyMS / health.SyncTotal
	}
	return loadInfo
}

// resolveKeyStatus builds a status snapshot for a single API key.
func (s *ContentModerationService) resolveKeyStatus(position int, digest string, maskedKey string, isConfigured bool) ContentModerationAPIKeyStatus {
	report := ContentModerationAPIKeyStatus{
		Index:      position,
		KeyHash:    digest,
		Masked:     maskedKey,
		Status:     "unknown",
		Configured: isConfigured,
	}
	if digest == "" || s == nil {
		return report
	}
	currentTime := time.Now()
	s.keyHealthMu.Lock()
	defer s.keyHealthMu.Unlock()
	health := s.keyHealth[digest]
	if health == nil {
		return report
	}
	report.FailureCount = health.FailureCount
	report.SuccessCount = health.SuccessCount
	report.LastError = health.LastError
	report.LastLatencyMS = health.LastLatencyMS
	report.LastHTTPStatus = health.LastHTTPStatus
	report.LastTested = health.LastTested
	if !health.LastCheckedAt.IsZero() {
		checkedAt := health.LastCheckedAt
		report.LastCheckedAt = &checkedAt
	}
	if health.FrozenUntil.After(currentTime) {
		frozenAt := health.FrozenUntil
		report.FrozenUntil = &frozenAt
		report.Status = "frozen"
		return report
	}
	if health.LastError != "" {
		report.Status = "error"
		return report
	}
	if health.SuccessCount > 0 || health.LastTested {
		report.Status = "ok"
	}
	return report
}

// computeKeyDigest returns the SHA-256 hex digest of an API key.
func computeKeyDigest(apiKey string) string {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return ""
	}
	checksum := sha256.Sum256([]byte(apiKey))
	return hex.EncodeToString(checksum[:])
}

// assembleTestModerationPayload builds the moderation API input for key testing.
func assembleTestModerationPayload(promptText string, testImages []string) (any, int, error) {
	promptText = truncateByRunes(collapseWhitespace(promptText), maxModerationInputRunes)
	validImages := make([]string, 0, len(testImages))
	for _, imgRef := range testImages {
		imgRef = strings.TrimSpace(imgRef)
		if imgRef == "" {
			continue
		}
		if len(validImages) >= maxContentModerationTestImages {
			return nil, 0, infraerrors.BadRequest("TOO_MANY_MODERATION_TEST_IMAGES", fmt.Sprintf("at most %d test images allowed", maxContentModerationTestImages))
		}
		if validErr := checkTestImageDataURL(imgRef); validErr != nil {
			return nil, 0, validErr
		}
		validImages = append(validImages, imgRef)
	}
	if promptText == "" && len(validImages) == 0 {
		return "hello", 0, nil
	}
	if len(validImages) == 0 {
		return promptText, 0, nil
	}
	segments := make([]moderationAPIInputPart, 0, len(validImages)+1)
	if promptText != "" {
		segments = append(segments, moderationAPIInputPart{Type: "text", Text: promptText})
	}
	for _, imgRef := range validImages {
		segments = append(segments, moderationAPIInputPart{
			Type:     "image_url",
			ImageURL: &moderationAPIImageURLRef{URL: imgRef},
		})
	}
	return segments, len(validImages), nil
}

// hasAuditableTestContent checks if test input contains user-supplied content.
func hasAuditableTestContent(promptText string, testImages []string) bool {
	if collapseWhitespace(promptText) != "" {
		return true
	}
	for _, imgRef := range testImages {
		if strings.TrimSpace(imgRef) != "" {
			return true
		}
	}
	return false
}

// checkTestImageDataURL validates that a test image is a properly-encoded data URL.
func checkTestImageDataURL(dataURL string) error {
	if len(dataURL) > maxContentModerationTestImageDataURLBytes {
		return infraerrors.BadRequest("MODERATION_TEST_IMAGE_TOO_LARGE", "test image must not exceed 8MB")
	}
	if !strings.HasPrefix(dataURL, "data:image/") {
		return infraerrors.BadRequest("INVALID_MODERATION_TEST_IMAGE", "test image must be a data:image/* URL")
	}
	segments := strings.SplitN(dataURL, ",", 2)
	if len(segments) != 2 || !strings.Contains(segments[0], ";base64") {
		return infraerrors.BadRequest("INVALID_MODERATION_TEST_IMAGE", "test image must be a base64 data URL")
	}
	decoded, decErr := base64.StdEncoding.DecodeString(segments[1])
	if decErr != nil {
		return infraerrors.BadRequest("INVALID_MODERATION_TEST_IMAGE", "test image base64 encoding is invalid")
	}
	if len(decoded) > maxContentModerationTestImageBytes {
		return infraerrors.BadRequest("MODERATION_TEST_IMAGE_TOO_LARGE", "test image must not exceed 8MB")
	}
	return nil
}

// compileTestAuditResult evaluates moderation scores and builds a test audit summary.
func compileTestAuditResult(apiResult *moderationAPIResult, thresholds map[string]float64) *ContentModerationTestAuditResult {
	if apiResult == nil {
		return nil
	}
	catScores := make(map[string]float64, len(apiResult.CategoryScores))
	for cat, val := range apiResult.CategoryScores {
		catScores[cat] = val
	}
	mergedThresholds := overlayThresholds(ContentModerationDefaultThresholds(), thresholds)
	wasFlagged, topCat, topVal := assessModerationScores(catScores, mergedThresholds)
	return &ContentModerationTestAuditResult{
		Flagged:         wasFlagged,
		HighestCategory: topCat,
		HighestScore:    topVal,
		CompositeScore:  topVal,
		CategoryScores:  catScores,
		Thresholds:      mergedThresholds,
	}
}

type moderationAPIRequest struct {
	Model string `json:"model"`
	Input any    `json:"input"`
}

type moderationAPIInputPart struct {
	Type     string                    `json:"type"`
	Text     string                    `json:"text,omitempty"`
	ImageURL *moderationAPIImageURLRef `json:"image_url,omitempty"`
}

type moderationAPIImageURLRef struct {
	URL string `json:"url"`
}

type moderationAPIResponse struct {
	Results []moderationAPIResult `json:"results"`
}

type moderationAPIResult struct {
	Flagged        bool               `json:"flagged"`
	CategoryScores map[string]float64 `json:"category_scores"`
}

// assessModerationScores evaluates category scores against thresholds and returns
// whether any threshold was exceeded, along with the highest-scoring category.
func assessModerationScores(scores map[string]float64, thresholds map[string]float64) (bool, string, float64) {
	exceeded := false
	peakCategory := ""
	peakScore := 0.0
	for _, cat := range contentModerationCategoryOrder {
		val := scores[cat]
		if val > peakScore || peakCategory == "" {
			peakScore = val
			peakCategory = cat
		}
		if val >= thresholds[cat] {
			exceeded = true
		}
	}
	for cat, val := range scores {
		if val > peakScore || peakCategory == "" {
			peakScore = val
			peakCategory = cat
		}
	}
	return exceeded, peakCategory, peakScore
}

// overlayThresholds merges user overrides onto a base threshold map, clamping values to [0,1].
func overlayThresholds(base map[string]float64, overrides map[string]float64) map[string]float64 {
	merged := duplicateFloatMap(base)
	if merged == nil {
		merged = map[string]float64{}
	}
	for _, cat := range contentModerationCategoryOrder {
		if val, exists := overrides[cat]; exists {
			if val < 0 {
				val = 0
			}
			if val > 1 {
				val = 1
			}
			merged[cat] = val
		}
	}
	return merged
}

// deduplicateInt64s removes duplicates and non-positive values, then sorts ascending.
func deduplicateInt64s(ids []int64) []int64 {
	if len(ids) == 0 {
		return []int64{}
	}
	encountered := make(map[int64]struct{}, len(ids))
	unique := make([]int64, 0, len(ids))
	for _, val := range ids {
		if val <= 0 {
			continue
		}
		if _, exists := encountered[val]; exists {
			continue
		}
		encountered[val] = struct{}{}
		unique = append(unique, val)
	}
	sort.Slice(unique, func(a, b int) bool { return unique[a] < unique[b] })
	return unique
}

// sanitizeKeywordList deduplicates, trims, and caps the blocked keyword list.
func sanitizeKeywordList(raw []string) []string {
	if len(raw) == 0 {
		return []string{}
	}
	cleaned := make([]string, 0, len(raw))
	encountered := make(map[string]struct{}, len(raw))
	for _, entry := range raw {
		trimmed := strings.TrimSpace(entry)
		if trimmed == "" {
			continue
		}
		trimmed = truncateByRunes(trimmed, maxContentModerationBlockedKeywordRunes)
		lowerKey := strings.ToLower(trimmed)
		if _, exists := encountered[lowerKey]; exists {
			continue
		}
		encountered[lowerKey] = struct{}{}
		cleaned = append(cleaned, trimmed)
		if len(cleaned) >= maxContentModerationBlockedKeywords {
			break
		}
	}
	return cleaned
}

// resolveKeywordMode normalizes the keyword blocking mode string.
func resolveKeywordMode(mode string) string {
	switch strings.TrimSpace(mode) {
	case ContentModerationKeywordModeKeywordOnly:
		return ContentModerationKeywordModeKeywordOnly
	case ContentModerationKeywordModeAPIOnly:
		return ContentModerationKeywordModeAPIOnly
	case ContentModerationKeywordModeKeywordAndAPI:
		return ContentModerationKeywordModeKeywordAndAPI
	default:
		return ContentModerationKeywordModeKeywordAndAPI
	}
}

// sanitizeModelFilter normalizes a model filter configuration.
func sanitizeModelFilter(filter ContentModerationModelFilter) ContentModerationModelFilter {
	sanitized := ContentModerationModelFilter{
		Type:   resolveModelFilterType(filter.Type),
		Models: deduplicateModelNames(filter.Models),
	}
	if sanitized.Type == ContentModerationModelFilterAll {
		sanitized.Models = []string{}
	}
	return sanitized
}

// copyModelFilter creates a deep copy of a model filter.
func copyModelFilter(filter ContentModerationModelFilter) ContentModerationModelFilter {
	sanitized := sanitizeModelFilter(filter)
	sanitized.Models = append([]string(nil), sanitized.Models...)
	return sanitized
}

// resolveModelFilterType normalizes a model filter type string.
func resolveModelFilterType(filterType string) string {
	switch strings.ToLower(strings.TrimSpace(filterType)) {
	case ContentModerationModelFilterInclude:
		return ContentModerationModelFilterInclude
	case ContentModerationModelFilterExclude:
		return ContentModerationModelFilterExclude
	case ContentModerationModelFilterAll:
		return ContentModerationModelFilterAll
	default:
		return ContentModerationModelFilterAll
	}
}

// deduplicateModelNames trims, deduplicates, and caps model name lists.
func deduplicateModelNames(models []string) []string {
	if len(models) == 0 {
		return []string{}
	}
	unique := make([]string, 0, len(models))
	encountered := make(map[string]struct{}, len(models))
	for _, entry := range models {
		trimmed := truncateByRunes(strings.TrimSpace(entry), maxContentModerationModelFilterRunes)
		if trimmed == "" {
			continue
		}
		lowerKey := strings.ToLower(trimmed)
		if _, exists := encountered[lowerKey]; exists {
			continue
		}
		encountered[lowerKey] = struct{}{}
		unique = append(unique, trimmed)
		if len(unique) >= maxContentModerationModelFilterModels {
			break
		}
	}
	return unique
}

// modelListHas performs a case-insensitive search for a model in a list.
func modelListHas(models []string, target string) bool {
	target = strings.ToLower(strings.TrimSpace(target))
	if target == "" {
		return false
	}
	for _, entry := range models {
		if strings.ToLower(strings.TrimSpace(entry)) == target {
			return true
		}
	}
	return false
}

// findBlockedKeyword searches for a blocked keyword match (case-insensitive).
func findBlockedKeyword(text string, keywords []string) (string, bool) {
	if text == "" || len(keywords) == 0 {
		return "", false
	}
	lowered := strings.ToLower(text)
	for _, kw := range keywords {
		if kw == "" {
			continue
		}
		if strings.Contains(lowered, strings.ToLower(kw)) {
			return kw, true
		}
	}
	return "", false
}

// deduplicateAPIKeys trims and deduplicates API keys.
func deduplicateAPIKeys(keys []string) []string {
	if len(keys) == 0 {
		return []string{}
	}
	encountered := make(map[string]struct{}, len(keys))
	unique := make([]string, 0, len(keys))
	for _, k := range keys {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		if _, exists := encountered[k]; exists {
			continue
		}
		encountered[k] = struct{}{}
		unique = append(unique, k)
	}
	return unique
}

// removeKeysByHash filters out API keys whose hashes appear in the removal set.
func removeKeysByHash(keys []string, hashesToRemove []string) []string {
	keys = deduplicateAPIKeys(keys)
	removalSet := make(map[string]struct{}, len(hashesToRemove))
	for _, h := range hashesToRemove {
		h = sanitizeHexHash(h)
		if h != "" {
			removalSet[h] = struct{}{}
		}
	}
	if len(removalSet) == 0 {
		return keys
	}
	kept := make([]string, 0, len(keys))
	for _, k := range keys {
		if _, shouldRemove := removalSet[computeKeyDigest(k)]; shouldRemove {
			continue
		}
		kept = append(kept, k)
	}
	return kept
}

// resolveAPIKeysMode normalizes the API key merge mode string.
func resolveAPIKeysMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case contentModerationAPIKeysModeReplace:
		return contentModerationAPIKeysModeReplace
	default:
		return contentModerationAPIKeysModeAppend
	}
}

// sanitizeHexHash normalizes and validates a SHA-256 hex hash string.
func sanitizeHexHash(hexStr string) string {
	hexStr = strings.ToLower(strings.TrimSpace(hexStr))
	if len(hexStr) != sha256.Size*2 {
		return ""
	}
	if _, decErr := hex.DecodeString(hexStr); decErr != nil {
		return ""
	}
	return hexStr
}

// duplicateFloatMap creates a shallow copy of a string-to-float64 map.
func duplicateFloatMap(src map[string]float64) map[string]float64 {
	if src == nil {
		return map[string]float64{}
	}
	dup := make(map[string]float64, len(src))
	for k, v := range src {
		dup[k] = v
	}
	return dup
}

// copyInt64Ptr creates a copy of an int64 pointer.
func copyInt64Ptr(ptr *int64) *int64 {
	if ptr == nil {
		return nil
	}
	val := *ptr
	return &val
}

// truncateByRunes truncates a string to a maximum number of runes.
func truncateByRunes(text string, maxRunes int) string {
	if maxRunes <= 0 {
		return ""
	}
	codepoints := []rune(text)
	if len(codepoints) <= maxRunes {
		return text
	}
	return string(codepoints[:maxRunes])
}

// maskSecretTail masks all but the last 4 characters of a secret string.
func maskSecretTail(secret string) string {
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return ""
	}
	if len(secret) <= 4 {
		return "****"
	}
	return strings.Repeat("*", 8) + secret[len(secret)-4:]
}

// collapseWhitespace normalizes all whitespace runs in a string to single spaces.
func collapseWhitespace(text string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(text)), " ")
}

// capModerationImages limits the image list to the maximum allowed count,
// selecting randomly when the limit is exceeded.
func capModerationImages(images []string) []string {
	if len(images) <= maxContentModerationInputImages {
		return images
	}
	idx, randErr := pickRandomIndex(len(images))
	if randErr != nil {
		return images[:maxContentModerationInputImages]
	}
	return []string{images[idx]}
}

// deduplicateImages removes duplicate and empty image URLs.
func deduplicateImages(images []string) []string {
	cleaned := make([]string, 0, len(images))
	encountered := make(map[string]struct{}, len(images))
	for _, imgRef := range images {
		imgRef = strings.TrimSpace(imgRef)
		if imgRef == "" {
			continue
		}
		if _, exists := encountered[imgRef]; exists {
			continue
		}
		encountered[imgRef] = struct{}{}
		cleaned = append(cleaned, imgRef)
	}
	return cleaned
}

// ---- Compatibility aliases for package-internal callers (tests, etc.) ----

func defaultContentModerationConfig() *ContentModerationConfig { return buildDefaultConfig() }

func normalizeBlockedKeywords(raw []string) []string { return sanitizeKeywordList(raw) }

func matchBlockedKeyword(text string, keywords []string) (string, bool) {
	return findBlockedKeyword(text, keywords)
}

func normalizeKeywordBlockingMode(mode string) string { return resolveKeywordMode(mode) }

func moderationAPIKeyHash(key string) string { return computeKeyDigest(key) }

func buildModerationTestInput(prompt string, images []string) (any, int, error) {
	return assembleTestModerationPayload(prompt, images)
}

func buildContentModerationTestAuditResult(result *moderationAPIResult, thresholds map[string]float64) *ContentModerationTestAuditResult {
	return compileTestAuditResult(result, thresholds)
}

func (s *ContentModerationService) loadConfig(ctx context.Context) (*ContentModerationConfig, error) {
	return s.fetchConfig(ctx)
}

func (s *ContentModerationService) buildLog(input ContentModerationCheckInput, cfg *ContentModerationConfig, action string, flagged bool, highestCategory string, highestScore float64, scores map[string]float64, text string, latency *int, queueDelay *int, errText string) *ContentModerationLog {
	return s.assembleLogEntry(input, cfg, action, flagged, highestCategory, highestScore, scores, text, latency, queueDelay, errText)
}

func (s *ContentModerationService) checkSync(ctx context.Context, input ContentModerationCheckInput, cfg *ContentModerationConfig, content ContentModerationInput, hashText string, queueDelay *int, allowBlock bool) *ContentModerationDecision {
	return s.executeSynchronousCheck(ctx, input, cfg, content, hashText, queueDelay, allowBlock)
}
