/**
 * InvestmentPulseVital — Portfolio value and allocation balance.
 *
 * Compact: "$23,450 Balanced"
 * Standard: total value + allocation summary + rebalance indicator
 * Large/Expanded: + per-account breakdown + performance
 *
 * Uses useInvestmentSummary, usePortfolioAllocation from useFinanceV2.
 */

import { useMemo } from 'react';
import { useInvestmentSummary, usePortfolioAllocation } from '@/hooks/useFinanceV2';
import { fmt } from '@/components/finance/classic/FinanceHelpers';
import { VitalCard } from './VitalCard';
import type { VitalSize, VitalIntelligenceLayer } from '@/types/vitals';

interface InvestmentPulseVitalProps {
  size: VitalSize;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpen?: () => void;
  onAction?: () => void;
}

export function InvestmentPulseVital({
  size,
  isExpanded,
  onToggleExpand,
  onOpen,
  onAction,
}: InvestmentPulseVitalProps) {
  const { data: summary } = useInvestmentSummary();
  const { data: allocation } = usePortfolioAllocation();

  const totalValue = (summary as any)?.total_value ?? 0;
  const totalGain = (summary as any)?.total_gain ?? 0;
  const totalGainPct = (summary as any)?.total_gain_percent ?? 0;
  const accountCount = (summary as any)?.account_count ?? 0;

  // Allocation status
  const allocationItems = Array.isArray((allocation as any)?.allocations)
    ? (allocation as any).allocations
    : [];
  const needsRebalance = (allocation as any)?.needs_rebalance === true;

  const statusLabel = needsRebalance ? 'Rebalance' : 'Balanced';
  const statusColor = needsRebalance ? 'text-amber-400' : 'text-emerald-400';

  const gainColor = totalGain >= 0 ? 'text-emerald-400' : 'text-amber-400';
  const gainSign = totalGain >= 0 ? '+' : '';

  // Intelligence layer
  const intelligence = useMemo((): VitalIntelligenceLayer => {
    if (accountCount === 0) {
      return { narrative: 'No investment accounts tracked', action: null, reasoning: null };
    }
    const gainText = totalGain !== 0
      ? ` (${gainSign}${fmt(totalGain)}, ${gainSign}${totalGainPct.toFixed(1)}%)`
      : '';
    return {
      narrative: `Portfolio: ${fmt(totalValue)}${gainText}`,
      action: needsRebalance
        ? { label: 'View Rebalance', onClick: () => {} }
        : null,
      reasoning: accountCount > 0
        ? `${accountCount} account${accountCount !== 1 ? 's' : ''} tracked`
        : null,
    };
  }, [accountCount, totalValue, totalGain, totalGainPct, gainSign, needsRebalance]);

  return (
    <VitalCard
      type="investment_pulse"
      size={size}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      onOpen={onOpen}
      onAction={onAction}
      confidence={0.85}
      hasAlert={needsRebalance}
      intelligence={intelligence}
      compactContent={
        accountCount > 0 ? (
          <span className="text-slate-200">
            {fmt(totalValue)} <span className={statusColor}>{statusLabel}</span>
          </span>
        ) : (
          <span className="text-slate-500">No investments</span>
        )
      }
      standardContent={
        <div className="space-y-2">
          {accountCount > 0 ? (
            <>
              <div className="text-lg font-semibold text-slate-200">
                {fmt(totalValue)}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className={gainColor}>
                  {gainSign}{fmt(totalGain)} ({gainSign}{totalGainPct.toFixed(1)}%)
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  needsRebalance
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {statusLabel}
                </span>
              </div>
            </>
          ) : (
            <span className="text-xs text-slate-500">Add investment accounts to track portfolio</span>
          )}
        </div>
      }
      expandedContent={
        <div className="space-y-2">
          {allocationItems.slice(0, 5).map((item: any, i: number) => (
            <div key={item.asset_class ?? i} className="flex justify-between text-xs">
              <span className="text-slate-300">{item.asset_class ?? 'Unknown'}</span>
              <span className="text-slate-400">
                {item.current_percent != null ? `${item.current_percent.toFixed(1)}%` : '--'}
                {item.target_percent != null && (
                  <span className="text-slate-600 ml-1">
                    (target: {item.target_percent.toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
          ))}
          {allocationItems.length === 0 && accountCount > 0 && (
            <div className="text-xs text-slate-500">
              Set allocation targets to track balance
            </div>
          )}
        </div>
      }
    />
  );
}
