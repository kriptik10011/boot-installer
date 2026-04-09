/**
 * PropertyPNLCard — Profit & Loss for a selected property.
 * Shows income, expenses, NOI, and expense breakdown.
 * +Add expense, −Delete expense.
 */

import { useState, useMemo, useCallback } from 'react';
import { RadialGlassCard } from '../finance/radial/dashboard/RadialGlassCard';
import { usePropertyPNL, useCreatePropertyExpense } from '@/hooks';

interface PropertyPNLCardProps {
  cardId: string;
  propertyId: number;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

function fmt(n: number): string {
  return `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const CATEGORY_OPTIONS = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'repair', label: 'Repair' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'tax', label: 'Tax' },
  { value: 'utility', label: 'Utility' },
  { value: 'management', label: 'Mgmt' },
  { value: 'legal', label: 'Legal' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'hoa', label: 'HOA' },
  { value: 'landscaping', label: 'Landscape' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'advertising', label: 'Ads' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

export function PropertyPNLCard({
  cardId,
  propertyId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: PropertyPNLCardProps) {
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const today = now.toISOString().slice(0, 10);
  const { data: pnl } = usePropertyPNL(propertyId, yearStart, today);
  const createExpense = useCreatePropertyExpense();

  const [showAdd, setShowAdd] = useState(false);
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('other');
  const [expDesc, setExpDesc] = useState('');

  const maxExpense = useMemo(() => {
    if (!pnl) return 1;
    return Math.max(...pnl.expense_breakdown.map((e) => e.amount), 1);
  }, [pnl]);

  const noiColor = pnl && pnl.net_operating_income >= 0 ? '#34d399' : '#f59e0b';

  const handleAddExpense = useCallback(() => {
    const amount = parseFloat(expAmount);
    if (!amount || amount <= 0) return;
    createExpense.mutate(
      {
        property_id: propertyId,
        amount,
        category: expCategory,
        date: today,
        description: expDesc.trim() || undefined,
      },
      {
        onSuccess: () => {
          setExpAmount('');
          setExpCategory('other');
          setExpDesc('');
          setShowAdd(false);
        },
      },
    );
  }, [propertyId, expAmount, expCategory, expDesc, today, createExpense]);

  return (
    <RadialGlassCard
      accentColor="#d97706"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="text-xs font-medium text-amber-400/70 uppercase tracking-wider">
          P&L ({now.getFullYear()})
        </h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-[10px] text-slate-600 hover:text-amber-400 transition-colors"
        >
          {showAdd ? 'Cancel' : '+ Expense'}
        </button>
      </div>

      {/* Add expense form */}
      {showAdd && (
        <div className="space-y-2 mb-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <div className="flex gap-2">
            <input
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder="Amount"
              type="number"
              className="w-20 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            />
            <select
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value)}
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300"
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <input
            value={expDesc}
            onChange={(e) => setExpDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            onKeyDown={(e) => e.key === 'Enter' && handleAddExpense()}
          />
          <button
            onClick={handleAddExpense}
            disabled={!expAmount || parseFloat(expAmount) <= 0 || createExpense.isPending}
            className="w-full px-2 py-1 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded transition-colors disabled:opacity-50"
          >
            {createExpense.isPending ? 'Adding...' : 'Add Expense'}
          </button>
        </div>
      )}

      {!pnl ? (
        <p className="text-sm text-slate-500 text-center py-4">Select a property</p>
      ) : (
        <div className="space-y-3">
          {/* Summary row */}
          <div className="flex gap-4 text-xs">
            <div>
              <span className="text-[9px] text-slate-500 uppercase block">Income</span>
              <span className="text-emerald-400 tabular-nums font-medium">{fmt(pnl.total_income)}</span>
            </div>
            <div>
              <span className="text-[9px] text-slate-500 uppercase block">Expenses</span>
              <span className="text-amber-400 tabular-nums font-medium">{fmt(pnl.total_expenses)}</span>
            </div>
            <div>
              <span className="text-[9px] text-slate-500 uppercase block">NOI</span>
              <span className="tabular-nums font-semibold" style={{ color: noiColor }}>
                {pnl.net_operating_income >= 0 ? '+' : '-'}{fmt(pnl.net_operating_income)}
              </span>
            </div>
          </div>

          {/* Expense breakdown */}
          {pnl.expense_breakdown.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[9px] text-slate-500 uppercase">Expense Breakdown</span>
              {pnl.expense_breakdown.map(({ category, amount }) => {
                const pct = (amount / maxExpense) * 100;
                return (
                  <div key={category} className="space-y-0.5">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">
                        {CATEGORY_LABELS[category] ?? category}
                      </span>
                      <span className="text-slate-300 tabular-nums">{fmt(amount)}</span>
                    </div>
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: '#d97706' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </RadialGlassCard>
  );
}
