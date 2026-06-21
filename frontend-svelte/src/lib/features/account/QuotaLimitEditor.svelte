<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import { ChevronDown } from '@lucide/svelte';

	type Props = {
		totalLimit: number | null;
		dailyLimit: number | null;
		weeklyLimit: number | null;
		dailyResetMode: string | null;
		dailyResetHour: number | null;
		weeklyResetMode: string | null;
		weeklyResetDay: number | null;
		weeklyResetHour: number | null;
		resetTimezone: string | null;
		onUpdate: (field: string, value: unknown) => void;
	};
	let {
		totalLimit = $bindable(null),
		dailyLimit = $bindable(null),
		weeklyLimit = $bindable(null),
		dailyResetMode = $bindable(null),
		dailyResetHour = $bindable(null),
		weeklyResetMode = $bindable(null),
		weeklyResetDay = $bindable(null),
		weeklyResetHour = $bindable(null),
		resetTimezone = $bindable(null),
		onUpdate
	}: Props = $props();

	const TIMEZONES = [
		'UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Asia/Kolkata',
		'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
		'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
		'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland'
	];
	const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${String(i).padStart(2, '0')}:00` }));
	const DAYS = [
		{ value: '1', label: 'Monday' }, { value: '2', label: 'Tuesday' },
		{ value: '3', label: 'Wednesday' }, { value: '4', label: 'Thursday' },
		{ value: '5', label: 'Friday' }, { value: '6', label: 'Saturday' },
		{ value: '0', label: 'Sunday' }
	];
	const RESET_MODES = [
		{ value: 'rolling', label: 'Rolling window' },
		{ value: 'fixed', label: 'Fixed schedule' }
	];
	const tzOptions = TIMEZONES.map(t => ({ value: t, label: t }));

	let enabled = $state(
		(totalLimit != null && totalLimit > 0) ||
		(dailyLimit != null && dailyLimit > 0) ||
		(weeklyLimit != null && weeklyLimit > 0)
	);
	let collapsed = $state(false);

	// Sync enabled state from props
	$effect(() => {
		const hasLimits =
			(totalLimit != null && totalLimit > 0) ||
			(dailyLimit != null && dailyLimit > 0) ||
			(weeklyLimit != null && weeklyLimit > 0);
		if (hasLimits && !enabled) enabled = true;
	});

	function toggleEnabled() {
		enabled = !enabled;
		if (!enabled) {
			totalLimit = null; dailyLimit = null; weeklyLimit = null;
			dailyResetMode = null; dailyResetHour = null;
			weeklyResetMode = null; weeklyResetDay = null; weeklyResetHour = null;
			resetTimezone = null;
			onUpdate('quotaLimits', null);
		}
	}

	function parseLimit(v: string): number | null {
		const t = v.trim();
		if (!t) return null;
		const n = Number(t);
		return Number.isFinite(n) && n >= 0 ? n : null;
	}

	function onDailyResetModeChange(val: string) {
		dailyResetMode = val;
		if (val === 'fixed') {
			if (dailyResetHour == null) dailyResetHour = 0;
			if (!resetTimezone) resetTimezone = 'UTC';
		}
	}

	function onWeeklyResetModeChange(val: string) {
		weeklyResetMode = val;
		if (val === 'fixed') {
			if (weeklyResetHour == null) weeklyResetHour = 0;
			if (weeklyResetDay == null) weeklyResetDay = 1;
			if (!resetTimezone) resetTimezone = 'UTC';
		}
	}
</script>

<div class="rounded-lg border border-border" data-testid="quota-limit-editor">
	<div class="flex items-center justify-between p-4" class:pb-0={enabled && !collapsed}>
		<button type="button" class="flex flex-1 cursor-pointer items-center gap-2 text-left" onclick={() => enabled && (collapsed = !collapsed)}>
			{#if enabled}<ChevronDown size={16} class="text-muted-foreground transition-transform {collapsed ? '-rotate-90' : ''}" />{/if}
			<div>
				<p class="text-sm font-medium">{$_('admin.accounts.quotaLimitToggle', { default: 'Quota limits' })}</p>
				<p class="mt-0.5 text-xs text-muted-foreground">{$_('admin.accounts.quotaLimitToggleHint', { default: 'Set daily, weekly, and total spending caps.' })}</p>
			</div>
		</button>
		<Checkbox checked={enabled} onchange={toggleEnabled} data-testid="quota-limit-toggle" />
	</div>

	{#if enabled && !collapsed}
		<div class="space-y-4 p-4 pt-3">
			<!-- Daily quota -->
			<div class="space-y-2">
				<p class="text-xs font-medium">{$_('admin.accounts.quotaDailyLimit', { default: 'Daily limit' })}</p>
				<div class="grid gap-2 sm:grid-cols-[1fr_auto]">
					<div class="relative">
						<span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
						<Input class="pl-6" type="number" min="0" step="0.01"
							value={dailyLimit ?? ''}
							oninput={(e) => { dailyLimit = parseLimit((e.target as HTMLInputElement).value); }}
							placeholder="No limit"
							data-testid="quota-daily-input" />
					</div>
					<NativeSelect value={dailyResetMode ?? 'rolling'} options={RESET_MODES} onchange={(e) => onDailyResetModeChange((e.target as HTMLSelectElement).value)} data-testid="quota-daily-mode" />
				</div>
				{#if dailyResetMode === 'fixed'}
					<div class="grid gap-2 sm:grid-cols-2">
						<NativeSelect value={String(dailyResetHour ?? 0)} options={HOURS} onchange={(e) => { dailyResetHour = Number((e.target as HTMLSelectElement).value); }} data-testid="quota-daily-hour" />
						<NativeSelect value={resetTimezone ?? 'UTC'} options={tzOptions} onchange={(e) => { resetTimezone = (e.target as HTMLSelectElement).value; }} data-testid="quota-daily-tz" />
					</div>
					<p class="text-xs text-muted-foreground">Resets daily at {String(dailyResetHour ?? 0).padStart(2, '0')}:00 {resetTimezone ?? 'UTC'}</p>
				{:else}
					<p class="text-xs text-muted-foreground">{$_('admin.accounts.quotaDailyLimitHint', { default: 'Rolling 24-hour window from last reset.' })}</p>
				{/if}
			</div>

			<!-- Weekly quota -->
			<div class="space-y-2">
				<p class="text-xs font-medium">{$_('admin.accounts.quotaWeeklyLimit', { default: 'Weekly limit' })}</p>
				<div class="grid gap-2 sm:grid-cols-[1fr_auto]">
					<div class="relative">
						<span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
						<Input class="pl-6" type="number" min="0" step="0.01"
							value={weeklyLimit ?? ''}
							oninput={(e) => { weeklyLimit = parseLimit((e.target as HTMLInputElement).value); }}
							placeholder="No limit"
							data-testid="quota-weekly-input" />
					</div>
					<NativeSelect value={weeklyResetMode ?? 'rolling'} options={RESET_MODES} onchange={(e) => onWeeklyResetModeChange((e.target as HTMLSelectElement).value)} data-testid="quota-weekly-mode" />
				</div>
				{#if weeklyResetMode === 'fixed'}
					<div class="grid gap-2 sm:grid-cols-3">
						<NativeSelect value={String(weeklyResetDay ?? 1)} options={DAYS} onchange={(e) => { weeklyResetDay = Number((e.target as HTMLSelectElement).value); }} data-testid="quota-weekly-day" />
						<NativeSelect value={String(weeklyResetHour ?? 0)} options={HOURS} onchange={(e) => { weeklyResetHour = Number((e.target as HTMLSelectElement).value); }} data-testid="quota-weekly-hour" />
						<NativeSelect value={resetTimezone ?? 'UTC'} options={tzOptions} onchange={(e) => { resetTimezone = (e.target as HTMLSelectElement).value; }} data-testid="quota-weekly-tz" />
					</div>
					<p class="text-xs text-muted-foreground">Resets weekly on {DAYS.find(d => d.value === String(weeklyResetDay ?? 1))?.label ?? 'Monday'} at {String(weeklyResetHour ?? 0).padStart(2, '0')}:00 {resetTimezone ?? 'UTC'}</p>
				{:else}
					<p class="text-xs text-muted-foreground">{$_('admin.accounts.quotaWeeklyLimitHint', { default: 'Rolling 7-day window from last reset.' })}</p>
				{/if}
			</div>

			<!-- Total quota -->
			<div class="space-y-2">
				<p class="text-xs font-medium">{$_('admin.accounts.quotaTotalLimit', { default: 'Total limit' })}</p>
				<div class="relative">
					<span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
					<Input class="pl-6" type="number" min="0" step="0.01"
						value={totalLimit ?? ''}
						oninput={(e) => { totalLimit = parseLimit((e.target as HTMLInputElement).value); }}
						placeholder="No limit"
						data-testid="quota-total-input" />
				</div>
				<p class="text-xs text-muted-foreground">{$_('admin.accounts.quotaTotalLimitHint', { default: 'Absolute lifetime spending cap. Never resets.' })}</p>
			</div>
		</div>
	{/if}
</div>
