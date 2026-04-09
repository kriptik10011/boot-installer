/**
 * useReducedMotion — checks browser prefers-reduced-motion setting.
 * Used by RadialDashboard to skip animations when user prefers reduced motion.
 */

export function useReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
