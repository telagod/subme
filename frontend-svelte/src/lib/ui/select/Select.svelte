<script lang="ts">
	/**
	 * Select sentinel contract（POC 3）
	 *
	 * 历史教训（Vue tree memory: reshadcn-migration）：
	 *   shadcn-vue Select 禁止空字符串 value——必须显式 sentinel（'__all__' / '__none__'）
	 *   + 查询参数还原。禁止再封装一层"哨兵补丁"层，因为补丁会把契约破坏点
	 *   推到调用方各处，反而扩大故障半径。
	 *
	 * 本 Svelte 版本沿用同一铁律：
	 *   - script load 阶段直接 throw（空串 / null / undefined）
	 *   - 调用方必须传 '__all__'、'__none__' 或真实业务值
	 *   - 后续 POC 会补 eslint 静态规则；本 POC 仅运行时哨兵
	 */
	import { createEventDispatcher } from 'svelte';

	export let value: string;

	if (value === '' || value == null) {
		throw new Error(
			`[Select sentinel] value must be a non-empty string; received ${JSON.stringify(value)}. ` +
				`Use a sentinel like '__all__' or '__none__' instead of empty string.`
		);
	}

	const dispatch = createEventDispatcher<{ select: string }>();

	function handleClick() {
		dispatch('select', value);
	}
</script>

<button type="button" data-testid="select-trigger" data-value={value} on:click={handleClick}>
	<slot>{value}</slot>
</button>
