/**
 * CashFlowVital — 30-day income vs expense projection.
 *
 * Compact: "+$1,200 next 30d"
 * Standard: projected net flow + inflow/outflow breakdown
 * Large/Expanded: + daily projections summary
 *
 * Uses useCashFlowForecast from useFinanceV2.
 * Dashed trust border (projection = AI-derived).
 */

import { useMemo } from 'react';
import { useCashFlowForecast } from '@/hooks/useFinanceV2';
import { fmt } from '@/components/finance/classic/FinanceHelpers';
import { VitalCard } from './VitalCard';
import type { VitalSize, VitalIntelligenceLayer } from '@/types/vitals';

interface CashFlowVitalProps {
  size: VitalSize;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpen?: () => void;
  onAction?: () => void;
}

export function CashFlowVital({
  size,
  isExpanded,
  onToggleExpand,
  onOpen,
  onAction,
}: CashFlowVitalProps) {
  const { data: forecast } = useCashFlowForecast(30);

  const projectedIncome = (forecast as any)?.projected_income ?? 0;
  const projectedExpenses = (forecast as any)?.projected_expenses ?? 0;
  const netFlow = projectedIncome - projectedExpenses;
  const lowBalanceDate = (forecast as any)?.low_balance_date ?? null;
  const projectedBalance = (forecast as any)?.projected_balance ?? null;

  const flowSign = netFlow >= 0 ? '+' : '';
  const flowColor = netFlow >= 0 ? 'text-emerald-400' : 'text-amber-400';

  // Intelligence layer
  const intelligence = useMemo((): VitalIntelligenceLayer => {
    if (projectedIncome === 0 && projectedExpenses === 0) {
      return { narrative: 'Not enough data for cash flow projection', action: null, reasoning: null };
    }

    const parts: string[] = [];
    if (netFlow >= 0) {
      parts.push(`Projected surplus of ${fmt(netFlow)} over 30 days`);
    } else {
      parts.push(`Projected shortfall of ${fmt(Math.abs(netFlow))} over 30 days`);
    }

    if (lowBalanceDate) {
      parts.push(`Low balance warning: ${lowBalanceDate}`);
    }

    return {
      narrative: parts[0],
      action: null,
      reasoning: `Income: ${fmt(projectedIncome)} \u2014 Expenses: ${fmt(projectedExpenses)}`,
    };
  }, [projectedIncome, projectedExpenses, netFlow, lowBalanceDate]);

  return (
    <VitalCard
      type="cash_flow"
      size={size}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      onOpen={onOpen}
      onAction={onAction}
      confidence={0.5}
      intelligence={intelligence}
      compactContent={
        projectedIncome > 0 || projectedExpenses > 0 ? (
          <span className={flowColor}>
            {flowSign}{fmt(netFlow)} next 30d
          </span>
        ) : (
          <span className="text-slate-500">No projection</span>
        )
      }
      standardContent={
        <div className="space-y-2">
          {projectedIncome > 0 || projectedExpenses > 0 ? (
            <>
              <div className={`text-lg font-semibold ${flowColor}`}>
                {flowSign}{fmt(netFlow)}
              </div>
              <div className="flex justify-between text-xs">
                <div>
                  <span className="text-slate-400">In: </span>
                  <span className="text-emerald-400">{fmt(projectedIncome)}</span>
                </div>
                <div>
                  <span className="text-slate-400">Out: </span>
                  <span className="text-amber-400">{fmt(projectedExpenses)}</span>
                </div>
              </div>
              {lowBalanceDate && (
                <div className="text-xs text-amber-400">
                  Low balance expected: {lowBalanceDate}
                </div>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-500">Add income and expenses for cash flow projection</span>
          )}
        </div>
      }
      expandedContent={
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300">Projected Income</span>
            <span className="text-emerald-400">{fmt(projectedIncome)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-300">Projected Expenses</span>
            <span className="text-amber-400">{fmt(projectedExpenses)}</span>
          </div>
          <div className="flex justify-between text-xs font-medium border-t border-slate-700/30 pt-1">
            <span className="text-slate-200">Net Flow</span>
            <span className={flowColor}>{flowSign}{fmt(netFlow)}</span>
          </div>
          {projectedBalance != null && (
            <div className="text-xs text-slate-500">
              Projected balance: {fmt(projectedBalance)}
            </div>
          )}
        </div>
      }
    />
  );
}
