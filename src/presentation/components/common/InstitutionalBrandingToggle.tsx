import React from 'react';
import { RefreshCw, Shield } from 'lucide-react';
import { DEFAULT_LOGO_BASE64 } from '../../../domain/services/default-logo-base64';
import {
  BrandingVariantKey,
  BrandingVariantOption,
  FALLBACK_PUBLIC_LOGO_PATH,
  SECONDARY_BRANDING_LOGO_PATH,
  applyCacheBustingTimestamp,
} from '../../utils/institutional-branding';

export interface InstitutionalBrandingToggleProps {
  activeVariant: BrandingVariantKey;
  activeUrl: string;
  variants: BrandingVariantOption[];
  hasSecondaryVariant: boolean;
  cacheTimestamp?: number | null;
  onToggleVariant: (nextVariant?: BrandingVariantKey) => void;
}

export const InstitutionalBrandingToggle: React.FC<InstitutionalBrandingToggleProps> = ({
  activeVariant,
  activeUrl,
  variants,
  hasSecondaryVariant,
  cacheTimestamp,
  onToggleVariant,
}) => {
  const activeOption = variants.find((v) => v.key === activeVariant) || variants[0];
  const nextVariant: BrandingVariantKey = activeVariant === 'primary' ? 'secondary' : 'primary';
  const nextOption = variants.find((v) => v.key === nextVariant);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const imgEl = e.currentTarget;
    const step = Number(imgEl.dataset.fallbackStep || '0');

    if (step === 0) {
      imgEl.dataset.fallbackStep = '1';
      const fallbackSecondary = applyCacheBustingTimestamp(
        SECONDARY_BRANDING_LOGO_PATH,
        cacheTimestamp
      );
      if (imgEl.src && !imgEl.src.includes(SECONDARY_BRANDING_LOGO_PATH)) {
        imgEl.src = fallbackSecondary;
        return;
      }
    }

    if (step <= 1) {
      imgEl.dataset.fallbackStep = '2';
      const fallbackPublic = applyCacheBustingTimestamp(
        FALLBACK_PUBLIC_LOGO_PATH,
        cacheTimestamp
      );
      if (imgEl.src && !imgEl.src.endsWith(FALLBACK_PUBLIC_LOGO_PATH)) {
        imgEl.src = fallbackPublic;
        return;
      }
    }

    imgEl.dataset.fallbackStep = '3';
    imgEl.src = DEFAULT_LOGO_BASE64;
  };

  return (
    <div
      data-testid="institutional-branding-switcher"
      className="shrink-0 flex flex-col sm:flex-row items-start sm:items-center gap-2.5"
    >
      <div className="relative group flex items-center bg-white/10 hover:bg-white/15 border border-white/20 rounded-2xl px-3 py-2 backdrop-blur-xs transition-all shadow-xs">
        <img
          key={`${activeVariant}-${activeUrl}`}
          src={activeUrl}
          alt={activeOption?.label || 'Logo Institucional'}
          data-testid="public-institutional-logo"
          data-variant={activeVariant}
          className="h-12 sm:h-14 lg:h-[62px] w-auto object-contain select-none transition-transform duration-200"
          onError={handleImageError}
        />

        {hasSecondaryVariant && (
          <div className="ml-2.5 pl-2.5 border-l border-white/20 flex flex-col items-stretch gap-1 print:hidden">
            <div
              role="group"
              aria-label="Selector de variante de identidad institucional"
              className="inline-flex items-center bg-slate-950/35 p-0.5 rounded-xl border border-white/15"
            >
              {variants.map((variant) => {
                const isSelected = variant.key === activeVariant;
                return (
                  <button
                    key={variant.key}
                    type="button"
                    onClick={() => onToggleVariant(variant.key)}
                    aria-pressed={isSelected}
                    aria-label={`Ver ${variant.label}`}
                    title={variant.label}
                    className={`px-2 py-1 rounded-lg text-[10px] font-extrabold tracking-tight transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 shadow-2xs'
                        : 'text-sky-100 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Shield className="w-2.5 h-2.5 shrink-0" />
                    <span>{variant.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              data-testid="branding-variant-toggle"
              onClick={() => onToggleVariant()}
              aria-label={`Alternar escudo institucional (actual: ${activeOption?.shortLabel || 'Oficial'})`}
              title={
                nextOption
                  ? `Cambiar a ${nextOption.label}`
                  : 'Alternar variante de escudo institucional'
              }
              className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-sky-100 hover:text-white border border-white/15 transition cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-2.5 h-2.5 shrink-0" />
              <span>Alternar escudo</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
