<script lang="ts">
	/**
	 * CustomMenuSection · 自定义菜单 + custom endpoints 复合 special section（M10）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/CustomMenuSection.vue。
	 *
	 * 两块独立 list（顺次 emit 'custom_endpoints' 与 'custom_menu_items'）：
	 *   - Custom Endpoints：name / endpoint / description
	 *   - Custom Menu Items：id / label / icon_svg / url / visibility / sort_order
	 *
	 * 不可重排：M10 不支持菜单项上下移（Vue tree 有，列入 backlog）—— 但保留 sort_order 字段
	 * 以保证 backend 兼容。
	 *
	 * Sentinel：visibility 走 'user' / 'admin'，绝不出 ''。
	 */
	import { _ } from 'svelte-i18n';

	type FieldUpdate = { key: string; value: unknown };

	type MenuItem = {
		id: string;
		label: string;
		icon_svg: string;
		url: string;
		visibility: 'user' | 'admin';
		sort_order: number;
	};

	type CustomEndpoint = {
		name: string;
		endpoint: string;
		description: string;
	};

	type Props = {
		values: Record<string, unknown>;
		dirtyKeys: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	const { values, onFieldUpdate }: Props = $props();

	function cloneMenu(raw: unknown): MenuItem[] {
		if (!Array.isArray(raw)) return [];
		return raw.map((it) => ({
			id: String((it as MenuItem)?.id ?? ''),
			label: String((it as MenuItem)?.label ?? ''),
			icon_svg: String((it as MenuItem)?.icon_svg ?? ''),
			url: String((it as MenuItem)?.url ?? ''),
			visibility: ((it as MenuItem)?.visibility === 'admin' ? 'admin' : 'user') as 'user' | 'admin',
			sort_order: Number((it as MenuItem)?.sort_order ?? 0)
		}));
	}

	function cloneEp(raw: unknown): CustomEndpoint[] {
		if (!Array.isArray(raw)) return [];
		return raw.map((it) => ({
			name: String((it as CustomEndpoint)?.name ?? ''),
			endpoint: String((it as CustomEndpoint)?.endpoint ?? ''),
			description: String((it as CustomEndpoint)?.description ?? '')
		}));
	}

	let menuItems = $state<MenuItem[]>([]);
	let endpoints = $state<CustomEndpoint[]>([]);
	let _initMenu = false;
	let _initEp = false;

	$effect(() => {
		const incoming = cloneMenu(values['custom_menu_items']);
		if (!_initMenu) {
			menuItems = incoming;
			_initMenu = true;
			return;
		}
		if (JSON.stringify(incoming) !== JSON.stringify(menuItems)) menuItems = incoming;
	});
	$effect(() => {
		const incoming = cloneEp(values['custom_endpoints']);
		if (!_initEp) {
			endpoints = incoming;
			_initEp = true;
			return;
		}
		if (JSON.stringify(incoming) !== JSON.stringify(endpoints)) endpoints = incoming;
	});

	function emitMenu() {
		onFieldUpdate?.({ key: 'custom_menu_items', value: menuItems.map((m) => ({ ...m })) });
	}
	function emitEndpoints() {
		onFieldUpdate?.({ key: 'custom_endpoints', value: endpoints.map((m) => ({ ...m })) });
	}

	function addMenu() {
		menuItems = [
			...menuItems,
			{ id: '', label: '', icon_svg: '', url: '', visibility: 'user', sort_order: menuItems.length }
		];
		emitMenu();
	}
	function removeMenu(i: number) {
		menuItems = menuItems.filter((_, idx) => idx !== i).map((m, idx) => ({ ...m, sort_order: idx }));
		emitMenu();
	}
	function patchMenu(i: number, key: keyof MenuItem, val: string) {
		const next = menuItems.map((m, idx) => (idx === i ? { ...m, [key]: val } : m));
		menuItems = next;
		emitMenu();
	}

	function addEp() {
		endpoints = [...endpoints, { name: '', endpoint: '', description: '' }];
		emitEndpoints();
	}
	function removeEp(i: number) {
		endpoints = endpoints.filter((_, idx) => idx !== i);
		emitEndpoints();
	}
	function patchEp(i: number, key: keyof CustomEndpoint, val: string) {
		endpoints = endpoints.map((m, idx) => (idx === i ? { ...m, [key]: val } : m));
		emitEndpoints();
	}
</script>

<div class="flex flex-col gap-6" data-special="custom-menu">
	<div class="flex flex-col gap-3">
		<p class="text-[11.5px] leading-snug text-muted-foreground">
			{$_('admin.settings.site.customEndpoints.description')}
		</p>
		{#each endpoints as ep, i (i)}
			<div class="overflow-hidden rounded-md border border-border bg-card" data-testid="custom-endpoint-row">
				<div class="flex items-center justify-between gap-2.5 border-b border-border px-3 py-2">
					<span class="text-xs font-semibold text-foreground">
						{$_('admin.settings.site.customEndpoints.itemLabel', { values: { n: i + 1 } })}
					</span>
					<button
						type="button"
						aria-label="remove endpoint"
						class="inline-flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10"
						onclick={() => removeEp(i)}>×</button
					>
				</div>
				<div class="grid grid-cols-1 gap-3 p-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
					<label class="block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.site.customEndpoints.name')}
						</span>
						<input
							type="text"
							class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
							value={ep.name}
							oninput={(e) => patchEp(i, 'name', (e.target as HTMLInputElement).value)}
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.site.customEndpoints.endpointUrl')}
						</span>
						<input
							type="url"
							class="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-xs"
							value={ep.endpoint}
							oninput={(e) => patchEp(i, 'endpoint', (e.target as HTMLInputElement).value)}
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.site.customEndpoints.descriptionLabel')}
						</span>
						<input
							type="text"
							class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
							value={ep.description}
							oninput={(e) => patchEp(i, 'description', (e.target as HTMLInputElement).value)}
						/>
					</label>
				</div>
			</div>
		{/each}
		<button
			type="button"
			data-testid="custom-endpoint-add"
			class="inline-flex h-9 w-full items-center justify-center rounded-md border border-dashed border-input bg-background text-xs text-muted-foreground hover:border-ring hover:text-foreground"
			onclick={addEp}>+ {$_('admin.settings.site.customEndpoints.add')}</button
		>
	</div>

	<div class="flex flex-col gap-3 border-t border-border pt-5">
		<p class="text-[11.5px] leading-snug text-muted-foreground">
			{$_('admin.settings.customMenu.description')}
		</p>
		{#each menuItems as item, i (i)}
			<div class="overflow-hidden rounded-md border border-border bg-card" data-testid="custom-menu-row">
				<div class="flex items-center justify-between gap-2.5 border-b border-border px-3 py-2">
					<span class="text-xs font-semibold text-foreground">
						{$_('admin.settings.customMenu.itemLabel', { values: { n: i + 1 } })}
					</span>
					<button
						type="button"
						aria-label="remove menu item"
						class="inline-flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10"
						onclick={() => removeMenu(i)}>×</button
					>
				</div>
				<div class="grid gap-3 p-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
					<label class="block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.customMenu.name')}
						</span>
						<input
							type="text"
							class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
							value={item.label}
							oninput={(e) => patchMenu(i, 'label', (e.target as HTMLInputElement).value)}
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.customMenu.url')}
						</span>
						<input
							type="url"
							class="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-xs"
							value={item.url}
							oninput={(e) => patchMenu(i, 'url', (e.target as HTMLInputElement).value)}
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.customMenu.visibility')}
						</span>
						<select
							class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
							value={item.visibility}
							onchange={(e) => patchMenu(i, 'visibility', (e.target as HTMLSelectElement).value)}
						>
							<option value="user">{$_('admin.settings.customMenu.visibilityUser')}</option>
							<option value="admin">{$_('admin.settings.customMenu.visibilityAdmin')}</option>
						</select>
					</label>
					<label class="col-span-full block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.customMenu.iconSvg')}
						</span>
						<textarea
							rows="2"
							class="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-[11px]"
							value={item.icon_svg}
							oninput={(e) => patchMenu(i, 'icon_svg', (e.target as HTMLTextAreaElement).value)}
						></textarea>
					</label>
				</div>
			</div>
		{/each}
		<button
			type="button"
			data-testid="custom-menu-add"
			class="inline-flex h-9 w-full items-center justify-center rounded-md border border-dashed border-input bg-background text-xs text-muted-foreground hover:border-ring hover:text-foreground"
			onclick={addMenu}>+ {$_('admin.settings.customMenu.add')}</button
		>
	</div>
</div>
