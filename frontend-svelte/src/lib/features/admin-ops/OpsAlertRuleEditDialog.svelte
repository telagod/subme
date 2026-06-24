<script lang="ts" module>
	/**
	 * Metric type catalog — mirrors the Vue source
	 * (frontend/src/views/admin/ops/components/OpsAlertRulesCard.vue @05c44218).
	 * Each entry drives the metric_type <NativeSelect>, the grouped optgroups,
	 * and the recommended operator/threshold hint shown under the picker.
	 */
	export type MetricGroup = 'system' | 'group' | 'account';

	export type MetricType =
		| 'success_rate'
		| 'error_rate'
		| 'upstream_error_rate'
		| 'cpu_usage_percent'
		| 'memory_usage_percent'
		| 'concurrency_queue_depth'
		| 'group_available_accounts'
		| 'group_available_ratio'
		| 'group_rate_limit_ratio'
		| 'account_rate_limited_count'
		| 'account_error_count'
		| 'account_error_ratio'
		| 'account_temp_unscheduled_count'
		| 'overload_account_count';

	export type RuleOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

	export interface MetricDefinition {
		type: MetricType;
		group: MetricGroup;
		/** i18n key suffix under admin.ops.alertRules.metrics.* */
		labelKey: string;
		labelDefault: string;
		descDefault: string;
		recommendedOperator: RuleOperator;
		recommendedThreshold: number;
		unit?: string;
	}

	export const METRIC_DEFINITIONS: MetricDefinition[] = [
		// ── system ──────────────────────────────────────────────────────────
		{ type: 'success_rate', group: 'system', labelKey: 'successRate', labelDefault: 'Success rate', descDefault: 'Percentage of successful requests.', recommendedOperator: 'lt', recommendedThreshold: 99, unit: '%' },
		{ type: 'error_rate', group: 'system', labelKey: 'errorRate', labelDefault: 'Error rate', descDefault: 'Percentage of failed requests.', recommendedOperator: 'gt', recommendedThreshold: 1, unit: '%' },
		{ type: 'upstream_error_rate', group: 'system', labelKey: 'upstreamErrorRate', labelDefault: 'Upstream error rate', descDefault: 'Percentage of upstream provider errors.', recommendedOperator: 'gt', recommendedThreshold: 1, unit: '%' },
		{ type: 'cpu_usage_percent', group: 'system', labelKey: 'cpu', labelDefault: 'CPU usage', descDefault: 'Process CPU utilisation.', recommendedOperator: 'gt', recommendedThreshold: 80, unit: '%' },
		{ type: 'memory_usage_percent', group: 'system', labelKey: 'memory', labelDefault: 'Memory usage', descDefault: 'Process memory utilisation.', recommendedOperator: 'gt', recommendedThreshold: 80, unit: '%' },
		{ type: 'concurrency_queue_depth', group: 'system', labelKey: 'queueDepth', labelDefault: 'Queue depth', descDefault: 'Pending requests waiting in the concurrency queue.', recommendedOperator: 'gt', recommendedThreshold: 10 },
		// ── group (requires group_id filter) ────────────────────────────────
		{ type: 'group_available_accounts', group: 'group', labelKey: 'groupAvailableAccounts', labelDefault: 'Group available accounts', descDefault: 'Number of available accounts in the group.', recommendedOperator: 'lt', recommendedThreshold: 1 },
		{ type: 'group_available_ratio', group: 'group', labelKey: 'groupAvailableRatio', labelDefault: 'Group available ratio', descDefault: 'Ratio of available accounts in the group.', recommendedOperator: 'lt', recommendedThreshold: 50, unit: '%' },
		{ type: 'group_rate_limit_ratio', group: 'group', labelKey: 'groupRateLimitRatio', labelDefault: 'Group rate-limit ratio', descDefault: 'Ratio of rate-limited accounts in the group.', recommendedOperator: 'gt', recommendedThreshold: 10, unit: '%' },
		// ── account ─────────────────────────────────────────────────────────
		{ type: 'account_rate_limited_count', group: 'account', labelKey: 'accountRateLimitedCount', labelDefault: 'Rate-limited accounts', descDefault: 'Number of rate-limited accounts.', recommendedOperator: 'gt', recommendedThreshold: 0 },
		{ type: 'account_error_count', group: 'account', labelKey: 'accountErrorCount', labelDefault: 'Account error count', descDefault: 'Number of account errors.', recommendedOperator: 'gt', recommendedThreshold: 0 },
		{ type: 'account_error_ratio', group: 'account', labelKey: 'accountErrorRatio', labelDefault: 'Account error ratio', descDefault: 'Ratio of account errors.', recommendedOperator: 'gt', recommendedThreshold: 5, unit: '%' },
		{ type: 'account_temp_unscheduled_count', group: 'account', labelKey: 'accountTempUnscheduledCount', labelDefault: 'Temp-unscheduled accounts', descDefault: 'Accounts temporarily removed from scheduling.', recommendedOperator: 'gt', recommendedThreshold: 0 },
		{ type: 'overload_account_count', group: 'account', labelKey: 'overloadAccountCount', labelDefault: 'Overloaded accounts', descDefault: 'Accounts reporting overload.', recommendedOperator: 'gt', recommendedThreshold: 0 }
	];

	export const GROUP_METRIC_TYPES = new Set<MetricType>([
		'group_available_accounts',
		'group_available_ratio',
		'group_rate_limit_ratio'
	]);

	export const OPERATORS: { value: RuleOperator; symbol: string }[] = [
		{ value: 'gt', symbol: '>' },
		{ value: 'gte', symbol: '>=' },
		{ value: 'lt', symbol: '<' },
		{ value: 'lte', symbol: '<=' },
		{ value: 'eq', symbol: '==' },
		{ value: 'neq', symbol: '!=' }
	];

	export const SEVERITIES = ['P0', 'P1', 'P2', 'P3'] as const;
	export const WINDOW_OPTIONS = [1, 5, 60] as const;
</script>

<script lang="ts">
	/**
	 * OpsAlertRuleEditDialog · create/edit a single ops alert rule.
	 *
	 * Vue parity: the editor that lived inline in
	 *   frontend/src/views/admin/ops/components/OpsAlertRulesCard.vue (@05c44218).
	 * Here it is extracted into a standalone StandardDialog so the route can wire
	 * it with explicit props.
	 *
	 * Endpoints (from $lib/api/admin/ops):
	 *   - rule.id == null  → createOpsAlertRule(body)
	 *   - rule.id != null  → updateOpsAlertRule(id, body)
	 *
	 * Hard rules honoured:
	 *   - Zinc-only palette; no raw hex — all colours via design tokens.
	 *   - <NativeSelect> values are always non-empty (metric_type / operator /
	 *     severity / window are real enum strings) → no empty-string sentinel
	 *     violation; the group filter falls back to the explicit '__null__'
	 *     sentinel rather than an empty value.
	 *   - i18n via $_(key, { default }) — no locale file edits.
	 *   - No top-level chart.js import (no chart in this dialog anyway).
	 */
	import { _ } from 'svelte-i18n';
	import {
		createOpsAlertRule,
		updateOpsAlertRule,
		type AlertRule
	} from '$lib/api/admin/ops';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';

	type Props = {
		open: boolean;
		rule: AlertRule | null;
		onClose: () => void;
		onSaved: () => void;
	};

	let { open = $bindable(false), rule, onClose, onSaved }: Props = $props();

	const NULL_GROUP = '__null__';

	// ── editable draft (decoupled from the parent's rule prop) ───────────────
	let name = $state('');
	let description = $state('');
	let enabled = $state(true);
	let metricType = $state<MetricType>('error_rate');
	let operator = $state<RuleOperator>('gt');
	let threshold = $state<number>(1);
	let windowMinutes = $state<number>(1);
	let sustainedMinutes = $state<number>(2);
	let severity = $state<string>('P1');
	let cooldownMinutes = $state<number>(10);
	let notifyEmail = $state(true);
	let filtersText = $state('');
	let groupSel = $state<string>(NULL_GROUP); // group_id sentinel-backed select-as-text

	let saving = $state(false);
	let formError = $state('');
	// Snapshot of the last rule identity we hydrated from, so re-opening with a
	// different rule re-seeds the form without clobbering live edits.
	let hydratedKey = $state<string>('');

	const editingId = $derived(rule?.id ?? null);
	const isEditing = $derived(editingId != null);

	function defaultsFromMetric(t: MetricType) {
		const def = METRIC_DEFINITIONS.find((m) => m.type === t);
		return def
			? { operator: def.recommendedOperator, threshold: def.recommendedThreshold }
			: { operator: 'gt' as RuleOperator, threshold: 1 };
	}

	function hydrate(r: AlertRule | null) {
		if (r) {
			name = r.name ?? '';
			description = r.description ?? '';
			enabled = r.enabled ?? true;
			metricType = (r.metric_type as MetricType) ?? 'error_rate';
			operator = (r.operator as RuleOperator) ?? 'gt';
			threshold = typeof r.threshold === 'number' ? r.threshold : 1;
			windowMinutes = typeof r.window_minutes === 'number' ? r.window_minutes : 1;
			sustainedMinutes = typeof r.sustained_minutes === 'number' ? r.sustained_minutes : 2;
			severity = r.severity ?? 'P1';
			cooldownMinutes = typeof r.cooldown_minutes === 'number' ? r.cooldown_minutes : 10;
			notifyEmail = r.notify_email ?? true;
			const gid = parsePositiveInt(r.filters?.group_id);
			groupSel = gid == null ? NULL_GROUP : String(gid);
			// filters minus group_id (group_id has its own field).
			const rest = stripGroupId(r.filters);
			filtersText = rest ? JSON.stringify(rest, null, 2) : '';
		} else {
			name = '';
			description = '';
			enabled = true;
			metricType = 'error_rate';
			operator = 'gt';
			threshold = 1;
			windowMinutes = 1;
			sustainedMinutes = 2;
			severity = 'P1';
			cooldownMinutes = 10;
			notifyEmail = true;
			groupSel = NULL_GROUP;
			filtersText = '';
		}
		formError = '';
	}

	// Re-seed whenever the dialog opens or the target rule identity changes.
	$effect(() => {
		const key = open ? `${rule?.id ?? 'new'}:${open}` : '';
		if (open && key !== hydratedKey) {
			hydrate(rule);
			hydratedKey = key;
		}
		if (!open) hydratedKey = '';
	});

	function parsePositiveInt(value: unknown): number | null {
		if (value == null || typeof value === 'boolean') return null;
		const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
		return Number.isFinite(n) && n > 0 ? n : null;
	}

	function stripGroupId(
		filters: Record<string, unknown> | null | undefined
	): Record<string, unknown> | null {
		if (!filters) return null;
		const { group_id: _gid, ...rest } = filters;
		return Object.keys(rest).length > 0 ? rest : null;
	}

	const selectedDef = $derived(METRIC_DEFINITIONS.find((m) => m.type === metricType) ?? null);
	const isGroupMetric = $derived(GROUP_METRIC_TYPES.has(metricType));
	const groupId = $derived(groupSel === NULL_GROUP ? null : parsePositiveInt(groupSel));

	// Apply recommended operator/threshold when the operator hasn't been touched
	// is intentionally NOT done automatically on every change — Vue kept the
	// user's edits. We only seed defaults for a *brand new* rule via hydrate().
	function onMetricChange() {
		if (!isEditing && metricType) {
			const d = defaultsFromMetric(metricType);
			operator = d.operator;
			threshold = d.threshold;
		}
	}

	const metricOptionLabel = (def: MetricDefinition) =>
		$_(`admin.ops.alertRules.metrics.${def.labelKey}`, { default: def.labelDefault });

	const groupLabel = (g: MetricGroup) =>
		$_(`admin.ops.alertRules.metricGroups.${g}`, {
			default: g === 'system' ? 'System' : g === 'group' ? 'Group' : 'Account'
		});

	const metricsByGroup = $derived(
		(['system', 'group', 'account'] as MetricGroup[]).map((g) => ({
			group: g,
			items: METRIC_DEFINITIONS.filter((m) => m.group === g)
		}))
	);

	// ── validation (mirrors Vue editorValidation) ────────────────────────────
	function validate(): string[] {
		const errors: string[] = [];
		if (!name.trim())
			errors.push(
				$_('admin.ops.alertRules.validation.nameRequired', { default: '名称必填。' })
			);
		if (!metricType)
			errors.push(
				$_('admin.ops.alertRules.validation.metricRequired', {
					default: '指标类型必填。'
				})
			);
		if (isGroupMetric && groupId == null)
			errors.push(
				$_('admin.ops.alertRules.validation.groupIdRequired', {
					default: '分组级指标需要分组。'
				})
			);
		if (!operator)
			errors.push(
				$_('admin.ops.alertRules.validation.operatorRequired', {
					default: '运算符必填。'
				})
			);
		if (!(typeof threshold === 'number' && Number.isFinite(threshold)))
			errors.push(
				$_('admin.ops.alertRules.validation.thresholdRequired', {
					default: '阈值必须为数字。'
				})
			);
		if (!WINDOW_OPTIONS.includes(windowMinutes as (typeof WINDOW_OPTIONS)[number]))
			errors.push(
				$_('admin.ops.alertRules.validation.windowRange', {
					default: '窗口必须为 1、5 或 60 分钟。'
				})
			);
		if (
			!(
				Number.isFinite(sustainedMinutes) &&
				sustainedMinutes >= 1 &&
				sustainedMinutes <= 1440
			)
		)
			errors.push(
				$_('admin.ops.alertRules.validation.sustainedRange', {
					default: '持续分钟数必须在 1 至 1440 之间。'
				})
			);
		if (
			!(
				Number.isFinite(cooldownMinutes) &&
				cooldownMinutes >= 0 &&
				cooldownMinutes <= 1440
			)
		)
			errors.push(
				$_('admin.ops.alertRules.validation.cooldownRange', {
					default: '冷却分钟数必须在 0 至 1440 之间。'
				})
			);
		// filters JSON must parse (when provided).
		if (filtersText.trim()) {
			try {
				const parsed = JSON.parse(filtersText);
				if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
					errors.push(
						$_('admin.ops.alertRules.validation.filtersObject', {
							default: '筛选条件必须为 JSON 对象。'
						})
					);
				}
			} catch {
				errors.push(
					$_('admin.ops.alertRules.validation.filtersJson', {
						default: '筛选条件必须为有效 JSON。'
					})
				);
			}
		}
		return errors;
	}

	const validationErrors = $derived(validate());
	const isValid = $derived(validationErrors.length === 0);

	function buildFilters(): Record<string, unknown> | null {
		let base: Record<string, unknown> = {};
		if (filtersText.trim()) {
			try {
				const parsed = JSON.parse(filtersText);
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					base = { ...(parsed as Record<string, unknown>) };
				}
			} catch {
				// validate() already gated this path; ignore here.
			}
		}
		const gid = groupId;
		if (gid != null) base.group_id = gid;
		else delete base.group_id;
		return Object.keys(base).length > 0 ? base : null;
	}

	function buildPayload(): AlertRule {
		return {
			name: name.trim(),
			description: description.trim() || undefined,
			enabled,
			severity,
			metric_type: metricType,
			operator,
			threshold,
			window_minutes: windowMinutes,
			sustained_minutes: sustainedMinutes,
			cooldown_minutes: cooldownMinutes,
			notify_email: notifyEmail,
			filters: buildFilters()
		};
	}

	async function save() {
		const errs = validate();
		if (errs.length > 0) {
			formError = errs[0];
			return;
		}
		saving = true;
		formError = '';
		try {
			const payload = buildPayload();
			if (editingId != null) {
				await updateOpsAlertRule(editingId, payload);
			} else {
				await createOpsAlertRule(payload);
			}
			showSuccess(
				$_('admin.ops.alertRules.saveSuccess', { default: '告警规则已保存。' })
			);
			onSaved();
		} catch (err) {
			const msg =
				(err as Error)?.message ??
				$_('admin.ops.alertRules.saveFailed', { default: '保存告警规则失败。' });
			formError = msg;
			showError(msg);
		} finally {
			saving = false;
		}
	}

	function handleOpenChange(next: boolean) {
		if (next) {
			open = true;
			return;
		}
		open = false;
		onClose();
	}

	function cancel() {
		open = false;
		onClose();
	}
</script>

<StandardDialog
	bind:open
	onOpenChange={handleOpenChange}
	width="lg"
	title={isEditing
		? $_('admin.ops.alertRules.editTitle', { default: '编辑告警规则' })
		: $_('admin.ops.alertRules.createTitle', { default: '创建告警规则' })}
	description={$_('admin.ops.alertRules.editDescription', {
		default: '定义告警触发条件和发送方式。'
	})}
	data-testid="ops-alert-rule-dialog"
>
	<div class="mt-4 flex flex-col gap-4">
		{#if formError}
			<Alert variant="destructive" class="text-xs" data-testid="ops-rule-error">
				{formError}
			</Alert>
		{/if}

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<!-- name -->
			<div class="space-y-1.5 sm:col-span-2">
				<label for="rule-name" class="text-sm font-medium text-foreground">
					{$_('admin.ops.alertRules.form.name', { default: '名称' })}
				</label>
				<Input
					id="rule-name"
					type="text"
					autocomplete="off"
					data-testid="ops-rule-name"
					bind:value={name}
					placeholder={$_('admin.ops.alertRules.form.namePlaceholder', {
						default: 'e.g. High error rate'
					})}
				/>
			</div>

			<!-- description -->
			<div class="space-y-1.5 sm:col-span-2">
				<label for="rule-description" class="text-sm font-medium text-foreground">
					{$_('admin.ops.alertRules.form.description', { default: '描述' })}
				</label>
				<Input
					id="rule-description"
					type="text"
					data-testid="ops-rule-description"
					bind:value={description}
					placeholder={$_('admin.ops.alertRules.form.descriptionPlaceholder', {
						default: '告警上显示的可选上下文。'
					})}
				/>
			</div>

			<!-- metric_type -->
			<div class="space-y-1.5">
				<label for="rule-metric" class="text-sm font-medium text-foreground">
					{$_('admin.ops.alertRules.form.metric', { default: '指标' })}
				</label>
				<NativeSelect
					id="rule-metric"
					class="w-full"
					data-testid="ops-rule-metric"
					bind:value={metricType}
					onchange={onMetricChange}
				>
					{#each metricsByGroup as bucket (bucket.group)}
						{#if bucket.items.length > 0}
							<optgroup label={groupLabel(bucket.group)}>
								{#each bucket.items as def (def.type)}
									<option value={def.type}>{metricOptionLabel(def)}</option>
								{/each}
							</optgroup>
						{/if}
					{/each}
				</NativeSelect>
				{#if selectedDef}
					<p class="text-xs text-muted-foreground">{selectedDef.descDefault}</p>
					<p class="text-xs text-muted-foreground">
						{$_('admin.ops.alertRules.hints.recommended', {
							default: '推荐：{operator} {threshold}{unit}',
							values: {
								operator:
									OPERATORS.find((o) => o.value === selectedDef.recommendedOperator)
										?.symbol ?? selectedDef.recommendedOperator,
								threshold: selectedDef.recommendedThreshold,
								unit: selectedDef.unit ?? ''
							}
						})}
					</p>
				{/if}
			</div>

			<!-- operator -->
			<div class="space-y-1.5">
				<label for="rule-operator" class="text-sm font-medium text-foreground">
					{$_('admin.ops.alertRules.form.operator', { default: '运算符' })}
				</label>
				<NativeSelect
					id="rule-operator"
					class="w-full"
					data-testid="ops-rule-operator"
					bind:value={operator}
				>
					{#each OPERATORS as op (op.value)}
						<option value={op.value}>{op.symbol}</option>
					{/each}
				</NativeSelect>
			</div>

			<!-- threshold -->
			<div class="space-y-1.5">
				<label for="rule-threshold" class="text-sm font-medium text-foreground">
					{$_('admin.ops.alertRules.form.threshold', { default: '阈值' })}
				</label>
				<Input
					id="rule-threshold"
					type="number"
					inputmode="decimal"
					step="any"
					data-testid="ops-rule-threshold"
					bind:value={threshold}
				/>
			</div>

			<!-- severity -->
			<div class="space-y-1.5">
				<label for="rule-severity" class="text-sm font-medium text-foreground">
					{$_('admin.ops.alertRules.form.severity', { default: '严重度' })}
				</label>
				<NativeSelect
					id="rule-severity"
					class="w-full"
					data-testid="ops-rule-severity"
					bind:value={severity}
				>
					{#each SEVERITIES as s (s)}
						<option value={s}>{s}</option>
					{/each}
				</NativeSelect>
			</div>

			<!-- window_minutes -->
			<div class="space-y-1.5">
				<label for="rule-window" class="text-sm font-medium text-foreground">
					{$_('admin.ops.alertRules.form.window', { default: '窗口（分钟）' })}
				</label>
				<NativeSelect
					id="rule-window"
					class="w-full"
					data-testid="ops-rule-window"
					value={String(windowMinutes)}
					onchange={(e) => (windowMinutes = Number((e.currentTarget as HTMLSelectElement).value))}
				>
					{#each WINDOW_OPTIONS as w (w)}
						<option value={String(w)}>{w}m</option>
					{/each}
				</NativeSelect>
			</div>

			<!-- sustained_minutes -->
			<div class="space-y-1.5">
				<label for="rule-sustained" class="text-sm font-medium text-foreground">
					{$_('admin.ops.alertRules.form.sustained', { default: '持续（分钟）' })}
				</label>
				<Input
					id="rule-sustained"
					type="number"
					inputmode="numeric"
					step="1"
					min="1"
					max="1440"
					data-testid="ops-rule-sustained"
					bind:value={sustainedMinutes}
				/>
			</div>

			<!-- cooldown_minutes -->
			<div class="space-y-1.5">
				<label for="rule-cooldown" class="text-sm font-medium text-foreground">
					{$_('admin.ops.alertRules.form.cooldown', { default: '冷却（分钟）' })}
				</label>
				<Input
					id="rule-cooldown"
					type="number"
					inputmode="numeric"
					step="1"
					min="0"
					max="1440"
					data-testid="ops-rule-cooldown"
					bind:value={cooldownMinutes}
				/>
			</div>

			<!-- group filter (only meaningful when set; required for group metrics) -->
			<div class="space-y-1.5 sm:col-span-2">
				<label for="rule-group" class="text-sm font-medium text-foreground">
					{$_('admin.ops.alertRules.form.groupId', { default: '分组筛选' })}
					{#if isGroupMetric}<span class="ml-1 text-destructive">*</span>{/if}
				</label>
				<Input
					id="rule-group"
					type="text"
					inputmode="numeric"
					data-testid="ops-rule-group"
					value={groupSel === NULL_GROUP ? '' : groupSel}
					oninput={(e) => {
						const v = (e.currentTarget as HTMLInputElement).value.trim();
						groupSel = v === '' ? NULL_GROUP : v;
					}}
					placeholder={$_('admin.ops.alertRules.form.groupPlaceholder', {
						default: '分组 ID（数字）— 留空表示所有分组'
					})}
					aria-invalid={isGroupMetric && groupId == null ? 'true' : undefined}
				/>
				<p class="text-xs text-muted-foreground">
					{isGroupMetric
						? $_('admin.ops.alertRules.hints.groupRequired', {
								default: '分组级指标需要分组 ID。'
							})
						: $_('admin.ops.alertRules.hints.groupOptional', {
								default: '可选：限制此规则仅适用于单个分组。'
							})}
				</p>
			</div>

			<!-- filters JSON -->
			<div class="space-y-1.5 sm:col-span-2">
				<label for="rule-filters" class="text-sm font-medium text-foreground">
					{$_('admin.ops.alertRules.form.filters', { default: '筛选条件 (JSON)' })}
				</label>
				<Textarea
					id="rule-filters"
					class="font-mono text-xs"
					rows={4}
					data-testid="ops-rule-filters"
					bind:value={filtersText}
					placeholder={'{\n  "platform": "openai"\n}'}
				/>
				<p class="text-xs text-muted-foreground">
					{$_('admin.ops.alertRules.hints.filters', {
						default: '可选的额外维度筛选 JSON 对象。'
					})}
				</p>
			</div>

			<!-- enabled -->
			<label
				class="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5 sm:col-span-2"
			>
				<span class="text-sm font-medium text-foreground">
					{$_('admin.ops.alertRules.form.enabled', { default: '已启用' })}
				</span>
				<Checkbox data-testid="ops-rule-enabled" bind:checked={enabled} />
			</label>

			<!-- notify_email -->
			<label
				class="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5 sm:col-span-2"
			>
				<span class="text-sm font-medium text-foreground">
					{$_('admin.ops.alertRules.form.notifyEmail', { default: '通过邮件通知' })}
				</span>
				<Checkbox data-testid="ops-rule-notify-email" bind:checked={notifyEmail} />
			</label>
		</div>

		<div class="flex items-center justify-end gap-2 pt-1">
			<Button
				variant="outline"
				class="h-9"
				disabled={saving}
				data-testid="ops-rule-cancel"
				onclick={cancel}
			>
				{$_('common.cancel', { default: '取消' })}
			</Button>
			<Button
				class="h-9"
				disabled={saving || !isValid}
				data-testid="ops-rule-save"
				onclick={save}
			>
				{saving
					? $_('common.saving', { default: '保存中...' })
					: $_('common.save', { default: '保存' })}
			</Button>
		</div>
	</div>
</StandardDialog>
