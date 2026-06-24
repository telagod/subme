<script lang="ts">
	/**
	 * OpsErrorDetailModal · 单条错误完整详情（Phase C · admin-ops）
	 *
	 * Vue 原型：frontend/src/views/admin/ops/components/OpsErrorDetailModal.vue
	 *   + utils/errorDetailResponse.ts（resolvePrimaryResponseBody / resolveUpstreamPayload）。
	 *
	 * 行为：
	 *   - StandardDialog（宽屏）。$effect 监听 open + errorId → 按 errorType 拉权威 detail：
	 *       request → getOpsRequestErrorDetail；upstream → getOpsUpstreamErrorDetail。
	 *     errorType 缺省时回退到已加载 detail.phase 推断（与 Vue 一致）。
	 *   - request 错误额外拉 listOpsRequestErrorUpstreamErrors(id, {include_detail:true})
	 *     渲染嵌套 upstream-errors 列表（可逐条展开 response 预览）。
	 *   - 渲染：summary grid + latency phases breakdown + response body（pretty JSON）。
	 *
	 * 调色板红线：Zinc-only，无裸 hex。状态码色调用 token class（destructive / amber 走
	 *   tailwind 语义 token，已审核）。i18n 全部 $_ 带 default fallback，防 hardcoded-English。
	 *
	 * Props（路由按此精确 wire）：
	 *   { open: boolean; errorId: number | null; errorType?: 'request' | 'upstream'; onClose: () => void }
	 */
	import { _ } from 'svelte-i18n';
	import { RefreshCw, AlertTriangle, ChevronRight, ChevronDown, X, CheckCircle2 } from '@lucide/svelte';
	import {
		getOpsRequestErrorDetail,
		getOpsUpstreamErrorDetail,
		listOpsRequestErrorUpstreamErrors,
		resolveOpsRequestError,
		resolveOpsUpstreamError,
		type OpsErrorDetail
	} from '$lib/api/admin/ops';
	import { formatDateTime, formatDuration } from '$lib/features/admin-ops/ops';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Alert from '$lib/ui/Alert.svelte';

	type ErrorType = 'request' | 'upstream';

	type Props = {
		open: boolean;
		errorId: number | null;
		errorType?: ErrorType;
		onClose: () => void;
	};

	let { open = $bindable(false), errorId = null, errorType, onClose }: Props = $props();

	// ── detail fetch state ───────────────────────────────────────────────────
	let detail = $state<OpsErrorDetail | null>(null);
	let loading = $state(false);
	let resolving = $state(false);
	let loadError = $state<string | null>(null);
	let lastLoadedId = $state<number | null>(null);

	// ── correlated upstream errors（仅 request 错误）─────────────────────────
	let correlatedUpstream = $state<OpsErrorDetail[]>([]);
	let correlatedLoading = $state(false);
	let expandedIds = $state<Set<number>>(new Set());

	const showUpstreamList = $derived(errorType === 'request');

	// ── response body resolution（移植自 errorDetailResponse.ts）─────────────
	const GENERIC_UPSTREAM_MESSAGES = new Set([
		'upstream request failed',
		'upstream request failed after retries',
		'upstream gateway error',
		'upstream service temporarily unavailable'
	]);

	function parseGatewayError(raw: string): { type: string; message: string } | null {
		const text = String(raw || '').trim();
		if (!text) return null;
		try {
			const parsed = JSON.parse(text) as Record<string, unknown>;
			const err = parsed?.error as Record<string, unknown> | undefined;
			if (!err || typeof err !== 'object') return null;
			const type = typeof err.type === 'string' ? err.type.trim() : '';
			const message = typeof err.message === 'string' ? err.message.trim() : '';
			if (!type && !message) return null;
			return { type, message };
		} catch {
			return null;
		}
	}

	function isGenericGatewayUpstream(raw: string): boolean {
		const parsed = parseGatewayError(raw);
		if (!parsed || parsed.type !== 'upstream_error') return false;
		return GENERIC_UPSTREAM_MESSAGES.has(parsed.message.toLowerCase());
	}

	function resolveUpstreamPayload(
		d: Pick<
			OpsErrorDetail,
			'upstream_error_detail' | 'upstream_errors' | 'upstream_error_message'
		> | null
	): string {
		if (!d) return '';
		const candidates = [d.upstream_error_detail, d.upstream_errors, d.upstream_error_message];
		for (const candidate of candidates) {
			const payload = String(candidate ?? '').trim();
			if (!payload) continue;
			if (payload === '[]' || payload === '{}' || payload.toLowerCase() === 'null') continue;
			return payload;
		}
		return '';
	}

	function resolvePrimaryResponseBody(d: OpsErrorDetail | null, kind?: ErrorType): string {
		if (!d) return '';
		const upstreamPayload = resolveUpstreamPayload(d);
		const errorBody = String(d.error_body ?? '').trim();
		if (kind === 'upstream') return upstreamPayload || errorBody;
		if (!errorBody) return upstreamPayload;
		if (upstreamPayload && isGenericGatewayUpstream(errorBody)) return upstreamPayload;
		return errorBody;
	}

	// ── derived display fields ──────────────────────────────────────────────
	const requestIdText = $derived(detail?.request_id || detail?.client_request_id || '');
	const primaryBody = $derived(resolvePrimaryResponseBody(detail, errorType));

	const title = $derived(
		errorId
			? $_('admin.ops.errorDetail.titleWithId', {
					values: { id: String(errorId) },
					default: `Error detail #${String(errorId)}`
				})
			: $_('admin.ops.errorDetail.title', { default: '错误详情' })
	);

	function isUpstreamError(d: OpsErrorDetail | null): boolean {
		if (!d) return false;
		const phase = String(d.phase ?? '').toLowerCase();
		const owner = String(d.error_owner ?? '').toLowerCase();
		return phase === 'upstream' && owner === 'provider';
	}

	function requestTypeLabel(t: number | null | undefined): string {
		switch (t) {
			case 1:
				return $_('admin.ops.errorDetail.requestTypeSync', { default: '同步' });
			case 2:
				return $_('admin.ops.errorDetail.requestTypeStream', { default: '流式' });
			case 3:
				return $_('admin.ops.errorDetail.requestTypeWs', { default: 'WebSocket' });
			default:
				return $_('admin.ops.errorDetail.requestTypeUnknown', { default: '未知' });
		}
	}

	function hasModelMapping(d: OpsErrorDetail | null): boolean {
		if (!d) return false;
		const requested = String(d.requested_model ?? '').trim();
		const upstream = String(d.upstream_model ?? '').trim();
		return !!requested && !!upstream && requested !== upstream;
	}

	function displayModel(d: OpsErrorDetail | null): string {
		if (!d) return '';
		const upstream = String(d.upstream_model ?? '').trim();
		if (upstream) return upstream;
		const requested = String(d.requested_model ?? '').trim();
		if (requested) return requested;
		return String(d.model ?? '').trim();
	}

	function statusBadgeClass(code: number | null | undefined): string {
		const c = code ?? 0;
		if (c >= 500) return 'border border-destructive/40 bg-destructive/10 text-destructive';
		if (c >= 400) return 'border border-amber-500/40 bg-amber-500/10 text-amber-600';
		return 'border border-border bg-muted text-muted-foreground';
	}

	function prettyJSON(raw?: string): string {
		if (!raw) return 'N/A';
		try {
			return JSON.stringify(JSON.parse(raw), null, 2);
		} catch {
			return raw;
		}
	}

	// latency phases — only render ones present
	type Phase = { key: string; label: string; ms: number | null | undefined };
	const latencyPhases = $derived<Phase[]>(
		detail
			? [
					{
						key: 'auth',
						label: $_('admin.ops.errorDetail.latency.auth', { default: '认证' }),
						ms: detail.auth_latency_ms
					},
					{
						key: 'routing',
						label: $_('admin.ops.errorDetail.latency.routing', { default: '路由' }),
						ms: detail.routing_latency_ms
					},
					{
						key: 'ttft',
						label: $_('admin.ops.errorDetail.latency.ttft', { default: '首令牌时间' }),
						ms: detail.time_to_first_token_ms
					},
					{
						key: 'upstream',
						label: $_('admin.ops.errorDetail.latency.upstream', { default: '上游' }),
						ms: detail.upstream_latency_ms
					},
					{
						key: 'response',
						label: $_('admin.ops.errorDetail.latency.response', { default: '响应' }),
						ms: detail.response_latency_ms
					}
				].filter((p) => typeof p.ms === 'number')
			: []
	);

	function upstreamResponsePreview(ev: OpsErrorDetail): string {
		const payload = resolveUpstreamPayload(ev);
		if (payload) return payload;
		return String(ev.error_body ?? '').trim();
	}

	function toggleUpstream(id: number) {
		const next = new Set(expandedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedIds = next;
	}

	// ── fetch ───────────────────────────────────────────────────────────────
	async function loadDetail(id: number) {
		loading = true;
		loadError = null;
		try {
			const kind: ErrorType =
				errorType ?? (detail?.phase === 'upstream' ? 'upstream' : 'request');
			detail =
				kind === 'upstream'
					? await getOpsUpstreamErrorDetail(id)
					: await getOpsRequestErrorDetail(id);
		} catch (err) {
			detail = null;
			loadError =
				err instanceof Error
					? err.message
					: $_('admin.ops.failedToLoadErrorDetail', { default: '加载错误详情失败。' });
		} finally {
			loading = false;
		}
	}

	async function loadCorrelatedUpstream(id: number) {
		correlatedLoading = true;
		try {
			const res = await listOpsRequestErrorUpstreamErrors(
				id,
				{ page: 1, page_size: 100, view: 'all' },
				{ include_detail: true }
			);
			correlatedUpstream = res.items ?? [];
		} catch {
			correlatedUpstream = [];
		} finally {
			correlatedLoading = false;
		}
	}

	$effect(() => {
		if (open && typeof errorId === 'number' && errorId > 0 && errorId !== lastLoadedId) {
			lastLoadedId = errorId;
			expandedIds = new Set();
			void loadDetail(errorId);
			if (errorType === 'request') {
				void loadCorrelatedUpstream(errorId);
			} else {
				correlatedUpstream = [];
			}
		}
		if (!open) {
			lastLoadedId = null;
			detail = null;
			loadError = null;
			correlatedUpstream = [];
		}
	});

	const isResolved = $derived(detail?.resolved === true);

	async function toggleResolve() {
		const id = errorId;
		if (id == null || resolving) return;
		resolving = true;
		try {
			const next = !detail?.resolved;
			const kind: ErrorType = errorType ?? (detail?.phase === 'upstream' ? 'upstream' : 'request');
			if (kind === 'upstream') {
				await resolveOpsUpstreamError(id, next);
			} else {
				await resolveOpsRequestError(id, next);
			}
			showSuccess(
				next
					? $_('admin.ops.errorDetail.resolveSuccess', { default: '错误已标记为已解决。' })
					: $_('admin.ops.errorDetail.unresolveSuccess', { default: '错误已标记为未解决。' })
			);
			await loadDetail(id);
		} catch (err) {
			showError(
				err instanceof Error
					? err.message
					: $_('admin.ops.errorDetail.resolveFailed', { default: '更新解决状态失败。' })
			);
		} finally {
			resolving = false;
		}
	}

	function handleClose() {
		open = false;
		onClose();
	}
</script>

<StandardDialog
	bind:open
	{title}
	width="lg"
	class="max-w-[920px]"
	onOpenChange={(v) => {
		if (!v) handleClose();
	}}
	data-testid="ops-error-detail-modal"
>
	<div class="mt-4 max-h-[72vh] overflow-y-auto pr-1">
		{#if loading && !detail}
			<div
				class="flex flex-col items-center justify-center gap-2.5 py-14"
				role="status"
				data-testid="ops-error-detail-loading"
			>
				<RefreshCw class="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
				<div class="text-[13px] text-muted-foreground">
					{$_('admin.ops.errorDetail.loading', { default: '加载错误详情中…' })}
				</div>
			</div>
		{:else if !detail}
			<div class="py-9 text-center text-[13px] text-muted-foreground" data-testid="ops-error-detail-empty">
				{#if loadError}
					{loadError}
				{:else}
					{$_('admin.ops.errorDetail.noErrorSelected', { default: '未选择错误。' })}
				{/if}
			</div>
		{:else}
			<div class="flex flex-col gap-4">
				{#if loadError}
					<Alert variant="destructive" data-testid="ops-error-detail-error">
						<AlertTriangle class="h-4 w-4" aria-hidden="true" />
						<span>{loadError}</span>
					</Alert>
				{/if}

				<!-- Summary grid -->
				<div class="grid grid-cols-2 gap-2.5 md:grid-cols-4" data-testid="ops-error-detail-summary">
					<div class="rounded-[10px] border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
							{$_('admin.ops.errorDetail.requestId', { default: '请求 ID' })}
						</div>
						<div class="mt-0.5 break-all font-mono text-base font-black tabular-nums">
							{requestIdText || '—'}
						</div>
					</div>
					<div class="rounded-[10px] border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
							{$_('admin.ops.errorDetail.time', { default: '时间' })}
						</div>
						<div class="mt-0.5 text-base font-black">{formatDateTime(detail.created_at)}</div>
					</div>
					<div class="rounded-[10px] border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
							{#if isUpstreamError(detail)}
								{$_('admin.ops.errorDetail.account', { default: '账户' })}
							{:else}
								{$_('admin.ops.errorDetail.user', { default: '用户' })}
							{/if}
						</div>
						<div class="mt-0.5 text-base font-black">
							{#if isUpstreamError(detail)}
								{detail.account_name || (detail.account_id != null ? String(detail.account_id) : '—')}
							{:else}
								{detail.user_email || (detail.user_id != null ? String(detail.user_id) : '—')}
							{/if}
						</div>
					</div>
					<div class="rounded-[10px] border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
							{$_('admin.ops.errorDetail.platform', { default: '平台' })}
						</div>
						<div class="mt-0.5 text-base font-black">{detail.platform || '—'}</div>
					</div>
					<div class="rounded-[10px] border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
							{$_('admin.ops.errorDetail.group', { default: '分组' })}
						</div>
						<div class="mt-0.5 text-base font-black">
							{detail.group_name || (detail.group_id != null ? String(detail.group_id) : '—')}
						</div>
					</div>
					<div class="rounded-[10px] border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
							{$_('admin.ops.errorDetail.model', { default: '模型' })}
						</div>
						<div class="mt-0.5 text-base font-black">
							{#if hasModelMapping(detail)}
								<span class="font-mono tabular-nums">{detail.requested_model}</span>
								<span class="mx-1 text-muted-foreground">→</span>
								<span class="font-mono tabular-nums text-primary">{detail.upstream_model}</span>
							{:else}
								{displayModel(detail) || '—'}
							{/if}
						</div>
					</div>
					<div class="rounded-[10px] border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
							{$_('admin.ops.errorDetail.inboundEndpoint', { default: '入站端点' })}
						</div>
						<div class="mt-0.5 break-all font-mono text-base font-black tabular-nums">
							{detail.inbound_endpoint || '—'}
						</div>
					</div>
					<div class="rounded-[10px] border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
							{$_('admin.ops.errorDetail.upstreamEndpoint', { default: '上游端点' })}
						</div>
						<div class="mt-0.5 break-all font-mono text-base font-black tabular-nums">
							{detail.upstream_endpoint || '—'}
						</div>
					</div>
					<div class="rounded-[10px] border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
							{$_('admin.ops.errorDetail.status', { default: '状态' })}
						</div>
						<div class="mt-1">
							<Badge variant="outline" class={statusBadgeClass(detail.status_code)}>
								{detail.status_code ?? '—'}
							</Badge>
						</div>
					</div>
					<div class="rounded-[10px] border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
							{$_('admin.ops.errorDetail.requestType', { default: '请求类型' })}
						</div>
						<div class="mt-0.5 text-base font-black">{requestTypeLabel(detail.request_type)}</div>
					</div>
					<div class="rounded-[10px] border border-border bg-card p-3 md:col-span-2">
						<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
							{$_('admin.ops.errorDetail.message', { default: '消息' })}
						</div>
						<div
							class="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-base font-black"
							title={detail.message}
						>
							{detail.message || '—'}
						</div>
					</div>
					{#if detail.api_key_prefix}
						<div class="rounded-[10px] border border-border bg-card p-3">
							<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
								{$_('admin.ops.errorDetail.apiKeyPrefix', { default: 'API 密钥前缀' })}
							</div>
							<div class="mt-0.5 font-mono text-base font-black tabular-nums">
								{detail.api_key_prefix}
							</div>
						</div>
					{/if}
					{#if detail.attempted_key_prefix}
						<div class="rounded-[10px] border border-border bg-card p-3">
							<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
								{$_('admin.ops.errorDetail.attemptedKeyPrefix', { default: '尝试的密钥前缀' })}
							</div>
							<div class="mt-0.5 font-mono text-base font-black tabular-nums">
								{detail.attempted_key_prefix}
							</div>
						</div>
					{/if}
					{#if detail.deleted_key_owner_email}
						<div class="rounded-[10px] border border-border bg-card p-3 md:col-span-2">
							<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
								{$_('admin.ops.errorDetail.deletedKeyOwner', { default: '已删除的密钥所有者' })}
							</div>
							<div class="mt-0.5 text-base font-black">
								{detail.deleted_key_owner_email}
								{#if detail.deleted_key_name}
									<span class="ml-1 text-[11px] text-muted-foreground"
										>({detail.deleted_key_name})</span
									>
								{/if}
								<Badge variant="destructive" class="ml-1.5 text-[10px]">
									{$_('admin.ops.errorDetail.keyDeletedBadge', { default: '密钥已删除' })}
								</Badge>
							</div>
						</div>
					{/if}
				</div>

				<!-- Classification + context -->
				<div class="grid grid-cols-2 gap-2.5 md:grid-cols-4" data-testid="ops-error-detail-classification">
					{#if detail.phase}
						<div class="rounded-[10px] border border-border bg-card p-3">
							<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
								{$_('admin.ops.errorDetail.phase', { default: '阶段' })}
							</div>
							<div class="mt-0.5 text-base font-black">{detail.phase}</div>
						</div>
					{/if}
					{#if detail.severity}
						<div class="rounded-[10px] border border-border bg-card p-3">
							<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
								{$_('admin.ops.errorDetail.severity', { default: '严重度' })}
							</div>
							<div class="mt-0.5 text-base font-black">{detail.severity}</div>
						</div>
					{/if}
					{#if detail.error_owner}
						<div class="rounded-[10px] border border-border bg-card p-3">
							<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
								{$_('admin.ops.errorDetail.errorOwner', { default: '错误归属' })}
							</div>
							<div class="mt-0.5 text-base font-black">{detail.error_owner}</div>
						</div>
					{/if}
					{#if detail.error_source}
						<div class="rounded-[10px] border border-border bg-card p-3">
							<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
								{$_('admin.ops.errorDetail.errorSource', { default: '错误来源' })}
							</div>
							<div class="mt-0.5 text-base font-black">{detail.error_source}</div>
						</div>
					{/if}
					{#if detail.upstream_status_code != null}
						<div class="rounded-[10px] border border-border bg-card p-3">
							<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
								{$_('admin.ops.errorDetail.upstreamStatusCode', { default: '上游状态' })}
							</div>
							<div class="mt-1">
								<Badge variant="outline" class={statusBadgeClass(detail.upstream_status_code)}>
									{detail.upstream_status_code}
								</Badge>
							</div>
						</div>
					{/if}
					{#if detail.client_ip}
						<div class="rounded-[10px] border border-border bg-card p-3">
							<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
								{$_('admin.ops.errorDetail.clientIp', { default: '客户端 IP' })}
							</div>
							<div class="mt-0.5 font-mono text-base font-black tabular-nums">
								{detail.client_ip}
							</div>
						</div>
					{/if}
					{#if detail.user_agent}
						<div class="rounded-[10px] border border-border bg-card p-3 md:col-span-2">
							<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
								{$_('admin.ops.errorDetail.userAgent', { default: '用户代理' })}
							</div>
							<div class="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-foreground" title={detail.user_agent}>
								{detail.user_agent}
							</div>
						</div>
					{/if}
					<div class="rounded-[10px] border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
							{$_('admin.ops.errorDetail.resolved', { default: '已解决' })}
						</div>
						<div class="mt-1 flex items-center gap-2">
							{#if isResolved}
								<Badge variant="outline" class="border-emerald-500/40 bg-emerald-500/10 text-emerald-600">
									{$_('admin.ops.errorDetail.resolvedYes', { default: '已解决' })}
								</Badge>
								{#if detail.resolved_by_user_name}
									<span class="text-xs text-muted-foreground">
										{$_('admin.ops.errorDetail.resolvedBy', { default: 'by' })} {detail.resolved_by_user_name}
									</span>
								{/if}
							{:else}
								<Badge variant="outline" class="border-border bg-muted text-muted-foreground">
									{$_('admin.ops.errorDetail.resolvedNo', { default: '未解决' })}
								</Badge>
							{/if}
						</div>
					</div>
					{#if detail.is_business_limited}
						<div class="rounded-[10px] border border-border bg-card p-3">
							<div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
								{$_('admin.ops.errorDetail.businessLimited', { default: '业务受限' })}
							</div>
							<div class="mt-1">
								<Badge variant="destructive" class="text-[10px]">
									{$_('common.yes', { default: '是' })}
								</Badge>
							</div>
						</div>
					{/if}
				</div>

				<!-- Latency phases breakdown -->
				{#if latencyPhases.length}
					<div
						class="rounded-xl border border-border bg-card p-4"
						data-testid="ops-error-detail-latency"
					>
						<h3 class="text-[11.5px] font-bold uppercase tracking-[.05em] text-foreground">
							{$_('admin.ops.errorDetail.latency.title', { default: '延迟分布' })}
						</h3>
						<div class="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-3">
							{#each latencyPhases as phase (phase.key)}
								<div class="rounded-lg border border-border bg-muted/40 p-2.5">
									<div class="text-[10px] font-bold uppercase tracking-[.05em] text-muted-foreground">
										{phase.label}
									</div>
									<div class="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">
										{formatDuration(phase.ms)}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Response body -->
				<div class="rounded-xl border border-border bg-card p-4" data-testid="ops-error-detail-body">
					<h3 class="text-[11.5px] font-bold uppercase tracking-[.05em] text-foreground">
						{$_('admin.ops.errorDetail.responseBody', { default: '响应体' })}
					</h3>
					<pre
						class="mt-3 max-h-[480px] overflow-auto rounded-md border border-border bg-muted p-3.5 text-[11.5px] text-muted-foreground"><code
							>{prettyJSON(primaryBody)}</code
						></pre>
				</div>

				<!-- Correlated upstream errors（request 错误专属）-->
				{#if showUpstreamList}
					<div
						class="rounded-xl border border-border bg-card p-4"
						data-testid="ops-error-detail-upstream-list"
					>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="text-[11.5px] font-bold uppercase tracking-[.05em] text-foreground">
								{$_('admin.ops.errorDetails.upstreamErrors', { default: '上游错误' })}
							</h3>
							{#if correlatedLoading}
								<div class="text-[11px] text-muted-foreground">
									{$_('common.loading', { default: '加载中…' })}
								</div>
							{/if}
						</div>

						{#if !correlatedLoading && !correlatedUpstream.length}
							<div class="mt-2.5 text-[13px] text-muted-foreground">
								{$_('common.noData', { default: '暂无数据' })}
							</div>
						{:else}
							<div class="mt-3 flex flex-col gap-2.5">
								{#each correlatedUpstream as ev, idx (ev.id)}
									{@const preview = upstreamResponsePreview(ev)}
									<div class="rounded-xl border border-border bg-card p-3.5">
										<div class="flex flex-wrap items-center justify-between gap-2">
											<div class="text-[12px] font-bold text-foreground">
												#{idx + 1}
												{#if ev.type}
													<Badge variant="outline" class="ml-1.5 font-mono text-[10px] tabular-nums">
														{ev.type}
													</Badge>
												{/if}
											</div>
											<div class="flex items-center gap-2">
												<div class="font-mono text-[11.5px] tabular-nums text-muted-foreground">
													{ev.status_code ?? '—'}
												</div>
												<Button
													variant="outline"
													size="sm"
													class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px]"
													disabled={!preview}
													title={preview ? '' : $_('common.noData', { default: '暂无数据' })}
													onclick={() => toggleUpstream(ev.id)}
												>
													{#if expandedIds.has(ev.id)}
														<ChevronDown class="h-3 w-3" aria-hidden="true" />
														{$_('admin.ops.errorDetail.responsePreview.collapse', {
															default: '折叠'
														})}
													{:else}
														<ChevronRight class="h-3 w-3" aria-hidden="true" />
														{$_('admin.ops.errorDetail.responsePreview.expand', {
															default: '展开'
														})}
													{/if}
												</Button>
											</div>
										</div>
										<div class="mt-2.5 grid grid-cols-2 gap-1.5 text-[11.5px] text-muted-foreground">
											<div>
												<span class="text-muted-foreground"
													>{$_('admin.ops.errorDetail.upstreamEvent.status', {
														default: '状态'
													})}:</span
												>
												<span class="ml-1 font-mono tabular-nums">{ev.status_code ?? '—'}</span>
											</div>
											<div>
												<span class="text-muted-foreground"
													>{$_('admin.ops.errorDetail.upstreamEvent.requestId', {
														default: '请求 ID'
													})}:</span
												>
												<span class="ml-1 font-mono tabular-nums"
													>{ev.request_id || ev.client_request_id || '—'}</span
												>
											</div>
										</div>
										{#if ev.message}
											<div class="mt-2 break-words text-[13px] font-medium text-foreground">
												{ev.message}
											</div>
										{/if}
										{#if expandedIds.has(ev.id)}
											<pre
												class="mt-2.5 max-h-[200px] overflow-auto rounded-md border border-border bg-muted p-2.5 text-[11px] text-muted-foreground"><code
													>{prettyJSON(preview)}</code
												></pre>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="mt-4 flex items-center justify-between border-t border-border pt-4">
		<Button variant="ghost" size="sm" onclick={handleClose} data-testid="ops-error-detail-close">
			<X class="h-4 w-4" aria-hidden="true" />
			{$_('common.close', { default: '关闭' })}
		</Button>
		{#if detail}
			<Button
				variant={isResolved ? 'outline' : 'default'}
				size="sm"
				disabled={resolving}
				onclick={toggleResolve}
				data-testid="ops-error-detail-resolve"
			>
				<CheckCircle2 class="h-4 w-4" aria-hidden="true" />
				{#if resolving}
					{$_('common.saving', { default: '保存中...' })}
				{:else if isResolved}
					{$_('admin.ops.errorDetail.unresolve', { default: '标记为未解决' })}
				{:else}
					{$_('admin.ops.errorDetail.resolve', { default: '标记为已解决' })}
				{/if}
			</Button>
		{/if}
	</div>
</StandardDialog>
