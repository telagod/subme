<script lang="ts">
	/**
	 * AssignSubscriptionDialog -- admin-side dialog for assigning a subscription
	 * to a user by email/ID, selecting a plan (group), setting validity, and notes.
	 *
	 * Backend contract:
	 *   POST /api/v1/admin/subscriptions/assign
	 *   body { user_id: int64, group_id: int64, validity_days?: int, notes?: string }
	 *
	 * The dialog needs a user_id (not email), so the admin must enter a numeric user ID.
	 * Plan selection maps to group_id (plans belong to groups; the assign endpoint uses group_id).
	 */
	import { _ } from 'svelte-i18n';
	import { UserPlus } from '@lucide/svelte';
	import { assignSub } from '$lib/api/admin/subscriptions';
	import { listGroups, type AdminGroupLite } from '$lib/api/admin/plans';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type Props = {
		open: boolean;
		onAssigned?: () => void;
	};

	let { open = $bindable(false), onAssigned }: Props = $props();

	// Form state
	let userId = $state('');
	let groupId = $state('');
	let validityDays = $state('30');
	let notes = $state('');
	let submitting = $state(false);
	let formError = $state('');

	// Groups for plan/group picker
	let groups = $state<AdminGroupLite[]>([]);
	let groupsLoading = $state(false);

	async function loadGroups() {
		if (groups.length > 0) return;
		groupsLoading = true;
		try {
			groups = await listGroups();
		} catch {
			groups = [];
		}
		groupsLoading = false;
	}

	$effect(() => {
		if (open) void loadGroups();
	});

	const groupOptions = $derived.by<Array<{ value: string; label: string }>>(() => {
		return [
			{
				value: '__none__',
				label: $_('admin.subscriptions.assignSelectGroup', { default: '-- Select group --' })
			},
			...groups.map((g) => ({
				value: String(g.id),
				label: `${g.name} (${g.platform})`
			}))
		];
	});

	function resetForm() {
		userId = '';
		groupId = '';
		validityDays = '30';
		notes = '';
		formError = '';
		submitting = false;
	}

	function handleOpenChange(next: boolean) {
		if (next) {
			open = true;
			return;
		}
		if (submitting) return;
		open = false;
		setTimeout(resetForm, 200);
	}

	async function handleSubmit() {
		formError = '';
		const uid = parseInt(userId.trim(), 10);
		if (!uid || !Number.isFinite(uid) || uid <= 0) {
			formError = $_('admin.subscriptions.assignErrorUserId', {
				default: '请输入有效的用户 ID'
			});
			return;
		}
		const gid = parseInt(groupId, 10);
		if (!gid || !Number.isFinite(gid) || gid <= 0) {
			formError = $_('admin.subscriptions.assignErrorGroup', {
				default: '请选择分组'
			});
			return;
		}
		const days = parseInt(validityDays.trim(), 10);
		if (validityDays.trim() && (!Number.isFinite(days) || days < 1 || days > 36500)) {
			formError = $_('admin.subscriptions.assignErrorDays', {
				default: '有效期必须在 1 至 36500 天之间'
			});
			return;
		}

		submitting = true;
		try {
			await assignSub({
				user_id: uid,
				group_id: gid,
				validity_days: days > 0 ? days : undefined,
				notes: notes.trim() || undefined
			});
			showSuccess(
				$_('admin.subscriptions.assignSuccess', {
					default: '订阅已成功分配'
				})
			);
			onAssigned?.();
			open = false;
			setTimeout(resetForm, 200);
		} catch (err) {
			const e = err as Error;
			formError = e?.message ?? 'Unknown error';
			showError(
				$_('admin.subscriptions.assignError', {
					default: '分配失败：{error}',
					values: { error: formError }
				})
			);
		} finally {
			submitting = false;
		}
	}
</script>

<StandardDialog
	bind:open
	onOpenChange={handleOpenChange}
	width="md"
	showHeader={false}
	title={$_('admin.subscriptions.assignTitle', { default: '分配订阅' })}
	description={$_('admin.subscriptions.assignDesc', {
		default: '为用户分配订阅方案。'
	})}
	data-testid="assign-sub-dialog"
	class="max-w-[480px] p-6"
>
	<div class="flex items-start gap-3">
		<div
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
		>
			<UserPlus class="h-5 w-5" />
		</div>
		<div class="space-y-1">
			<h2 class="text-base font-semibold text-foreground">
				{$_('admin.subscriptions.assignTitle', { default: '分配订阅' })}
			</h2>
			<p class="text-sm text-muted-foreground">
				{$_('admin.subscriptions.assignDesc', {
					default: '为用户分配订阅方案。'
				})}
			</p>
		</div>
	</div>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			void handleSubmit();
		}}
		data-testid="assign-sub-form"
		class="mt-5 space-y-4"
	>
		<!-- User ID -->
		<div class="space-y-1.5">
			<label for="assign-user-id" class="text-sm font-medium text-foreground">
				{$_('admin.subscriptions.assignUserIdLabel', { default: '用户 ID' })}
			</label>
			<Input
				id="assign-user-id"
				type="number"
				inputmode="numeric"
				min="1"
				step="1"
				data-testid="assign-user-id"
				placeholder={$_('admin.subscriptions.assignUserIdPlaceholder', {
					default: 'e.g. 1001'
				})}
				bind:value={userId}
				disabled={submitting}
			/>
			<p class="text-[11px] text-muted-foreground">
				{$_('admin.subscriptions.assignUserIdHint', {
					default: '输入数字用户 ID，可在用户页面找到。'
				})}
			</p>
		</div>

		<!-- Group / Plan picker -->
		<div class="space-y-1.5">
			<label for="assign-group" class="text-sm font-medium text-foreground">
				{$_('admin.subscriptions.assignGroupLabel', { default: '分组' })}
			</label>
			<NativeSelect
				id="assign-group"
				data-testid="assign-group"
				value={groupId || '__none__'}
				options={groupOptions}
				onchange={(e) => {
					const v = (e.currentTarget as HTMLSelectElement).value;
					groupId = v === '__none__' ? '' : v;
				}}
				disabled={submitting || groupsLoading}
			/>
		</div>

		<!-- Validity days -->
		<div class="space-y-1.5">
			<label for="assign-validity" class="text-sm font-medium text-foreground">
				{$_('admin.subscriptions.assignValidityLabel', { default: '有效期（天）' })}
			</label>
			<Input
				id="assign-validity"
				type="number"
				inputmode="numeric"
				min="1"
				max="36500"
				step="1"
				data-testid="assign-validity"
				placeholder={$_('admin.subscriptions.assignValidityPlaceholder', {
					default: '30'
				})}
				bind:value={validityDays}
				disabled={submitting}
			/>
		</div>

		<!-- Notes -->
		<div class="space-y-1.5">
			<label for="assign-notes" class="text-sm font-medium text-foreground">
				{$_('admin.subscriptions.assignNotesLabel', { default: '备注（可选）' })}
			</label>
			<Textarea
				id="assign-notes"
				data-testid="assign-notes"
				class="min-h-16"
				placeholder={$_('admin.subscriptions.assignNotesPlaceholder', {
					default: '手动分配原因...'
				})}
				bind:value={notes}
				disabled={submitting}
			/>
		</div>

		{#if formError}
			<Alert
				variant="destructive"
				class="px-3 py-2 text-xs"
				data-testid="assign-error"
			>
				{formError}
			</Alert>
		{/if}

		<div class="flex items-center justify-end gap-2 pt-2">
			<Button
				variant="outline"
				data-testid="assign-cancel-btn"
				onclick={() => handleOpenChange(false)}
				class="h-9"
				disabled={submitting}
			>
				{$_('common.cancel', { default: '取消' })}
			</Button>
			<Button
				type="submit"
				data-testid="assign-submit-btn"
				disabled={submitting}
				class="h-9"
			>
				{submitting
					? $_('common.submitting', { default: '提交中...' })
					: $_('admin.subscriptions.assignConfirm', { default: '分配' })}
			</Button>
		</div>
	</form>
</StandardDialog>
