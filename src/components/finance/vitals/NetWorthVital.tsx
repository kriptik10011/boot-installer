/**
 * NetWorthVital — Total net worth with trend sparkline.
 *
 * Compact: "$45,230 +2.3%"
 * Standard: net worth amount + 4-week trend direction
 * Large/Expanded: + asset/liability breakdown
 *
 * Uses useNetWorthCurrent, useNetWorthTrend from useFinanceV2.
 * Solid trust border (user-confirmed data).
 */

import { useMemo } from 'react';
import { useNetWorthCurrent, useNetWorthTrend } from '@/hooks/useFinanceV2';
import { fmt } from '@/components/finance/classic/FinanceHelpers';
import { VitalCard } from './VitalCard';
import type { VitalSize, VitalIntelligenceLayer } from '@/types/vitals';

interface NetWorthVitalProps {
  size: VitalSize;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpen?: () => void;
  onAction?: () => void;
}

export function NetWorthVital({
  size,
  isExpanded,
  onToggleExpand,
  onOpen,
  onAction,
}: NetWorthVitalProps) {
  const { data: current } = useNetWorthCurrent();
  const { data: trendData } = useNetWorthTrend(3);

  const netWorth = (current as any)?.net_worth ?? 0;
  const totalAssets = (current as any)?.total_assets ?? 0;
  const totalLiabilities = (current as any)?.total_liabilities ?? 0;

  // Trend calculation
  const { changeAmount, changePct, trendDirection } = useMemo(() => {
    const trend = Array.isArray(trendData) ? trendData : [];
    if (trend.length < 2) {
      return { changeAmount: 0, changePct: 0, trendDirection: 'flat' as const };
    }
    const oldest = (trend[0] as any)?.net_worth ?? 0;
    const newest = (trend[trend.length - 1] as any)?.net_worth ?? netWorth;
    const change = newest - oldest;
    const pct = oldest !== 0 ? Math.round((change / Math.abs(oldest)) * 100) : 0;
    const dir = change > 0 ? 'up' as const : change < 0 ? 'down' as const : 'flat' as const;
    return { changeAmount: change, changePct: pct, trendDirection: dir };
  }, [trendData, netWorth]);

  const trendColor = trendDirection === 'up'
    ? 'text-emerald-400'
    : trendDirection === 'down'
      ? 'text-amber-400'
      : 'text-slate-400';

  const trendArrow = trendDirection === 'up' ? '\u2191' : trendDirection === 'down' ? '\u2193' : '\u2192';

  // Intelligence layer
  const intelligence = useMemo((): VitalIntelligenceLayer => {
    if (netWorth === 0 && totalAssets === 0) {
      return { narrative: 'Add assets and liabilities to track net worth', action: null, reasoning: null };
    }
    const trendText = changePct !== 0 ? ` (${changePct > 0 ? '+' : ''}${changePct}% over 3 months)` : '';
    return {
      narrative: `Net worth: ${fmt(netWorth)}${trendText}`,
      action: null,
      reasoning: totalAssets > 0 || totalLiabilities > 0
        ? `Assets: ${fmt(totalAssets)} \u2014 Liabilities: ${fmt(totalLiabilities)}`
        : null,
    };
  }, [netWorth, totalAssets, totalLiabilities, changePct]);

  const compactPct = changePct !== 0 ? ` ${changePct > 0 ? '+' : ''}${changePct}%` : '';

  return (
    <VitalCard
      type="net_worth"
      size={size}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      onOpen={onOpen}
      onAction={onAction}
      confidence={0.95}
      intelligence={intelligence}
      compactContent={
        netWorth !== 0 || totalAssets > 0 ? (
          <span className="text-slate-200">
            {fmt(netWorth)}
            {compactPct && <span className={`ml-1 ${trendColor}`}>{compactPct}</span>}
          </span>
        ) : (
          <span className="text-slate-500">Not set up</span>
        )
      }
      standardContent={
        <div className="space-y-2">
          {netWorth !== 0 || totalAssets > 0 ? (
            <>
              <div className="text-lg font-semibold text-slate-200">
                {fmt(netWorth)}
              </div>
              <div className={`text-xs ${trendColor} flex items-center gap-1`}>
                <span>{trendArrow}</span>
                <span>
                  {changeAmount !== 0
                    ? `${changeAmount > 0 ? '+' : ''}${fmt(changeAmount)} (${changePct > 0 ? '+' : ''}${changePct}%)`
                    : 'No change'}
                </span>
                <span className="text-slate-500">3mo</span>
              </div>
            </>
          ) : (
            <span className="text-xs text-slate-500">Add assets and liabilities to see net worth</span>
          )}
        </div>
      }
      expandedContent={
        <div className="space-y-2">
          {totalAssets > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-300">Total Assets</span>
              <span className="text-emerald-400">{fmt(totalAssets)}</span>
            </div>
          )}
          {totalLiabilities > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-300">Total Liabilities</span>
              <span className="text-amber-400">{fmt(totalLiabilities)}</span>
            </div>
          )}
          {Array.isArray(trendData) && trendData.length > 1 && (
            <div className="text-xs text-slate-500 pt-1 border-t border-slate-700/30">
              {trendData.length} data points over 3 months
            </div>
          )}
        </div>
      }
    />
  );
}
