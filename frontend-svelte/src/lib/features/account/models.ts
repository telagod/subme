/**
 * Platform model registry for whitelist selection.
 * Keep in sync with backend curated lists.
 */

const openaiModels = [
	'gpt-5.2', 'gpt-5.2-pro',
	'gpt-5.4', 'gpt-5.4-mini',
	'gpt-5.3-codex', 'gpt-5.3-codex-spark',
	'gpt-4o-audio-preview', 'gpt-4o-realtime-preview',
	'gpt-image-1', 'gpt-image-1.5', 'gpt-image-2'
];

const claudeModels = [
	'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022',
	'claude-3-7-sonnet-20250219',
	'claude-sonnet-4-20250514', 'claude-opus-4-20250514',
	'claude-opus-4-1-20250805',
	'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001',
	'claude-opus-4-5-20251101',
	'claude-opus-4-6', 'claude-opus-4-7', 'claude-opus-4-8',
	'claude-sonnet-4-6'
];

const geminiModels = [
	'gemini-3.1-flash-image', 'gemini-2.5-flash-image',
	'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro',
	'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3-pro-preview'
];

const antigravityModels = [
	'claude-opus-4-6', 'claude-opus-4-6-thinking',
	'claude-opus-4-7', 'claude-opus-4-8',
	'claude-opus-4-5-thinking',
	'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4-5-thinking',
	'gemini-3.1-flash-image', 'gemini-2.5-flash-image',
	'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-thinking',
	'gemini-2.5-pro',
	'gemini-3-flash', 'gemini-3-pro-high', 'gemini-3-pro-low',
	'gemini-3.1-pro-high', 'gemini-3.1-pro-low', 'gemini-3-pro-image',
	'gpt-oss-120b-medium', 'tab_flash_lite_preview'
];

const platformModelMap: Record<string, string[]> = {
	openai: openaiModels,
	claude: claudeModels,
	anthropic: claudeModels,
	gemini: geminiModels,
	antigravity: antigravityModels,
	sora: openaiModels,
	codex: openaiModels
};

export interface ModelOption {
	value: string;
	label: string;
}

export function getModelsByPlatform(platform: string): string[] {
	return platformModelMap[platform.toLowerCase()] ?? [];
}

export function getAllModels(): ModelOption[] {
	const seen = new Set<string>();
	const result: ModelOption[] = [];
	for (const models of Object.values(platformModelMap)) {
		for (const m of models) {
			if (!seen.has(m)) {
				seen.add(m);
				result.push({ value: m, label: m });
			}
		}
	}
	return result;
}

export function getModelsForPlatforms(platforms: string[]): ModelOption[] {
	const seen = new Set<string>();
	const result: ModelOption[] = [];
	for (const p of platforms) {
		for (const m of getModelsByPlatform(p)) {
			if (!seen.has(m)) {
				seen.add(m);
				result.push({ value: m, label: m });
			}
		}
	}
	return result.length ? result : getAllModels();
}
