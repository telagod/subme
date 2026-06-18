//go:build embed && frontend_svelte

package web

import "embed"

// frontendFS embeds the Svelte SPA build output.
//
// Selected by `-tags=embed,frontend_svelte`. The Vue tree under `dist/`
// remains the default (see embed_vue.go) until Phase D of the rewrite
// roadmap promotes Svelte to default and deletes the Vue dist.
//
//go:embed all:dist_svelte
var frontendFS embed.FS

// distRoot names the subdirectory inside frontendFS that holds the SPA.
const distRoot = "dist_svelte"
