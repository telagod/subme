//go:build embed

package web

import "embed"

// frontendFS embeds the Svelte SPA build output.
//
//go:embed all:dist_svelte
var frontendFS embed.FS

// distRoot names the subdirectory inside frontendFS that holds the SPA.
const distRoot = "dist_svelte"
