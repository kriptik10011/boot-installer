/**
 * Backward-compat re-export — actual code is in surfacing/ directory.
 *
 * All imports from '@/utils/surfacing' continue to work.
 * This file exists because surfacing.ts takes priority over surfacing/index.ts
 * in TypeScript module resolution.
 */
export * from './surfacing/index';
