<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle, Loader2 } from '@lucide/svelte';
	import { showError } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';

	let errorMessage = $state('');

	function q(key: string): string {
		try {
			return page?.url?.searchParams.get(key) ?? '';
		} catch {
			return '';
		}
	}

	function parseFragmentParams(): URLSearchParams {
		if (typeof window === 'undefined') return new URLSearchParams();
		const raw = window.location.hash;
		return new URLSearchParams(raw.startsWith('#') ? raw.slice(1) : raw);
	}

	function normalizeRedirectPath(path: string | null | undefined): string {
		const value = (path || '').trim();
		if (!value) return '/purchase';
		if (!value.startsWith('/')) return '/purchase';
		if (value.startsWith('//') || value.includes('://')) return '/purchase';
		if (value === '/payment') return '/purchase';
		if (value.startsWith('/payment?')) return `/purchase${value.slice('/payment'.length)}`;
		return value;
	}

	function appendQueryParam(params: URLSearchParams, key: string, value: string) {
		if (value) params.set(key, value);
	}

	function goBackToPayment() {
		void goto('/purchase', { replaceState: true });
	}

	onMount(async () => {
		const fragment = parseFragmentParams();
		const readParam = (key: string) => fragment.get(key) || q(key);

		const error = readParam('error') || readParam('err_msg') || readParam('errmsg');
		const errorDescription = readParam('error_description') || readParam('message');
		if (error) {
			errorMessage = errorDescription || error;
			showError(errorMessage);
			return;
		}

		const resumeToken = readParam('wechat_resume_token');
		const openid = readParam('openid');
		if (!resumeToken && !openid) {
			errorMessage = $_('auth.wechatPayment.callbackMissingResumeToken', {
				default: 'The WeChat payment callback is missing the resume token.'
			});
			showError(errorMessage);
			return;
		}

		const redirectPath = normalizeRedirectPath(readParam('redirect'));
		const target = new URL(redirectPath, 'http://local');
		target.searchParams.set('wechat_resume', '1');
		if (resumeToken) {
			target.searchParams.set('wechat_resume_token', resumeToken);
		} else {
			target.searchParams.set('openid', openid);
			appendQueryParam(target.searchParams, 'state', readParam('state'));
			appendQueryParam(target.searchParams, 'scope', readParam('scope'));
			appendQueryParam(target.searchParams, 'payment_type', readParam('payment_type'));
			appendQueryParam(target.searchParams, 'amount', readParam('amount'));
			appendQueryParam(target.searchParams, 'order_type', readParam('order_type'));
			appendQueryParam(target.searchParams, 'plan_id', readParam('plan_id'));
		}
		await goto(`${target.pathname}${target.search}`, { replaceState: true });
	});
</script>

<svelte:head>
	<title>{$_('auth.wechatPayment.callbackTitle', { default: 'Resuming WeChat payment' })} · sub2api</title>
</svelte:head>

<section class="min-h-screen bg-background px-4 py-10" data-testid="wechat-payment-callback-page">
	<div class="mx-auto max-w-2xl">
		<div class="rounded-lg border border-border bg-card p-6">
			<h1 class="text-lg font-semibold text-foreground">
				{$_('auth.wechatPayment.callbackTitle', { default: 'Resuming WeChat payment' })}
			</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				{errorMessage ||
					$_('auth.wechatPayment.callbackProcessing', {
						default: 'Resuming WeChat payment...'
					})}
			</p>

			{#if !errorMessage}
				<div class="mt-6 flex items-center justify-center py-10" data-testid="wechat-payment-callback-processing">
					<Loader2 class="h-8 w-8 animate-spin text-primary" />
				</div>
			{:else}
				<div class="mt-6 rounded-md border border-border bg-muted p-4" data-testid="wechat-payment-callback-error">
					<div class="flex items-start gap-2 text-sm text-foreground/85">
						<AlertTriangle class="mt-0.5 h-4 w-4 text-destructive" />
						<p>{errorMessage}</p>
					</div>
					<Button
						type="button"
						class="mt-4"
						onclick={goBackToPayment}
					>
						{$_('auth.wechatPayment.backToPayment', { default: 'Back to payment' })}
					</Button>
				</div>
			{/if}
		</div>
	</div>
</section>
