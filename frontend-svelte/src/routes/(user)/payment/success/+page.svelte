<script lang="ts">
	/**
	 * /(user)/payment/success · Stripe / Airwallex return-URL 着陆页
	 *
	 * 流程：
	 *   1. 从 URL params 读 sessionId（兼容多个字段名：session_id /
	 *      resume_token / payment_intent / out_trade_no）。
	 *   2. 每 5s 调一次 confirmPayment(sessionId)，最多 30s（≤ 6 次）。
	 *   3. status === 'succeeded' → toast 成功 + 跳 /billing 或
	 *      /subscriptions（按 ?type= 决定；缺省 /billing）。
	 *   4. 30s 后仍是 pending → 显示「确认中」提示 + 手动 Retry。
	 *   5. status === 'failed' → 错误说明 + 返回 /billing 链接。
	 *
	 * RED LINE：
	 *   - 严禁在此页顶层 import @stripe/stripe-js / airwallex-payment-elements。
	 *     本页只读 URL + 调 confirmPayment（fetch wrapper），无 SDK 唤起。
	 *   - 即便后续要在此页 invoke 任何 SDK，必须走 $lib/payments/*.ts
	 *     facade 的 dynamic import 路径。
	 */
	import { onMount, onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CheckCircle2, Loader2, AlertTriangle, RotateCw } from '@lucide/svelte';
	import { confirmPayment } from '$lib/api/user/payment';
	import { showSuccess, showError } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';

	type Phase = 'polling' | 'succeeded' | 'pending' | 'failed';

	let phase = $state<Phase>('polling');
	let attempts = $state(0);
	let lastError = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;

	const POLL_INTERVAL_MS = 5_000;
	const MAX_POLLS = 6; // 6 * 5s = 30s

	function readSessionId(): string {
		try {
			const url = page?.url;
			if (!url) return '';
			const q = url.searchParams;
			return (
				q.get('session_id') ??
				q.get('sessionId') ??
				q.get('resume_token') ??
				q.get('payment_intent') ??
				q.get('out_trade_no') ??
				q.get('order_id') ??
				''
			);
		} catch {
			return '';
		}
	}

	function readType(): 'subscription' | 'topup' {
		try {
			const url = page?.url;
			const t = url?.searchParams.get('type') ?? '';
			return t === 'subscription' ? 'subscription' : 'topup';
		} catch {
			return 'topup';
		}
	}

	async function pollOnce(sessionId: string): Promise<void> {
		attempts += 1;
		try {
			const res = await confirmPayment(sessionId);
			if (stopped) return;
			if (res.status === 'succeeded') {
				phase = 'succeeded';
				lastError = null;
				showSuccess(
					$_('user.payment.success.toast', { default: 'Payment confirmed.' })
				);
				const targetType = readType();
				// 短延时让 toast 出现一拍后再跳，避免直接跳走看不到 success UI。
				setTimeout(() => {
					const target = targetType === 'subscription' ? '/subscriptions' : '/billing';
					void goto(target);
				}, 1500);
				return;
			}
			if (res.status === 'failed') {
				phase = 'failed';
				lastError = res.rawStatus ?? null;
				showError(
					$_('user.payment.success.failedToast', {
						default: 'Payment did not complete.'
					})
				);
				return;
			}
			// pending —— 继续轮询直到上限。
			if (attempts >= MAX_POLLS) {
				phase = 'pending';
				return;
			}
			pollTimer = setTimeout(() => void pollOnce(sessionId), POLL_INTERVAL_MS);
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			// 网络失败：不立刻判失败，给一次重试机会。
			if (attempts >= MAX_POLLS) {
				phase = 'pending';
				lastError = msg || null;
				return;
			}
			pollTimer = setTimeout(() => void pollOnce(sessionId), POLL_INTERVAL_MS);
		}
	}

	function retry() {
		const sid = readSessionId();
		if (!sid) {
			phase = 'failed';
			lastError = 'MISSING_SESSION_ID';
			return;
		}
		attempts = 0;
		phase = 'polling';
		lastError = null;
		void pollOnce(sid);
	}

	function goBilling() {
		void goto('/billing');
	}

	function goSubs() {
		void goto('/subscriptions');
	}

	onMount(() => {
		const sid = readSessionId();
		if (!sid) {
			phase = 'failed';
			lastError = 'MISSING_SESSION_ID';
			return;
		}
		void pollOnce(sid);
	});

	onDestroy(() => {
		stopped = true;
		if (pollTimer) {
			clearTimeout(pollTimer);
			pollTimer = null;
		}
	});
</script>

<svelte:head>
	<title>
		{$_('user.payment.success.pageTitle', { default: 'Payment status' })} · sub2api
	</title>
</svelte:head>

<section class="mx-auto max-w-xl space-y-6 py-12" data-testid="payment-success-page">
	{#if phase === 'polling'}
		<div
			class="rounded-lg border border-border bg-card p-8 text-center"
			data-testid="payment-success-polling"
		>
			<div
				class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"
			>
				<Loader2 class="h-6 w-6 animate-spin" />
			</div>
			<h1 class="mt-4 text-lg font-semibold text-foreground">
				{$_('user.payment.success.pollingTitle', {
					default: 'Confirming your payment…'
				})}
			</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				{$_('user.payment.success.pollingHint', {
					default: 'This usually takes a few seconds.'
				})}
			</p>
		</div>
	{:else if phase === 'succeeded'}
		<div
			class="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-8 text-center"
			data-testid="payment-success-done"
		>
			<div
				class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
			>
				<CheckCircle2 class="h-6 w-6" />
			</div>
			<h1 class="mt-4 text-lg font-semibold text-foreground">
				{$_('user.payment.success.doneTitle', { default: 'Payment confirmed' })}
			</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				{$_('user.payment.success.doneHint', {
					default: 'Redirecting you back to your account…'
				})}
			</p>
		</div>
	{:else if phase === 'pending'}
		<div
			class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-8 text-center"
			data-testid="payment-success-pending"
		>
			<div
				class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400"
			>
				<Loader2 class="h-6 w-6" />
			</div>
			<h1 class="mt-4 text-lg font-semibold text-foreground">
				{$_('user.payment.success.pendingTitle', {
					default: 'Still confirming…'
				})}
			</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				{$_('user.payment.success.pendingHint', {
					default:
						'Your payment provider is taking longer than expected. You can retry or check back later in your billing history.'
				})}
			</p>
			<div class="mt-6 flex items-center justify-center gap-2">
				<Button
					variant="outline"
					data-testid="payment-success-retry"
					onclick={retry}
					class="h-9 gap-1.5"
				>
					<RotateCw class="h-4 w-4" />
					{$_('user.payment.success.retry', { default: 'Retry' })}
				</Button>
				<Button
					data-testid="payment-success-go-billing"
					onclick={goBilling}
					class="h-9"
				>
					{$_('user.payment.success.goBilling', { default: 'Go to billing' })}
				</Button>
			</div>
		</div>
	{:else}
		<div
			class="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center"
			data-testid="payment-success-failed"
		>
			<div
				class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
			>
				<AlertTriangle class="h-6 w-6" />
			</div>
			<h1 class="mt-4 text-lg font-semibold text-foreground">
				{$_('user.payment.success.failedTitle', {
					default: 'Payment failed'
				})}
			</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				{$_('user.payment.success.failedHint', {
					default: 'We could not confirm your payment. Please retry or contact support.'
				})}
			</p>
			{#if lastError}
				<p
					class="mt-2 text-xs text-muted-foreground"
					data-testid="payment-success-error-detail"
				>
					{lastError}
				</p>
			{/if}
			<div class="mt-6 flex items-center justify-center gap-2">
				<Button
					variant="outline"
					data-testid="payment-success-retry-failed"
					onclick={retry}
					class="h-9 gap-1.5"
				>
					<RotateCw class="h-4 w-4" />
					{$_('user.payment.success.retry', { default: 'Retry' })}
				</Button>
				<Button
					data-testid="payment-success-go-billing-failed"
					onclick={goBilling}
					class="h-9"
				>
					{$_('user.payment.success.goBilling', { default: 'Go to billing' })}
				</Button>
				<Button
					variant="outline"
					data-testid="payment-success-go-subs"
					onclick={goSubs}
					class="h-9"
				>
					{$_('user.payment.success.goSubs', { default: 'My subscriptions' })}
				</Button>
			</div>
		</div>
	{/if}
</section>
