/**
 * InvestmentsTab — Portfolio summary + individual accounts.
 *
 * Extracted verbatim from FinancePanel.tsx L484-526.
 */

import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { useInvestmentAccounts, useInvestmentSummary } from '@/hooks/useFinanceV2';
import { StatCard, SectionTitle, EmptyState, fmt, fmtPct } from './FinanceHelpers';

export function InvestmentsTab() {
  const { data: accounts, isLoading } = useInvestmentAccounts();
  const { data: summary } = useInvestmentSummary();

  if (isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Total Value" value={fmt(summary.total_value)} color="cyan" />
          <StatCard
            label="Gain/Loss"
            value={`${summary.total_gain_loss >= 0 ? '+' : ''}${fmt(summary.total_gain_loss)}`}
            sublabel={fmtPct(summary.total_gain_loss_pct)}
            color={summary.total_gain_loss >= 0 ? 'emerald' : 'red'}
          />
        </div>
      )}

      <SectionTitle>Accounts</SectionTitle>
      {accounts && accounts.length > 0 ? (
        <div className="space-y-2">
          {accounts.map((acct: any) => (
            <div key={acct.id} className="bg-slate-700/50 rounded-lg p-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300 font-medium">{acct.name}</span>
                <span className="text-cyan-400">{fmt(acct.total_value)}</span>
              </div>
              <div className="text-xs text-slate-500">{acct.type} - {acct.institution || 'N/A'}</div>
              {acct.total_gain_loss !== 0 && (
                <div className={`text-xs mt-1 ${acct.total_gain_loss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {acct.total_gain_loss >= 0 ? '+' : ''}{fmt(acct.total_gain_loss)} ({fmtPct(acct.total_gain_loss_pct)})
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No investment accounts" />
      )}
    </div>
  );
}
