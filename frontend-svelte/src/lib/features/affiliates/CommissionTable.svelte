<script lang="ts">
	/**
	 * CommissionTable — invited users table with client-side pagination
	 *
	 * Receives the full invitees array + loading state from the page.
	 * Owns pagination state internally (page / pageSize).
	 */
	import { _ } from 'svelte-i18n';
	import { Users } from '@lucide/svelte';
	import type { AffiliateInvitee } from '$lib/api/user/affiliates';
	import Button from '$lib/ui/Button.svelte';

	type Props = {
		invitees: AffiliateInvitee[];
		totalInvited: number;
		loading: boolean;
	};

	let { invitees, totalInvited, loading }: Props = $props();

	const PAGE_SIZE = 10;

	let page = $state(1);

	const totalPages = $derived(Math.max(1, Math.ceil(invitees.length / PAGE_SIZE)));
	const paged = $derived(invitees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

	// Reset page when invitees change (e.g. after refresh)
	$effect(() => {
		// Touch invitees.length to track changes
		if (invitees.length >= 0) {
			page = 1;
		}
	});

	function prev() {
		if (page <= 1) return;
		page -= 1;
	}

	function next() {
		if (page >= totalPages) return;
		page += 1;
	}

	// ── format helpers ───────────────────────────────────────────────────

	function fmtMoney(v: number | null | undefined): string {
		if (v === null || v === undefined || !Number.isFinite(v)) return '—';
		const sign = v < 0 ? '-' : '';
		return `${sign}$${Math.abs(v).toFixed(2)}`;
	}

	function fmtDate(s: string | null | undefined): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleDateString();
		} catch {
			return s;
		}
	}

	function maskEmail(email: string): string {
		if (!email) return '—';
		const at = email.indexOf('@');
		if (at <= 1) return email;
		const local = email.slice(0, at);
		const domain = email.slice(at);
		const head = local.slice(0, 1);
		return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}${domain}`;
	}
</script>

<section class="rounded-lg border border-border bg-card" data-testid="affiliates-invited-card">
	<header class="flex items-center justify-between border-b border-border px-4 py-3">
		<h2 class="text-sm font-semibold text-foreground">
			{$_('user.affiliates.invited.title', { default: '被邀请用户' })}
		</h2>
		<span class="text-xs text-muted-foreground" data-testid="affiliates-invited-total">
			{$_('user.affiliates.invited.totalLabel', {
				default: '{count} total',
				values: { count: totalInvited }
			})}
		</span>
	</header>

	{#if loading}
		<div class="space-y-2 p-4" data-testid="affiliates-invited-loading">
			{#each Array.from({ length: 3 }) as _placeholder, i (i)}
				<div class="h-10 w-full animate-pulse rounded bg-muted"></div>
			{/each}
		</div>
	{:else if paged.length === 0}
		<div class="p-6 text-center" data-testid="affiliates-invited-empty">
			<Users class="mx-auto h-8 w-8 text-muted-foreground" />
			<p class="mt-2 text-sm text-muted-foreground">
				{$_('user.affiliates.invited.empty', { default: '暂无被邀请用户' })}
			</p>
		</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-sm" data-testid="affiliates-invited-table">
				<thead>
					<tr
						class="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"
					>
						<th class="px-4 py-2 text-left font-medium">
							{$_('user.affiliates.invited.colId', { default: 'ID' })}
						</th>
						<th class="px-4 py-2 text-left font-medium">
							{$_('user.affiliates.invited.colEmail', { default: '邮箱' })}
						</th>
						<th class="px-4 py-2 text-left font-medium">
							{$_('user.affiliates.invited.colJoined', { default: '加入' })}
						</th>
						<th class="px-4 py-2 text-right font-medium">
							{$_('user.affiliates.invited.colSpend', { default: '消费' })}
						</th>
						<th class="px-4 py-2 text-right font-medium">
							{$_('user.affiliates.invited.colRebate', { default: '返佣' })}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each paged as inv (inv.userId)}
						<tr
							data-testid="affiliates-invited-row"
							data-user-id={inv.userId}
							class="border-b border-border last:border-b-0 hover:bg-accent/40"
						>
							<td class="px-4 py-2 text-xs text-muted-foreground">{inv.userId}</td>
							<td class="px-4 py-2 text-xs" data-testid="affiliates-invited-email">
								{maskEmail(inv.email)}
							</td>
							<td class="px-4 py-2 text-xs text-muted-foreground">
								{fmtDate(inv.joinedAt)}
							</td>
							<td class="px-4 py-2 text-right tabular-nums text-xs">
								{fmtMoney(inv.totalSpend)}
							</td>
							<td
								class="px-4 py-2 text-right tabular-nums text-xs font-medium text-emerald-700 dark:text-emerald-400"
							>
								{fmtMoney(inv.rebateGenerated)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if totalPages > 1}
			<div
				class="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground"
				data-testid="affiliates-invited-pagination"
			>
				<span>
					{$_('user.affiliates.pageOf', {
						default: '第 {page} / {pages} 页',
						values: { page, pages: totalPages }
					})}
				</span>
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						data-testid="affiliates-invited-prev"
						disabled={page <= 1}
						onclick={prev}
						class="h-7 px-2"
					>
						{$_('user.affiliates.prevPage', { default: '上一页' })}
					</Button>
					<Button
						variant="outline"
						size="sm"
						data-testid="affiliates-invited-next"
						disabled={page >= totalPages}
						onclick={next}
						class="h-7 px-2"
					>
						{$_('user.affiliates.nextPage', { default: '下一步' })}
					</Button>
				</div>
			</div>
		{/if}
	{/if}
</section>
