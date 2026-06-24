<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Cloud, Save } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import {
		getS3Config,
		testS3Connection,
		updateS3Config,
		type BackupS3Config
	} from '$lib/api/admin/backup';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	let s3Form = $state<BackupS3Config>({
		endpoint: '',
		region: 'auto',
		bucket: '',
		access_key_id: '',
		secret_access_key: '',
		prefix: 'backups/',
		force_path_style: false
	});
	let s3SecretConfigured = $state(false);
	let savingS3 = $state(false);
	let testingS3 = $state(false);
	let r2GuideOpen = $state(false);

	const r2Rows = $derived([
		{ field: $_('admin.backup.s3.endpoint'), value: 'https://<account_id>.r2.cloudflarestorage.com' },
		{ field: $_('admin.backup.s3.region'), value: 'auto' },
		{ field: $_('admin.backup.s3.bucket'), value: $_('admin.backup.r2Guide.step4.bucketValue') },
		{ field: $_('admin.backup.s3.prefix'), value: 'backups/' },
		{ field: 'Access Key ID', value: $_('admin.backup.r2Guide.step4.fromStep2') },
		{ field: 'Secret Access Key', value: $_('admin.backup.r2Guide.step4.fromStep2') },
		{ field: $_('admin.backup.s3.forcePathStyle'), value: $_('admin.backup.r2Guide.step4.unchecked') }
	]);

	export async function load() {
		try {
			const cfg = await getS3Config();
			s3Form = {
				endpoint: cfg.endpoint || '',
				region: cfg.region || 'auto',
				bucket: cfg.bucket || '',
				access_key_id: cfg.access_key_id || '',
				secret_access_key: '',
				prefix: cfg.prefix || 'backups/',
				force_path_style: Boolean(cfg.force_path_style)
			};
			s3SecretConfigured = Boolean(cfg.access_key_id);
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		}
	}

	async function saveS3() {
		savingS3 = true;
		try {
			await updateS3Config(s3Form);
			showSuccess($_('admin.backup.s3.saved'));
			await load();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			savingS3 = false;
		}
	}

	async function testS3() {
		testingS3 = true;
		try {
			const result = await testS3Connection(s3Form);
			if (result.ok) showSuccess(result.message || $_('admin.backup.s3.testSuccess'));
			else showError(result.message || $_('admin.backup.s3.testFailed'));
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			testingS3 = false;
		}
	}
</script>

<Card class="p-4">
	<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-base font-semibold">{$_('admin.backup.s3.title')}</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				{$_('admin.backup.s3.descriptionPrefix')}
				<Button variant="ghost" size="sm" class="h-auto px-1 underline" onclick={() => (r2GuideOpen = true)}>Cloudflare R2</Button>
				{$_('admin.backup.s3.descriptionSuffix')}
			</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={testS3} disabled={testingS3}>
				<Cloud size={14} />{testingS3 ? $_('common.loading', { default: 'Loading' }) : $_('admin.backup.s3.testConnection')}
			</Button>
			<Button size="sm" onclick={saveS3} disabled={savingS3}>
				<Save size={14} />{savingS3 ? $_('common.loading', { default: 'Loading' }) : $_('common.save', { default: '保存' })}
			</Button>
		</div>
	</div>
	<div class="grid gap-3 md:grid-cols-2">
		<label class="space-y-1 text-xs font-medium">
			<span>{$_('admin.backup.s3.endpoint')}</span>
			<Input bind:value={s3Form.endpoint} placeholder="https://<account_id>.r2.cloudflarestorage.com" data-testid="backup-s3-endpoint" />
		</label>
		<label class="space-y-1 text-xs font-medium">
			<span>{$_('admin.backup.s3.region')}</span>
			<Input bind:value={s3Form.region} placeholder="auto" data-testid="backup-s3-region" />
		</label>
		<label class="space-y-1 text-xs font-medium">
			<span>{$_('admin.backup.s3.bucket')}</span>
			<Input bind:value={s3Form.bucket} data-testid="backup-s3-bucket" />
		</label>
		<label class="space-y-1 text-xs font-medium">
			<span>{$_('admin.backup.s3.prefix')}</span>
			<Input bind:value={s3Form.prefix} placeholder="backups/" data-testid="backup-s3-prefix" />
		</label>
		<label class="space-y-1 text-xs font-medium">
			<span>{$_('admin.backup.s3.accessKeyId')}</span>
			<Input bind:value={s3Form.access_key_id} data-testid="backup-s3-access-key" />
		</label>
		<label class="space-y-1 text-xs font-medium">
			<span>{$_('admin.backup.s3.secretAccessKey')}</span>
			<Input
				bind:value={s3Form.secret_access_key}
				type="password"
				placeholder={s3SecretConfigured ? $_('admin.backup.s3.secretConfigured') : ''}
				data-testid="backup-s3-secret"
			/>
		</label>
		<label class="flex items-center gap-2 text-sm md:col-span-2">
			<Checkbox bind:checked={s3Form.force_path_style} data-testid="backup-s3-force-path" />
			<span>{$_('admin.backup.s3.forcePathStyle')}</span>
		</label>
	</div>
</Card>

<StandardDialog bind:open={r2GuideOpen} title={$_('admin.backup.r2Guide.title')} description={$_('admin.backup.r2Guide.intro')} width="lg" data-testid="backup-r2-guide">
	<div class="mt-4 max-h-[60vh] space-y-5 overflow-auto pr-1">
		<section>
			<h3 class="text-sm font-semibold">1. {$_('admin.backup.r2Guide.step1.title')}</h3>
			<ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
				<li>{$_('admin.backup.r2Guide.step1.line1')}</li>
				<li>{$_('admin.backup.r2Guide.step1.line2')}</li>
				<li>{$_('admin.backup.r2Guide.step1.line3')}</li>
			</ol>
		</section>
		<section>
			<h3 class="text-sm font-semibold">2. {$_('admin.backup.r2Guide.step2.title')}</h3>
			<ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
				<li>{$_('admin.backup.r2Guide.step2.line1')}</li>
				<li>{$_('admin.backup.r2Guide.step2.line2')}</li>
				<li>{$_('admin.backup.r2Guide.step2.line3')}</li>
				<li>{$_('admin.backup.r2Guide.step2.line4')}</li>
			</ol>
			<p class="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{$_('admin.backup.r2Guide.step2.warning')}</p>
		</section>
		<section>
			<h3 class="text-sm font-semibold">3. {$_('admin.backup.r2Guide.step3.title')}</h3>
			<p class="mt-2 text-sm text-muted-foreground">{$_('admin.backup.r2Guide.step3.desc')}</p>
			<code class="mt-2 block rounded bg-muted px-3 py-2 text-xs">https://&lt;{$_('admin.backup.r2Guide.step3.accountId')}&gt;.r2.cloudflarestorage.com</code>
		</section>
		<section>
			<h3 class="text-sm font-semibold">4. {$_('admin.backup.r2Guide.step4.title')}</h3>
			<div class="mt-2 overflow-hidden rounded-md border border-border">
				{#each r2Rows as item}
					<div class="grid grid-cols-[160px_1fr] border-b text-sm last:border-b-0">
						<p class="bg-muted px-3 py-2 font-medium">{item.field}</p>
						<code class="px-3 py-2 text-xs text-muted-foreground">{item.value}</code>
					</div>
				{/each}
			</div>
		</section>
		<p class="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">{$_('admin.backup.r2Guide.freeTier')}</p>
	</div>
	<div class="mt-5 flex justify-end">
		<Button variant="outline" onclick={() => (r2GuideOpen = false)}>{$_('common.close', { default: '关闭' })}</Button>
	</div>
</StandardDialog>
