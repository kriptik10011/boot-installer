/**
 * DebtFreedomJourney — Progress visualization toward debt freedom.
 *
 * Research basis: No-Shame — "journey to freedom" not "debt remaining".
 * Shows snowball vs avalanche strategy comparison with encouraging language.
 */

import { useState } from 'react';
import { debtApi } from '@/api/client';
import { useQuery } from '@tanstack/react-query';

interface DebtFreedomJourneyProps {
  totalDebt: number;
  totalPaid: number;
}

export function DebtFreedomJourney({ totalDebt, totalPaid }: DebtFreedomJourneyProps) {
  const [whatIfExtra, setWhatIfExtra] = useState<number | null>(null);

  const { data: strategies } = useQuery({
    queryKey: ['debt', 'strategies'],
    queryFn: () => debtApi.compareStrategies(),
  });

  const { data: whatIfResult } = useQuery({
    queryKey: ['debt', 'what-if', whatIfExtra],
    queryFn: () => debtApi.whatIf(whatIfExtra!),
    enabled: whatIfExtra !== null && whatIfExtra > 0,
  });

  const progressPct = totalDebt > 0 ? ((totalPaid / (totalPaid + totalDebt)) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Overall Progress */}
      <div className="p-3 rounded-lg bg-gradient-to-r from-emerald-900/20 to-slate-800/50 border border-emerald-700/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">Journey to Freedom</span>
          <span className="text-xs font-bold text-emerald-400">{Math.round(progressPct)}%</span>
        </div>
        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, progressPct)}%` }}
          />
        </div>
        {totalDebt > 0 && (
          <p className="text-xs text-slate-500 mt-1">
            ${totalPaid.toLocaleString()} paid off — ${totalDebt.toLocaleString()} to go
          </p>
        )}
      </div>

      {/* Strategy Comparison */}
      {strategies && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-400">Payoff Strategies</div>
          {strategies.snowball && (
            <StrategyCard
              name="Snowball"
              description="Smallest balance first (motivating wins)"
              months={strategies.snowball.months_to_payoff}
              totalInterest={strategies.snowball.total_interest}
            />
          )}
          {strategies.avalanche && (
            <StrategyCard
              name="Avalanche"
              description="Highest interest first (saves money)"
              months={strategies.avalanche.months_to_payoff}
              totalInterest={strategies.avalanche.total_interest}
            />
          )}
        </div>
      )}

      {/* What-If */}
      <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
        <div className="text-xs text-slate-400 mb-2">What if I paid extra?</div>
        <div className="flex gap-2">
          {[50, 100, 200].map((amount) => (
            <button
              key={amount}
              onClick={() => setWhatIfExtra(whatIfExtra === amount ? null : amount)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                whatIfExtra === amount
                  ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                  : 'border-slate-600 text-slate-400 hover:border-slate-500'
              }`}
            >
              +${amount}/mo
            </button>
          ))}
        </div>
        {whatIfResult && whatIfExtra && (
          <p className="text-xs text-emerald-400 mt-2">
            Debt-free {whatIfResult.months_saved} months sooner, saving ${Math.round(whatIfResult.interest_saved).toLocaleString()} in interest
          </p>
        )}
      </div>
    </div>
  );
}

function StrategyCard({
  name,
  description,
  months,
  totalInterest,
}: {
  name: string;
  description: string;
  months: number;
  totalInterest: number;
}) {
  return (
    <div className="p-2 rounded-lg bg-slate-700/30 border border-slate-700/50">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium text-slate-300">{name}</span>
          <p className="text-[10px] text-slate-500">{description}</p>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold text-slate-200">{months} months</div>
          <div className="text-[10px] text-slate-500">${Math.round(totalInterest).toLocaleString()} interest</div>
        </div>
      </div>
    </div>
  );
}
