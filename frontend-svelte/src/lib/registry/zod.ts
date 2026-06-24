/**
 * Settings Registry · Zod 动态 schema 构造器（POC 4）
 *
 * 设计：
 *   - 从 SectionDef[] 推一个 ZodObject，保存前对 dirty payload 走 .safeParse
 *     拦截类型异常（如 smtp_port 不是 number、空 required 字段）。
 *   - 不取代后端校验 —— 仅为前端阻挡显然不合法的提交，减少一次往返。
 *   - 所有字段默认 optional()（patch 语义）；required 仅对**当前提交中出现的键**生效。
 *     这与 buildPatch 的"仅发 dirty key"语义闭环：required 校验只检查发出去的字段。
 *
 * 不在 schema 里编码 sentinel 逻辑：sentinel 转换发生在 FieldRenderer 输入侧，
 * 写入 form 的值已经是真实业务值或 undefined（'__unset__' → undefined）。
 */
import { z, type ZodTypeAny } from 'zod';
import type { Field, SectionDef } from './types';

function fieldSchema(field: Field): ZodTypeAny {
	let s: ZodTypeAny;
	switch (field.type) {
		case 'switch':
		case 'checkbox':
			s = z.boolean();
			break;
		case 'number': {
			let ns = z.number();
			if (typeof field.min === 'number') ns = ns.min(field.min);
			if (typeof field.max === 'number') ns = ns.max(field.max);
			s = ns;
			break;
		}
		case 'json':
			// json 字段：值可能是 string（原 textarea）或解析后的 object/array。
			// patch 语义下 passthrough，不强类型。
			s = z.unknown();
			break;
		case 'image':
		case 'select':
		case 'text':
		case 'password':
		case 'textarea':
		default: {
			const ss = z.string();
			s = field.required ? ss.min(1) : ss;
			break;
		}
	}
	// patch 语义：未被 dirty 的字段不出现 → optional 永远兜底。
	return s.optional();
}

/** 把一组 section 平铺成 { key: ZodSchema } 后构造 ZodObject。 */
export function buildZodSchema(sections: SectionDef[]) {
	const shape: Record<string, ZodTypeAny> = {};
	for (const sec of sections) {
		if (!sec.fields) continue;
		for (const f of sec.fields) {
			shape[f.key] = fieldSchema(f);
		}
	}
	// passthrough：special section 自带的字段（如 smtp_*）不在 shape 里，
	// 不应被 strict 模式吃掉。
	return z.object(shape).passthrough();
}
