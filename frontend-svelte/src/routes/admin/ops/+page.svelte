<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import Alert from '$lib/ui/Alert.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import OpsFilterBar from '$lib/features/admin-ops/OpsFilterBar.svelte';
	import OpsHealthCard from '$lib/features/admin-ops/OpsHealthCard.svelte';
	import OpsConcurrencyCard from '$lib/features/admin-ops/OpsConcurrencyCard.svelte';
	import OpsThroughputTrendChart from '$lib/features/admin-ops/OpsThroughputTrendChart.svelte';
	import OpsSwitchRateTrendChart from '$lib/features/admin-ops/OpsSwitchRateTrendChart.svelte';
	import OpsLatencyChart from '$lib/features/admin-ops/OpsLatencyChart.svelte';
	import OpsErrorDistributionChart from '$lib/features/admin-ops/OpsErrorDistributionChart.svelte';
	import OpsErrorTrendChart from '$lib/features/admin-ops/OpsErrorTrendChart.svelte';
	import OpsOpenAITokenStatsCard from '$lib/features/admin-ops/OpsOpenAITokenStatsCard.svelte';
	import OpsAlertEventsCard from '$lib/features/admin-ops/OpsAlertEventsCard.svelte';
	import OpsAlertRulesCard from '$lib/features/admin-ops/OpsAlertRulesCard.svelte';
	import OpsErrorLogTable from '$lib/features/admin-ops/OpsErrorLogTable.svelte';
	import OpsSystemLogTable from '$lib/features/admin-ops/OpsSystemLogTable.svelte';
	import OpsSettingsDialog from '$lib/features/admin-ops/OpsSettingsDialog.svelte';
	import OpsErrorDetailModal from '$lib/features/admin-ops/OpsErrorDetailModal.svelte';
	import OpsErrorDetailsModal from '$lib/features/admin-ops/OpsErrorDetailsModal.svelte';
	import OpsRequestDetailsModal from '$lib/features/admin-ops/OpsRequestDetailsModal.svelte';
	import type { OpsRequestDetailsPreset } from '$lib/features/admin-ops/OpsRequestDetailsModal.svelte';
	import { settingsApi } from '$lib/api/admin/settingsRegistry';
	import {
		getOpsDashboardOverview,
		getOpsThroughputTrend,
		getOpsLatencyHistogram,
		getOpsErrorTrend,
		getOpsErrorDistribution,
		getOpsMetricThresholds,
		type OpsDashboardOverview,
		type OpsDashboardParams,
		type OpsQueryMode,
		type OpsThroughputTrendResponse,
		type OpsLatencyHistogramResponse,
		type OpsErrorTrendResponse,
		type OpsErrorDistributionResponse,
		type OpsMetricThresholds
	} from '$lib/api/admin/ops';

	type TimeRange = '5m' | '30m' | '1h' | '6h' | '24h' | 'custom';

	let opsEnabled = $state(false);
	let gateLoading = $state(true);

	// ── Filters ──────────────────────────────────────────────────────────────
	let platform = $state('');
	let groupId = $state<number | null>(null);
	let queryMode = $state<OpsQueryMode>('auto');
	let timeRange = $state<TimeRange>('1h');
	let customStart = $state<string | null>(null);
	let customEnd = $state<string | null>(null);
	let refreshToken = $state(0);

	// ── Dashboard data (route-fetched, passed to data-receiving components) ──
	let overview = $state<OpsDashboardOverview | null>(null);
	let thresholds = $state<OpsMetricThresholds | null>(null);
	let throughput = $state<OpsThroughputTrendResponse | null>(null);
	let switchTrend = $state<OpsThroughputTrendResponse | null>(null);
	let latency = $state<OpsLatencyHistogramResponse | null>(null);
	let errorTrend = $state<OpsErrorTrendResponse | null>(null);
	let errorDist = $state<OpsErrorDistributionResponse | null>(null);
	let dashLoading = $state(false);
	let lastUpdated = $state<Date | null>(null);

	// ── Dialogs / modals ─────────────────────────────────────────────────────
	let showSettings = $state(false);
	let showAlertRules = $state(false);
	let showErrorDetail = $state(false);
	let errorDetailId = $state<number | null>(null);
	let errorDetailType = $state<'request' | 'upstream'>('request');
	let showErrorDetails = $state(false);
	let errorDetailsType = $state<'request' | 'upstream'>('request');
	let showRequestDetails = $state(false);
	let requestPreset = $state<OpsRequestDetailsPreset>({ title: 'Request Details' });

	// ── Auto-refresh ─────────────────────────────────────────────────────────
	let autoRefreshEnabled = $state(true);
	let autoRefreshInterval = 30;
	let autoRefreshCountdown = $state(autoRefreshInterval);
	let refreshTimer: ReturnType<typeof setInterval> | undefined;

	function startAutoRefresh() {
		stopAutoRefresh();
		if (!autoRefreshEnabled) return;
		autoRefreshCountdown = autoRefreshInterval;
		refreshTimer = setInterval(() => {
			autoRefreshCountdown--;
			if (autoRefreshCountdown <= 0) {
				refreshToken++;
				autoRefreshCountdown = autoRefreshInterval;
			}
		}, 1000);
	}
	function stopAutoRefresh() {
		if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = undefined; }
	}

	// ── Data fetching ────────────────────────────────────────────────────────
	function buildParams(): OpsDashboardParams {
		const p: OpsDashboardParams = {};
		if (platform) p.platform = platform;
		if (groupId != null) p.group_id = groupId;
		if (queryMode !== 'auto') p.mode = queryMode;
		if (timeRange !== 'custom') p.time_range = timeRange;
		else { p.start_time = customStart ?? undefined; p.end_time = customEnd ?? undefined; }
		return p;
	}

	async function fetchDashboard() {
		dashLoading = true;
		const params = buildParams();
		try {
			const [ov, th, tp, sw, lat, et, ed] = await Promise.all([
				getOpsDashboardOverview(params),
				getOpsMetricThresholds(),
				getOpsThroughputTrend(params),
				getOpsThroughputTrend({ ...params, platform: '__switch__' }).catch(() => null),
				getOpsLatencyHistogram(params),
				getOpsErrorTrend(params),
				getOpsErrorDistribution(params)
			]);
			overview = ov; thresholds = th; throughput = tp;
			switchTrend = sw; latency = lat; errorTrend = et; errorDist = ed;
			lastUpdated = new Date();
		} catch { /* individual components show error states */ }
		dashLoading = false;
	}

	$effect(() => { void refreshToken; if (opsEnabled) fetchDashboard(); });

	onMount(async () => {
		try {
			const s = await settingsApi.getSettings();
			opsEnabled = s?.ops_monitoring_enabled === true;
		} catch { opsEnabled = false; }
		gateLoading = false;
		if (opsEnabled) startAutoRefresh();
	});
	onDestroy(stopAutoRefresh);

	function handleRefresh() { refreshToken++; autoRefreshCountdown = autoRefreshInterval; }
	function openErrorDetail(id: number, type: 'request' | 'upstream') {
		errorDetailId = id; errorDetailType = type; showErrorDetail = true;
	}
	function openErrorsPanel(type: 'request' | 'upstream') {
		errorDetailsType = type; showErrorDetails = true;
	}
</script>

<svelte:head>
	<title>{$_('admin.ops.title', { default: 'Operations Dashboard' })}</title>
</svelte:head>

<div class="mx-auto max-w-screen-2xl space-y-6 p-4 lg:p-6">
	{#if gateLoading}
		<div class="flex items-center justify-center py-20">
			<div class="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground"></div>
		</div>
	{:else if !opsEnabled}
		<Alert>{$_('admin.ops.disabled', { default: 'Operations monitoring is disabled. Enable it in Settings → Features.' })}</Alert>
	{:else}
		<OpsFilterBar {overview} {platform} {groupId} {timeRange} {queryMode}
			loading={dashLoading} {lastUpdated} {autoRefreshEnabled} {autoRefreshCountdown}
			customStartTime={customStart} customEndTime={customEnd}
			onPlatformChange={(v) => { platform = v; refreshToken++; }}
			onGroupChange={(v) => { groupId = v; refreshToken++; }}
			onTimeRangeChange={(v) => { timeRange = v as TimeRange; refreshToken++; }}
			onQueryModeChange={(v) => { queryMode = v; refreshToken++; }}
			onCustomTimeRange={(s, e) => { customStart = s; customEnd = e; refreshToken++; }}
			onRefresh={handleRefresh}
			onOpenSettings={() => (showSettings = true)}
			onOpenAlertRules={() => (showAlertRules = true)}
			onOpenRequestDetails={() => { requestPreset = { title: 'All Requests' }; showRequestDetails = true; }} />

		<OpsHealthCard {overview} {thresholds} loading={dashLoading} />

		<div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
			<div class="lg:col-span-2">
				<OpsConcurrencyCard platformFilter={platform} groupIdFilter={groupId} {refreshToken} />
			</div>
			<OpsSwitchRateTrendChart points={switchTrend?.points ?? []} loading={dashLoading} {timeRange} />
			<OpsThroughputTrendChart points={throughput?.points ?? []}
				byPlatform={throughput?.by_platform} topGroups={throughput?.top_groups}
				loading={dashLoading} {timeRange}
				onSelectPlatform={(p) => { platform = p; refreshToken++; }}
				onSelectGroup={(g) => { groupId = g; refreshToken++; }}
				onOpenDetails={(preset) => { requestPreset = { title: 'Request Details', ...preset }; showRequestDetails = true; }} />
		</div>

		<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
			<OpsLatencyChart latencyData={latency} loading={dashLoading} />
			<OpsErrorDistributionChart data={errorDist} loading={dashLoading}
				onOpenDetails={() => openErrorsPanel('request')} />
			<OpsErrorTrendChart points={errorTrend?.points ?? []} loading={dashLoading} {timeRange}
				onOpenRequestErrors={() => openErrorsPanel('request')}
				onOpenUpstreamErrors={() => openErrorsPanel('upstream')} />
		</div>

		<OpsOpenAITokenStatsCard platformFilter={platform} groupIdFilter={groupId} {refreshToken} />
		<OpsAlertEventsCard {refreshToken} platformFilter={platform} groupIdFilter={groupId} />

		<OpsErrorLogTable errorType="request" {timeRange} platform={platform || undefined}
			groupId={groupId} onOpenErrorDetail={openErrorDetail} />
		<OpsErrorLogTable errorType="upstream" {timeRange} platform={platform || undefined}
			groupId={groupId} onOpenErrorDetail={openErrorDetail} />

		<OpsSystemLogTable platformFilter={platform} {refreshToken} />

		<!-- Alert rules: always rendered inline at the bottom of the dashboard -->
		<OpsAlertRulesCard />

		<!-- Alert rules management dialog (opened from filter bar button) -->
		<StandardDialog
			bind:open={showAlertRules}
			width="lg"
			title={$_('admin.ops.alertRules.title', { default: 'Alert rules' })}
			description={$_('admin.ops.alertRules.description', { default: 'Define metric thresholds that trigger ops alerts.' })}
			class="!max-w-5xl"
			data-testid="ops-alert-rules-dialog"
		>
			<div class="mt-3 min-h-0 max-h-[75vh] overflow-y-auto">
				<OpsAlertRulesCard />
			</div>
		</StandardDialog>

		<OpsSettingsDialog open={showSettings}
			onClose={() => (showSettings = false)}
			onSaved={() => { showSettings = false; refreshToken++; }} />
		<OpsErrorDetailModal open={showErrorDetail} errorId={errorDetailId}
			errorType={errorDetailType} onClose={() => (showErrorDetail = false)} />
		<OpsErrorDetailsModal open={showErrorDetails} errorType={errorDetailsType}
			{timeRange} platform={platform || undefined} groupId={groupId}
			onClose={() => (showErrorDetails = false)}
			onOpenErrorDetail={openErrorDetail} />
		<OpsRequestDetailsModal open={showRequestDetails} {timeRange}
			preset={requestPreset} platform={platform || undefined} groupId={groupId}
			onClose={() => (showRequestDetails = false)}
			onOpenErrorDetail={(id) => openErrorDetail(id, 'request')} />
	{/if}
</div>
