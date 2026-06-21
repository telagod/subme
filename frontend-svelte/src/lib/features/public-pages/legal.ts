import type { LoginAgreementDocument, PublicSettings } from '$lib/api/auth';
import { sanitizeUrl } from './url';

export type LegalDocumentIcon = 'document' | 'shield' | 'globe' | 'cog';

export function findLegalDocument(
	settings: PublicSettings | null | undefined,
	documentId: string
): LoginAgreementDocument | null {
	if (!documentId) return null;
	return (settings?.login_agreement_documents ?? []).find((doc) => doc.id === documentId) ?? null;
}

export function documentIconForTitle(title: string | null | undefined): LegalDocumentIcon {
	const value = title ?? '';
	if (value.includes('政策') || value.includes('隐私')) return 'shield';
	if (value.includes('国家') || value.includes('地区')) return 'globe';
	if (value.includes('特定')) return 'cog';
	return 'document';
}

export function legalSiteLogo(settings: PublicSettings | null | undefined): string {
	return sanitizeUrl(settings?.site_logo, { allowRelative: true, allowDataUrl: true });
}
