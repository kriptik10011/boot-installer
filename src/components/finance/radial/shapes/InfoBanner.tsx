/**
 * InfoBanner — Colored status strip for success, warning, or info messages.
 * Pure props, cqi-responsive. Used for "Review complete", flash messages, format hints.
 */

import { CARD_SIZES, FONT_FAMILY } from '../cardTemplate';

type BannerVariant = 'success' | 'warning' | 'info';

const VARIANT_STYLES: Record<BannerVariant, { bg: string; text: string }> = {
  success: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399' },
  warning: { bg: 'rgba(217, 119, 6, 0.15)', text: '#d97706' },
  info: { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8' },
};

interface InfoBannerProps {
  message: string;
  variant: BannerVariant;
  className?: string;
}

export function InfoBanner({ message, variant, className }: InfoBannerProps) {
  const style = VARIANT_STYLES[variant];

  return (
    <div
      className={`flex items-center justify-center ${className ?? ''}`}
      style={{
        background: style.bg,
        color: style.text,
        fontSize: `${CARD_SIZES.sectionContent * 0.85}cqi`,
        fontFamily: FONT_FAMILY,
        fontWeight: 600,
        padding: '0.8cqi 2cqi',
        borderRadius: '3cqi',
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}
