<script lang="ts">
	/**
	 * OAuthBindingsList · 第三方账号绑定列表（M7 profile/connections）
	 *
	 * 列出可绑定的 provider；每条：
	 *   - icon + 名称 + 已绑定身份 / 未绑定
	 *   - 已绑定 → Unbind 按钮（确认 dialog → DELETE /user/account-bindings/<provider>）
	 *   - 未绑定 → Bind 按钮（window.location.href = startOAuthBind(...)）
	 *
	 * 设计契约：
	 *   - providers 列表由父组件按 public-settings 过滤后传入（这里不再二次 gate）。
	 *   - bindings 来自当前 user.auth_bindings；按 provider 名归集 lookup。
	 *   - 不在此层调 prepareOAuthBindAccessTokenCookie —— svelte port 通过 BFF /
	 *     SameSite=lax cookie 已经能拿到 token；如未来需要可注入 onBeforeBind hook。
	 *
	 * Tests 关心：
	 *   - 渲染所有 provider
	 *   - Unbind 触发确认 dialog
	 */
	import { _ } from 'svelte-i18n';
	import { Link as LinkIcon, MessageCircle, Building2, Globe, ShieldCheck, Code2 } from '@lucide/svelte';
	import { Dialog } from 'bits-ui';
	import {
		startOAuthBind,
		unbindOAuth,
		type OAuthProvider
	} from '$lib/api/user/profile';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	export type BindingState = {
		bound: boolean;
		/** 绑定到的第三方身份显示串（邮箱 / 用户名 / openid）。 */
		identity?: string;
	};

	type Props = {
		/** 已启用的 provider，顺序即渲染顺序。 */
		providers: OAuthProvider[];
		/** provider → 绑定状态。 */
		bindings: Partial<Record<OAuthProvider, BindingState>>;
		/** 解绑成功回调（父刷新 user）。 */
		onChanged?: () => void;
	};

	let { providers, bindings, onChanged }: Props = $props();

	let confirmOpen = $state(false);
	let pendingProvider = $state<OAuthProvider | null>(null);
	let submitting = $state(false);

	function providerLabel(p: OAuthProvider): string {
		const fallback: Record<OAuthProvider, string> = {
			github: 'GitHub',
			google: 'Google',
			linuxdo: 'LinuxDo',
			dingtalk: 'DingTalk',
			wechat: 'WeChat',
			oidc: 'SSO'
		};
		return $_(`user.connections.providers.${p}`, { default: fallback[p] });
	}

	function providerInitial(p: OAuthProvider): string {
		return providerLabel(p).slice(0, 1).toUpperCase();
	}

	function bindHref(p: OAuthProvider): string {
		return startOAuthBind(p, { redirect: '/profile' });
	}

	function openUnbind(p: OAuthProvider) {
		pendingProvider = p;
		confirmOpen = true;
	}

	async function handleUnbind() {
		if (!pendingProvider || submitting) return;
		const p = pendingProvider;
		submitting = true;
		try {
			await unbindOAuth(p);
			showSuccess(
				$_('user.connections.unbindSuccess', {
					default: '{provider} unlinked',
					values: { provider: providerLabel(p) }
				})
			);
			onChanged?.();
			confirmOpen = false;
			pendingProvider = null;
		} catch (err) {
			const e = err as Error;
			showError(
				e?.message ??
					$_('user.connections.unbindFailed', { default: 'Failed to unlink account' })
			);
		} finally {
			submitting = false;
		}
	}

	function handleBindClick(p: OAuthProvider) {
		const url = bindHref(p);
		// 与 Vue tree 一致：window.location.href 转跳，无需 await。
		if (typeof window !== 'undefined') {
			window.location.href = url;
		}
	}
</script>

<section
	class="rounded-lg border border-border bg-card p-6 shadow-sm"
	data-testid="oauth-bindings-card"
>
	<header class="mb-5 space-y-1">
		<h2 class="text-base font-semibold text-foreground">
			{$_('user.connections.title', { default: 'Connected sign-in methods' })}
		</h2>
		<p class="text-sm text-muted-foreground">
			{$_('user.connections.description', {
				default: 'Link or unlink third-party sign-in providers.'
			})}
		</p>
	</header>

	{#if providers.length === 0}
		<p
			class="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground"
			data-testid="oauth-bindings-empty"
		>
			{$_('user.connections.empty', {
				default: 'No third-party providers are enabled by the administrator.'
			})}
		</p>
	{:else}
		<ul class="divide-y divide-border" data-testid="oauth-bindings-list">
			{#each providers as p (p)}
				{@const state = bindings[p] ?? { bound: false }}
				<li
					class="flex items-center justify-between gap-4 py-3"
					data-testid="oauth-bindings-row"
					data-provider={p}
				>
					<div class="flex min-w-0 items-center gap-3">
						<div
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground"
							aria-hidden="true"
						>
							{#if p === 'github'}
								<Code2 class="h-4 w-4" />
							{:else if p === 'google'}
								<Globe class="h-4 w-4" />
							{:else if p === 'wechat'}
								<MessageCircle class="h-4 w-4" />
							{:else if p === 'dingtalk'}
								<Building2 class="h-4 w-4" />
							{:else if p === 'oidc'}
								<ShieldCheck class="h-4 w-4" />
							{:else}
								<LinkIcon class="h-4 w-4" />
							{/if}
							<span class="sr-only">{providerInitial(p)}</span>
						</div>
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-foreground">{providerLabel(p)}</p>
							<p class="truncate text-xs text-muted-foreground" data-testid="oauth-row-identity">
								{#if state.bound}
									{state.identity ??
										$_('user.connections.status.bound', { default: 'Linked' })}
								{:else}
									{$_('user.connections.status.notBound', { default: 'Not linked' })}
								{/if}
							</p>
						</div>
					</div>

					<div class="flex shrink-0 items-center gap-2">
						{#if state.bound}
							<button
								type="button"
								data-testid="oauth-unbind-btn"
								data-provider={p}
								onclick={() => openUnbind(p)}
								class="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
							>
								{$_('user.connections.unbind', { default: 'Unlink' })}
							</button>
						{:else}
							<button
								type="button"
								data-testid="oauth-bind-btn"
								data-provider={p}
								onclick={() => handleBindClick(p)}
								class="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
							>
								{$_('user.connections.bind', { default: 'Link' })}
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<Dialog.Root bind:open={confirmOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			data-testid="oauth-unbind-dialog"
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg outline-none"
		>
			<Dialog.Title class="text-base font-semibold text-foreground">
				{$_('user.connections.unbindTitle', { default: 'Unlink this sign-in method?' })}
			</Dialog.Title>
			<Dialog.Description class="mt-1.5 text-sm text-muted-foreground">
				{$_('user.connections.unbindDescription', {
					default:
						'You will no longer be able to log in with {provider}. Make sure another sign-in method is available.',
					values: { provider: pendingProvider ? providerLabel(pendingProvider) : '' }
				})}
			</Dialog.Description>

			<div class="mt-6 flex items-center justify-end gap-2">
				<button
					type="button"
					data-testid="oauth-unbind-cancel"
					disabled={submitting}
					onclick={() => (confirmOpen = false)}
					class="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
				>
					{$_('user.connections.cancel', { default: 'Cancel' })}
				</button>
				<button
					type="button"
					data-testid="oauth-unbind-confirm"
					disabled={submitting}
					onclick={handleUnbind}
					class="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{submitting
						? $_('user.connections.unbinding', { default: 'Unlinking…' })
						: $_('user.connections.confirmUnbind', { default: 'Unlink' })}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
