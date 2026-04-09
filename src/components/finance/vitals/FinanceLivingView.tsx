/**
 * FinanceLivingView — Orchestrator for the Living Vitals financial dashboard.
 *
 * Zones: Hero (S2S) -> Story (intelligence) -> Vital Grid -> Add Zone.
 * Wires useAuroraIntelligence, useVitalLayout, useCurrentMode.
 *
 * Living Mode: hero + 1-2 compact vitals. Planning Mode: full grid.
 * Calm Collapse: when healthScore >= 70, no urgentBill, no anomalies -> compact grid.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { useSafeToSpend } from '@/hooks/useFinanceV2';
import { useAuroraIntelligence } from '@/hooks/useAuroraIntelligence';
import { useCurrentMode } from '@/hooks/useCurrentMode';
import { useVitalLayout } from '@/hooks/useVitalLayout';
import { useSpendingVelocity as useSpendingVelocityPredictions } from '@/hooks/usePredictions';
import { HeroVital } from './HeroVital';
import { VitalStory } from './VitalStory';
import { VitalGrid, VitalGridItem } from './VitalGrid';
import { BudgetPulseVital } from './BudgetPulseVital';
import { BillsRadarVital } from './BillsRadarVital';
import { SavingsSprintVital } from './SavingsSprintVital';
import { SpendingLensVital } from './SpendingLensVital';
import { DebtJourneyVital } from './DebtJourneyVital';
import { NetWorthVital } from './NetWorthVital';
import { CashFlowVital } from './CashFlowVital';
import { InvestmentPulseVital } from './InvestmentPulseVital';
import { VitalPicker } from './VitalPicker';
import type { VitalType, VitalSize } from '@/types/vitals';

/**
 * Determine if Calm Collapse should activate.
 * When finances look healthy, the grid shows compact vitals only.
 */
export function shouldCalmCollapse(
  healthScore: number,
  hasUrgentBill: boolean,
  hasAnomaly: boolean,
): boolean {
  return healthScore >= 70 && !hasUrgentBill && !hasAnomaly;
}

/**
 * Maps vital type to its component.
 */
function renderVital(
  type: VitalType,
  size: VitalSize,
  isExpanded: boolean,
  onToggleExpand: () => void,
  onOpen: () => void,
  onAction: () => void,
) {
  const commonProps = { size, isExpanded, onToggleExpand, onOpen, onAction };

  switch (type) {
    case 'budget_pulse':
      return <BudgetPulseVital {...commonProps} />;
    case 'bills_radar':
      return <BillsRadarVital {...commonProps} />;
    case 'savings_sprint':
      return <SavingsSprintVital {...commonProps} />;
    case 'spending_lens':
      return <SpendingLensVital {...commonProps} />;
    case 'debt_journey':
      return <DebtJourneyVital {...commonProps} />;
    case 'net_worth':
      return <NetWorthVital {...commonProps} />;
    case 'cash_flow':
      return <CashFlowVital {...commonProps} />;
    case 'investment_pulse':
      return <InvestmentPulseVital {...commonProps} />;
    default:
      return null;
  }
}

export function FinanceLivingView() {
  const { isLoading: safeLoading } = useSafeToSpend();
  const intelligence = useAuroraIntelligence();
  const { healthScore, insights, predictedBills, isLoading: intelLoading } = intelligence;
  const { isLivingMode } = useCurrentMode();
  const vitalLayout = useVitalLayout();
  const {
    orderedVitals, sizes, removed, recordOpen, recordAction, recordDwell,
    restoreVital, applySmartDefaults,
  } = vitalLayout;

  // Anomaly detection for Calm Collapse
  const { data: velocityData } = useSpendingVelocityPredictions();
  const hasAnomaly = useMemo(() => {
    const items = Array.isArray(velocityData) ? velocityData : [];
    return items.some((v: any) => (v.pace_ratio ?? 0) > 1.3);
  }, [velocityData]);

  // Expanded state (accordion — one at a time)
  const [expandedVital, setExpandedVital] = useState<VitalType | null>(null);

  // Story dismissal (session-only for now)
  const [storyDismissed, setStoryDismissed] = useState(false);

  // Vital Picker modal
  const [pickerOpen, setPickerOpen] = useState(false);

  // Apply smart defaults on first load
  useEffect(() => {
    if (!safeLoading && !intelLoading) {
      applySmartDefaults();
    }
  }, [safeLoading, intelLoading, applySmartDefaults]);

  // Top insight for story zone
  const topInsight = useMemo(() => {
    if (storyDismissed || !insights.length) return null;
    const urgent = insights.filter((i) => i.priority <= 2);
    return urgent[0] ?? null;
  }, [insights, storyDismissed]);

  // Bill due <48h
  const urgentBill = useMemo(() => {
    if (storyDismissed) return null;
    return predictedBills.find((b) => {
      const dueDate = new Date(b.predicted_date);
      const hoursUntil = (dueDate.getTime() - Date.now()) / (1000 * 60 * 60);
      return hoursUntil > 0 && hoursUntil < 48;
    });
  }, [predictedBills, storyDismissed]);

  const hasUrgentBill = urgentBill != null;

  // Calm Collapse: healthy + no urgent bills + no anomalies → compact grid
  const calmCollapsed = useMemo(
    () => shouldCalmCollapse(healthScore, hasUrgentBill, hasAnomaly),
    [healthScore, hasUrgentBill, hasAnomaly]
  );

  const storyMessage = topInsight?.message ?? (urgentBill
    ? `${urgentBill.description} predicted ~$${Math.round(urgentBill.predicted_amount)} due soon`
    : null);
  const storyConfidence = topInsight?.confidence ?? urgentBill?.confidence ?? 0.6;

  const handleToggleExpand = useCallback(
    (type: VitalType) => {
      setExpandedVital((prev) => (prev === type ? null : type));
    },
    []
  );

  const handleAddVital = useCallback(
    (type: VitalType) => {
      restoreVital(type);
      setPickerOpen(false);
    },
    [restoreVital]
  );

  // Active vitals set (for picker badge)
  const activeVitalSet = useMemo(
    () => new Set(orderedVitals as string[]),
    [orderedVitals]
  );

  if (safeLoading) return <PanelSkeleton />;

  // Vitals to display (exclude hero — it's separate)
  const displayVitals = orderedVitals.filter((t) => t !== 'safe_to_spend');

  // Living mode: limit to 2 vitals max
  const visibleVitals = isLivingMode ? displayVitals.slice(0, 2) : displayVitals;

  // Calm Collapse: override sizes to compact when collapsed
  const effectiveSizes = calmCollapsed
    ? Object.fromEntries(visibleVitals.map((t) => [t, 'compact' as VitalSize]))
    : sizes;

  return (
    <div
      className="flex-1 overflow-y-auto"
      role="region"
      aria-label="Financial vitals overview"
    >
      {/* Hero Zone — Safe to Spend with gradient + health pill */}
      <HeroVital />

      {/* Story Zone */}
      {storyMessage && (
        <VitalStory
          message={storyMessage}
          confidence={storyConfidence}
          onDismiss={() => setStoryDismissed(true)}
        />
      )}

      {/* Calm Collapse indicator */}
      {calmCollapsed && visibleVitals.length > 0 && (
        <div className="mx-3 mb-2 text-center">
          <span className="text-xs text-slate-500">
            Finances look healthy — showing compact view
          </span>
        </div>
      )}

      {/* Vital Grid */}
      {visibleVitals.length > 0 ? (
        <VitalGrid>
          {visibleVitals.map((type) => {
            const vitalSize = effectiveSizes[type] ?? 'standard';
            return (
              <VitalGridItem key={type} size={vitalSize}>
                {renderVital(
                  type,
                  vitalSize,
                  expandedVital === type,
                  () => handleToggleExpand(type),
                  () => recordOpen(type),
                  () => recordAction(type),
                )}
              </VitalGridItem>
            );
          })}
        </VitalGrid>
      ) : (
        <div className="mx-3 rounded-xl p-6 text-center bg-slate-800/30 border border-slate-700/30">
          <div className="text-slate-400 text-sm">
            {healthScore >= 70
              ? 'All clear \u2014 your finances look balanced'
              : 'Add vitals to track your financial health'}
          </div>
        </div>
      )}

      {/* Add Zone */}
      {!isLivingMode && (
        <div className="px-3 py-3">
          <button
            className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-300 border border-dashed border-slate-700/50 rounded-xl hover:border-slate-600/50 transition-colors"
            aria-label="Add a vital to your dashboard"
            onClick={() => setPickerOpen(true)}
          >
            + Add Vital
          </button>
        </div>
      )}

      {/* VitalPicker Modal */}
      {pickerOpen && (
        <VitalPicker
          activeVitals={activeVitalSet}
          removedVitals={removed}
          onAddVital={handleAddVital}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
