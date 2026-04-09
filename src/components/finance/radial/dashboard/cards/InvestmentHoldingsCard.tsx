/**
 * InvestmentHoldingsCard — Holdings table with gain/loss and portfolio weight.
 *
 * +Add holding, −Delete holding (hover-reveal).
 */

import { useMemo, useState, useCallback } from 'react';
import { RadialGlassCard } from '../RadialGlassCard';
import { useCreateInvestmentHolding } from '@/hooks';
import { useToastStore } from '@/stores/toastStore';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { investmentsApi } from '@/api/finance';
import { financeV2Keys } from '@/hooks/useFinanceV2';
import { fmtDashboard } from '../../cards/shared/formatUtils';

interface Holding {
  holding_id: number;
  name: string;
  symbol: string | null;
  asset_class: string;
  quantity: number;
  cost_basis: number;
  current_value: number;
  gain_loss: number;
  gain_loss_pct: number;
  weight_pct: number;
}

interface InvestmentHoldingsCardProps {
  holdings: Holding[];
  totalValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

export function InvestmentHoldingsCard({
  holdings,
  totalValue,
  totalGainLoss,
  totalGainLossPct,
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: InvestmentHoldingsCardProps) {
  const createHolding = useCreateInvestmentHolding();
  const addToast = useToastStore((s) => s.addToast);

  const { requestDelete } = useUndoDelete<Holding>({
    entityLabel: 'holding',
    getItemName: (item) => item.symbol ?? item.name,
    getItemId: (item) => item.holding_id,
    listQueryKeys: [financeV2Keys.performance],
    deleteFn: (id) => investmentsApi.deleteHolding(id),
    invalidateKeys: [financeV2Keys.investments, financeV2Keys.netWorth],
  });

  const [showAdd, setShowAdd] = useState(false);
  const [holdingName, setHoldingName] = useState('');
  const [holdingSymbol, setHoldingSymbol] = useState('');
  const [holdingQty, setHoldingQty] = useState('');
  const [holdingCost, setHoldingCost] = useState('');

  const handleAdd = useCallback(() => {
    const qty = Math.min(10_000_000, Math.max(0.0001, parseFloat(holdingQty) || 0));
    const cost = Math.min(10_000_000, Math.max(0, parseFloat(holdingCost) || 0));
    if (!holdingName.trim() || qty <= 0) return;
    createHolding.mutate(
      {
        name: holdingName.trim(),
        symbol: holdingSymbol.trim().toUpperCase() || undefined,
        quantity: qty,
        cost_basis: cost,
        asset_class: 'equity',
      },
      {
        onSuccess: () => {
          addToast({ message: 'Holding added', type: 'success', durationMs: 4000 });
          setHoldingName('');
          setHoldingSymbol('');
          setHoldingQty('');
          setHoldingCost('');
          setShowAdd(false);
        },
        onError: () => {
          addToast({ message: 'Failed to add holding', type: 'error', durationMs: 4000 });
        },
      },
    );
  }, [holdingName, holdingSymbol, holdingQty, holdingCost, createHolding, addToast]);

  const sorted = useMemo(
    () => [...holdings].sort((a, b) => b.current_value - a.current_value),
    [holdings],
  );

  const isPositive = totalGainLoss >= 0;

  return (
    <RadialGlassCard
      accentColor="#f59e0b"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      {/* Header */}
      <div className="flex justify-between items-baseline mb-1">
        <h2 className="text-xs font-medium text-amber-400/70 uppercase tracking-wider">
          Holdings
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {holdings.length} position{holdings.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-[10px] text-slate-600 hover:text-amber-400 transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Holding'}
          </button>
        </div>
      </div>

      {/* Add holding form */}
      {showAdd && (
        <div className="space-y-2 mb-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <div className="flex gap-2">
            <input
              value={holdingName}
              onChange={(e) => setHoldingName(e.target.value)}
              placeholder="Name..."
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            />
            <input
              value={holdingSymbol}
              onChange={(e) => setHoldingSymbol(e.target.value)}
              placeholder="Symbol"
              className="w-16 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            />
          </div>
          <div className="flex gap-2">
            <input
              value={holdingQty}
              onChange={(e) => setHoldingQty(e.target.value)}
              placeholder="Qty"
              type="number"
              min={0.0001}
              max={10000000}
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            />
            <input
              value={holdingCost}
              onChange={(e) => setHoldingCost(e.target.value)}
              placeholder="Cost basis $"
              type="number"
              min={0}
              max={10000000}
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!holdingName.trim() || !holdingQty || createHolding.isPending}
            className="w-full px-2 py-1 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded transition-colors disabled:opacity-50"
          >
            {createHolding.isPending ? 'Adding...' : 'Add Holding'}
          </button>
        </div>
      )}

      {/* Portfolio summary line */}
      <div className="flex items-baseline gap-2 mb-4">
        <span
          className="text-lg font-semibold text-slate-100"
          style={{ fontFamily: "'Space Grotesk', system-ui" }}
        >
          {fmtDashboard(totalValue)}
        </span>
        <span
          className="text-xs font-medium"
          style={{ color: isPositive ? '#34d399' : '#f59e0b' }}
        >
          {isPositive ? '+' : '-'}{fmtDashboard(totalGainLoss)} ({totalGainLossPct >= 0 ? '+' : ''}{totalGainLossPct.toFixed(1)}%)
        </span>
      </div>

      {/* Holdings table */}
      {sorted.length > 0 ? (
        <div className="space-y-2">
          {/* Header row */}
          <div className="flex text-[10px] text-slate-600 uppercase tracking-wider pb-1 border-b border-slate-800">
            <span className="flex-1">Name</span>
            <span className="w-16 text-right">Value</span>
            <span className="w-16 text-right">G/L</span>
            <span className="w-10 text-right">Wt%</span>
          </div>

          {sorted.slice(0, 10).map((h) => {
            const glPositive = h.gain_loss >= 0;
            const glColor = glPositive ? '#34d399' : '#f59e0b';

            return (
              <div key={h.holding_id} className="flex items-center text-xs group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {h.symbol && (
                      <span className="text-slate-300 font-medium text-[11px]">{h.symbol}</span>
                    )}
                    <span className="text-slate-500 truncate text-[10px]">{h.name}</span>
                  </div>
                </div>
                <span className="w-16 text-right text-slate-300 tabular-nums">
                  {fmtDashboard(h.current_value)}
                </span>
                <span
                  className="w-16 text-right tabular-nums"
                  style={{ color: glColor }}
                >
                  {glPositive ? '+' : '-'}{h.gain_loss_pct.toFixed(1)}%
                </span>
                <span className="w-10 text-right text-slate-500 tabular-nums">
                  {h.weight_pct.toFixed(0)}%
                </span>
                <button
                  onClick={() => requestDelete(h)}
                  className="p-0.5 rounded text-slate-700 opacity-0 group-hover:opacity-100 hover:text-rose-400 transition-all ml-1"
                  title="Remove holding"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500 text-center py-4">No holdings yet</p>
      )}

      {/* Overflow */}
      {sorted.length > 10 && (
        <p className="text-[10px] text-slate-600 mt-2 text-center">
          +{sorted.length - 10} more holdings
        </p>
      )}
    </RadialGlassCard>
  );
}
