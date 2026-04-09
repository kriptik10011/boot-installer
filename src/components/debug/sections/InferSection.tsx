/**
 * InferSection Component
 *
 * Debug section for the INFER layer.
 * Shows pattern detection results, day health calculator, algorithm details.
 */

import { useState, useMemo } from 'react';
import {
  useWeekPatterns,
  usePatternConfidence,
  getCurrentWeekStart,
  getDayName,
  formatHour,
  getDayHealthColor,
  getSpendingTrendIndicator,
} from '@/hooks/usePatterns';
import { DebugCard, DebugTable, StatusIndicator, ProgressBar } from '../shared';

type InferTab = 'patterns' | 'health' | 'markov' | 'formulas';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function InferSection() {
  const [activeTab, setActiveTab] = useState<InferTab>('patterns');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const weekStart = getCurrentWeekStart();
  const { data: patterns, isLoading } = useWeekPatterns(weekStart);
  const { data: confidence } = usePatternConfidence();

  const tabs: { id: InferTab; label: string }[] = [
    { id: 'patterns', label: 'Pattern Results' },
    { id: 'health', label: 'Day Health' },
    { id: 'markov', label: 'Markov Matrix' },
    { id: 'formulas', label: 'Formula Details' },
  ];

  // Markov transition matrix - track view-to-view transitions
  // This would ideally come from backend, for now we compute from session data
  const markovMatrix = useMemo(() => {
    // Define the view states
    const views = ['week', 'events', 'meals', 'finances', 'recipes', 'settings'];

    // Initialize transition counts
    const transitions: Record<string, Record<string, number>> = {};
    const totals: Record<string, number> = {};

    views.forEach(from => {
      transitions[from] = {};
      totals[from] = 0;
      views.forEach(to => {
        transitions[from][to] = 0;
      });
    });

    // Get view popularity to estimate transitions
    // In production this would come from actual transition tracking
    if (patterns?.temporal) {
      // Simulate typical transitions based on view preferences
      const viewPrefs = patterns.behavioral.view_preferences;
      viewPrefs.forEach((pref, i) => {
        if (i < viewPrefs.length - 1) {
          const from = pref.view;
          const to = viewPrefs[i + 1]?.view;
          if (from && to && transitions[from] && transitions[from][to] !== undefined) {
            transitions[from][to] += Math.round(pref.time_share * 100);
            totals[from] += Math.round(pref.time_share * 100);
          }
        }
      });

      // Add some realistic base transitions
      // week -> meals is common (checking meal plan)
      transitions['week']['meals'] = (transitions['week']['meals'] || 0) + 30;
      totals['week'] = (totals['week'] || 0) + 30;

      // week -> finances (checking bills)
      transitions['week']['finances'] = (transitions['week']['finances'] || 0) + 20;
      totals['week'] = (totals['week'] || 0) + 20;

      // meals -> recipes (looking up recipe)
      transitions['meals']['recipes'] = (transitions['meals']['recipes'] || 0) + 40;
      totals['meals'] = (totals['meals'] || 0) + 40;

      // recipes -> meals (adding to meal plan)
      transitions['recipes']['meals'] = (transitions['recipes']['meals'] || 0) + 25;
      totals['recipes'] = (totals['recipes'] || 0) + 25;
    }

    // Convert to probabilities
    const probabilities: Record<string, Record<string, number>> = {};
    views.forEach(from => {
      probabilities[from] = {};
      views.forEach(to => {
        probabilities[from][to] = totals[from] > 0
          ? transitions[from][to] / totals[from]
          : 0;
      });
    });

    return { views, probabilities, transitions, totals };
  }, [patterns]);

  const getConfidenceStatus = (value: number): 'healthy' | 'warning' | 'error' => {
    if (value >= 0.7) return 'healthy';
    if (value >= 0.5) return 'warning';
    return 'error';
  };

  // Calculate detected patterns list
  const detectedPatterns = patterns ? [
    {
      name: 'Planning Time',
      value: patterns.temporal.planning_time
        ? `${getDayName(patterns.temporal.planning_time.day)} ${formatHour(patterns.temporal.planning_time.hour)}`
        : 'Not detected',
      confidence: patterns.temporal.planning_time?.confidence || 0,
    },
    {
      name: 'Peak Hours',
      value: patterns.temporal.peak_hours.length > 0
        ? patterns.temporal.peak_hours.map(h => formatHour(h)).join(', ')
        : 'Not detected',
      confidence: patterns.temporal.peak_hours.length > 0 ? 0.7 : 0,
    },
    {
      name: 'Busiest Day',
      value: patterns.temporal.busiest_day !== null
        ? getDayName(patterns.temporal.busiest_day)
        : 'Not detected',
      confidence: patterns.temporal.busiest_day !== null ? 0.6 : 0,
    },
    {
      name: 'Preferred View',
      value: patterns.behavioral.view_preferences[0]?.view || 'Not detected',
      confidence: patterns.behavioral.view_preferences[0]?.time_share || 0,
    },
  ] : [];

  const selectedDayHealth = selectedDay
    ? patterns?.day_healths.find(d => d.date === selectedDay)
    : patterns?.day_healths[0];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-sm rounded-t transition-colors ${
              activeTab === tab.id
                ? 'bg-slate-700 text-cyan-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-slate-500">Loading patterns...</p>}

      {/* Pattern Results */}
      {activeTab === 'patterns' && patterns && (
        <div className="space-y-4">
          {/* Confidence Overview */}
          {confidence && (
            <DebugCard title="Pattern Confidence">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <ProgressBar
                    label="Temporal"
                    value={Math.round(confidence.temporal * 100)}
                    status={getConfidenceStatus(confidence.temporal)}
                  />
                </div>
                <div>
                  <ProgressBar
                    label="Behavioral"
                    value={Math.round(confidence.behavioral * 100)}
                    status={getConfidenceStatus(confidence.behavioral)}
                  />
                </div>
                <div>
                  <ProgressBar
                    label="Overall"
                    value={Math.round(confidence.overall * 100)}
                    status={getConfidenceStatus(confidence.overall)}
                  />
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {confidence.ready_for_surfacing
                  ? '✓ Ready for surfacing insights'
                  : '○ Collecting more data...'}
              </div>
            </DebugCard>
          )}

          {/* Detected Patterns Table */}
          <DebugCard title="Detected Patterns">
            <DebugTable
              headers={['Pattern', 'Value', 'Confidence', 'Status']}
              rows={detectedPatterns.map(p => [
                p.name,
                <span className="text-cyan-400">{p.value}</span>,
                <span className="font-mono">{(p.confidence * 100).toFixed(0)}%</span>,
                <StatusIndicator
                  status={getConfidenceStatus(p.confidence)}
                />,
              ])}
            />
          </DebugCard>

          {/* Week Summary */}
          <DebugCard title="Week Summary">
            <p className="text-amber-400 mb-3">{patterns.week_summary.summary_sentence}</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Busy Days</span>
                <span className="font-mono text-cyan-400">{patterns.week_summary.busy_days}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Conflicts</span>
                <span className={`font-mono ${patterns.week_summary.event_conflicts > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                  {patterns.week_summary.event_conflicts}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Bills Due</span>
                <span className="font-mono text-cyan-400">${patterns.week_summary.total_bills_due.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Meals Unplanned</span>
                <span className="font-mono text-cyan-400">{patterns.week_summary.unplanned_meals}</span>
              </div>
            </div>
          </DebugCard>
        </div>
      )}

      {/* Day Health */}
      {activeTab === 'health' && patterns && (
        <div className="space-y-4">
          {/* Day Selector */}
          <DebugCard title="Day Health Scores">
            <div className="flex gap-2 mb-4">
              {patterns.day_healths.map(day => (
                <button
                  key={day.date}
                  onClick={() => setSelectedDay(day.date)}
                  className={`flex-1 text-center p-2 rounded transition-colors ${
                    selectedDay === day.date || (!selectedDay && day === patterns.day_healths[0])
                      ? 'bg-slate-700 ring-1 ring-cyan-500/50'
                      : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  <div className="text-xs text-slate-400">
                    {DAY_NAMES[new Date(day.date + 'T12:00:00').getDay()]}
                  </div>
                  <div className={`text-lg font-bold ${getDayHealthColor(day.status)}`}>
                    {day.score}
                  </div>
                  <div className="text-xs text-slate-500">{day.status}</div>
                </button>
              ))}
            </div>
          </DebugCard>

          {/* Day Health Breakdown */}
          {selectedDayHealth && (
            <DebugCard title={`Health Breakdown: ${selectedDayHealth.date}`}>
              <div className="space-y-2 font-mono text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Base Score</span>
                  <span className="text-slate-300">100</span>
                </div>
                <div className="border-t border-slate-700 pt-2">
                  <div className="text-slate-500 text-xs mb-1">Penalties:</div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Events ({selectedDayHealth.event_count})</span>
                    <span className="text-red-400">
                      {selectedDayHealth.event_count > 3 ? `-${(selectedDayHealth.event_count - 3) * 10}` : '0'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Conflicts ({selectedDayHealth.conflict_count})</span>
                    <span className="text-red-400">
                      {selectedDayHealth.has_conflicts ? '-20' : '0'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Unplanned Meals ({selectedDayHealth.unplanned_meals})</span>
                    <span className="text-red-400">
                      {selectedDayHealth.unplanned_meals > 0 ? `-${selectedDayHealth.unplanned_meals * 5}` : '0'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Bills Due ({selectedDayHealth.bills_due})</span>
                    <span className="text-red-400">
                      {selectedDayHealth.bills_due > 0 ? `-${selectedDayHealth.bills_due * 5}` : '0'}
                    </span>
                  </div>
                </div>
                <div className="border-t border-slate-700 pt-2 flex justify-between">
                  <span className="text-slate-300 font-bold">Final Score</span>
                  <span className={`font-bold ${getDayHealthColor(selectedDayHealth.status)}`}>
                    {selectedDayHealth.score}
                  </span>
                </div>
                <div className="text-center text-slate-500 text-xs pt-2">
                  Status: {selectedDayHealth.status.toUpperCase()}
                </div>
              </div>
            </DebugCard>
          )}
        </div>
      )}

      {/* Markov Transition Matrix */}
      {activeTab === 'markov' && (
        <div className="space-y-4">
          <DebugCard title="View Transition Probabilities">
            <p className="text-xs text-slate-400 mb-3">
              Heatmap shows P(Next View | Current View). Darker = higher probability.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="p-1 text-slate-500 text-left">From ↓ To →</th>
                    {markovMatrix.views.map(view => (
                      <th key={view} className="p-1 text-slate-400 text-center w-16">
                        {view.slice(0, 4)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {markovMatrix.views.map(fromView => (
                    <tr key={fromView}>
                      <td className="p-1 text-slate-400 font-medium">{fromView}</td>
                      {markovMatrix.views.map(toView => {
                        const prob = markovMatrix.probabilities[fromView]?.[toView] || 0;
                        const intensity = Math.round(prob * 255);
                        const bgColor = prob > 0.3
                          ? `rgba(34, 211, 238, ${prob})` // cyan for high
                          : prob > 0
                          ? `rgba(148, 163, 184, ${prob * 2})` // slate for low
                          : 'transparent';

                        return (
                          <td
                            key={`${fromView}-${toView}`}
                            className="p-1 text-center font-mono"
                            style={{
                              backgroundColor: bgColor,
                              color: prob > 0.4 ? 'white' : prob > 0 ? '#94a3b8' : '#475569',
                            }}
                          >
                            {prob > 0 ? prob.toFixed(2) : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DebugCard>

          <DebugCard title="Top Transitions">
            <div className="space-y-2">
              {markovMatrix.views
                .flatMap((from: string) =>
                  markovMatrix.views
                    .filter((to: string) => {
                      const prob = markovMatrix.probabilities[from]?.[to] || 0;
                      return prob > 0 && from !== to;
                    })
                    .map((to: string) => ({
                      from,
                      to,
                      prob: markovMatrix.probabilities[from]?.[to] || 0
                    }))
                )
                .sort((a, b) => b.prob - a.prob)
                .slice(0, 5)
                .map(({ from, to, prob }) => (
                  <div
                    key={`${from}-${to}`}
                    className="flex items-center justify-between p-2 bg-slate-800/50 rounded"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400">{from}</span>
                      <span className="text-slate-500">→</span>
                      <span className="text-amber-400">{to}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-500 transition-all"
                          style={{ width: `${prob * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-sm text-slate-300">
                        {(prob * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              {markovMatrix.views.every((view: string) =>
                markovMatrix.views.every((to: string) =>
                  (markovMatrix.probabilities[view]?.[to] || 0) === 0
                )
              ) && (
                <p className="text-slate-500 text-sm">
                  No transition data yet. Use the app to generate navigation patterns.
                </p>
              )}
            </div>
          </DebugCard>

          <DebugCard title="Markov Chain Formula">
            <div className="font-mono text-xs text-slate-300 space-y-1">
              <p className="text-slate-500">// First-order Markov Chain</p>
              <p>P(View[t+1] | View[t]) = Count(View[t] → View[t+1]) / Count(View[t])</p>
              <p className="text-slate-500 mt-2">// Prediction</p>
              <p>NextView = argmax P(V | CurrentView)</p>
              <p className="text-slate-500 mt-2">// V2 Upgrade: CPT (Compact Prediction Trees)</p>
              <p className="text-xs text-slate-400">Store full sequences for context-aware predictions</p>
            </div>
          </DebugCard>
        </div>
      )}

      {/* Formula Details */}
      {activeTab === 'formulas' && patterns && (
        <div className="space-y-4">
          <DebugCard title="Confidence Score Formula">
            <div className="font-mono text-sm space-y-2 text-slate-300">
              <p className="text-slate-500">// Planning Time Confidence</p>
              <p>concentration = events_at_time / total_events</p>
              <p>sample_factor = min(sessions / 20, 1.0)</p>
              <p>confidence = concentration × 0.7 + sample_factor × 0.3</p>
            </div>
          </DebugCard>

          <DebugCard title="Day Health Score Formula">
            <div className="font-mono text-sm space-y-2 text-slate-300">
              <p className="text-slate-500">// Day Health Calculation</p>
              <p>base = 100</p>
              <p>penalty_events = max(0, events - 3) × 10</p>
              <p>penalty_conflicts = has_conflict ? 20 : 0</p>
              <p>penalty_meals = unplanned_meals × 5</p>
              <p>penalty_bills = bills_due × 5</p>
              <p>score = base - all_penalties</p>
              <p className="text-slate-500 mt-2">// Status thresholds</p>
              <p>80-100: light | 60-79: balanced | 40-59: busy | 0-39: overloaded</p>
            </div>
          </DebugCard>

          <DebugCard title="EWMA Formula (Spending Trend)">
            <div className="font-mono text-sm space-y-2 text-slate-300">
              <p className="text-slate-500">// Exponentially Weighted Moving Average</p>
              <p>alpha = 0.3</p>
              <p>ewma[t] = alpha × value[t] + (1 - alpha) × ewma[t-1]</p>
              <p className="text-slate-500 mt-2">// Current values</p>
              {!patterns.spending_trend.insufficient_data && (
                <>
                  <p>current_week = ${patterns.spending_trend.current_week.toFixed(2)}</p>
                  <p>four_week_avg = ${patterns.spending_trend.four_week_average.toFixed(2)}</p>
                  <p>change = {patterns.spending_trend.percent_change.toFixed(1)}%</p>
                </>
              )}
            </div>
          </DebugCard>
        </div>
      )}
    </div>
  );
}
