/**
 * auroraTheme — Data-driven color palette, gradient fills, and narratives
 * for the Aurora Glass financial dashboard.
 *
 * Health score drives the ambient color palette (pre-attentive processing).
 * Spend ratio drives per-card gradient fills (two-channel encoding).
 * Pace ratio drives narrative sentences (behavioral-level design).
 */

// ---------------------------------------------------------------------------
// Aurora palette — shifts based on overall budget health
// ---------------------------------------------------------------------------

export type AuroraPaletteId = 'healthy' | 'watchful' | 'tight' | 'over';

export interface AuroraPalette {
  id: AuroraPaletteId;
  label: string;
  /** CSS radial-gradient stops for the mesh background */
  meshGradient: string;
  /** Primary glow color for progress edge and hero text */
  glowColor: string;
  /** Hero text gradient (background-image for gradient text) */
  heroGradient: string;
  /** Progress edge fill color */
  edgeColor: string;
}

const PALETTES: Record<AuroraPaletteId, AuroraPalette> = {
  healthy: {
    id: 'healthy',
    label: 'Healthy',
    meshGradient: 'radial-gradient(ellipse at 20% 50%, rgba(6,182,212,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(16,185,129,0.12) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(6,182,212,0.08) 0%, transparent 50%)',
    glowColor: 'rgba(6,182,212,0.5)',
    heroGradient: 'linear-gradient(135deg, #06b6d4, #10b981)',
    edgeColor: '#06b6d4',
  },
  watchful: {
    id: 'watchful',
    label: 'Watchful',
    meshGradient: 'radial-gradient(ellipse at 20% 50%, rgba(6,182,212,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(245,158,11,0.10) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(6,182,212,0.06) 0%, transparent 50%)',
    glowColor: 'rgba(245,158,11,0.4)',
    heroGradient: 'linear-gradient(135deg, #06b6d4, #f59e0b)',
    edgeColor: '#f59e0b',
  },
  tight: {
    id: 'tight',
    label: 'Tight',
    meshGradient: 'radial-gradient(ellipse at 20% 50%, rgba(245,158,11,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(217,119,6,0.10) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(245,158,11,0.06) 0%, transparent 50%)',
    glowColor: 'rgba(217,119,6,0.4)',
    heroGradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    edgeColor: '#d97706',
  },
  over: {
    id: 'over',
    label: 'Over Budget',
    meshGradient: 'radial-gradient(ellipse at 30% 50%, rgba(217,119,6,0.15) 0%, transparent 50%), radial-gradient(ellipse at 70% 30%, rgba(146,64,14,0.10) 0%, transparent 50%)',
    glowColor: 'rgba(146,64,14,0.4)',
    heroGradient: 'linear-gradient(135deg, #d97706, #92400e)',
    edgeColor: '#e11d48',
  },
};

/**
 * Select aurora palette based on overall budget usage percentage.
 * <70% = healthy, 70-85% = watchful, 85-100% = tight, >100% = over.
 */
export function getAuroraPalette(budgetUsedPct: number): AuroraPalette {
  if (budgetUsedPct > 100) return PALETTES.over;
  if (budgetUsedPct > 85) return PALETTES.tight;
  if (budgetUsedPct > 70) return PALETTES.watchful;
  return PALETTES.healthy;
}

/**
 * Derive palette from health score (0-100) as an alternative input.
 * Maps inversely: high health = healthy, low health = tight/over.
 */
export function getAuroraPaletteFromHealth(healthScore: number): AuroraPalette {
  if (healthScore >= 70) return PALETTES.healthy;
  if (healthScore >= 50) return PALETTES.watchful;
  if (healthScore >= 30) return PALETTES.tight;
  return PALETTES.over;
}

// ---------------------------------------------------------------------------
// Progress edge — 4px top bar
// ---------------------------------------------------------------------------

export interface ProgressEdgeStyle {
  background: string;
  boxShadow: string;
}

/**
 * Returns CSS styles for the progress edge bar.
 */
export function getProgressEdgeStyle(fillPct: number, palette: AuroraPalette): ProgressEdgeStyle {
  const clamped = Math.min(100, Math.max(0, fillPct));
  return {
    background: `linear-gradient(90deg, ${palette.edgeColor} ${clamped}%, transparent ${clamped}%)`,
    boxShadow: clamped > 0 ? `0 0 12px ${palette.glowColor}` : 'none',
  };
}

// ---------------------------------------------------------------------------
// Living gradient fills — per-card spend ratio
// ---------------------------------------------------------------------------

/**
 * Returns Tailwind classes for the living gradient fill inside a glass card.
 * Color shifts from cool->warm as spend ratio increases.
 */
export function getGradientFillClasses(spendRatio: number): string {
  if (spendRatio > 1) return 'bg-rose-500/20';
  if (spendRatio > 0.85) return 'bg-gradient-to-r from-amber-500/15 to-rose-500/10';
  if (spendRatio > 0.6) return 'bg-gradient-to-r from-cyan-500/15 to-amber-500/10';
  return 'bg-gradient-to-r from-cyan-500/15 to-transparent';
}

/**
 * Returns inline style width for the gradient fill.
 */
export function getGradientFillWidth(spendRatio: number): string {
  return `${Math.min(100, Math.max(0, spendRatio * 100))}%`;
}

// ---------------------------------------------------------------------------
// Narrative sentences — behavioral-level design
// ---------------------------------------------------------------------------

/**
 * Generates a human narrative sentence based on spending velocity.
 *
 * @param paceRatio - Spending pace vs historical average (1.0 = on track)
 * @param daysLeft - Days remaining in the budget period
 */
export function getNarrativeSentence(paceRatio: number, daysLeft: number): string {
  if (daysLeft <= 0) return 'Period ended';

  if (paceRatio <= 0.7) return `Comfortable \u2014 ${daysLeft} days left`;
  if (paceRatio <= 0.9) return `On track \u2014 ${daysLeft} days left`;
  if (paceRatio <= 1.1) return `Watchful \u2014 ${daysLeft} days left`;
  if (paceRatio <= 1.3) return `Running hot \u2014 ${daysLeft} days left`;
  return `Over pace \u2014 ${daysLeft} days left`;
}

/**
 * Returns a short velocity label for a category card.
 */
export function getVelocityLabel(paceRatio: number): string {
  if (paceRatio <= 0.7) return 'lots of room';
  if (paceRatio <= 0.9) return 'on track';
  if (paceRatio <= 1.1) return 'close to pace';
  if (paceRatio <= 1.3) return 'above average';
  return 'over pace';
}
