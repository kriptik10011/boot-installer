/**
 * BillsRadarCard — Upcoming bills sorted by urgency with mark-paid flow.
 *
 * Display-only: bills are added via BillPanel (traditional view).
 * Actions: mark paid, delete (hover-reveal).
 */

import { useState } from 'react';
import { RadialGlassCard } from '../RadialGlassCard';
import { useFinanceIntelligence, type ComputedBill } from '@/hooks/useFinanceIntelligence';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { financesApi, recurringApi } from '@/api/finance';
import { financeKeys } from '@/hooks/useFinances';
import { financeV2Keys } from '@/hooks/useFinanceV2';
import { fmtDashboard } from '../../cards/shared/formatUtils';

interface BillsRadarCardProps {
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
  timeRangeDays?: number;
}

export function BillsRadarCard({
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
  timeRangeDays = 30,
}: BillsRadarCardProps) {
  const { upcoming30d: bills, recurring, markPaid, markPaidPending } = useFinanceIntelligence();
  const [pendingUid, setPendingUid] = useState<string | null>(null);

  // Source-aware undo-delete: separate instances for one-time and recurring
  const { requestDelete: requestDeleteOneTime } = useUndoDelete<ComputedBill>({
    entityLabel: 'bill',
    getItemName: (item) => item.name,
    getItemId: (item) => item.rawId,
    listQueryKeys: [financeKeys.list('bill', false, undefined)],
    deleteFn: (id) => financesApi.delete(id),
    invalidateKeys: [financeKeys.all],
  });
  const { requestDelete: requestDeleteRecurring } = useUndoDelete<ComputedBill>({
    entityLabel: 'bill',
    getItemName: (item) => item.name,
    getItemId: (item) => item.rawId,
    listQueryKeys: [financeV2Keys.recurringUpcoming(timeRangeDays)],
    deleteFn: (id) => recurringApi.delete(id),
    invalidateKeys: [financeV2Keys.recurring],
  });
  const requestDelete = (bill: ComputedBill) => {
    if (bill.source === 'one_time') requestDeleteOneTime(bill);
    else requestDeleteRecurring(bill);
  };

  const overdueCount = bills.filter((b) => b.isOverdue).length;
  const totalUpcoming = bills.reduce((sum, b) => sum + b.amount, 0);
  const recurringItems = recurring;
  const monthlySubTotal = recurringItems.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const hasAnomaly = overdueCount > 0;

  const handleMarkPaid = (bill: ComputedBill) => {
    setPendingUid(bill.uid);
    markPaid(bill).finally(() => setPendingUid(null));
  };

  return (
    <RadialGlassCard
      accentColor="#3b82f6"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      hasAnomaly={hasAnomaly}
      onFocus={onFocus}
    >
      {/* Header */}
      <div className="flex justify-between items-baseline mb-1">
        <h2 className="text-xs font-medium text-blue-400/70 uppercase tracking-wider">
          Bills & Recurring
        </h2>
        {overdueCount > 0 && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400">
            {overdueCount} overdue
          </span>
        )}
      </div>

      {/* Summary metrics */}
      <div className="flex gap-4 mb-4 text-xs">
        <div>
          <span className="text-slate-500">Next {timeRangeDays}d</span>
          <span className="ml-1 text-slate-200 font-medium">{fmtDashboard(totalUpcoming)}</span>
        </div>
        <div>
          <span className="text-slate-500">Subs</span>
          <span className="ml-1 text-slate-200 font-medium">{fmtDashboard(monthlySubTotal)}/mo</span>
        </div>
        <div>
          <span className="text-slate-500">Bills</span>
          <span className="ml-1 text-slate-200 font-medium">{bills.length}</span>
        </div>
      </div>

      {/* Bills list */}
      {bills.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No upcoming bills</p>
      ) : (
        <div className="space-y-2">
          {bills.slice(0, 8).map((bill) => {
            const color = bill.urgencyColor;
            const isPending = pendingUid === bill.uid;

            return (
              <div
                key={bill.uid}
                className="flex items-center gap-2 group"
              >
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-300 truncate">{bill.name}</span>
                    <span
                      className="text-[10px] flex-shrink-0"
                      style={{ color }}
                    >
                      {bill.dayLabel}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">
                  {fmtDashboard(bill.amount)}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => handleMarkPaid(bill)}
                    disabled={isPending || markPaidPending}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
                    aria-label={`Mark ${bill.name} as paid`}
                  >
                    {isPending ? '...' : 'Paid'}
                  </button>
                  <button
                    onClick={() => requestDelete(bill)}
                    className="p-0.5 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="Delete bill"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {bills.length > 8 && (
        <p className="text-[10px] text-slate-600 mt-2 text-center">
          +{bills.length - 8} more bills
        </p>
      )}
    </RadialGlassCard>
  );
}
