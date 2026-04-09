/**
 * Shared color/label threshold functions extracted from widget files.
 * Used by multiple adapters across domains.
 */

// ── Health score thresholds ──

export function healthColor(score: number): string {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  if (score >= 25) return '#f97316';
  return '#a16207';
}

export function healthLabel(score: number): string {
  if (score >= 75) return 'Healthy';
  if (score >= 50) return 'Watchful';
  if (score >= 25) return 'Tight';
  return 'Over Budget';
}

// ── Week health thresholds (cyan palette) ──

export function weekHealthColor(score: number): string {
  if (score > 75) return '#22d3ee';
  if (score > 50) return '#3b82f6';
  if (score > 25) return '#f59e0b';
  return '#d97706';
}

export function weekNarrative(score: number): string {
  if (score > 85) return 'Great week!';
  if (score > 70) return 'Balanced';
  if (score > 50) return 'Gaps to fill';
  return 'Needs planning';
}

// ── Budget pace thresholds ──

export function paceColor(pacePct: number, monthPct: number): string {
  if (pacePct <= monthPct * 0.9) return '#22c55e';
  if (pacePct <= monthPct * 1.1) return '#f59e0b';
  return '#f97316';
}

export function paceLabel(pacePct: number, monthPct: number): string {
  if (pacePct <= monthPct * 0.9) return 'Under pace';
  if (pacePct <= monthPct * 1.1) return 'On pace';
  return 'Over pace';
}

// ── Inventory health thresholds (amber palette) ──

export function inventoryHealthColor(score: number): string {
  if (score >= 80) return '#f59e0b';
  if (score >= 60) return '#d97706';
  if (score >= 40) return '#b45309';
  return '#a16207';
}

// ── Month elapsed percentage ──

export function getMonthElapsedPct(): number {
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return (today.getDate() / daysInMonth) * 100;
}
