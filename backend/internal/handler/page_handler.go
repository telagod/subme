package handler

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/telagod/subme/internal/pkg/response"
	middleware2 "github.com/telagod/subme/internal/server/middleware"
	"github.com/telagod/subme/internal/service"
	"github.com/gin-gonic/gin"
)

var validSlugPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]*$`)

const maxPageFileSize = 1 << 20 // 1MB

type PageHandler struct {
	pagesDir       string
	settingService *service.SettingService
}

func NewPageHandler(dataDir string, settingService *service.SettingService) *PageHandler {
	dir := filepath.Join(dataDir, "pages")
	_ = os.MkdirAll(dir, 0755)
	return &PageHandler{pagesDir: dir, settingService: settingService}
}

// GetPageContent serves raw markdown content for a given slug.
// GET /api/v1/pages/:slug
func (h *PageHandler) GetPageContent(c *gin.Context) {
	pageSlug := c.Param("slug")
	if !validSlugPattern.MatchString(pageSlug) || len(pageSlug) > 64 {
		response.BadRequest(c, "Page slug is not valid")
		return
	}

	// Visibility gate: the slug must be present in custom_menu_items
	// and the caller must have permission based on its visibility setting.
	if !h.checkSlugVisibility(c, pageSlug) {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	target := filepath.Join(h.pagesDir, pageSlug+".md")
	sanitized := filepath.Clean(target)
	if !strings.HasPrefix(sanitized, filepath.Clean(h.pagesDir)) {
		response.BadRequest(c, "Page slug is not valid")
		return
	}

	stat, statErr := os.Stat(sanitized)
	if statErr != nil || stat.IsDir() {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}
	if stat.Size() > maxPageFileSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "page content exceeds size limit"})
		return
	}

	raw, readErr := os.ReadFile(sanitized)
	if readErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read page content"})
		return
	}

	c.Data(http.StatusOK, "text/markdown; charset=utf-8", raw)
}

// ListPages returns available page slugs.
// GET /api/v1/pages
func (h *PageHandler) ListPages(c *gin.Context) {
	dirEntries, readErr := os.ReadDir(h.pagesDir)
	if readErr != nil {
		response.Success(c, []string{})
		return
	}

	collected := make([]string, 0, len(dirEntries))
	for _, entry := range dirEntries {
		if entry.IsDir() {
			continue
		}
		fname := entry.Name()
		if strings.HasSuffix(fname, ".md") {
			collected = append(collected, strings.TrimSuffix(fname, ".md"))
		}
	}
	response.Success(c, collected)
}

// ServePageImage serves images from data/pages/{slug}/ directory.
// GET /api/v1/pages/:slug/images/*filename
// No JWT required (browser img tags can't carry tokens), but visibility is checked.
func (h *PageHandler) ServePageImage(c *gin.Context) {
	pageSlug := c.Param("slug")
	imgFile := c.Param("filename")
	imgFile = strings.TrimPrefix(imgFile, "/")

	if !validSlugPattern.MatchString(pageSlug) || len(pageSlug) > 64 {
		c.Status(http.StatusNotFound)
		return
	}

	if !h.checkImageSlugVisibility(c, pageSlug) {
		c.Status(http.StatusNotFound)
		return
	}

	imgDir := filepath.Join(h.pagesDir, pageSlug)
	resolved, safe := resolvePageImagePath(h.pagesDir, imgDir, imgFile)
	if !safe {
		c.Status(http.StatusNotFound)
		return
	}

	stat, statErr := os.Stat(resolved)
	if statErr != nil || stat.IsDir() {
		c.Status(http.StatusNotFound)
		return
	}

	c.File(resolved)
}

func resolvePageImagePath(pagesRoot, imgDir, filename string) (string, bool) {
	relSegment, valid := cleanPageImageRelativePath(filename)
	if !valid {
		return "", false
	}

	normalizedRoot := filepath.Clean(pagesRoot)
	normalizedDir := filepath.Clean(imgDir)
	normalizedTarget := filepath.Clean(filepath.Join(normalizedDir, relSegment))
	if !isPathWithinBase(normalizedTarget, normalizedDir) {
		return "", false
	}

	realRoot, symlinkErr := filepath.EvalSymlinks(normalizedRoot)
	if symlinkErr != nil {
		return "", false
	}
	realDir, symlinkErr := filepath.EvalSymlinks(normalizedDir)
	if symlinkErr != nil || !isPathWithinBase(realDir, realRoot) {
		return "", false
	}
	realTarget, symlinkErr := filepath.EvalSymlinks(normalizedTarget)
	if symlinkErr != nil || !isPathWithinBase(realTarget, realDir) {
		return "", false
	}
	return realTarget, true
}

func cleanPageImageRelativePath(filename string) (string, bool) {
	if filename == "" {
		return "", false
	}
	if strings.HasPrefix(filename, "/") {
		return "", false
	}
	unescaped, decodeErr := url.PathUnescape(filename)
	if decodeErr != nil {
		return "", false
	}
	if unescaped == "" || strings.HasPrefix(unescaped, "/") || strings.Contains(unescaped, "\\") || strings.ContainsRune(unescaped, 0) {
		return "", false
	}

	segments := make([]string, 0)
	for _, seg := range strings.Split(unescaped, "/") {
		switch seg {
		case "", ".":
			continue
		case "..":
			return "", false
		default:
			segments = append(segments, seg)
		}
	}
	if len(segments) == 0 {
		return "", false
	}

	joined := filepath.Join(segments...)
	if filepath.IsAbs(joined) || filepath.VolumeName(joined) != "" {
		return "", false
	}
	return joined, true
}

func isPathWithinBase(candidate, base string) bool {
	relative, relErr := filepath.Rel(filepath.Clean(base), filepath.Clean(candidate))
	if relErr != nil {
		return false
	}
	return relative != "." && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

// findSlugVisibility looks up the slug in custom_menu_items and returns (visibility, found).
func (h *PageHandler) findSlugVisibility(c *gin.Context, pageSlug string) (string, bool) {
	if h.settingService == nil {
		return "", false
	}

	rawJSON := h.settingService.GetCustomMenuItemsRaw(c.Request.Context())
	if rawJSON == "" || rawJSON == "[]" {
		return "", false
	}

	var menuEntries []struct {
		URL        string `json:"url"`
		PageSlug   string `json:"page_slug"`
		Visibility string `json:"visibility"`
	}
	if unmarshalErr := json.Unmarshal([]byte(rawJSON), &menuEntries); unmarshalErr != nil {
		return "", false
	}

	for _, entry := range menuEntries {
		entrySlug := entry.PageSlug
		if entrySlug == "" && strings.HasPrefix(entry.URL, "md:") {
			entrySlug = strings.TrimPrefix(entry.URL, "md:")
		}
		if entrySlug == pageSlug {
			return entry.Visibility, true
		}
	}
	return "", false
}

// checkSlugVisibility verifies the slug is configured in custom_menu_items
// and the authenticated user has permission to view it.
func (h *PageHandler) checkSlugVisibility(c *gin.Context, pageSlug string) bool {
	vis, exists := h.findSlugVisibility(c, pageSlug)
	if !exists {
		return false
	}
	if vis == "admin" {
		userRole, _ := middleware2.GetUserRoleFromContext(c)
		return userRole == "admin"
	}
	return true
}

// checkImageSlugVisibility checks visibility for image requests (no JWT available).
// Only allows user-visible pages; admin-only pages are blocked.
func (h *PageHandler) checkImageSlugVisibility(c *gin.Context, pageSlug string) bool {
	vis, exists := h.findSlugVisibility(c, pageSlug)
	if !exists {
		return false
	}
	return vis != "admin"
}

// RegisterPageRoutes registers page routes on a router group.
func RegisterPageRoutes(v1 *gin.RouterGroup, dataDir string, jwtAuth gin.HandlerFunc, adminAuth gin.HandlerFunc, settingService *service.SettingService) {
	hdlr := NewPageHandler(dataDir, settingService)

	// Authenticated page content (JWT required + visibility check)
	authedPages := v1.Group("/pages")
	authedPages.Use(jwtAuth)
	{
		authedPages.GET("/:slug", hdlr.GetPageContent)
	}

	// Images: no JWT (browser img tags can't carry tokens), visibility check in handler
	publicImages := v1.Group("/pages")
	{
		publicImages.GET("/:slug/images/*filename", hdlr.ServePageImage)
	}

	// Admin-only: list all available pages
	adminOnlyPages := v1.Group("/pages")
	adminOnlyPages.Use(adminAuth)
	{
		adminOnlyPages.GET("", hdlr.ListPages)
	}
}
