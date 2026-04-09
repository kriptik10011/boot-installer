/**
 * BillsRadarVital — Upcoming and predicted bills with trust borders.
 *
 * Compact: "2 bills due -- $540"
 * Standard: upcoming bills list + predicted bills with dashed trust borders
 * Large/Expanded: + escalation timeline + mark paid action
 *
 * Uses useFinanceIntelligence (canonical data source), useBillPredictions from usePredictions.
 * No-Shame: "approaching" language, amber not red.
 */

import { useMemo, useCallback } from 'react';
import { useFinanceIntelligence } from '@/hooks/useFinanceIntelligence';
import { useBillPredictions } from '@/hooks/usePredictions';
import type { PredictedBill } from '@/api/finance';
import { fmt } from '@/components/finance/classic/FinanceHelpers';
import { VitalCard } from './VitalCard';
import type { VitalSize, VitalIntelligenceLayer } from '@/types/vitals';

interface BillsRadarVitalProps {
  size: VitalSize;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpen?: () => void;
  onAction?: () => void;
}

export function BillsRadarVital({
  size,
  isExpanded,
  onToggleExpand,
  onOpen,
  onAction,
}: BillsRadarVitalProps) {
  const { upcoming14d: bills, markPaid: unifiedMarkPaid } = useFinanceIntelligence();
  const { data: predictions } = useBillPredictions(14);

  const predictedBills = predictions?.predictions ?? [];

  // Total upcoming amount
  const totalAmount = useMemo(() => {
    const fromBills = bills.reduce((sum, b) => sum + b.amount, 0);
    const fromPredictions = predictedBills.reduce((sum: number, p: PredictedBill) => sum + (p.predicted_amount ?? 0), 0);
    return fromBills + fromPredictions;
  }, [bills, predictedBills]);

  const totalCount = bills.length + predictedBills.length;

  // Check for urgent bills (daysUntilDue <= 2, using pre-computed value)
  const hasUrgent = useMemo(() => {
    return bills.some((b) => b.daysUntilDue >= 0 && b.daysUntilDue <= 2);
  }, [bills]);

  // Intelligence layer
  const intelligence = useMemo((): VitalIntelligenceLayer => {
    if (totalCount === 0) {
      return { narrative: 'No bills approaching', action: null, reasoning: null };
    }
    const urgentText = hasUrgent ? ' (some due soon)' : '';
    return {
      narrative: `${totalCount} bill${totalCount !== 1 ? 's' : ''} approaching${urgentText}`,
      action: null,
      reasoning: predictedBills.length > 0
        ? `${predictedBills.length} predicted based on your recurring patterns`
        : null,
    };
  }, [totalCount, hasUrgent, predictedBills.length]);

  const handleMarkPaid = useCallback(
    (bill: typeof bills[number], e: React.MouseEvent) => {
      e.stopPropagation();
      unifiedMarkPaid(bill);
      onAction?.();
    },
    [unifiedMarkPaid, onAction]
  );

  // Days until due label (pre-computed by intelligence hook)
  const dueLabel = (bill: typeof bills[number]) => `Due ${bill.dayLabel.toLowerCase()}`;

  return (
    <VitalCard
      type="bills_radar"
      size={size}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      onOpen={onOpen}
      onAction={onAction}
      confidence={0.85}
      hasAlert={hasUrgent}
      intelligence={intelligence}
      compactContent={
        totalCount > 0 ? (
          <span>
            <span className="text-slate-200">{totalCount} bill{totalCount !== 1 ? 's' : ''}</span>
            <span className="text-slate-500 mx-1">\u2014</span>
            <span className="text-amber-400">{fmt(totalAmount)}</span>
          </span>
        ) : (
          <span className="text-emerald-400">All clear</span>
        )
      }
      standardContent={
        <div className="space-y-1.5">
          {/* Confirmed upcoming bills */}
          {bills.slice(0, 3).map((bill) => (
            <div key={bill.uid} className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                <span className="text-slate-200 truncate">{bill.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-1">
                <span className="text-slate-400">{dueLabel(bill)}</span>
                <span className="text-slate-200 font-medium">{fmt(bill.amount)}</span>
              </div>
            </div>
          ))}

          {/* Predicted bills (dashed indicator) */}
          {predictedBills.slice(0, 2).map((pred: PredictedBill) => (
            <div key={pred.recurrence_id} className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full border border-dashed border-slate-400 flex-shrink-0" />
                <span className="text-slate-300 truncate">{pred.description}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-1">
                <span className="text-slate-500">Due {pred.predicted_date?.slice(5) ?? 'TBD'}</span>
                <span className="text-slate-300 font-medium">~{fmt(pred.predicted_amount)}</span>
              </div>
            </div>
          ))}

          {totalCount === 0 && (
            <span className="text-xs text-slate-500">No upcoming bills</span>
          )}
        </div>
      }
      expandedContent={
        <div className="space-y-2">
          {/* Full bill list with mark-paid action */}
          {bills.map((bill) => (
            <div key={bill.uid} className="flex justify-between items-center text-xs">
              <div>
                <span className="text-slate-200">{bill.name}</span>
                <span className="text-slate-500 ml-1.5">{fmt(bill.amount)}</span>
              </div>
              <button
                className="text-cyan-400 hover:text-cyan-300 transition-colors"
                onClick={(e) => handleMarkPaid(bill, e)}
              >
                Mark Paid
              </button>
            </div>
          ))}

          {/* Full prediction list */}
          {predictedBills.map((pred: PredictedBill) => (
            <div key={pred.recurrence_id} className="flex justify-between items-center text-xs border-t border-slate-700/30 pt-1">
              <div>
                <span className="text-slate-300">{pred.description}</span>
                <span className="text-slate-500 ml-1.5">~{fmt(pred.predicted_amount)}</span>
              </div>
              <span className="text-slate-500 text-[10px]">
                {Math.round(pred.confidence * 100)}% confident
              </span>
            </div>
          ))}
        </div>
      }
    />
  );
}
