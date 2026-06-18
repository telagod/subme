// SPA 模式：禁用 SSR 与 prerender。
// 与 adapter-static fallback:'index.html' 配合，输出单页应用，
// 所有路由由客户端 router 接管，与 Vue tree 历史行为对齐。
export const ssr = false;
export const prerender = false;
