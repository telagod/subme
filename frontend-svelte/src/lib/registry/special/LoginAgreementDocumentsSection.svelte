<script lang="ts">
	/**
	 * LoginAgreementDocumentsSection · 登录条款 Markdown 文档列表（M10d · agreement tab）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/AgreementDocumentsSection.vue。
	 *
	 * 契约：
	 *   - 与 flat-form 同流水线 —— 整组文档 [{id,title,content_md}] 作为单一 key
	 *     `login_agreement_documents` 上抛父级，父级把它当成一个 dirty 字段送进 patch。
	 *   - login_agreement_enabled=true 时禁止删除最后一条（与 Vue tree 同语义）。
	 *   - 与父级 form 单向同步：父级 reset / 拉新快照时 $effect 检测并刷新本地副本。
	 *
	 * 之所以是 special：每条文档是 {id,title,content_md} 复合记录，FieldRenderer
	 * 的 9 类原子字段无法表达；用 special 把"按文档分卡 + Markdown textarea"包成黑盒。
	 */
	import { _ } from 'svelte-i18n';

	type FieldUpdate = { key: string; value: unknown };

	type AgreementDoc = {
		id: string;
		title: string;
		content_md: string;
	};

	type Props = {
		values: Record<string, unknown>;
		dirtyKeys?: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { values, dirtyKeys: _d, onFieldUpdate }: Props = $props();

	function cloneDocs(raw: unknown): AgreementDoc[] {
		if (!Array.isArray(raw)) return [];
		return raw.map((d) => ({
			id: String((d as AgreementDoc)?.id ?? ''),
			title: String((d as AgreementDoc)?.title ?? ''),
			content_md: String((d as AgreementDoc)?.content_md ?? '')
		}));
	}

	let localDocs = $state<AgreementDoc[]>([]);
	let _initialized = false;

	// 单向同步：父级 form 改了（reset / load）→ 拉回本地。
	$effect(() => {
		const incoming = cloneDocs(values['login_agreement_documents']);
		if (!_initialized) {
			localDocs = incoming;
			_initialized = true;
			return;
		}
		if (JSON.stringify(incoming) !== JSON.stringify(localDocs)) {
			localDocs = incoming;
		}
	});

	const agreementEnabled = $derived(values['login_agreement_enabled'] === true);

	function emit() {
		onFieldUpdate?.({
			key: 'login_agreement_documents',
			value: localDocs.map((d) => ({ ...d }))
		});
	}

	function addDocument() {
		localDocs = [...localDocs, { id: '', title: '', content_md: '' }];
		emit();
	}

	function removeDocument(index: number) {
		localDocs = localDocs.filter((_, i) => i !== index);
		emit();
	}

	function onTitleInput(index: number, e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		localDocs = localDocs.map((d, i) => (i === index ? { ...d, title: raw } : d));
		emit();
	}

	function onIdInput(index: number, e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		localDocs = localDocs.map((d, i) => (i === index ? { ...d, id: raw } : d));
		emit();
	}

	function onContentInput(index: number, e: Event) {
		const raw = (e.target as HTMLTextAreaElement).value;
		localDocs = localDocs.map((d, i) => (i === index ? { ...d, content_md: raw } : d));
		emit();
	}
</script>

<div class="flex flex-col gap-4" data-special="login-agreement-documents">
	<!-- header row -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<p class="m-0 text-xs leading-relaxed text-muted-foreground">
			{$_('admin.settings.agreement.docsHint')}
		</p>
		<button
			type="button"
			data-testid="agreement-doc-add"
			onclick={addDocument}
			class="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs hover:bg-accent"
		>
			+ {$_('admin.settings.agreement.addDoc')}
		</button>
	</div>

	<!-- documents -->
	{#if localDocs.length === 0}
		<p
			data-testid="agreement-doc-empty"
			class="m-0 text-sm text-muted-foreground"
		>
			{$_('admin.settings.agreement.noDocs')}
		</p>
	{:else}
		<div class="flex flex-col gap-3">
			{#each localDocs as doc, index (index)}
				<div
					data-testid="agreement-doc-row"
					data-doc-index={index}
					class="overflow-hidden rounded-md border border-border bg-card"
				>
					<!-- card header -->
					<div
						class="flex items-center justify-between gap-3 border-b border-border px-3 py-2"
					>
						<div class="min-w-0">
							<p class="m-0 truncate text-sm font-semibold text-foreground">
								{doc.title || $_('admin.settings.agreement.unnamedDoc')}
							</p>
							<p class="m-0 truncate text-[11px] text-muted-foreground">
								/legal/{doc.id || '…'}
							</p>
						</div>
						<button
							type="button"
							data-testid="agreement-doc-remove"
							disabled={agreementEnabled && localDocs.length <= 1}
							onclick={() => removeDocument(index)}
							class="inline-flex h-7 items-center justify-center rounded-md border border-input bg-background px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
						>
							✕
						</button>
					</div>

					<!-- fields grid -->
					<div class="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
						<div class="flex flex-col gap-1">
							<label
								class="text-xs font-medium text-muted-foreground"
								for="agreement-doc-title-{index}"
							>
								{$_('admin.settings.agreement.docTitle')}
							</label>
							<input
								id="agreement-doc-title-{index}"
								type="text"
								data-testid="agreement-doc-title"
								placeholder={$_('admin.settings.agreement.docTitlePlaceholder')}
								value={doc.title}
								oninput={(e) => onTitleInput(index, e)}
								class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label
								class="text-xs font-medium text-muted-foreground"
								for="agreement-doc-slug-{index}"
							>
								{$_('admin.settings.agreement.docSlug')}
							</label>
							<div
								class="flex h-9 overflow-hidden rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring"
							>
								<span
									class="inline-flex items-center border-r border-input bg-muted px-2.5 text-xs whitespace-nowrap text-muted-foreground"
								>
									/legal/
								</span>
								<input
									id="agreement-doc-slug-{index}"
									type="text"
									data-testid="agreement-doc-slug"
									placeholder="usage-policy"
									value={doc.id}
									oninput={(e) => onIdInput(index, e)}
									class="min-w-0 flex-1 bg-transparent px-2 text-sm focus:outline-none"
								/>
							</div>
						</div>
					</div>

					<!-- content textarea -->
					<div class="flex flex-col gap-1 px-3 pb-3">
						<label
							class="text-xs font-medium text-muted-foreground"
							for="agreement-doc-content-{index}"
						>
							{$_('admin.settings.agreement.docContent')}
						</label>
						<textarea
							id="agreement-doc-content-{index}"
							rows="8"
							data-testid="agreement-doc-content"
							placeholder={$_('admin.settings.agreement.docContentPlaceholder')}
							value={doc.content_md}
							oninput={(e) => onContentInput(index, e)}
							class="resize-y rounded-md border border-input bg-background p-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
						></textarea>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
