/**
 * SubscriptionCard — Monthly subscription total + list of recurring items.
 * Display-only: subscriptions are added via BillPanel (traditional view).
 * Actions: delete (hover-reveal).
 */

import { RadialGlassCard } from '../RadialGlassCard';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { recurringApi } from '@/api/finance';
import { financeV2Keys } from '@/hooks/useFinanceV2';
import { fmtDashboard } from '../../cards/shared/formatUtils';

interface RecurringItem {
  id: number;
  description: string;
  amount: number;
  frequency: string;
  next_due?: string;
}

interface SubscriptionCardProps {
  subscriptions: RecurringItem[];
  monthlyTotal: number;
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: '/wk',
  biweekly: '/2wk',
  monthly: '/mo',
  quarterly: '/qtr',
  annual: '/yr',
};

export function SubscriptionCard({
  subscriptions,
  monthlyTotal,
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: SubscriptionCardProps) {
  const { requestDelete } = useUndoDelete<RecurringItem>({
    entityLabel: 'subscription',
    getItemName: (item) => item.description,
    getItemId: (item) => item.id,
    listQueryKeys: [financeV2Keys.recurringList],
    deleteFn: (id) => recurringApi.delete(id),
    invalidateKeys: [financeV2Keys.recurring],
  });

  const shown = subscriptions.slice(0, 5);

  return (
    <RadialGlassCard
      accentColor="#a855f7"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      <div className="flex justify-between items-baseline mb-3">
        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Subscriptions</h3>
        <span className="text-[10px] text-slate-600">
          {subscriptions.length} active
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-4">
        <span
          className="text-2xl font-bold text-purple-400"
          style={{ fontFamily: "'Space Grotesk', system-ui" }}
        >
          {fmtDashboard(monthlyTotal)}
        </span>
        <span className="text-xs text-slate-500">/month</span>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-slate-500">No recurring expenses</p>
      ) : (
        <div className="space-y-2">
          {shown.map((sub) => (
            <div key={sub.id} className="flex items-center justify-between group">
              <span className="text-sm text-slate-300 truncate">{sub.description}</span>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span
                  className="text-sm text-slate-400"
                  style={{ fontFamily: "'Space Grotesk', system-ui" }}
                >
                  {fmtDashboard(sub.amount)}
                </span>
                <span className="text-[10px] text-slate-600">
                  {FREQ_LABELS[sub.frequency] ?? `/${sub.frequency}`}
                </span>
                <button
                  onClick={() => requestDelete(sub)}
                  className="p-0.5 rounded text-slate-700 opacity-0 group-hover:opacity-100 hover:text-rose-400 transition-all"
                  title="Remove subscription"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {subscriptions.length > 5 && (
            <p className="text-[10px] text-slate-500 text-center mt-1">
              +{subscriptions.length - 5} more
            </p>
          )}
        </div>
      )}
    </RadialGlassCard>
  );
}
