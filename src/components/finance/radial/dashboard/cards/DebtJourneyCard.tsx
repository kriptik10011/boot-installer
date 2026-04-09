/**
 * DebtJourneyCard — Debt payoff progress with strategy comparison.
 *
 * +Add debt account, −Delete account.
 * Shows per-account progress bars, weighted avg APR, strategy comparison.
 */

import { useMemo, useState, useCallback } from 'react';
import { RadialGlassCard } from '../RadialGlassCard';
import { usePayoffPlan, useCreateDebtAccount } from '@/hooks';
import { useToastStore } from '@/stores/toastStore';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { debtApi } from '@/api/finance';
import { financeV2Keys } from '@/hooks/useFinanceV2';
import { fmtDashboard } from '../../cards/shared/formatUtils';

interface DebtAccount {
  id: number;
  name: string;
  current_balance: number;
  original_balance: number;
  interest_rate: number;
  minimum_payment: number;
}

interface DebtJourneyCardProps {
  accounts: DebtAccount[];
  totalDebt: number;
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

const DEBT_COLORS = ['#d97706', '#f97316', '#f59e0b', '#a855f7', '#6366f1'];

type ViewMode = 'progress' | 'strategy';

export function DebtJourneyCard({
  accounts,
  totalDebt,
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: DebtJourneyCardProps) {
  const [view, setView] = useState<ViewMode>('progress');
  const { data: avalancheData } = usePayoffPlan('avalanche');
  const { data: snowballData } = usePayoffPlan('snowball');
  const createDebt = useCreateDebtAccount();
  const addToast = useToastStore((s) => s.addToast);

  const { requestDelete } = useUndoDelete<DebtAccount>({
    entityLabel: 'debt account',
    getItemName: (item) => item.name,
    getItemId: (item) => item.id,
    listQueryKeys: [financeV2Keys.debtAccounts],
    deleteFn: (id) => debtApi.deleteAccount(id),
    invalidateKeys: [financeV2Keys.debt, financeV2Keys.netWorth],
  });

  const [showAdd, setShowAdd] = useState(false);
  const [debtName, setDebtName] = useState('');
  const [debtBalance, setDebtBalance] = useState('');
  const [debtRate, setDebtRate] = useState('');
  const [debtMinPay, setDebtMinPay] = useState('');

  const handleAdd = useCallback(() => {
    const balance = Math.min(10_000_000, Math.max(0.01, parseFloat(debtBalance) || 0));
    const rate = Math.max(0, Math.min(100, parseFloat(debtRate) || 0));
    const minPay = Math.min(balance, Math.max(0, parseFloat(debtMinPay) || 0));
    if (!debtName.trim() || balance <= 0) return;
    createDebt.mutate(
      {
        name: debtName.trim(),
        current_balance: balance,
        original_balance: balance,
        interest_rate: rate,
        minimum_payment: minPay,
      },
      {
        onSuccess: () => {
          addToast({ message: 'Debt account added', type: 'success', durationMs: 4000 });
          setDebtName('');
          setDebtBalance('');
          setDebtRate('');
          setDebtMinPay('');
          setShowAdd(false);
        },
        onError: () => {
          addToast({ message: 'Failed to add debt account', type: 'error', durationMs: 4000 });
        },
      },
    );
  }, [debtName, debtBalance, debtRate, debtMinPay, createDebt, addToast]);

  const shown = accounts.slice(0, 5);

  // Weighted average interest rate
  const weightedAvgRate = useMemo(() => {
    if (totalDebt <= 0) return 0;
    const weighted = accounts.reduce(
      (sum, a) => sum + a.interest_rate * a.current_balance,
      0,
    );
    return weighted / totalDebt;
  }, [accounts, totalDebt]);

  // Parse strategy data
  const avalanche = avalancheData as {
    total_months?: number;
    total_interest?: number;
    debt_free_date?: string;
  } | null;
  const snowball = snowballData as {
    total_months?: number;
    total_interest?: number;
    debt_free_date?: string;
  } | null;

  const interestSavings = useMemo(() => {
    if (!avalanche?.total_interest || !snowball?.total_interest) return null;
    return snowball.total_interest - avalanche.total_interest;
  }, [avalanche, snowball]);

  const hasStrategy = avalanche?.total_months != null || snowball?.total_months != null;

  return (
    <RadialGlassCard
      accentColor="#d97706"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      {/* Header */}
      <div className="flex justify-between items-baseline mb-1">
        <h2 className="text-xs font-medium text-rose-400/70 uppercase tracking-wider">
          Debt Journey
        </h2>
        <div className="flex items-center gap-1">
          {hasStrategy && (
            <>
              <button
                onClick={() => setView('progress')}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  view === 'progress' ? 'text-rose-400 bg-rose-400/10' : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                Progress
              </button>
              <button
                onClick={() => setView('strategy')}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  view === 'strategy' ? 'text-rose-400 bg-rose-400/10' : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                Strategy
              </button>
            </>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-[10px] text-slate-600 hover:text-rose-400 transition-colors ml-1"
          >
            {showAdd ? 'Cancel' : '+ Debt'}
          </button>
        </div>
      </div>

      {/* Add debt form */}
      {showAdd && (
        <div className="space-y-2 mb-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <input
            value={debtName}
            onChange={(e) => setDebtName(e.target.value)}
            placeholder="Debt name..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
          />
          <div className="flex gap-2">
            <input
              value={debtBalance}
              onChange={(e) => setDebtBalance(e.target.value)}
              placeholder="Balance"
              type="number"
              min={0.01}
              max={10000000}
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            />
            <input
              value={debtRate}
              onChange={(e) => setDebtRate(e.target.value)}
              placeholder="APR %"
              type="number"
              min={0}
              max={100}
              className="w-16 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            />
            <input
              value={debtMinPay}
              onChange={(e) => setDebtMinPay(e.target.value)}
              placeholder="Min $"
              type="number"
              min={0}
              max={10000000}
              className="w-16 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!debtName.trim() || !debtBalance || createDebt.isPending}
            className="w-full px-2 py-1 text-xs font-medium text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded transition-colors disabled:opacity-50"
          >
            {createDebt.isPending ? 'Adding...' : 'Add Debt'}
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="flex items-baseline gap-2 mb-1">
        <span
          className="text-lg font-semibold text-slate-100"
          style={{ fontFamily: "'Space Grotesk', system-ui" }}
        >
          {fmtDashboard(totalDebt)}
        </span>
        <span className="text-xs text-slate-500">remaining</span>
      </div>

      {/* Sub-metrics */}
      <div className="flex gap-4 mb-4 text-xs">
        <div>
          <span className="text-slate-500">Avg APR</span>
          <span className="ml-1 text-slate-200 font-medium">
            {weightedAvgRate.toFixed(1)}%
          </span>
        </div>
        {avalanche?.debt_free_date && (
          <div>
            <span className="text-slate-500">Debt-free</span>
            <span className="ml-1 text-slate-200 font-medium">
              {new Date(avalanche.debt_free_date).toLocaleDateString(undefined, {
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        )}
        <div>
          <span className="text-slate-500">Accounts</span>
          <span className="ml-1 text-slate-200 font-medium">{accounts.length}</span>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-2">
          <p className="text-sm text-emerald-400">Debt-free!</p>
          <p className="text-xs text-slate-500 mt-1">No active debt accounts</p>
        </div>
      ) : view === 'progress' ? (
        /* Progress bars per account */
        <div className="space-y-3">
          {shown.map((account, i) => {
            const paidOff = account.original_balance > 0
              ? Math.max(0, 1 - account.current_balance / account.original_balance)
              : 0;
            const pct = Math.round(paidOff * 100);
            const color = DEBT_COLORS[i % DEBT_COLORS.length];

            return (
              <div key={account.id} className="group">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 truncate">{account.name}</span>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className="text-slate-500">{pct}% paid</span>
                    <button
                      onClick={() => requestDelete(account)}
                      className="p-0.5 rounded text-slate-700 opacity-0 group-hover:opacity-100 hover:text-rose-400 transition-all"
                      title="Remove debt"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                  <span>{fmtDashboard(account.current_balance)} left</span>
                  <span>{account.interest_rate}% APR</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Strategy comparison */
        <div className="space-y-3">
          {[
            { label: 'Avalanche', desc: 'Highest APR first', data: avalanche, color: '#3b82f6' },
            { label: 'Snowball', desc: 'Smallest balance first', data: snowball, color: '#a855f7' },
          ].map(({ label, desc, data, color }) => (
            <div
              key={label}
              className="rounded-lg px-3 py-2"
              style={{ background: `${color}0D` }}
            >
              <div className="flex justify-between items-baseline mb-1">
                <div>
                  <span className="text-xs font-medium" style={{ color }}>
                    {label}
                  </span>
                  <span className="text-[10px] text-slate-600 ml-1.5">{desc}</span>
                </div>
                {data?.total_months != null && (
                  <span className="text-xs text-slate-300 font-medium tabular-nums">
                    {data.total_months}mo
                  </span>
                )}
              </div>
              {data?.total_interest != null && (
                <div className="text-[10px] text-slate-500">
                  Total interest: <span className="text-slate-400">{fmtDashboard(data.total_interest)}</span>
                </div>
              )}
            </div>
          ))}

          {interestSavings != null && interestSavings > 0 && (
            <div className="text-center py-1.5 rounded-lg bg-emerald-500/10">
              <span className="text-xs text-emerald-400 font-medium">
                Avalanche saves {fmtDashboard(interestSavings)} in interest
              </span>
            </div>
          )}
        </div>
      )}

      {/* Overflow */}
      {accounts.length > 5 && view === 'progress' && (
        <p className="text-[10px] text-slate-600 mt-2 text-center">
          +{accounts.length - 5} more accounts
        </p>
      )}
    </RadialGlassCard>
  );
}
