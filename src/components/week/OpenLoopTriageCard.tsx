/**
 * OpenLoopTriageCard — Carry, Kill, or Park for open loop items.
 *
 * Research basis: Zeigarnik Protocol — deciding on incomplete items
 * releases cognitive tension. No-Shame framing: "Open Loops" not failures.
 */

import { useState, useCallback } from 'react';
import type { FinancialItem } from '@/types';

interface OpenLoopTriageCardProps {
  bill: FinancialItem;
  /** Reschedule to next week */
  onCarry: (bill: FinancialItem) => void;
  /** Delete (with undo) */
  onKill: (bill: FinancialItem) => void;
  /** Defer indefinitely (mark as paid/resolved) */
  onPark: (bill: FinancialItem) => void;
  /** Open detail panel */
  onDetail?: (bill: FinancialItem) => void;
}

export function OpenLoopTriageCard({ bill, onCarry, onKill, onPark, onDetail }: OpenLoopTriageCardProps) {
  const [isActing, setIsActing] = useState(false);

  const handleAction = useCallback(
    (action: (b: FinancialItem) => void) => {
      setIsActing(true);
      action(bill);
    },
    [bill]
  );

  return (
    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
      {/* Item info */}
      <button
        onClick={() => onDetail?.(bill)}
        className="w-full text-left mb-3 hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-amber-300">{bill.name}</div>
            <div className="text-xs text-amber-400/70">Due {bill.due_date}</div>
          </div>
          <div className="text-lg font-semibold font-mono text-amber-400">
            ${bill.amount.toFixed(2)}
          </div>
        </div>
      </button>

      {/* Triage actions */}
      <div className="flex gap-2">
        <button
          onClick={() => handleAction(onCarry)}
          disabled={isActing}
          className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg
                     bg-cyan-500/20 text-cyan-300 border border-cyan-500/30
                     hover:bg-cyan-500/30 transition-colors
                     disabled:opacity-50"
          title="Reschedule to next week"
        >
          Carry
        </button>
        <button
          onClick={() => handleAction(onKill)}
          disabled={isActing}
          className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg
                     bg-amber-500/20 text-amber-300 border border-amber-500/30
                     hover:bg-amber-500/30 transition-colors
                     disabled:opacity-50"
          title="Remove this item"
        >
          Kill
        </button>
        <button
          onClick={() => handleAction(onPark)}
          disabled={isActing}
          className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg
                     bg-slate-600/30 text-slate-400 border border-slate-600/50
                     hover:bg-slate-600/40 transition-colors
                     disabled:opacity-50"
          title="Mark as resolved"
        >
          Park
        </button>
      </div>
    </div>
  );
}
