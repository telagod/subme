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
	 * 菜单项支持上移/下移重排，emit 时同步归一化 sort_order，保持 backend 兼容。
	 *
	 * Sentinel：visibility 走 'user' / 'admin'，绝不出 ''。
 */
	import { _ } from 'svelte-i18n';
	import { ChevronDown, ChevronUp, X } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';

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
	function moveMenu(i: number, direction: -1 | 1) {
		const target = i + direction;
		if (target < 0 || target >= menuItems.length) return;
		const next = [...menuItems];
		[next[i], next[target]] = [next[target], next[i]];
		menuItems = next.map((m, idx) => ({ ...m, sort_order: idx }));
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
					<Button
						variant="ghost"
						size="icon"
						aria-label="remove endpoint"
						class="h-7 w-7 text-destructive hover:bg-destructive/10"
						onclick={() => removeEp(i)}
					>
						<X class="h-3 w-3" />
					</Button>
				</div>
				<div class="grid grid-cols-1 gap-3 p-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
					<label class="block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.site.customEndpoints.name')}
						</span>
						<Input
							type="text"
							class="h-9"
							value={ep.name}
							oninput={(e) => patchEp(i, 'name', (e.target as HTMLInputElement).value)}
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.site.customEndpoints.endpointUrl')}
						</span>
						<Input
							type="url"
							class="h-9 font-mono text-xs"
							value={ep.endpoint}
							oninput={(e) => patchEp(i, 'endpoint', (e.target as HTMLInputElement).value)}
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.site.customEndpoints.descriptionLabel')}
						</span>
						<Input
							type="text"
							class="h-9"
							value={ep.description}
							oninput={(e) => patchEp(i, 'description', (e.target as HTMLInputElement).value)}
						/>
					</label>
				</div>
			</div>
		{/each}
		<Button
			variant="outline"
			data-testid="custom-endpoint-add"
			class="h-9 w-full border-dashed text-xs text-muted-foreground hover:border-ring hover:text-foreground"
			onclick={addEp}
		>
			+ {$_('admin.settings.site.customEndpoints.add')}
		</Button>
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
					<div class="flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon"
							aria-label={$_('admin.settings.customMenu.moveUp')}
							title={$_('admin.settings.customMenu.moveUp')}
							data-testid={`custom-menu-move-up-${i}`}
							disabled={i === 0}
							class="h-7 w-7"
							onclick={() => moveMenu(i, -1)}
						>
							<ChevronUp class="h-3.5 w-3.5" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							aria-label={$_('admin.settings.customMenu.moveDown')}
							title={$_('admin.settings.customMenu.moveDown')}
							data-testid={`custom-menu-move-down-${i}`}
							disabled={i === menuItems.length - 1}
							class="h-7 w-7"
							onclick={() => moveMenu(i, 1)}
						>
							<ChevronDown class="h-3.5 w-3.5" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							aria-label={$_('admin.settings.customMenu.remove')}
							title={$_('admin.settings.customMenu.remove')}
							class="h-7 w-7 text-destructive hover:bg-destructive/10"
							onclick={() => removeMenu(i)}
						>
							<X class="h-3 w-3" />
						</Button>
					</div>
				</div>
				<div class="grid gap-3 p-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
					<label class="block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.customMenu.name')}
						</span>
						<Input
							type="text"
							class="h-9"
							value={item.label}
							oninput={(e) => patchMenu(i, 'label', (e.target as HTMLInputElement).value)}
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.customMenu.url')}
						</span>
						<Input
							type="url"
							class="h-9 font-mono text-xs"
							value={item.url}
							oninput={(e) => patchMenu(i, 'url', (e.target as HTMLInputElement).value)}
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.customMenu.visibility')}
						</span>
						<NativeSelect
							class="h-9 w-full"
							value={item.visibility}
							onchange={(e) => patchMenu(i, 'visibility', (e.target as HTMLSelectElement).value)}
						>
							<option value="user">{$_('admin.settings.customMenu.visibilityUser')}</option>
							<option value="admin">{$_('admin.settings.customMenu.visibilityAdmin')}</option>
						</NativeSelect>
					</label>
					<label class="col-span-full block">
						<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
							{$_('admin.settings.customMenu.iconSvg')}
						</span>
						<Textarea
							rows={2}
							class="font-mono text-[11px]"
							value={item.icon_svg}
							oninput={(e) => patchMenu(i, 'icon_svg', (e.target as HTMLTextAreaElement).value)}
						/>
					</label>
				</div>
			</div>
		{/each}
		<Button
			variant="outline"
			data-testid="custom-menu-add"
			class="h-9 w-full border-dashed text-xs text-muted-foreground hover:border-ring hover:text-foreground"
			onclick={addMenu}
		>
			+ {$_('admin.settings.customMenu.add')}
		</Button>
	</div>
</div>
