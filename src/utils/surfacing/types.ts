/**
 * Surfacing Layer Types
 *
 * All type definitions for the Interruption Calculus surfacing system.
 */

import type { Insight } from '@/api/client';

// =============================================================================
// CORE TYPES
// =============================================================================

export interface SurfacingDecision {
  shouldShow: boolean;
  reason: string;
  score: number;
  escalationLevel: EscalationLevel;
  failedGates: string[];
}

export interface DismissalRecord {
  insightType: string;
  count: number;
  lastDismissed: string; // ISO date
  permanent?: boolean;   // If true, uses 30-day decay; if false/undefined, uses 1-day decay
}

/**
 * Context for surfacing decisions.
 * These are the "hard gates" that must pass before any insight is shown.
 */
export interface SurfacingContext {
  /** Is Do Not Disturb / Focus mode active? */
  isDndMode?: boolean;
  /** Is the user mid-task? (typing, scrolling in last 30 seconds) */
  isMidTask?: boolean;
  /** Is the user in Planning Mode? */
  isPlanningMode?: boolean;
  /** Is this insight truly urgent? (overrides some gates) */
  isUrgent?: boolean;
  /** Last user activity timestamp */
  lastActivityTimestamp?: number;
  /** Idle threshold in milliseconds (default: 30000 = 30 seconds) */
  idleThresholdMs?: number;
}

export type EscalationLevel = 'ambient' | 'passive' | 'notification';

/**
 * Insight queued for deferred display.
 * Instead of showing immediately when score > threshold,
 * wait for an opportune moment (natural break, idle period).
 */
export interface DeferredInsight {
  insight: Insight;
  queuedAt: number;
  deadline: number; // Must be shown by this timestamp
  score: number;
  escalationLevel: EscalationLevel;
}

export interface AcceptanceRecord {
  insightType: string;
  count: number;
  lastAccepted: string; // ISO date
}

export interface InsufficientDataInfo {
  message: string;
  progressPercent: number;
  neededData: string[];
}

// Legacy type — kept for backward compat but no longer used in production
export interface ContextGateResult {
  passed: boolean;
  failedGates: string[];
}
