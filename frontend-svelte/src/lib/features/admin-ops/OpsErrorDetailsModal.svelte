<script lang="ts" module>
	/**
	 * OpsErrorDetailsModal · admin Ops 错误明细弹窗（Phase C M13）
	 *
	 * Vue 参照：frontend/src/views/admin/ops/components/OpsErrorDetailsModal.vue
	 *   — 该弹窗在 Vue 侧承担「过滤器 + fetch 参数装配 + 表格」三件事；Svelte 重写里
	 *     过滤器/装配/拉取/分页/行内 resolve 已全部内化进 OpsErrorLogTable（其 module
	 *     块导出 buildErrorQueryParams 等纯函数并自带 co-located 测试），所以本弹窗回归
	 *     其本职：一个宽 StandardDialog 外壳，宿主 OpsErrorLogTable，并把行点击产生的
	 *     openErrorDetail 事件向上冒泡给路由（one-modal-at-a-time：路由收到后再开单错弹窗）。
	 *
	 * 红线遵循：
	 *   - 仅复用 lib/ui/StandardDialog + OpsErrorLogTable，不手搓 dialog/表格。
	 *   - 调色板只用 Zinc / 语义 token，无裸 hex。
	 *   - 无 NativeSelect 直接用（过滤器在 OpsErrorLogTable 内，已用哨兵），本壳无空 value 风险。
	 *   - i18n 走 $_('admin.ops.<key>', { default }) ，default 兜底防硬编码英文 finding。
	 *   - 无 chart.js（纯弹窗外壳，不引图表，规避 TDZ vendor-chunk 陷阱）。
	 *   - 不引 ops API（数据全在 OpsErrorLogTable 内），usesEndpoints: []。
	 *
	 * module 块导出标题解析纯函数，供 co-located 测试无需挂载即可验证 errorType→标题语义。
	 */

	export type OpsErrorType = 'request' | 'upstream';

	/** errorType → 标题 i18n key + 英文兜底（与 Vue 弹窗标题语义一致）。 */
	export function titleFor(errorType: OpsErrorType): { key: string; fallback: string } {
		return errorType === 'upstream'
			? { key: 'admin.ops.errorDetails.upstreamTitle', fallback: 'Upstream error details' }
			: { key: 'admin.ops.errorDetails.requestTitle', fallback: 'Request error details' };
	}

	/** errorType → 描述 i18n key + 英文兜底。 */
	export function descriptionFor(errorType: OpsErrorType): { key: string; fallback: string } {
		return errorType === 'upstream'
			? {
					key: 'admin.ops.errorDetails.upstreamDescription',
					fallback: 'Errors returned by upstream providers within the selected window.'
				}
			: {
					key: 'admin.ops.errorDetails.requestDescription',
					fallback: 'Request-level errors observed within the selected window.'
				};
	}
</script>

<script lang="ts">
	import { _ } from 'svelte-i18n';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import OpsErrorLogTable from './OpsErrorLogTable.svelte';

	type Props = {
		open: boolean;
		errorType: OpsErrorType;
		timeRange: string;
		platform?: string;
		groupId?: number | null;
		onClose: () => void;
		onOpenErrorDetail: (id: number, errorType: OpsErrorType) => void;
	};

	let {
		open = $bindable(false),
		errorType,
		timeRange,
		platform,
		groupId = null,
		onClose,
		onOpenErrorDetail
	}: Props = $props();

	const tr = (k: string, fallback: string) => $_(k, { default: fallback });

	const title = $derived(titleFor(errorType));
	const description = $derived(descriptionFor(errorType));

	function handleOpenChange(next: boolean) {
		if (next) {
			open = true;
			return;
		}
		open = false;
		onClose();
	}
</script>

<StandardDialog
	bind:open
	onOpenChange={handleOpenChange}
	width="lg"
	title={tr(title.key, title.fallback)}
	description={tr(description.key, description.fallback)}
	class="flex h-[80vh] max-w-5xl flex-col"
	data-testid="ops-error-details-modal"
>
	<div class="mt-3 min-h-0 flex-1 overflow-hidden">
		<OpsErrorLogTable {errorType} {timeRange} {platform} {groupId} {onOpenErrorDetail} />
	</div>
</StandardDialog>
