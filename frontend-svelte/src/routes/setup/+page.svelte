<script lang="ts">
	import { goto } from '$app/navigation';
	import { _ } from 'svelte-i18n';
	import {
		AlertCircle,
		Check,
		CheckCircle2,
		ChevronLeft,
		ChevronRight,
		Database,
		Loader2,
		RefreshCw,
		Settings,
		ShieldCheck,
		Server
	} from '@lucide/svelte';
	import { setupApi } from '$lib/api/setup';
	import {
		SETUP_STEPS,
		canProceed,
		defaultInstallRequest,
		waitForSetupRestart
	} from '$lib/features/setup/setup';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';

	let currentStep = $state(0);
	let errorMessage = $state('');
	let installSuccess = $state(false);
	let serviceReady = $state(false);
	let testingDb = $state(false);
	let testingRedis = $state(false);
	let dbConnected = $state(false);
	let redisConnected = $state(false);
	let installing = $state(false);
	let confirmPassword = $state('');
	let formData = $state(defaultInstallRequest());

	const steps = $derived([
		{ id: SETUP_STEPS[0], title: $_('setup.database.title', { default: '数据库配置' }) },
		{ id: SETUP_STEPS[1], title: $_('setup.redis.title', { default: 'Redis 配置' }) },
		{ id: SETUP_STEPS[2], title: $_('setup.admin.title', { default: '管理员账户' }) },
		{ id: SETUP_STEPS[3], title: $_('setup.ready.title', { default: '准备安装' }) }
	]);
	const canMoveNext = $derived(canProceed(currentStep, {
		dbConnected,
		redisConnected,
		adminEmail: formData.admin.email,
		adminPassword: formData.admin.password,
		confirmPassword
	}));
	const passwordMismatch = $derived(
		confirmPassword !== '' && formData.admin.password !== confirmPassword
	);

	function connectionError(err: unknown, fallback: string): string {
		return (err as Error)?.message || fallback;
	}

	async function testDatabaseConnection(): Promise<void> {
		testingDb = true;
		errorMessage = '';
		dbConnected = false;
		try {
			await setupApi.testDatabase(formData.database);
			dbConnected = true;
		} catch (err) {
			errorMessage = connectionError(err, 'Connection failed');
		} finally {
			testingDb = false;
		}
	}

	async function testRedisConnection(): Promise<void> {
		testingRedis = true;
		errorMessage = '';
		redisConnected = false;
		try {
			await setupApi.testRedis(formData.redis);
			redisConnected = true;
		} catch (err) {
			errorMessage = connectionError(err, 'Connection failed');
		} finally {
			testingRedis = false;
		}
	}

	function nextStep(): void {
		if (!canMoveNext) return;
		errorMessage = '';
		currentStep += 1;
	}

	async function performInstall(): Promise<void> {
		installing = true;
		errorMessage = '';
		try {
			await setupApi.install(formData);
			installSuccess = true;
			const ready = await waitForSetupRestart(() => setupApi.status());
			if (ready) {
				serviceReady = true;
				setTimeout(() => {
					void goto('/login', { replaceState: true });
				}, 1500);
			} else {
				errorMessage = $_('setup.status.timeout', {
					default: '服务重启时间超出预期，请手动刷新页面。'
				});
			}
		} catch (err) {
			errorMessage = connectionError(err, 'Installation failed');
		} finally {
			installing = false;
		}
	}

	const labelClass = 'mb-1.5 block text-sm font-medium text-foreground';
</script>

<svelte:head>
	<title>{$_('setup.title', { default: 'subme Setup' })}</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background p-4 text-foreground" data-testid="setup-page">
	<div class="w-full max-w-2xl">
		<header class="mb-8 text-center">
			<div class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-secondary text-primary">
				<Settings class="h-8 w-8" />
			</div>
			<h1 class="text-3xl font-bold tracking-normal text-foreground">
				{$_('setup.title', { default: 'subme Setup' })}
			</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				{$_('setup.description', { default: '配置您的 subme 实例' })}
			</p>
		</header>

		<nav class="mb-8 overflow-x-auto" aria-label="Setup progress">
			<div class="flex min-w-max items-center justify-center px-1">
				{#each steps as step, index}
					<div class="flex items-center">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition"
							class:bg-primary={currentStep >= index}
							class:text-primary-foreground={currentStep >= index}
							class:border={currentStep < index}
							class:border-border={currentStep < index}
							class:bg-secondary={currentStep < index}
							class:text-muted-foreground={currentStep < index}
							class:ring-4={currentStep === index}
							class:ring-border={currentStep === index}
						>
							{#if currentStep > index}
								<Check class="h-5 w-5" />
							{:else}
								{index + 1}
							{/if}
						</div>
						<span class="ml-2 text-sm font-medium {currentStep >= index ? 'text-foreground' : 'text-muted-foreground'}">
							{step.title}
						</span>
					</div>
					{#if index < steps.length - 1}
						<div class="mx-3 h-0.5 w-10 {currentStep > index ? 'bg-primary' : 'bg-border'}"></div>
					{/if}
				{/each}
			</div>
		</nav>

		<section class="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
			{#if currentStep === 0}
				<div class="space-y-6" data-testid="setup-step-database">
					<div class="text-center">
						<Database class="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
						<h2 class="text-xl font-semibold tracking-normal text-foreground">
							{$_('setup.database.title', { default: '数据库配置' })}
						</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							{$_('setup.database.description', { default: '连接到您的 PostgreSQL 数据库' })}
						</p>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class={labelClass} for="setup-db-host">{$_('setup.database.host', { default: '主机' })}</label>
							<Input id="setup-db-host" data-testid="setup-db-host" bind:value={formData.database.host} />
						</div>
						<div>
							<label class={labelClass} for="setup-db-port">{$_('setup.database.port', { default: '端口' })}</label>
							<Input id="setup-db-port" data-testid="setup-db-port" type="number" bind:value={formData.database.port} />
						</div>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class={labelClass} for="setup-db-user">{$_('setup.database.username', { default: '用户名' })}</label>
							<Input id="setup-db-user" data-testid="setup-db-user" bind:value={formData.database.user} />
						</div>
						<div>
							<label class={labelClass} for="setup-db-password">{$_('setup.database.password', { default: '密码' })}</label>
							<Input id="setup-db-password" type="password" bind:value={formData.database.password} />
						</div>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class={labelClass} for="setup-db-name">{$_('setup.database.databaseName', { default: '数据库名称' })}</label>
							<Input id="setup-db-name" data-testid="setup-db-name" bind:value={formData.database.dbname} />
						</div>
						<div>
							<label class={labelClass} for="setup-db-ssl">{$_('setup.database.sslMode', { default: 'SSL 模式' })}</label>
							<NativeSelect id="setup-db-ssl" class="w-full" bind:value={formData.database.sslmode}>
								<option value="disable">{$_('setup.database.ssl.disable', { default: '禁用' })}</option>
								<option value="require">{$_('setup.database.ssl.require', { default: '要求' })}</option>
								<option value="verify-ca">{$_('setup.database.ssl.verifyCa', { default: '验证 CA' })}</option>
								<option value="verify-full">{$_('setup.database.ssl.verifyFull', { default: '完全验证' })}</option>
							</NativeSelect>
						</div>
					</div>

					<Button
						variant="outline"
						class="w-full"
						data-testid="setup-test-db"
						disabled={testingDb}
						onclick={() => void testDatabaseConnection()}
					>
						{#if testingDb}
							<Loader2 class="h-4 w-4 animate-spin" />
							{$_('setup.status.testing', { default: '测试中...' })}
						{:else if dbConnected}
							<CheckCircle2 class="h-4 w-4 text-emerald-500" />
							{$_('setup.status.success', { default: '连接成功' })}
						{:else}
							{$_('setup.status.testConnection', { default: '测试连接' })}
						{/if}
					</Button>
				</div>
			{:else if currentStep === 1}
				<div class="space-y-6" data-testid="setup-step-redis">
					<div class="text-center">
						<Server class="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
						<h2 class="text-xl font-semibold tracking-normal text-foreground">
							{$_('setup.redis.title', { default: 'Redis 配置' })}
						</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							{$_('setup.redis.description', { default: '连接到您的 Redis 服务器' })}
						</p>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class={labelClass} for="setup-redis-host">{$_('setup.redis.host', { default: '主机' })}</label>
							<Input id="setup-redis-host" data-testid="setup-redis-host" bind:value={formData.redis.host} />
						</div>
						<div>
							<label class={labelClass} for="setup-redis-port">{$_('setup.redis.port', { default: '端口' })}</label>
							<Input id="setup-redis-port" type="number" bind:value={formData.redis.port} />
						</div>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class={labelClass} for="setup-redis-password">{$_('setup.redis.password', { default: '密码（可选）' })}</label>
							<Input id="setup-redis-password" type="password" bind:value={formData.redis.password} />
						</div>
						<div>
							<label class={labelClass} for="setup-redis-db">{$_('setup.redis.database', { default: '数据库' })}</label>
							<Input id="setup-redis-db" type="number" bind:value={formData.redis.db} />
						</div>
					</div>
					<label class="flex items-center justify-between gap-4 rounded-md border border-border p-3">
						<span>
							<span class="block text-sm font-medium text-foreground">{$_('setup.redis.enableTls', { default: '启用 TLS' })}</span>
							<span class="block text-xs text-muted-foreground">{$_('setup.redis.enableTlsHint', { default: '连接 Redis 时使用 TLS' })}</span>
						</span>
						<Checkbox bind:checked={formData.redis.enable_tls} />
					</label>
					<Button
						variant="outline"
						class="w-full"
						data-testid="setup-test-redis"
						disabled={testingRedis}
						onclick={() => void testRedisConnection()}
					>
						{#if testingRedis}
							<Loader2 class="h-4 w-4 animate-spin" />
							{$_('setup.status.testing', { default: '测试中...' })}
						{:else if redisConnected}
							<CheckCircle2 class="h-4 w-4 text-emerald-500" />
							{$_('setup.status.success', { default: '连接成功' })}
						{:else}
							{$_('setup.status.testConnection', { default: '测试连接' })}
						{/if}
					</Button>
				</div>
			{:else if currentStep === 2}
				<div class="space-y-6" data-testid="setup-step-admin">
					<div class="text-center">
						<ShieldCheck class="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
						<h2 class="text-xl font-semibold tracking-normal text-foreground">
							{$_('setup.admin.title', { default: '管理员账户' })}
						</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							{$_('setup.admin.description', { default: '创建管理员账户' })}
						</p>
					</div>
					<div>
						<label class={labelClass} for="setup-admin-email">{$_('setup.admin.email', { default: '邮箱' })}</label>
						<Input id="setup-admin-email" data-testid="setup-admin-email" type="email" bind:value={formData.admin.email} />
					</div>
					<div>
						<label class={labelClass} for="setup-admin-password">{$_('setup.admin.password', { default: '密码' })}</label>
						<Input id="setup-admin-password" data-testid="setup-admin-password" type="password" bind:value={formData.admin.password} />
					</div>
					<div>
						<label class={labelClass} for="setup-admin-confirm">{$_('setup.admin.confirmPassword', { default: '确认密码' })}</label>
						<Input id="setup-admin-confirm" data-testid="setup-admin-confirm" type="password" bind:value={confirmPassword} />
						{#if passwordMismatch}
							<p class="mt-1 text-sm text-destructive" data-testid="setup-password-mismatch">
								{$_('setup.admin.passwordMismatch', { default: '密码不匹配' })}
							</p>
						{/if}
					</div>
				</div>
			{:else}
				<div class="space-y-6" data-testid="setup-step-ready">
					<div class="text-center">
						<RefreshCw class="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
						<h2 class="text-xl font-semibold tracking-normal text-foreground">
							{$_('setup.ready.title', { default: '准备安装' })}
						</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							{$_('setup.ready.description', { default: '检查您的配置并完成安装' })}
						</p>
					</div>
					<div class="space-y-4">
						<div class="rounded-md border border-border bg-muted p-4">
							<h3 class="mb-2 text-sm font-medium text-muted-foreground">{$_('setup.ready.database', { default: '数据库' })}</h3>
							<p class="break-words text-sm text-foreground">{formData.database.user}@{formData.database.host}:{formData.database.port}/{formData.database.dbname}</p>
						</div>
						<div class="rounded-md border border-border bg-muted p-4">
							<h3 class="mb-2 text-sm font-medium text-muted-foreground">{$_('setup.ready.redis', { default: 'Redis' })}</h3>
							<p class="break-words text-sm text-foreground">{formData.redis.host}:{formData.redis.port}</p>
						</div>
						<div class="rounded-md border border-border bg-muted p-4">
							<h3 class="mb-2 text-sm font-medium text-muted-foreground">{$_('setup.ready.adminEmail', { default: '管理员邮箱' })}</h3>
							<p class="break-words text-sm text-foreground">{formData.admin.email}</p>
						</div>
					</div>
				</div>
			{/if}

			{#if errorMessage}
				<div class="mt-6 rounded-md border border-destructive/30 bg-destructive/10 p-4" data-testid="setup-error">
					<div class="flex items-start gap-3">
						<AlertCircle class="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
						<p class="text-sm text-destructive">{errorMessage}</p>
					</div>
				</div>
			{/if}

			{#if installSuccess}
				<div class="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4" data-testid="setup-success">
					<div class="flex items-start gap-3">
						{#if serviceReady}
							<CheckCircle2 class="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
						{:else}
							<Loader2 class="mt-0.5 h-5 w-5 shrink-0 animate-spin text-emerald-500" />
						{/if}
						<div>
							<p class="text-sm font-medium text-emerald-600">
								{$_('setup.status.completed', { default: '安装完成！' })}
							</p>
							<p class="mt-1 text-sm text-emerald-600/80">
								{serviceReady
									? $_('setup.status.redirecting', { default: '跳转到登录页面中...' })
									: $_('setup.status.restarting', { default: '服务正在重启，请稍候...' })}
							</p>
						</div>
					</div>
				</div>
			{/if}

				<div class="mt-8 flex justify-between gap-3">
				{#if currentStep > 0 && !installSuccess}
					<Button
						variant="outline"
						data-testid="setup-back"
						onclick={() => {
							currentStep -= 1;
						}}
					>
						<ChevronLeft class="h-4 w-4" />
						{$_('common.back', { default: '返回' })}
					</Button>
				{:else}
					<span></span>
				{/if}

				{#if currentStep < 3}
					<Button
						data-testid="setup-next"
						disabled={!canMoveNext}
						onclick={nextStep}
					>
						{$_('common.next', { default: '下一步' })}
						<ChevronRight class="h-4 w-4" />
					</Button>
				{:else if !installSuccess}
					<Button
						data-testid="setup-install"
						disabled={installing}
						onclick={() => void performInstall()}
					>
						{#if installing}
							<Loader2 class="h-4 w-4 animate-spin" />
							{$_('setup.status.installing', { default: '安装中...' })}
						{:else}
							{$_('setup.status.completeInstallation', { default: '完成安装' })}
						{/if}
					</Button>
				{/if}
			</div>
		</section>
	</div>
</main>
