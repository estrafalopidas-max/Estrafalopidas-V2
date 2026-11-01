import { DEFAULT_LOGO_BASE64 } from '../../domain/services/default-logo-base64';

export type BrandingVariantKey = 'primary' | 'secondary';

export interface BrandingVariantOption {
  key: BrandingVariantKey;
  label: string;
  shortLabel: string;
  url: string;
}

export interface ResolvedBrandingState {
  activeVariant: BrandingVariantKey;
  activeUrl: string;
  cacheTimestamp: number | null;
  variants: BrandingVariantOption[];
  hasSecondaryVariant: boolean;
}

export const PRIMARY_INSTITUTIONAL_LOGO_PATH = '/logo-institucional.png';
export const SECONDARY_BRANDING_LOGO_PATH = '/assets/aistudio/logo_html_859fb25c.png';
export const FALLBACK_PUBLIC_LOGO_PATH = '/logo.png';

export function extractCacheTimestamp(urlOrRaw: string | null | undefined): number | null {
  if (!urlOrRaw || typeof urlOrRaw !== 'string') return null;
  const trimmed = urlOrRaw.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;

  const match = trimmed.match(/[?&]t=(\d+)/i);
  if (match && match[1]) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

export function stripQueryParams(url: string): string {
  if (!url || url.startsWith('data:')) return url;
  const qIdx = url.indexOf('?');
  return qIdx >= 0 ? url.slice(0, qIdx) : url;
}

export function applyCacheBustingTimestamp(
  logoPath: string,
  timestamp?: number | string | null
): string {
  if (!logoPath || typeof logoPath !== 'string') return DEFAULT_LOGO_BASE64;
  const trimmed = logoPath.trim();
  if (!trimmed) return DEFAULT_LOGO_BASE64;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  const existingTs = extractCacheTimestamp(trimmed);
  const numericTs =
    typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0
      ? Math.floor(timestamp)
      : typeof timestamp === 'string' && /^\d+$/.test(timestamp.trim())
      ? Number(timestamp.trim())
      : existingTs;

  const basePath = stripQueryParams(trimmed);
  if (!numericTs || numericTs <= 0) {
    return basePath;
  }

  return `${basePath}?t=${numericTs}`;
}

export interface BrandingResolutionInput {
  adminLogoUrl?: string | null;
  adminLogoDataUrl?: string | null;
  secondaryLogoUrl?: string | null;
  snapshotUpdatedAtMs?: number | null;
  selectedVariant?: BrandingVariantKey;
}

export function resolveInstitutionalBranding(
  input: BrandingResolutionInput = {}
): ResolvedBrandingState {
  const adminTimestamp =
    extractCacheTimestamp(input.adminLogoUrl) ??
    (typeof input.snapshotUpdatedAtMs === 'number' &&
    Number.isFinite(input.snapshotUpdatedAtMs) &&
    input.snapshotUpdatedAtMs > 0
      ? Math.floor(input.snapshotUpdatedAtMs)
      : null);

  const rawPrimaryPath =
    input.adminLogoUrl && input.adminLogoUrl.trim().length > 0
      ? input.adminLogoUrl.trim()
      : input.adminLogoDataUrl && input.adminLogoDataUrl.trim().startsWith('data:')
      ? input.adminLogoDataUrl.trim()
      : PRIMARY_INSTITUTIONAL_LOGO_PATH;

  const primaryUrl = applyCacheBustingTimestamp(rawPrimaryPath, adminTimestamp);

  const rawSecondaryPath =
    input.secondaryLogoUrl && input.secondaryLogoUrl.trim().length > 0
      ? input.secondaryLogoUrl.trim()
      : stripQueryParams(rawPrimaryPath) === SECONDARY_BRANDING_LOGO_PATH
      ? PRIMARY_INSTITUTIONAL_LOGO_PATH
      : SECONDARY_BRANDING_LOGO_PATH;

  const secondaryUrl = applyCacheBustingTimestamp(rawSecondaryPath, adminTimestamp);

  const variants: BrandingVariantOption[] = [
    {
      key: 'primary',
      label: 'Escudo Institucional Oficial',
      shortLabel: 'Oficial',
      url: primaryUrl,
    },
  ];

  const normalizedPrimaryBase = stripQueryParams(primaryUrl);
  const normalizedSecondaryBase = stripQueryParams(secondaryUrl);

  if (normalizedSecondaryBase && normalizedSecondaryBase !== normalizedPrimaryBase) {
    variants.push({
      key: 'secondary',
      label: 'Variante Institucional Secundaria',
      shortLabel: 'Alterno',
      url: secondaryUrl,
    });
  }

  const hasSecondaryVariant = variants.length > 1;
  const activeVariant: BrandingVariantKey =
    hasSecondaryVariant && input.selectedVariant === 'secondary' ? 'secondary' : 'primary';

  const activeOption = variants.find((v) => v.key === activeVariant) || variants[0];

  return {
    activeVariant,
    activeUrl: activeOption.url,
    cacheTimestamp: adminTimestamp,
    variants,
    hasSecondaryVariant,
  };
}
