/**
 * Living Vitals Type System
 *
 * Defines the type model for the Living Vitals financial dashboard.
 * Each financial concern is a "vital sign" with behavioral sizing,
 * trust borders, and intelligence layers.
 */

// =============================================================================
// Core types
// =============================================================================

/** All 9 vital types available in the dashboard */
export type VitalType =
  | 'safe_to_spend'
  | 'budget_pulse'
  | 'bills_radar'
  | 'savings_sprint'
  | 'spending_lens'
  | 'debt_journey'
  | 'net_worth'
  | 'cash_flow'
  | 'investment_pulse';

/** Behavioral sizing — drives card height and detail level */
export type VitalSize = 'compact' | 'standard' | 'large';

// =============================================================================
// Interaction tracking (persisted for behavioral learning)
// =============================================================================

export interface VitalInteraction {
  openCount: number;
  actionCount: number;
  lastInteraction: number; // timestamp ms
  totalDwellMs: number;
}

// =============================================================================
// Layout state (persisted in appStore)
// =============================================================================

export interface VitalLayoutState {
  /** Vital IDs in user-set order */
  order: string[];
  /** Vitals with locked position */
  pinned: string[];
  /** Vitals user explicitly removed */
  removed: string[];
  /** Behavioral tracking per vital */
  interactions: Record<string, VitalInteraction>;
  /** Whether smart defaults have been applied */
  defaultsApplied: boolean;
}

export const EMPTY_VITAL_LAYOUT: VitalLayoutState = {
  order: [],
  pinned: [],
  removed: [],
  interactions: {},
  defaultsApplied: false,
};

// =============================================================================
// Registry metadata
// =============================================================================

export interface VitalMetadata {
  type: VitalType;
  label: string;
  description: string;
  /** Icon identifier (emoji for now, can be swapped for SVG) */
  icon: string;
  /** Whether this vital can be removed by the user */
  removable: boolean;
  /** Default size when first added */
  defaultSize: VitalSize;
  /** Data key to check for smart defaults (maps to DataAvailability) */
  dataKey: keyof DataAvailability | null;
}

// =============================================================================
// Intelligence layer per vital
// =============================================================================

export interface VitalIntelligenceLayer {
  /** 1-line interpretation ("On track", "Running hot") */
  narrative: string | null;
  /** Coupled next-step ("Move $50 from Travel?" with action) */
  action: { label: string; onClick: () => void } | null;
  /** Expandable reasoning (Glass Box) */
  reasoning: string | null;
}

// =============================================================================
// Data availability (for smart defaults)
// =============================================================================

export interface DataAvailability {
  hasBudget: boolean;
  hasBills: boolean;
  hasDebt: boolean;
  hasSavings: boolean;
  hasInvestments: boolean;
  hasNetWorth: boolean;
}
