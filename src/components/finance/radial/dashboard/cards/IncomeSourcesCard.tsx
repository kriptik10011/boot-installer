/**
 * IncomeSourcesCard — Income sources list with frequency and monthly total.
 *
 * +Add income source, −Delete source (hover-reveal).
 */

import { useMemo, useState, useCallback } from 'react';
import { RadialGlassCard } from '../RadialGlassCard';
import { useIncomeSources, useCreateIncomeSource } from '@/hooks';
import { useToastStore } from '@/stores/toastStore';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { incomeApi } from '@/api/finance';
import { financeV2Keys } from '@/hooks/useFinanceV2';
import { fmtDashboard } from '../../cards/shared/formatUtils';

interface IncomeSource {
  id: number;
  name: string;
  amount: number;
  frequency: string;
  next_expected_date: string | null;
  is_active: boolean;
  color: string | null;
}

interface IncomeSourcesCardProps {
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

const SOURCE_COLORS = ['#34d399', '#3b82f6', '#a78bfa', '#f59e0b', '#22d3ee'];

/** Normalize any frequency to monthly equivalent */
function toMonthly(amount: number, frequency: string): number {
  switch (frequency.toLowerCase()) {
    case 'weekly': return amount * 52 / 12;
    case 'biweekly': return amount * 26 / 12;
    case 'monthly': return amount;
    case 'annual': return amount / 12;
    case 'irregular': return amount;
    default: return amount;
  }
}

function frequencyLabel(freq: string): string {
  switch (freq.toLowerCase()) {
    case 'weekly': return '/wk';
    case 'biweekly': return '/2wk';
    case 'monthly': return '/mo';
    case 'annual': return '/yr';
    case 'irregular': return 'var';
    default: return '';
  }
}

export function IncomeSourcesCard({
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: IncomeSourcesCardProps) {
  const { data: sourcesData } = useIncomeSources();
  const createSource = useCreateIncomeSource();
  const addToast = useToastStore((s) => s.addToast);

  const { requestDelete } = useUndoDelete<IncomeSource>({
    entityLabel: 'income source',
    getItemName: (item) => item.name,
    getItemId: (item) => item.id,
    listQueryKeys: [financeV2Keys.incomeSources],
    deleteFn: (id) => incomeApi.deleteSource(id),
    invalidateKeys: [financeV2Keys.income],
  });

  const [showAdd, setShowAdd] = useState(false);
  const [srcName, setSrcName] = useState('');
  const [srcAmount, setSrcAmount] = useState('');
  const [srcFreq, setSrcFreq] = useState('monthly');

  const handleAdd = useCallback(() => {
    const amount = Math.min(10_000_000, Math.max(0.01, parseFloat(srcAmount) || 0));
    if (!srcName.trim() || amount <= 0) return;
    createSource.mutate(
      {
        name: srcName.trim(),
        amount,
        frequency: srcFreq,
      },
      {
        onSuccess: () => {
          addToast({ message: 'Income source added', type: 'success', durationMs: 4000 });
          setSrcName('');
          setSrcAmount('');
          setSrcFreq('monthly');
          setShowAdd(false);
        },
        onError: () => {
          addToast({ message: 'Failed to add income source', type: 'error', durationMs: 4000 });
        },
      },
    );
  }, [srcName, srcAmount, srcFreq, createSource, addToast]);

  const sources = useMemo(() => {
    const items = (sourcesData ?? []) as IncomeSource[];
    return items.filter((s) => s.is_active).sort((a, b) => toMonthly(b.amount, b.frequency) - toMonthly(a.amount, a.frequency));
  }, [sourcesData]);

  const monthlyTotal = useMemo(
    () => sources.reduce((sum, s) => sum + toMonthly(s.amount, s.frequency), 0),
    [sources],
  );

  return (
    <RadialGlassCard
      accentColor="#34d399"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      {/* Header */}
      <div className="flex justify-between items-baseline mb-1">
        <h2 className="text-xs font-medium text-emerald-400/70 uppercase tracking-wider">
          Income Sources
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {sources.length} active
          </span>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-[10px] text-slate-600 hover:text-emerald-400 transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Source'}
          </button>
        </div>
      </div>

      {/* Add income source form */}
      {showAdd && (
        <div className="space-y-2 mb-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <input
            value={srcName}
            onChange={(e) => setSrcName(e.target.value)}
            placeholder="Source name..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <div className="flex gap-2">
            <input
              value={srcAmount}
              onChange={(e) => setSrcAmount(e.target.value)}
              placeholder="Amount"
              type="number"
              min={0.01}
              max={10000000}
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            />
            <select
              value={srcFreq}
              onChange={(e) => setSrcFreq(e.target.value)}
              className="w-24 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
              <option value="irregular">Irregular</option>
            </select>
          </div>
          <button
            onClick={handleAdd}
            disabled={!srcName.trim() || !srcAmount || createSource.isPending}
            className="w-full px-2 py-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded transition-colors disabled:opacity-50"
          >
            {createSource.isPending ? 'Adding...' : 'Add Source'}
          </button>
        </div>
      )}

      {/* Monthly total */}
      <div className="flex items-baseline gap-2 mb-4">
        <span
          className="text-lg font-semibold text-slate-100"
          style={{ fontFamily: "'Space Grotesk', system-ui" }}
        >
          {fmtDashboard(monthlyTotal)}
        </span>
        <span className="text-xs text-slate-500">/month</span>
      </div>

      {/* Sources list */}
      {sources.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No income sources</p>
      ) : (
        <div className="space-y-2">
          {sources.slice(0, 6).map((source, i) => {
            const color = source.color ?? SOURCE_COLORS[i % SOURCE_COLORS.length];
            const monthly = toMonthly(source.amount, source.frequency);
            const pct = monthlyTotal > 0 ? (monthly / monthlyTotal) * 100 : 0;

            return (
              <div key={source.id} className="space-y-1 group">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-slate-300 truncate max-w-[120px]">{source.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 tabular-nums">
                    <span className="text-slate-200">{fmtDashboard(source.amount)}</span>
                    <span className="text-slate-600 text-[10px]">
                      {frequencyLabel(source.frequency)}
                    </span>
                    <button
                      onClick={() => requestDelete(source)}
                      className="p-0.5 rounded text-slate-700 opacity-0 group-hover:opacity-100 hover:text-rose-400 transition-all"
                      title="Remove source"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Proportion bar */}
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Overflow */}
      {sources.length > 6 && (
        <p className="text-[10px] text-slate-600 mt-2 text-center">
          +{sources.length - 6} more sources
        </p>
      )}
    </RadialGlassCard>
  );
}
