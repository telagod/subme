//go:build embed && !frontend_svelte

package web

import "embed"

// frontendFS embeds the Vue SPA build output (default frontend).
//
// This is the default tree shipped today. The Svelte rewrite lives in
// a parallel `dist_svelte/` directory and is selected by adding the
// `frontend_svelte` build tag (see embed_vue.go's sibling embed_svelte.go).
//
//go:embed all:dist
var frontendFS embed.FS

// distRoot names the subdirectory inside frontendFS that holds the SPA.
const distRoot = "dist"
