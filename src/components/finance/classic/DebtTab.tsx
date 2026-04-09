/**
 * DebtTab — Debt summary, freedom journey, individual accounts.
 *
 * Extracted verbatim from FinancePanel.tsx L395-444.
 */

import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { DebtFreedomJourney } from '@/components/finance/DebtFreedomJourney';
import { useDebtAccounts, useDebtSummary } from '@/hooks/useFinanceV2';
import { StatCard, SectionTitle, EmptyState, fmt, ProgressBar } from './FinanceHelpers';

export function DebtTab() {
  const { data: accounts, isLoading } = useDebtAccounts();
  const { data: summary } = useDebtSummary();

  if (isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Total Debt" value={fmt(summary.total_debt)} color="amber" />
          <StatCard label="Monthly Min" value={fmt(summary.total_minimum_payments)} />
        </div>
      )}

      {/* Debt Freedom Journey */}
      {summary && summary.total_debt > 0 && (
        <DebtFreedomJourney
          totalDebt={summary.total_debt}
          totalPaid={summary.total_paid || 0}
        />
      )}

      <SectionTitle>Debt Accounts</SectionTitle>
      {accounts && accounts.length > 0 ? (
        <div className="space-y-2">
          {accounts.map((acct: any) => (
            <div key={acct.id} className="bg-slate-700/50 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300 font-medium">{acct.name}</span>
                <span className="text-amber-400">{fmt(acct.current_balance)}</span>
              </div>
              <div className="text-xs text-slate-500">
                {acct.interest_rate}% APR - Min {fmt(acct.minimum_payment)}/mo
              </div>
              {acct.original_balance > 0 && (
                <ProgressBar
                  pct={((acct.original_balance - acct.current_balance) / acct.original_balance) * 100}
                  color="emerald"
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No debt accounts — that's something to celebrate!" />
      )}
    </div>
  );
}
