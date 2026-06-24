import { marked } from 'marked';
import DOMPurify from 'dompurify';

export interface TocItem {
	id: string;
	text: string;
	level: number;
}

export interface RenderMarkdownOptions {
	breaks?: boolean;
	allowIframes?: boolean;
	withHeadingIds?: boolean;
}

export interface RenderedMarkdown {
	html: string;
	toc: TocItem[];
}

const MARKDOWN_ASSET_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

export function renderMarkdown(
	content: string,
	options: RenderMarkdownOptions = {}
): RenderedMarkdown {
	if (!content.trim()) return { html: '', toc: [] };

	marked.setOptions({ breaks: options.breaks ?? true, gfm: true });
	const rawHtml = marked.parse(content) as string;
	const sanitized = DOMPurify.sanitize(rawHtml, {
		ADD_TAGS: options.allowIframes ? ['iframe'] : [],
		ADD_ATTR: options.allowIframes ? ['allowfullscreen', 'frameborder', 'src'] : []
	});

	if (!options.withHeadingIds) return { html: sanitized, toc: [] };
	return addHeadingIds(sanitized);
}

export function generateHeadingId(text: string, index: number): string {
	const base = text
		.toLowerCase()
		.replace(/[^\w\u4e00-\u9fff]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return base ? `${base}-${index}` : `heading-${index}`;
}

export function addHeadingIds(html: string): RenderedMarkdown {
	const toc: TocItem[] = [];
	let headingIndex = 0;
	const withIds = html.replace(
		/<(h[1-4])[^>]*>(.*?)<\/h[1-4]>/gi,
		(_, tag: string, content: string) => {
			const level = Number.parseInt(tag[1] ?? '1', 10);
			const text = content.replace(/<[^>]+>/g, '').trim();
			const id = generateHeadingId(text, headingIndex++);
			toc.push({ id, text, level });
			return `<${tag} id="${id}">${content}</${tag}>`;
		}
	);
	return { html: withIds, toc };
}

export function isRelativeMarkdownAsset(src: string): boolean {
	const trimmed = src.trim();
	if (
		!trimmed ||
		/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
		trimmed.startsWith('//') ||
		trimmed.startsWith('/')
	) {
		return false;
	}
	const [pathPart] = trimmed.split(/([?#].*)/, 2);
	return pathPart
		.split('/')
		.filter((part) => part && part !== '.')
		.every((part) => part !== '..' && !part.includes('\\'));
}

export function buildPageImageUrl(slug: string, src: string): string {
	const trimmed = src.trim();
	const [pathPart, suffix = ''] = trimmed.split(/([?#].*)/, 2);
	const encodedPath = pathPart
		.split('/')
		.filter((part) => part && part !== '.')
		.map((part) => encodeURIComponent(part))
		.join('/');
	return `/api/v1/pages/${encodeURIComponent(slug)}/images/${encodedPath}${suffix}`;
}

export function rewriteMarkdownImageSources(slug: string, raw: string): string {
	return raw.replace(MARKDOWN_ASSET_RE, (match, alt: string, src: string) => {
		return isRelativeMarkdownAsset(src)
			? `![${alt}](${buildPageImageUrl(slug, src)})`
			: match;
	});
}
