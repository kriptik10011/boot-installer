/**
 * BillPredictionCard — Predicted bill with "Add to Transactions" action.
 */

import { useCallback } from 'react';
import { useApplyBillPrediction } from '@/hooks/usePredictions';
import { getTrustBorderClasses } from '@/utils/trustVisualization';
import type { PredictedBill } from '@/api/client';

interface BillPredictionCardProps {
  prediction: PredictedBill;
}

export function BillPredictionCard({ prediction }: BillPredictionCardProps) {
  const applyBill = useApplyBillPrediction();

  const handleApply = useCallback(() => {
    applyBill.mutate({
      recurrenceId: prediction.recurrence_id,
      amount: prediction.predicted_amount,
      date: prediction.predicted_date,
    });
  }, [applyBill, prediction]);

  const pct = Math.round(prediction.confidence * 100);

  return (
    <div className={`p-3 rounded-lg bg-slate-700/30 ${getTrustBorderClasses(prediction.confidence, 'border-slate-700/50')}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-slate-200">{prediction.description}</p>
          <p className="text-xs text-slate-500">
            Due {prediction.predicted_date}
            {prediction.category && ` \u00B7 ${prediction.category}`}
          </p>
        </div>
        <span className="text-lg font-mono font-semibold text-amber-400">
          ${prediction.predicted_amount.toFixed(2)}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-500">
            {pct}% confidence
          </span>
          {prediction.last_3_amounts.length > 0 && (
            <span className="text-[10px] text-slate-600">
              (avg of {prediction.last_3_amounts.length})
            </span>
          )}
        </div>
        <button
          onClick={handleApply}
          disabled={applyBill.isPending}
          className="text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {applyBill.isPending ? 'Adding...' : 'Add to Transactions'}
        </button>
      </div>
    </div>
  );
}
