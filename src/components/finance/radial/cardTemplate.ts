/**
 * Unified card template — consolidated from radialCardTemplate, subArcCardTemplate,
 * and junctionCardTemplate. Single source of truth for all circular card constants.
 *
 * Unified circular card template.
 */

import { useAppStore } from '@/stores/appStore';

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const FONT_FAMILY = "'Space Grotesk', system-ui" as const;

// =============================================================================
// SIZING (cqi units)
// =============================================================================

export const CARD_SIZES = {
  heroText: 5.5,
  labelText: 3.5,
  statusText: 3,
  buttonText: 3.2,
  statsText: 2.8,
  sectionContent: 2.2,
} as const;

/** Minimum button text size in cqi */
export const BUTTON_MIN_TEXT = 2.4;

export const MAX_PILL_ITEMS = 3;

/** Standard paddingTop for circular card hero layout */
export const CIRCULAR_HERO_PADDING = '14cqi';

/** Standard root style for circular card content zones — matches ArcCardRenderer */
export const CIRCULAR_ROOT_STYLE = {
  containerType: 'inline-size' as const,
} as const;

// =============================================================================
// PILL COLUMN STYLES (no rectangular borders — circular harmony)
// =============================================================================

/** Glass morphism pill columns — subtle glass for circular card harmony */
export const PILL_COLUMN_STYLE = {
  border: 'none',
  background: 'rgba(51, 65, 85, 0.15)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
} as const;

/** Subtle divider for separating sections within cards */
export const DIVIDER_BORDER = '1px solid rgba(255, 255, 255, 0.05)';

/** Mandatory column headers — uppercase, tracking-wider, accent-colored */
export const COLUMN_HEADER_STYLE = {
  fontSize: `${CARD_SIZES.sectionContent * 0.75}cqi`,
  fontFamily: FONT_FAMILY,
  fontWeight: 600,
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  textAlign: 'center' as const,
  color: '#94a3b8',
  opacity: 0.7,
  marginBottom: '0.5cqi',
} as const;

/** Pill column border radii — large radii for circular card harmony */
export const PILL_RADIUS_LEFT = '9999px 2cqi 2cqi 9999px';
export const PILL_RADIUS_RIGHT = '2cqi 9999px 9999px 2cqi';
export const PILL_RADIUS_SINGLE = '9999px';

// =============================================================================
// FORM ZONE PADDING (circular card formZone pattern — ref: MealsOverviewCard)
// =============================================================================

/**
 * Standard padding for formZone content inside CircularCardLayout.
 * CircularCardLayout provides 8cqi horizontal padding on the formZone wrapper.
 * ScrollZone/fixed elements add these values for inner content padding.
 * Total horizontal: 8cqi (layout) + 6cqi (content) = 14cqi per side = 72cqi content width.
 */
export const FORM_ZONE_PADDING = {
  /** Horizontal padding for fixed top elements (FormField, ButtonGroup) */
  fixedTopX: '6cqi',
  /** Horizontal padding for ScrollZone content */
  scrollX: '6cqi',
  /** Bottom padding inside ScrollZone */
  scrollBottom: '4cqi',
} as const;

// =============================================================================
// RING / TRACK
// =============================================================================

/** Default track color for all ring SVG components (CountdownRing, DonutRing, etc.) */
export const RING_TRACK_COLOR = 'rgba(51, 65, 85, 0.3)';

// =============================================================================
// JUNCTION-SPECIFIC
// =============================================================================

/** Standard junction card insets — cards fill available center space. Circular-only. */
export const JUNCTION_INSETS = {
  circ: { shield: '3%', card: '8%' },
} as const;

/** Content padding for widgets inside circular junction cards.
 *  The 86% core zone extends past the 70.7% inscribed rectangle,
 *  so content at edges clips. This padding keeps content inside the safe zone. */
export const JUNCTION_CONTENT_PADDING = '3cqi 11cqi';

/** Junction accent colors per position. */
export const JUNCTION_ACCENTS = {
  nw: '#fbbf24',  // amber-400 (shopping)
  ne: '#22d3ee',  // cyan-400 (dashboard/review)
  se: '#a78bfa',  // violet-400 (habits)
  sw: '#94a3b8',  // slate-400 (settings)
} as const;

// =============================================================================
// SUB-ARC-SPECIFIC
// =============================================================================

/** Sub-arc accent colors per domain. Matches main arc accents for visual continuity. */
export const SUB_ARC_ACCENTS = {
  week: '#22d3ee',     // cyan-400
  meals: '#34d399',    // emerald-400
  finance: '#a78bfa',  // violet-400
  inventory: '#fbbf24', // amber-400
} as const;

// =============================================================================
// GLASS MORPHISM TIERS
// =============================================================================

/** Standard dark-glass backgrounds — use instead of hardcoding rgba(8,16,32,x) */
export const GLASS = {
  subtle: 'rgba(8, 16, 32, 0.55)',   // hover states, secondary elements
  medium: 'rgba(8, 16, 32, 0.70)',   // standard components (blobs, cards)
  heavy:  'rgba(8, 16, 32, 0.90)',   // overlays, modals
} as const;

/** Backdrop blur tiers — use instead of hardcoding blur(Npx) */
export const BLUR = {
  light:  'blur(8px)',    // pills, subtle glass
  medium: 'blur(12px)',   // standard components
  heavy:  'blur(24px)',   // overlays, modals
} as const;

/**
 * Compute responsive glass surface styles from user preferences.
 *
 * - opacity:   controls background alpha AND blur (clear glass -> frosted)
 * - brightness: controls base-color lightness (dark navy -> visible blue glass)
 *
 * Consumers: GlassCard (main arc), Carousel SubArcContent (sub-arc).
 */
export function getGlassStyle(rawOpacity: number, rawBrightness: number) {
  const opacity = Math.max(0, Math.min(1, rawOpacity));
  const brightness = Math.max(0, Math.min(1, rawBrightness));

  // Base color: dark (8,16,32) -> lighter blue glass (40,60,100) via brightness
  const r = Math.round(8 + 32 * brightness);
  const g = Math.round(16 + 44 * brightness);
  const b = Math.round(32 + 68 * brightness);

  // Blur scales with opacity: 2px floor (below ~14%) up to ~13px at slider max (0.95)
  const blurPx = `${Math.max(2, opacity * 14).toFixed(1)}px`;

  // Shadow scales with opacity: subtle at low, stronger at high
  const shadowAlpha = (0.15 + opacity * 0.35).toFixed(2);

  return {
    background: `rgba(${r}, ${g}, ${b}, ${opacity})`,
    backdropFilter: `blur(${blurPx})`,
    WebkitBackdropFilter: `blur(${blurPx})`,
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: `0 8px 32px rgba(0, 0, 0, ${shadowAlpha}), inset 0 1px 0 rgba(255,255,255,0.08)`,
  } as const;
}

// =============================================================================
// TEXT COLORS
// =============================================================================

/** Semantic text colors — use instead of hardcoding slate hex values */
export const TEXT_COLORS = {
  primary:   '#cbd5e1',   // slate-300, main content text
  secondary: '#64748b',   // slate-500, labels and metadata
  tertiary:  '#475569',   // slate-600, placeholders and disabled
} as const;

// =============================================================================
// HOOKS
// =============================================================================

/** Shared hook for reading card shape from store. */
export function useCardShape() {
  const cardShape = useAppStore((s) => s.latticePrefs.cardShape) ?? 'rectangular';
  const isCircular = cardShape === 'circular';
  return { cardShape, isCircular } as const;
}

/** Shared hook for responsive glass surface styles. Reads both sliders from store. */
export function useGlassStyle() {
  const cardBgOpacity = useAppStore((s) => s.latticePrefs.cardBgOpacity) ?? 0.75;
  return getGlassStyle(cardBgOpacity, 0.6);
}
