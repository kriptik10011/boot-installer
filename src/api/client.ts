/**
 * API Client — Legacy barrel file.
 *
 * All API functions and types have been split into domain files:
 *   core.ts, events.ts, meals.ts, finance.ts, inventory.ts, intelligence.ts, user.ts
 *
 * This file re-exports everything for backward compatibility.
 * New code should import from '@/api' or specific domain files.
 */

// Re-export everything from the index barrel
export * from './index';
