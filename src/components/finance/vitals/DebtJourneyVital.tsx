/**
 * DebtJourneyVital — Debt payoff progress with No-Shame framing.
 *
 * Compact: "Debt Freedom: 62% -- 18mo"
 * Standard: progress bar + snowball vs avalanche comparison
 * Large/Expanded: + per-account breakdown + strategy comparison
 *
 * Uses useDebtSummary, usePayoffPlan from useFinanceV2.
 * No-Shame: "journey" language, amber not red, progress-focused.
 */

import { useMemo } from 'react';
import { useDebtSummary, usePayoffPlan } from '@/hooks/useFinanceV2';
import { fmt } from '@/components/finance/classic/FinanceHelpers';
import { VitalCard } from './VitalCard';
import type { VitalSize, VitalIntelligenceLayer } from '@/types/vitals';

interface DebtJourneyVitalProps {
  size: VitalSize;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpen?: () => void;
  onAction?: () => void;
}

export function DebtJourneyVital({
  size,
  isExpanded,
  onToggleExpand,
  onOpen,
  onAction,
}: DebtJourneyVitalProps) {
  const { data: summary } = useDebtSummary();
  const { data: plan } = usePayoffPlan();

  const totalDebt = (summary as any)?.total_balance ?? 0;
  const totalOriginal = (summary as any)?.total_original ?? totalDebt;
  const accountCount = (summary as any)?.account_count ?? 0;

  // Progress calculation (how much paid off)
  const { progressPct, remainingMonths } = useMemo(() => {
    const paidOff = totalOriginal > 0 ? totalOriginal - totalDebt : 0;
    const pct = totalOriginal > 0 ? Math.round((paidOff / totalOriginal) * 100) : 0;
    const months = (plan as any)?.months_to_payoff ?? null;
    return { progressPct: pct, remainingMonths: months };
  }, [totalDebt, totalOriginal, plan]);

  const barColor = progressPct >= 75 ? 'bg-emerald-500' : progressPct >= 40 ? 'bg-cyan-500' : 'bg-cyan-400';

  // Intelligence layer
  const intelligence = useMemo((): VitalIntelligenceLayer => {
    if (accountCount === 0) {
      return { narrative: 'No debt accounts tracked', action: null, reasoning: null };
    }
    const monthsText = remainingMonths != null ? ` \u2014 ~${remainingMonths}mo to freedom` : '';
    return {
      narrative: `${progressPct}% of the journey complete${monthsText}`,
      action: null,
      reasoning: totalDebt > 0
        ? `${fmt(totalDebt)} remaining across ${accountCount} account${accountCount !== 1 ? 's' : ''}`
        : null,
    };
  }, [accountCount, progressPct, remainingMonths, totalDebt]);

  const compactMonths = remainingMonths != null ? ` \u2014 ${remainingMonths}mo` : '';

  return (
    <VitalCard
      type="debt_journey"
      size={size}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      onOpen={onOpen}
      onAction={onAction}
      confidence={0.9}
      intelligence={intelligence}
      compactContent={
        accountCount > 0 ? (
          <span className="text-slate-200">
            Freedom: {progressPct}%{compactMonths}
          </span>
        ) : (
          <span className="text-slate-500">No debt</span>
        )
      }
      standardContent={
        <div className="space-y-2">
          {accountCount > 0 ? (
            <>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-slate-300">Journey Progress</span>
                <span className="text-slate-400">{progressPct}%</span>
              </div>
              <div className="w-full bg-slate-700/50 rounded-full h-1.5">
                <div
                  className={`${barColor} h-1.5 rounded-full transition-all`}
                  style={{ width: `${Math.min(100, progressPct)}%` }}
                />
              </div>
              {remainingMonths != null && (
                <div className="text-xs text-slate-400">
                  ~{remainingMonths} months to debt freedom
                </div>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-500">Track debt accounts to see your journey</span>
          )}
        </div>
      }
      expandedContent={
        <div className="space-y-2">
          {totalDebt > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-300">Remaining Balance</span>
              <span className="text-slate-400">{fmt(totalDebt)}</span>
            </div>
          )}
          {(plan as any)?.strategy && (
            <div className="text-xs text-slate-500 pt-1 border-t border-slate-700/30">
              Strategy: {(plan as any).strategy === 'snowball' ? 'Snowball (smallest first)' : 'Avalanche (highest rate first)'}
            </div>
          )}
          {(plan as any)?.total_interest_saved != null && (plan as any).total_interest_saved > 0 && (
            <div className="text-xs text-emerald-400">
              Saving {fmt((plan as any).total_interest_saved)} in interest
            </div>
          )}
        </div>
      }
    />
  );
}
