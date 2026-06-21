<script lang="ts">
	/**
	 * Cloudflare Turnstile CAPTCHA widget · Svelte 5
	 *
	 * Lazy-loads the Turnstile script, renders the widget, and exposes
	 * the verification token via onVerify callback.
	 *
	 * Usage:
	 *   <TurnstileWidget siteKey="xxx" onVerify={(t) => token = t} />
	 *
	 * Conditional: only renders when siteKey is truthy.
	 * Global Window types augmented in turnstile.d.ts.
	 */
	import { onMount, onDestroy } from 'svelte';
	import type {} from './turnstile.d.ts';

	type Props = {
		siteKey: string;
		theme?: 'light' | 'dark' | 'auto';
		size?: 'normal' | 'compact' | 'flexible';
		onVerify?: (token: string) => void;
		onExpire?: () => void;
		onError?: () => void;
	};

	let {
		siteKey,
		theme = 'auto',
		size = 'flexible',
		onVerify,
		onExpire,
		onError
	}: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let widgetId: string | null = $state(null);
	let scriptLoaded = $state(false);

	function loadScript(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (window.turnstile) {
				scriptLoaded = true;
				resolve();
				return;
			}

			const existing = document.querySelector('script[src*="turnstile"]');
			if (existing) {
				window.onTurnstileLoad = () => {
					scriptLoaded = true;
					resolve();
				};
				return;
			}

			const script = document.createElement('script');
			script.src =
				'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad';
			script.async = true;
			script.defer = true;

			window.onTurnstileLoad = () => {
				scriptLoaded = true;
				resolve();
			};

			script.onerror = () => {
				reject(new Error('Failed to load Turnstile script'));
			};

			document.head.appendChild(script);
		});
	}

	function renderWidget() {
		if (!window.turnstile || !containerEl || !siteKey) return;

		// Remove existing widget if any.
		if (widgetId) {
			try {
				window.turnstile.remove(widgetId);
			} catch {
				// ignore
			}
			widgetId = null;
		}

		containerEl.innerHTML = '';

		widgetId = window.turnstile.render(containerEl, {
			sitekey: siteKey,
			callback: (token: string) => onVerify?.(token),
			'expired-callback': () => onExpire?.(),
			'error-callback': () => onError?.(),
			theme,
			size
		});
	}

	export function reset() {
		if (window.turnstile && widgetId) {
			window.turnstile.reset(widgetId);
		}
	}

	onMount(async () => {
		if (!siteKey) return;
		try {
			await loadScript();
			renderWidget();
		} catch (err) {
			console.error('Failed to initialize Turnstile:', err);
			onError?.();
		}
	});

	onDestroy(() => {
		if (window.turnstile && widgetId) {
			try {
				window.turnstile.remove(widgetId);
			} catch {
				// ignore
			}
		}
	});

	// Re-render when siteKey changes at runtime.
	$effect(() => {
		if (siteKey && scriptLoaded) {
			renderWidget();
		}
	});
</script>

{#if siteKey}
	<div class="w-full">
		<div bind:this={containerEl} class="w-full min-h-[65px] [&_iframe]:!w-full"></div>
	</div>
{/if}
