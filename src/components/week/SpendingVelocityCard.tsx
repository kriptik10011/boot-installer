/**
 * SpendingVelocityCard - Shows spending trend compared to average.
 *
 * Displays when spending is higher or lower than the 4-week average.
 * Uses amber for higher, emerald for lower (no-shame colors).
 */

import { useSpendingTrends, getSpendingTrendIndicator } from '@/hooks/usePatterns';

interface SpendingVelocityCardProps {
  /** Whether to show in compact mode (inline) vs expanded mode */
  compact?: boolean;
  /** Called when user clicks the card */
  onClick?: () => void;
}

export function SpendingVelocityCard({ compact = false, onClick }: SpendingVelocityCardProps) {
  const { data: spendingTrend, isLoading } = useSpendingTrends();

  // Don't show if loading, no data, normal trend, or insufficient data
  if (isLoading || !spendingTrend) return null;
  if (spendingTrend.trend === 'normal') return null;
  if (spendingTrend.insufficient_data) return null;

  const indicator = getSpendingTrendIndicator(spendingTrend.trend);
  const percentChange = Math.abs(spendingTrend.percent_change).toFixed(0);

  // Determine colors based on trend
  const bgColor = spendingTrend.trend === 'higher'
    ? 'bg-amber-500/10 border-amber-500/20'
    : 'bg-emerald-500/10 border-emerald-500/20';
  const textColor = spendingTrend.trend === 'higher'
    ? 'text-amber-300'
    : 'text-emerald-300';
  const accentColor = spendingTrend.trend === 'higher'
    ? 'text-amber-400'
    : 'text-emerald-400';

  if (compact) {
    // Compact mode: Single line for InsightBar integration
    return (
      <button
        onClick={onClick}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${bgColor} hover:opacity-90`}
      >
        <span className={`text-lg ${accentColor}`}>{indicator.icon}</span>
        <span className={`text-sm ${textColor}`}>
          Spending {percentChange}% {spendingTrend.trend}
        </span>
      </button>
    );
  }

  // Full mode: Card with more details
  return (
    <div className={`px-4 py-3 border-t ${bgColor}`}>
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between hover:opacity-90 rounded-lg p-2 -m-2 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            spendingTrend.trend === 'higher' ? 'bg-amber-500/20' : 'bg-emerald-500/20'
          }`}>
            <span className={`text-xl ${accentColor}`}>{indicator.icon}</span>
          </div>
          <div className="text-left">
            <div className={`text-sm ${textColor}`}>
              Spending {percentChange}% {spendingTrend.trend} than usual
            </div>
            <div className="text-xs text-slate-500">
              ${spendingTrend.current_week.toFixed(0)} this week vs ${spendingTrend.four_week_average.toFixed(0)} avg
            </div>
          </div>
        </div>
        <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

export default SpendingVelocityCard;
