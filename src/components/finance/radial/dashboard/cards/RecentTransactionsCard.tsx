/**
 * RecentTransactionsCard — Recent transactions with category filter.
 *
 * +Add transaction, self-contained via useTransactions.
 */

import { useMemo, useState, useCallback } from 'react';
import { RadialGlassCard } from '../RadialGlassCard';
import { useTransactions, useCreateTransaction } from '@/hooks';
import { useToastStore } from '@/stores/toastStore';
import { fmtDashboardCents } from '../../cards/shared/formatUtils';

interface Transaction {
  id: number;
  description: string;
  amount: number;
  date: string;
  category_name?: string;
  type?: string;
  is_income?: boolean;
}

interface RecentTransactionsCardProps {
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
  timeRangeDays?: number;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function RecentTransactionsCard({
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
  timeRangeDays = 30,
}: RecentTransactionsCardProps) {
  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - timeRangeDays);
    return d.toISOString().slice(0, 10);
  }, [timeRangeDays]);
  const { data: txData } = useTransactions({ limit: '30', sort: 'date_desc', start_date: startDate });
  const createTx = useCreateTransaction();
  const addToast = useToastStore((s) => s.addToast);
  const [filter, setFilter] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');

  const handleAdd = useCallback(() => {
    const amount = Math.min(10_000_000, Math.max(0.01, parseFloat(txAmount) || 0));
    if (!txDesc.trim() || amount <= 0) return;
    createTx.mutate(
      {
        description: txDesc.trim(),
        amount,
        date: new Date().toISOString().slice(0, 10),
        is_income: txType === 'income',
      },
      {
        onSuccess: () => {
          addToast({ message: 'Transaction added', type: 'success', durationMs: 4000 });
          setTxDesc('');
          setTxAmount('');
          setTxType('expense');
          setShowAdd(false);
        },
        onError: () => {
          addToast({ message: 'Failed to add transaction', type: 'error', durationMs: 4000 });
        },
      },
    );
  }, [txDesc, txAmount, txType, createTx, addToast]);

  const transactions = useMemo(() => {
    return ((txData ?? []) as Transaction[]).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [txData]);

  // Unique categories for filter chips
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const tx of transactions) {
      if (tx.category_name) cats.add(tx.category_name);
    }
    return Array.from(cats).slice(0, 5);
  }, [transactions]);

  const filtered = useMemo(() => {
    if (!filter) return transactions;
    return transactions.filter((tx) => tx.category_name === filter);
  }, [transactions, filter]);

  const shown = filtered.slice(0, 10);

  return (
    <RadialGlassCard
      accentColor="#8b5cf6"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      {/* Header */}
      <div className="flex justify-between items-baseline mb-2">
        <h2 className="text-xs font-medium text-violet-400/70 uppercase tracking-wider">
          Recent Transactions
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {transactions.length} total
          </span>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-[10px] text-slate-600 hover:text-violet-400 transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Tx'}
          </button>
        </div>
      </div>

      {/* Add transaction form */}
      {showAdd && (
        <div className="space-y-2 mb-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <input
            value={txDesc}
            onChange={(e) => setTxDesc(e.target.value)}
            placeholder="Description..."
            maxLength={100}
            className="w-full bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <div className="flex gap-2">
            <input
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
              placeholder="Amount"
              type="number"
              min={0.01}
              max={10000000}
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            />
            <select
              value={txType}
              onChange={(e) => setTxType(e.target.value as 'expense' | 'income')}
              className="w-24 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <button
            onClick={handleAdd}
            disabled={!txDesc.trim() || !txAmount || createTx.isPending}
            className="w-full px-2 py-1 text-xs font-medium text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 rounded transition-colors disabled:opacity-50"
          >
            {createTx.isPending ? 'Adding...' : 'Add Transaction'}
          </button>
        </div>
      )}

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div className="flex gap-1 mb-3 flex-wrap">
          <button
            onClick={() => setFilter(null)}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              filter === null ? 'text-violet-400 bg-violet-400/10' : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(filter === cat ? null : cat)}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors truncate max-w-[80px] ${
                filter === cat ? 'text-violet-400 bg-violet-400/10' : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Transaction list */}
      {shown.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No transactions</p>
      ) : (
        <div className="space-y-2">
          {shown.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-300 truncate">{tx.description}</p>
                <p className="text-[10px] text-slate-600">
                  {tx.category_name ?? 'Uncategorized'} · {formatDate(tx.date)}
                </p>
              </div>
              <span
                className="text-xs font-medium shrink-0 ml-3 tabular-nums"
                style={{
                  color: tx.is_income ? '#34d399' : '#f59e0b',
                  fontFamily: "'Space Grotesk', system-ui",
                }}
              >
                {tx.is_income ? '+' : '-'}{fmtDashboardCents(tx.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Overflow */}
      {filtered.length > 10 && (
        <p className="text-[10px] text-slate-600 mt-2 text-center">
          +{filtered.length - 10} more transactions
        </p>
      )}
    </RadialGlassCard>
  );
}
