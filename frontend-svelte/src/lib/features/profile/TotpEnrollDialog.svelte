<script lang="ts">
	/**
	 * TotpEnrollDialog · StandardDialog 启动 2FA 注册（M7 profile/security）
	 *
	 * 流程：
	 *   1. open=true → POST /api/v1/user/totp/setup → { secret, qr_code_url, setup_token }
	 *   2. dynamic-import 'qrcode' → canvas/dataURL 渲染 otpauth:// URL
	 *      （vite manualChunks 已规则路由到 vendor-qrcode lazy island）
	 *   3. 用户输入 6 位 TOTP → POST /api/v1/user/totp/enable { code, setup_token }
	 *   4. 成功 → toast + close + onEnabled() 回调（父刷新 user）
	 *
	 * RED LINE：
	 *   - 不顶层 import 'qrcode'；只在 onMount 之后 await import('qrcode')；
	 *     manualChunks 已把它落 'vendor-qrcode' 独立 lazy chunk，避免 eager 红线。
	 *   - 不展示 secret plaintext 之外的字段；qr_code_url 是 otpauth:// 格式。
	 *   - Select / sentinel 红线本组件不触发（无 Select）。
	 */
	import { _ } from 'svelte-i18n';
	import { AlertTriangle } from '@lucide/svelte';
	import { enrollTotpStart, enrollTotpConfirm } from '$lib/api/user/profile';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type Props = {
		open: boolean;
		onEnabled?: () => void;
	};

	let { open = $bindable(false), onEnabled }: Props = $props();

	let phase = $state<'loading' | 'show-qr' | 'verify'>('loading');
	let secret = $state('');
	let qrUrl = $state('');
	let setupToken = $state('');
	let qrDataUrl = $state<string | null>(null);
	let qrLoadError = $state<string | null>(null);
	let code = $state('');
	let submitting = $state(false);
	let loadError = $state<string | null>(null);

	async function loadSetup() {
		phase = 'loading';
		loadError = null;
		try {
			const resp = await enrollTotpStart({});
			secret = resp.secret;
			qrUrl = resp.qr_code_url;
			setupToken = resp.setup_token;
			phase = 'show-qr';
			await renderQr();
		} catch (err) {
			const e = err as Error;
			loadError = e?.message ?? $_('user.security.totp.setupFailed', { default: '加载设置向导失败' });
			showError(loadError);
		}
	}

	async function renderQr() {
		qrLoadError = null;
		try {
			// Dynamic-import 才是 chunk 落 'vendor-qrcode' lazy 的关键；
			// 顶层 import 会被 rollup 顺势吸进 vendor → check-chunks 红。
			const mod: unknown = await import('qrcode');
			const QR = (mod as { default?: unknown }).default ?? mod;
			const fn = (QR as { toDataURL?: (text: string) => Promise<string> }).toDataURL;
			if (typeof fn !== 'function') {
				throw new Error('qrcode toDataURL missing');
			}
			qrDataUrl = await fn(qrUrl);
		} catch (err) {
			const e = err as Error;
			qrLoadError = e?.message ?? 'qr render failed';
		}
	}

	async function handleConfirm() {
		if (submitting) return;
		if (!/^\d{6}$/.test(code.trim())) {
			showError(
				$_('user.security.totp.invalidCode', { default: '输入您的应用中的 6 位验证码' })
			);
			return;
		}
		submitting = true;
		try {
			await enrollTotpConfirm({ code: code.trim(), setup_token: setupToken });
			showSuccess(
				$_('user.security.totp.enableSuccess', { default: '双因素认证已启用' })
			);
			onEnabled?.();
			open = false;
		} catch (err) {
			const e = err as Error;
			showError(e?.message ?? $_('user.security.totp.verifyFailed', { default: '验证码无效，请重试' }));
		} finally {
			submitting = false;
		}
	}

	function resetState() {
		phase = 'loading';
		secret = '';
		qrUrl = '';
		setupToken = '';
		qrDataUrl = null;
		qrLoadError = null;
		code = '';
		submitting = false;
		loadError = null;
	}

	// 父通过 bind:open 翻 true 时启动加载；controlled dialog
	// 模式不一定回调外部置 true，因此用 $effect 兜底。
	let lastOpen = false;
	$effect(() => {
		if (open && !lastOpen) {
			lastOpen = true;
			loadSetup();
		} else if (!open && lastOpen) {
			lastOpen = false;
			setTimeout(resetState, 200);
		}
	});

	function handleCancel() {
		if (submitting) return;
		open = false;
	}
</script>

<StandardDialog
	bind:open
	width="md"
	title={$_('user.security.totp.setupTitle', { default: '设置双因素认证' })}
	description={$_('user.security.totp.setupStep1', {
		default: '使用身份验证器应用扫描下方二维码，然后输入 6 位验证码。'
	})}
	data-testid="totp-enroll-dialog"
>
	<div class="mt-4">
		{#if phase === 'loading'}
			<div
				class="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/20 p-8 text-sm text-muted-foreground"
				data-testid="totp-loading"
			>
				{$_('user.security.totp.loading', { default: '加载设置向导中…' })}
			</div>
			{#if loadError}
				<Alert variant="destructive" class="mt-3 px-3 py-2 text-xs" data-testid="totp-load-error">
					{loadError}
				</Alert>
			{/if}
		{:else}
			<div class="space-y-4">
					<div class="flex flex-col items-center gap-3">
						<div
							class="flex h-44 w-44 items-center justify-center rounded-md border border-border bg-white p-2"
							data-testid="totp-qr-box"
						>
							{#if qrDataUrl}
								<img
									src={qrDataUrl}
									alt="TOTP QR code"
									data-testid="totp-qr-img"
									class="h-full w-full object-contain"
								/>
							{:else if qrLoadError}
								<div class="flex items-center gap-1 text-xs text-destructive" data-testid="totp-qr-error">
									<AlertTriangle class="h-3.5 w-3.5" />
									{$_('user.security.totp.qrFailed', { default: '生成二维码失败' })}
								</div>
							{:else}
								<span class="text-xs text-muted-foreground">…</span>
							{/if}
						</div>

						<div class="w-full space-y-1.5">
							<span class="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
								{$_('user.security.totp.manualEntry', { default: '或手动输入此密钥' })}
							</span>
							<code
								data-testid="totp-secret"
								class="block w-full break-all rounded-md border border-input bg-muted/40 px-3 py-2 font-mono text-xs text-foreground"
							>
								{secret}
							</code>
						</div>
					</div>

					<div class="space-y-1.5">
						<label for="totp-code" class="text-sm font-medium text-foreground">
							{$_('user.security.totp.enterCode', { default: '输入 6 位验证码' })}
						</label>
						<Input
							id="totp-code"
							type="text"
							inputmode="numeric"
							autocomplete="one-time-code"
							maxlength={6}
							pattern="[0-9]{6}"
							data-testid="totp-code"
							placeholder="123456"
							bind:value={code}
							class="text-center font-mono text-lg tracking-widest"
						/>
					</div>

					<div class="flex items-center justify-end gap-2 pt-1">
						<Button
							type="button"
							variant="outline"
							data-testid="totp-cancel"
							onclick={handleCancel}
						>
							{$_('user.security.totp.cancel', { default: '取消' })}
						</Button>
						<Button
							type="button"
							data-testid="totp-confirm"
							disabled={submitting}
							onclick={handleConfirm}
						>
							{submitting
								? $_('user.security.totp.verifying', { default: '验证中…' })
								: $_('user.security.totp.verify', { default: '验证并启用' })}
						</Button>
					</div>
				</div>
			{/if}
	</div>
</StandardDialog>
