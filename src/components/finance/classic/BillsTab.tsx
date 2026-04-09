/**
 * BillsTab — Subscription summary + recurring bills list.
 *
 * Extracted verbatim from FinancePanel.tsx L320-353.
 */

import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { useFinanceIntelligence } from '@/hooks/useFinanceIntelligence';
import { useBillPredictions } from '@/hooks/usePredictions';
import { BillPredictionCard } from '@/components/finance/BillPredictionCard';
import { StatCard, SectionTitle, EmptyState, fmt } from './FinanceHelpers';

export function BillsTab() {
  const { recurring, subscriptionSummary, isLoading } = useFinanceIntelligence();
  const { data: predictions } = useBillPredictions(14);

  if (isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      {/* Subscription summary */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Monthly Subs" value={fmt(subscriptionSummary.monthly)} sublabel={`${subscriptionSummary.count} active`} />
        <StatCard label="Annual Cost" value={fmt(subscriptionSummary.annual)} color="amber" />
      </div>

      <SectionTitle>Recurring Bills</SectionTitle>
      {recurring.length > 0 ? (
        <div className="space-y-1">
          {recurring.map((b) => (
            <div key={b.uid} className="flex justify-between text-sm py-1.5 border-b border-slate-700/50">
              <div>
                <div className="text-slate-300">{b.name}</div>
                <div className="text-xs text-slate-500">{b.frequency} - Next: {b.dueDate || 'N/A'}</div>
              </div>
              <span className="text-slate-400">{fmt(b.amount)}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No recurring bills set up" />
      )}

      {/* Predicted bills (AI) */}
      {predictions?.predictions && predictions.predictions.length > 0 && (
        <>
          <SectionTitle>Predicted Bills</SectionTitle>
          <div className="space-y-2">
            {predictions.predictions.map((pred) => (
              <BillPredictionCard key={pred.recurrence_id} prediction={pred} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
