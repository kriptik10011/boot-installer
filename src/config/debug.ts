/**
 * Debug mode configuration.
 *
 * Uses the compile-time `__DEBUG_BUILD__` constant (set via VITE_DEBUG_BUILD env var).
 * When false, all debug code is tree-shaken out of the production bundle.
 */
export const DEBUG_MODE =
  typeof __DEBUG_BUILD__ !== 'undefined' && __DEBUG_BUILD__;
