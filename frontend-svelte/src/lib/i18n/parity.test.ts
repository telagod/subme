/**
 * i18n parity test（POC 3）
 *
 * 目的：保证 zh / en 键集合完全一致 + 抽样 100 键非空字符串。
 * 失败语义：parity 不一致只报告 mismatch 数量，断言依然 PASS——
 * 修复属另一任务（Vue tree 主仓库），本仓库不负责回写。
 */
import { describe, it, expect } from 'vitest';

type Dict = Record<string, unknown>;

function flatten(obj: Dict, prefix = '', out: Record<string, string> = {}): Record<string, string> {
	for (const [k, v] of Object.entries(obj)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === 'object' && !Array.isArray(v)) {
			flatten(v as Dict, key, out);
		} else {
			out[key] = String(v);
		}
	}
	return out;
}

describe('i18n parity zh<->en', () => {
	it('locale modules load and flatten', async () => {
		const zhMod = await import('./locales/zh');
		const enMod = await import('./locales/en');

		const zhFlat = flatten(zhMod.default as Dict);
		const enFlat = flatten(enMod.default as Dict);

		const zhKeys = new Set(Object.keys(zhFlat));
		const enKeys = new Set(Object.keys(enFlat));

		const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
		const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));

		// 报告型断言：mismatch 数量打印到 stdout，不阻塞 CI。
		// eslint-disable-next-line no-console
		console.log(
			`[parity] zh=${zhKeys.size} en=${enKeys.size} missingInEn=${missingInEn.length} missingInZh=${missingInZh.length}`
		);
		if (missingInEn.length) {
			// eslint-disable-next-line no-console
			console.log('[parity] missingInEn sample:', missingInEn.slice(0, 10));
		}
		if (missingInZh.length) {
			// eslint-disable-next-line no-console
			console.log('[parity] missingInZh sample:', missingInZh.slice(0, 10));
		}

		// Hard contract: 键集合完全一致。
		expect(zhKeys.size).toBe(enKeys.size);
		expect(missingInEn).toEqual([]);
		expect(missingInZh).toEqual([]);

		// Sample 100 random keys — both locales must have non-empty strings.
		const allKeys = [...zhKeys];
		const sampleSize = Math.min(100, allKeys.length);
		for (let i = 0; i < sampleSize; i++) {
			const idx = Math.floor(Math.random() * allKeys.length);
			const key = allKeys[idx];
			expect(zhFlat[key], `zh.${key} empty`).toBeTruthy();
			expect(enFlat[key], `en.${key} empty`).toBeTruthy();
		}
	});
});
