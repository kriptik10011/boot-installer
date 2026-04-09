/**
 * TransactionsTab — This month's transactions list.
 *
 * Extracted verbatim from FinancePanel.tsx L289-317.
 */

import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { useTransactions } from '@/hooks/useFinanceV2';
import { SectionTitle, EmptyState, fmt } from './FinanceHelpers';

export function TransactionsTab() {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.substring(0, 8) + '01';
  const { data: txns, isLoading } = useTransactions({ start_date: firstOfMonth, end_date: today });

  if (isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-3">
      <SectionTitle>This Month</SectionTitle>
      {txns && txns.length > 0 ? (
        <div className="space-y-1">
          {txns.slice(0, 20).map((txn: any) => (
            <div key={txn.id} className="flex justify-between text-sm py-1 border-b border-slate-700/50">
              <div>
                <div className="text-slate-300">{txn.description || txn.merchant || 'Transaction'}</div>
                <div className="text-xs text-slate-500">{txn.date}</div>
              </div>
              <span className={txn.is_income ? 'text-emerald-400' : 'text-slate-300'}>
                {txn.is_income ? '+' : '-'}{fmt(txn.amount)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No transactions this month" />
      )}
    </div>
  );
}
