import type {
	UserAvailableChannel,
	UserAvailableGroup,
	UserChannelPlatformSection,
	UserSupportedModel
} from '$lib/api/user/channels';
import { perTokenToMTok } from '$lib/utils/pricing';

export function filterAvailableChannels(
	channels: UserAvailableChannel[],
	query: string
): UserAvailableChannel[] {
	const q = query.trim().toLowerCase();
	if (!q) return channels;
	return channels
		.map((channel) => {
			const nameHit = channel.name.toLowerCase().includes(q);
			const descHit = (channel.description || '').toLowerCase().includes(q);
			if (nameHit || descHit) return channel;
			const platforms = channel.platforms.filter((section) => sectionMatches(section, q));
			return platforms.length ? { ...channel, platforms } : null;
		})
		.filter((channel): channel is UserAvailableChannel => channel !== null);
}

function sectionMatches(section: UserChannelPlatformSection, query: string): boolean {
	return (
		section.platform.toLowerCase().includes(query) ||
		section.groups.some((group) => group.name.toLowerCase().includes(query)) ||
		section.supported_models.some((model) => model.name.toLowerCase().includes(query))
	);
}

export function exclusiveGroups(section: UserChannelPlatformSection): UserAvailableGroup[] {
	return section.groups.filter((group) => group.is_exclusive);
}

export function publicGroups(section: UserChannelPlatformSection): UserAvailableGroup[] {
	return section.groups.filter((group) => !group.is_exclusive);
}

export function modelPricingLabel(model: UserSupportedModel): string {
	const pricing = model.pricing;
	if (!pricing) return 'No pricing';
	switch (pricing.billing_mode) {
		case 'token':
			return [
				pricePart('in', pricing.input_price, '/1M'),
				pricePart('out', pricing.output_price, '/1M')
			].filter(Boolean).join(' · ') || 'Token pricing';
		case 'per_request':
			return pricing.per_request_price == null ? 'Per request' : `$${pricing.per_request_price}/request`;
		case 'image':
			return pricing.image_output_price == null ? 'Image pricing' : `$${pricing.image_output_price}/image`;
		default:
			return pricing.billing_mode || 'Pricing';
	}
}

function pricePart(label: string, perTokenValue: number | null, unit: string): string {
	if (perTokenValue == null) return '';
	const mtok = perTokenToMTok(perTokenValue);
	if (mtok === null) return '';
	return `${label} $${mtok}${unit}`;
}

export function groupRateLabel(group: UserAvailableGroup, userRates: Record<number, number>): string {
	const effective = userRates[group.id] ?? group.rate_multiplier;
	return `${Number(effective || 1).toFixed(2)}x`;
}

export function platformTone(platform: string): string {
	const p = platform.toLowerCase();
	if (p.includes('openai')) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
	if (p.includes('anthropic')) return 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300';
	if (p.includes('gemini') || p.includes('google')) return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
	if (p.includes('antigravity')) return 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300';
	return 'border-border bg-background text-muted-foreground';
}
