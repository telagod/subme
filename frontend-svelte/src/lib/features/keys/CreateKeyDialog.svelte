<script lang="ts">
	/**
	 * CreateKeyDialog · bits-ui Dialog + superforms SPA + zod schema（M6）
	 *
	 * 流程：
	 *   1. 表单（name 必填 / quota 可选 / expires_in_days 可选）→ POST /keys
	 *   2. 后端返回包含 plaintext `key` 的 ApiKey（一次性可见）
	 *   3. 切到 "reveal panel"：显示完整 key + Copy 按钮 + 「I've saved it」checkbox
	 *   4. 用户必须 Copy 一次 *或* 勾选 saved checkbox 才允许关闭 —— 防止丢 key
	 *
	 * 红线（reshadcn-migration memory）：
	 *   - 表单内 Select 禁止空字符串 value；本组件未用 Select（type=number / text），
	 *     不触发该规则。测试里有 sentinel guard 兜底。
	 *
	 * 剪贴板降级：
	 *   - 优先 navigator.clipboard.writeText
	 *   - fallback document.execCommand('copy')（依然写入选区，老 Safari/IE 兼容）
	 */
	import { Dialog } from 'bits-ui';
	import { _ } from 'svelte-i18n';
	import { z } from 'zod';
	import { superForm, defaults } from 'sveltekit-superforms/client';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { Copy, Check, KeyRound, ShieldAlert } from '@lucide/svelte';
	import { createKey, type ApiKey } from '$lib/api/user/apiKeys';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type Props = {
		open: boolean;
		onCreated?: (key: ApiKey) => void;
	};

	let { open = $bindable(false), onCreated }: Props = $props();

	// ── schema ─────────────────────────────────────────────────────────
	// 中间步骤：name 必填；quota / expires_in_days 可选；
	// expires_in_days 接受 1..365 整数（与 Vue tree 范围对齐）。
	const schema = z.object({
		name: z
			.string()
			.min(1, 'user.keys.errors.NAME_REQUIRED')
			.max(64, 'user.keys.errors.NAME_TOO_LONG'),
		quota: z.coerce
			.number()
			.min(0, 'user.keys.errors.QUOTA_NEGATIVE')
			.optional()
			.or(z.literal(undefined)),
		expiresInDays: z.coerce
			.number()
			.int('user.keys.errors.EXPIRES_INT')
			.min(1, 'user.keys.errors.EXPIRES_MIN')
			.max(365, 'user.keys.errors.EXPIRES_MAX')
			.optional()
			.or(z.literal(undefined))
	});

	type CreateForm = z.infer<typeof schema>;

	const initial = defaults<CreateForm>(zod4(schema));

	const { form, errors, enhance, submitting, reset } = superForm<CreateForm>(initial, {
		SPA: true,
		validators: zod4Client(schema),
		resetForm: false,
		clearOnSubmit: 'errors-and-message',
		onUpdate: async ({ form: validated, cancel }) => {
			cancel();
			if (!validated.valid) return;

			try {
				const payload: Record<string, unknown> = { name: validated.data.name };
				if (validated.data.quota && validated.data.quota > 0) {
					payload.quota = validated.data.quota;
				}
				if (validated.data.expiresInDays && validated.data.expiresInDays > 0) {
					payload.expires_in_days = validated.data.expiresInDays;
				}
				const created = await createKey(payload as never);
				createdKey = created;
				revealPanel = true;
				showSuccess(
					$_('user.keys.createSuccess', { default: 'API key created successfully' })
				);
				onCreated?.(created);
			} catch (err) {
				const e = err as Error;
				formError = e?.message ?? $_('user.keys.errors.UNKNOWN', { default: 'Unknown error' });
				showError(formError);
			}
		}
	});

	let revealPanel = $state(false);
	let createdKey = $state<ApiKey | null>(null);
	let formError = $state<string>('');
	let savedConfirmed = $state(false);
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	function tr(key: string | undefined, fallback: string): string {
		if (!key) return '';
		return $_(key, { default: fallback });
	}

	async function copyKey() {
		if (!createdKey?.key) return;
		const text = createdKey.key;
		let ok = false;
		try {
			if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				ok = true;
			}
		} catch {
			ok = false;
		}
		if (!ok && typeof document !== 'undefined') {
			// fallback：创建临时 textarea + execCommand。仅老浏览器才走这条。
			try {
				const ta = document.createElement('textarea');
				ta.value = text;
				ta.style.position = 'fixed';
				ta.style.opacity = '0';
				document.body.appendChild(ta);
				ta.focus();
				ta.select();
				ok = document.execCommand('copy');
				document.body.removeChild(ta);
			} catch {
				ok = false;
			}
		}

		if (ok) {
			copied = true;
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 1200);
			showSuccess($_('user.keys.copiedToast', { default: 'Copied to clipboard' }));
		} else {
			showError($_('user.keys.copyFailed', { default: 'Failed to copy. Select and copy manually.' }));
		}
	}

	function canClose(): boolean {
		// 创建后：必须 copy 过 *或* 勾选 saved checkbox。
		if (!revealPanel) return true;
		return copied || savedConfirmed;
	}

	function resetState() {
		revealPanel = false;
		createdKey = null;
		formError = '';
		savedConfirmed = false;
		copied = false;
		if (copyTimer) {
			clearTimeout(copyTimer);
			copyTimer = null;
		}
		reset();
	}

	function handleDoneClick() {
		if (!canClose()) return;
		open = false;
		// 等关闭动画后清空 state，避免下次打开闪现旧 key。
		setTimeout(resetState, 200);
	}

	// 拦截 bits-ui Dialog 自带的 ESC / overlay click 关闭。
	function handleOpenChange(next: boolean) {
		if (next) {
			open = true;
			return;
		}
		// 试图关闭：reveal panel 阶段且未确认 → 阻止。
		if (!canClose()) {
			showError(
				$_('user.keys.mustSaveKeyWarning', {
					default: 'Please copy the key or confirm you have saved it before closing.'
				})
			);
			return;
		}
		open = false;
		setTimeout(resetState, 200);
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			data-testid="create-key-dialog"
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg outline-none"
		>
			<div class="flex items-start gap-3">
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
				>
					<KeyRound class="h-5 w-5" />
				</div>
				<div class="space-y-1">
					<Dialog.Title class="text-base font-semibold text-foreground">
						{revealPanel
							? $_('user.keys.revealTitle', { default: 'Save your new API key' })
							: $_('user.keys.createTitle', { default: 'Create API key' })}
					</Dialog.Title>
					<Dialog.Description class="text-sm text-muted-foreground">
						{revealPanel
							? $_('user.keys.revealDescription', {
									default: "Copy this key now. We won't show it again."
								})
							: $_('user.keys.createDescription', {
									default: 'Generate a new key for API access.'
								})}
					</Dialog.Description>
				</div>
			</div>

			{#if !revealPanel}
				<form
					method="POST"
					use:enhance
					data-testid="create-key-form"
					class="mt-5 space-y-4"
				>
					<!-- name -->
					<div class="space-y-1.5">
						<label for="key-name" class="text-sm font-medium text-foreground">
							{$_('user.keys.nameLabel', { default: 'Name' })}
						</label>
						<input
							id="key-name"
							name="name"
							type="text"
							autocomplete="off"
							data-testid="create-key-name"
							placeholder={$_('user.keys.namePlaceholder', { default: 'My API key' })}
							bind:value={$form.name}
							aria-invalid={$errors.name ? 'true' : undefined}
							class="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
						/>
						{#if $errors.name && $errors.name[0]}
							<p class="text-xs text-destructive" data-testid="error-name">
								{tr($errors.name[0], 'Name error')}
							</p>
						{/if}
					</div>

					<!-- quota -->
					<div class="space-y-1.5">
						<label for="key-quota" class="text-sm font-medium text-foreground">
							{$_('user.keys.quotaLabel', { default: 'Quota (USD, optional)' })}
						</label>
						<input
							id="key-quota"
							name="quota"
							type="number"
							inputmode="decimal"
							step="0.01"
							min="0"
							data-testid="create-key-quota"
							placeholder={$_('user.keys.quotaPlaceholder', { default: 'Leave empty for unlimited' })}
							bind:value={$form.quota}
							aria-invalid={$errors.quota ? 'true' : undefined}
							class="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						/>
						{#if $errors.quota && $errors.quota[0]}
							<p class="text-xs text-destructive" data-testid="error-quota">
								{tr($errors.quota[0], 'Quota error')}
							</p>
						{/if}
					</div>

					<!-- expires in days -->
					<div class="space-y-1.5">
						<label for="key-expires" class="text-sm font-medium text-foreground">
							{$_('user.keys.expiresLabel', { default: 'Expires in (days, optional)' })}
						</label>
						<input
							id="key-expires"
							name="expiresInDays"
							type="number"
							inputmode="numeric"
							step="1"
							min="1"
							max="365"
							data-testid="create-key-expires"
							placeholder={$_('user.keys.expiresPlaceholder', {
								default: 'e.g. 30 — leave empty for no expiry'
							})}
							bind:value={$form.expiresInDays}
							aria-invalid={$errors.expiresInDays ? 'true' : undefined}
							class="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						/>
						{#if $errors.expiresInDays && $errors.expiresInDays[0]}
							<p class="text-xs text-destructive" data-testid="error-expires">
								{tr($errors.expiresInDays[0], 'Expires error')}
							</p>
						{/if}
					</div>

					{#if formError}
						<p
							class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
							data-testid="create-error-form"
						>
							{formError}
						</p>
					{/if}

					<div class="flex items-center justify-end gap-2 pt-2">
						<button
							type="button"
							data-testid="create-cancel-btn"
							onclick={() => handleOpenChange(false)}
							class="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
						>
							{$_('user.keys.cancel', { default: 'Cancel' })}
						</button>
						<button
							type="submit"
							data-testid="create-submit-btn"
							disabled={$submitting}
							class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{$submitting
								? $_('user.keys.creating', { default: 'Creating...' })
								: $_('user.keys.create', { default: 'Create' })}
						</button>
					</div>
				</form>
			{:else}
				<!-- ── Reveal panel ── -->
				<div class="mt-5 space-y-4">
					<div
						class="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
					>
						<ShieldAlert class="mt-0.5 h-4 w-4 shrink-0" />
						<p>
							{$_('user.keys.revealWarning', {
								default:
									"This is the only time we'll display the full key. Store it somewhere safe."
							})}
						</p>
					</div>

					<div class="space-y-1.5">
						<span class="block text-sm font-medium text-foreground" id="reveal-key-label">
							{$_('user.keys.apiKey', { default: 'API Key' })}
						</span>
						<div
							data-testid="reveal-key-panel"
							role="group"
							aria-labelledby="reveal-key-label"
							class="flex items-stretch gap-2 rounded-md border border-input bg-background"
						>
							<code
								data-testid="reveal-key-value"
								class="block flex-1 truncate px-3 py-2 font-mono text-xs text-foreground"
							>
								{createdKey?.key ?? ''}
							</code>
							<button
								type="button"
								data-testid="reveal-copy-btn"
								onclick={copyKey}
								aria-label={$_('user.keys.copyToClipboard', { default: 'Copy to clipboard' })}
								class="flex items-center justify-center border-l border-input px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
							>
								{#if copied}
									<Check class="h-4 w-4 text-emerald-500" />
								{:else}
									<Copy class="h-4 w-4" />
								{/if}
							</button>
						</div>
					</div>

					<label
						class="flex items-center gap-2 text-sm text-foreground"
						data-testid="reveal-saved-label"
					>
						<input
							type="checkbox"
							data-testid="reveal-saved-checkbox"
							bind:checked={savedConfirmed}
							class="h-4 w-4 rounded border-input text-primary focus:ring-ring"
						/>
						<span>
							{$_('user.keys.savedAcknowledge', {
								default: "I've saved this key in a secure location"
							})}
						</span>
					</label>

					<div class="flex items-center justify-end gap-2 pt-2">
						<button
							type="button"
							data-testid="reveal-done-btn"
							disabled={!canClose()}
							onclick={handleDoneClick}
							class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{$_('user.keys.done', { default: 'Done' })}
						</button>
					</div>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
