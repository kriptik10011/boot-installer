/**
 * CrossFeatureSection Component
 *
 * Debug section for Cross-Feature Intelligence.
 * Shows how features interact, spending anomalies (Bayesian Surprise),
 * week character determination, and cross-feature insight triggers.
 */

import { useState, useMemo } from 'react';
import { useCrossFeatureIntelligence } from '@/hooks/useCrossFeatureIntelligence';
import { useFinanceIntelligence } from '@/hooks/useFinanceIntelligence';
import { useEventIntelligence } from '@/hooks/useEventIntelligence';
import { useMealIntelligence } from '@/hooks/useMealIntelligence';
import { usePatternConfidence, getCurrentWeekStart } from '@/hooks/usePatterns';
import { DebugCard, DebugTable, StatusIndicator, ProgressBar } from '../shared';

type CrossFeatureTab = 'overview' | 'insights' | 'bayesian' | 'matrix';

// Spending model from localStorage (same as useCrossFeatureIntelligence)
interface MetricModel {
  mean: number;
  variance: number;
  count: number;
}

function loadSpendingModel(): MetricModel {
  try {
    const stored = localStorage.getItem('weekly-spending-model');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        typeof parsed.mean === 'number' &&
        typeof parsed.variance === 'number' &&
        typeof parsed.count === 'number'
      ) {
        return parsed;
      }
    }
  } catch {
    // Ignore
  }
  return { mean: 0, variance: 0, count: 0 };
}

export function CrossFeatureSection() {
  const [activeTab, setActiveTab] = useState<CrossFeatureTab>('overview');
  const weekStart = getCurrentWeekStart();

  // Get all intelligence data
  const crossFeature = useCrossFeatureIntelligence();
  const financeIntel = useFinanceIntelligence();
  const eventIntel = useEventIntelligence(weekStart);
  const mealIntel = useMealIntelligence(weekStart);
  const { data: confidence } = usePatternConfidence();

  // Load spending model for Bayesian Surprise visualization
  const spendingModel = useMemo(() => loadSpendingModel(), []);

  const tabs: { id: CrossFeatureTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'insights', label: 'Insights' },
    { id: 'bayesian', label: 'Bayesian Surprise' },
    { id: 'matrix', label: 'Feature Matrix' },
  ];

  // Calculate Bayesian Surprise for current spending
  const bayesianAnalysis = useMemo(() => {
    const currentSpending = financeIntel.totalUpcoming;
    const model = spendingModel;

    if (model.count < 3) {
      return {
        hasSurprise: false,
        reason: 'Insufficient data (need 3+ weeks)',
        zScore: 0,
        threshold: 2.0,
        mean: 0,
        stdDev: 0,
        currentValue: currentSpending,
        dataPoints: model.count,
      };
    }

    const stdDev = Math.sqrt(model.variance);
    const zScore = stdDev > 0 ? Math.abs(currentSpending - model.mean) / stdDev : 0;
    const hasSurprise = zScore > 2.0;

    return {
      hasSurprise,
      reason: hasSurprise
        ? `Spending ${currentSpending > model.mean ? 'above' : 'below'} normal (z=${zScore.toFixed(2)})`
        : 'Within normal range',
      zScore,
      threshold: 2.0,
      mean: model.mean,
      stdDev,
      currentValue: currentSpending,
      dataPoints: model.count,
    };
  }, [financeIntel.totalUpcoming, spendingModel]);

  // Feature interaction matrix
  const featureMatrix = useMemo(() => {
    return [
      {
        from: 'Events',
        to: 'Meals',
        interaction: 'Busy days → Suggest quick meals',
        active: eventIntel.overloadedDays >= 2 && mealIntel.unplannedCount > 0,
        strength: eventIntel.overloadedDays >= 2 ? 0.8 : 0.2,
      },
      {
        from: 'Finances',
        to: 'Meals',
        interaction: 'End of month → Budget-friendly suggestions',
        active: financeIntel.totalUpcoming > 200,
        strength: financeIntel.totalUpcoming > 200 ? 0.7 : 0.1,
      },
      {
        from: 'Events',
        to: 'Events',
        interaction: 'Conflicts → Buffer suggestions',
        active: eventIntel.totalConflicts > 0,
        strength: eventIntel.totalConflicts > 0 ? 0.9 : 0.0,
      },
      {
        from: 'Meals',
        to: 'Shopping',
        interaction: 'Planned meals → Auto-generate list',
        active: 21 - mealIntel.unplannedCount > 5,
        strength: (21 - mealIntel.unplannedCount) / 21,
      },
    ];
  }, [eventIntel, mealIntel, financeIntel]);

  const getWeekCharacterColor = (char: string): string => {
    switch (char) {
      case 'light': return 'text-emerald-400';
      case 'balanced': return 'text-cyan-400';
      case 'busy': return 'text-amber-400';
      case 'overloaded': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

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

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <DebugCard title="Week Character Analysis">
            <div className="text-center mb-4">
              <span className="text-2xl font-bold">
                <span className={getWeekCharacterColor(crossFeature.weekCharacter)}>
                  {crossFeature.weekCharacter.toUpperCase()}
                </span>
              </span>
              <p className="text-sm text-slate-400 mt-1">
                {crossFeature.isLearning ? 'Still learning patterns...' : 'Based on pattern analysis'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-800/50 p-3 rounded">
                <div className="text-slate-400 mb-1">Events</div>
                <div className="font-mono">
                  <span className="text-cyan-400">{eventIntel.overloadedDays}</span>
                  <span className="text-slate-500"> overloaded days</span>
                </div>
                <div className="font-mono">
                  <span className={eventIntel.totalConflicts > 0 ? 'text-red-400' : 'text-emerald-400'}>
                    {eventIntel.totalConflicts}
                  </span>
                  <span className="text-slate-500"> conflicts</span>
                </div>
              </div>

              <div className="bg-slate-800/50 p-3 rounded">
                <div className="text-slate-400 mb-1">Meals</div>
                <div className="font-mono">
                  <span className={mealIntel.unplannedCount > 10 ? 'text-amber-400' : 'text-cyan-400'}>
                    {mealIntel.unplannedCount}
                  </span>
                  <span className="text-slate-500"> unplanned</span>
                </div>
                <div className="font-mono">
                  <span className="text-emerald-400">{21 - mealIntel.unplannedCount}</span>
                  <span className="text-slate-500"> planned</span>
                </div>
              </div>

              <div className="bg-slate-800/50 p-3 rounded">
                <div className="text-slate-400 mb-1">Finances</div>
                <div className="font-mono">
                  <span className="text-cyan-400">${financeIntel.totalUpcoming.toFixed(0)}</span>
                  <span className="text-slate-500"> due</span>
                </div>
                <div className="font-mono">
                  <span className={financeIntel.overdueCount > 0 ? 'text-red-400' : 'text-emerald-400'}>
                    {financeIntel.overdueCount}
                  </span>
                  <span className="text-slate-500"> overdue</span>
                </div>
              </div>

              <div className="bg-slate-800/50 p-3 rounded">
                <div className="text-slate-400 mb-1">Confidence</div>
                <div className="font-mono">
                  <span className={(confidence?.overall ?? 0) >= 0.5 ? 'text-emerald-400' : 'text-amber-400'}>
                    {((confidence?.overall ?? 0) * 100).toFixed(0)}%
                  </span>
                  <span className="text-slate-500"> overall</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {confidence?.ready_for_surfacing ? '✓ Ready' : '○ Learning'}
                </div>
              </div>
            </div>
          </DebugCard>

          <DebugCard title="Week Character Formula">
            <div className="font-mono text-sm space-y-2 text-slate-300">
              <p className="text-slate-500">// Week Character Determination</p>
              <p>{'if (overloadedDays >= 3) → OVERLOADED'}</p>
              <p>{'if (overloadedDays >= 2 || conflicts >= 2) → BUSY'}</p>
              <p>{'if (lightDays >= 5) → LIGHT'}</p>
              <p>{'else → BALANCED'}</p>
              <div className="border-t border-slate-700 pt-2 mt-2">
                <p className="text-slate-500">// Current Values</p>
                <p>overloadedDays = {eventIntel.overloadedDays}</p>
                <p>lightDays = {eventIntel.dayInsights.filter(d => d.status === 'light').length}</p>
                <p>conflicts = {eventIntel.totalConflicts}</p>
                <p className={getWeekCharacterColor(crossFeature.weekCharacter)}>
                  {'→ '}{crossFeature.weekCharacter.toUpperCase()}
                </p>
              </div>
            </div>
          </DebugCard>
        </div>
      )}

      {/* Insights */}
      {activeTab === 'insights' && (
        <div className="space-y-4">
          <DebugCard title={`Cross-Feature Insights (${crossFeature.insights.length})`}>
            {crossFeature.isLoading ? (
              <p className="text-slate-500 text-sm">Loading...</p>
            ) : crossFeature.insights.length > 0 ? (
              <div className="space-y-3">
                {crossFeature.insights.map((insight, i) => (
                  <div key={i} className="bg-slate-800/50 p-3 rounded">
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-medium text-slate-300">{insight.type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        insight.priority <= 2 ? 'bg-red-500/20 text-red-400' :
                        insight.priority <= 3 ? 'bg-amber-500/20 text-amber-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        P{insight.priority}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 mb-2">{insight.message}</p>
                    <p className="text-xs text-slate-500 mb-2">
                      <span className="text-cyan-400/70">Glass Box:</span> {insight.reasoning}
                    </p>
                    {insight.suggestion && (
                      <p className="text-xs text-emerald-400/70">
                        💡 {insight.suggestion}
                      </p>
                    )}
                    <div className="flex gap-2 mt-2">
                      {insight.affectedFeatures.map(f => (
                        <span key={f} className="text-xs bg-slate-700 px-2 py-0.5 rounded">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">
                {crossFeature.isLearning
                  ? 'Collecting data to detect cross-feature patterns...'
                  : 'No cross-feature insights triggered this week'}
              </p>
            )}
          </DebugCard>

          <DebugCard title="Insight Type Triggers">
            <DebugTable
              headers={['Type', 'Condition', 'Status']}
              rows={[
                [
                  'busy_week_meals',
                  '2+ overloaded days AND 3+ unplanned meals',
                  <StatusIndicator
                    key="busy"
                    status={eventIntel.overloadedDays >= 2 && mealIntel.unplannedCount >= 3 ? 'healthy' : 'warning'}
                    label={eventIntel.overloadedDays >= 2 && mealIntel.unplannedCount >= 3 ? 'ACTIVE' : 'INACTIVE'}
                  />,
                ],
                [
                  'end_of_month_budget',
                  'Last week of month AND $200+ bills',
                  <StatusIndicator
                    key="budget"
                    status={financeIntel.totalUpcoming >= 200 ? 'warning' : 'healthy'}
                    label={financeIntel.totalUpcoming >= 200 ? 'WATCHING' : 'INACTIVE'}
                  />,
                ],
                [
                  'light_week_opportunity',
                  '4+ light days AND no conflicts',
                  <StatusIndicator
                    key="light"
                    status={eventIntel.dayInsights.filter(d => d.status === 'light').length >= 4 ? 'healthy' : 'warning'}
                    label={eventIntel.dayInsights.filter(d => d.status === 'light').length >= 4 ? 'ACTIVE' : 'INACTIVE'}
                  />,
                ],
                [
                  'spending_anomaly',
                  'z-score > 2.0 (Bayesian Surprise)',
                  <StatusIndicator
                    key="spending"
                    status={bayesianAnalysis.hasSurprise ? 'error' : 'healthy'}
                    label={bayesianAnalysis.hasSurprise ? 'TRIGGERED' : 'NORMAL'}
                  />,
                ],
              ]}
            />
          </DebugCard>
        </div>
      )}

      {/* Bayesian Surprise */}
      {activeTab === 'bayesian' && (
        <div className="space-y-4">
          <DebugCard title="Bayesian Surprise Analysis">
            <div className="space-y-4">
              {/* Current Status */}
              <div className={`p-4 rounded-lg ${
                bayesianAnalysis.hasSurprise
                  ? 'bg-red-500/10 border border-red-500/30'
                  : 'bg-emerald-500/10 border border-emerald-500/30'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">
                    {bayesianAnalysis.hasSurprise ? '🚨 SURPRISE DETECTED' : '✓ NORMAL RANGE'}
                  </span>
                  <span className={`font-mono ${
                    bayesianAnalysis.hasSurprise ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    z = {bayesianAnalysis.zScore.toFixed(2)}
                  </span>
                </div>
                <p className="text-sm text-slate-400">{bayesianAnalysis.reason}</p>
              </div>

              {/* Visual Z-Score Indicator */}
              <div className="bg-slate-800/50 p-4 rounded">
                <div className="text-sm text-slate-400 mb-2">Z-Score Visualization</div>
                <div className="relative h-8 bg-slate-700 rounded-full overflow-hidden">
                  {/* Normal range (green) */}
                  <div className="absolute left-1/4 right-1/4 h-full bg-emerald-500/30" />
                  {/* Warning range (amber) */}
                  <div className="absolute left-[10%] w-[15%] h-full bg-amber-500/30" />
                  <div className="absolute right-[10%] w-[15%] h-full bg-amber-500/30" />
                  {/* Danger range (red) */}
                  <div className="absolute left-0 w-[10%] h-full bg-red-500/30" />
                  <div className="absolute right-0 w-[10%] h-full bg-red-500/30" />

                  {/* Current position indicator */}
                  {bayesianAnalysis.dataPoints >= 3 && (
                    <div
                      className="absolute top-0 w-2 h-full bg-cyan-400 rounded"
                      style={{
                        left: `${Math.min(95, Math.max(5, 50 + (bayesianAnalysis.zScore * 10 * (bayesianAnalysis.currentValue > bayesianAnalysis.mean ? 1 : -1))))}%`,
                      }}
                    />
                  )}
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>-3σ</span>
                  <span>-2σ</span>
                  <span>μ</span>
                  <span>+2σ</span>
                  <span>+3σ</span>
                </div>
              </div>

              {/* Model Statistics */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 p-3 rounded">
                  <div className="text-xs text-slate-500 mb-1">Historical Mean (μ)</div>
                  <div className="font-mono text-lg text-cyan-400">
                    ${bayesianAnalysis.mean.toFixed(0)}
                  </div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded">
                  <div className="text-xs text-slate-500 mb-1">Std Deviation (σ)</div>
                  <div className="font-mono text-lg text-cyan-400">
                    ${bayesianAnalysis.stdDev.toFixed(0)}
                  </div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded">
                  <div className="text-xs text-slate-500 mb-1">Current Value</div>
                  <div className="font-mono text-lg text-amber-400">
                    ${bayesianAnalysis.currentValue.toFixed(0)}
                  </div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded">
                  <div className="text-xs text-slate-500 mb-1">Data Points</div>
                  <div className="font-mono text-lg text-slate-300">
                    {bayesianAnalysis.dataPoints} weeks
                  </div>
                </div>
              </div>
            </div>
          </DebugCard>

          <DebugCard title="Bayesian Surprise Formula">
            <div className="font-mono text-sm space-y-2 text-slate-300">
              <p className="text-slate-500">// Bayesian Surprise via Z-Score</p>
              <p>z = |value - μ| / σ</p>
              <p>{'surprise = z > 2.0 ? z : 0'}</p>
              <div className="border-t border-slate-700 pt-2 mt-2">
                <p className="text-slate-500">{'// Welford\'s Online Algorithm (variance update)'}</p>
                <p>count++</p>
                <p>delta = value - mean</p>
                <p>mean += delta / count</p>
                <p>delta2 = value - mean</p>
                <p>variance = (variance × (count-1) + delta × delta2) / count</p>
              </div>
              <div className="border-t border-slate-700 pt-2 mt-2">
                <p className="text-slate-500">{'// Why z > 2?'}</p>
                <p className="text-xs text-slate-400">2σ = 95% confidence interval</p>
                <p className="text-xs text-slate-400">Values outside are statistically unusual</p>
              </div>
            </div>
          </DebugCard>
        </div>
      )}

      {/* Feature Matrix */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <DebugCard title="Feature Interaction Matrix">
            <div className="space-y-3">
              {featureMatrix.map((interaction, i) => (
                <div key={i} className="bg-slate-800/50 p-3 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400">{interaction.from}</span>
                      <span className="text-slate-500">→</span>
                      <span className="text-amber-400">{interaction.to}</span>
                    </div>
                    <StatusIndicator
                      status={interaction.active ? 'healthy' : 'warning'}
                      label={interaction.active ? 'ACTIVE' : 'INACTIVE'}
                    />
                  </div>
                  <p className="text-sm text-slate-400">{interaction.interaction}</p>
                  <div className="mt-2">
                    <ProgressBar
                      label="Strength"
                      value={Math.round(interaction.strength * 100)}
                      status={interaction.strength > 0.5 ? 'healthy' : 'warning'}
                    />
                  </div>
                </div>
              ))}
            </div>
          </DebugCard>

          <DebugCard title="Data Flow Diagram">
            <div className="font-mono text-xs text-slate-400 whitespace-pre">
{`┌─────────┐    ┌─────────┐    ┌─────────┐
│ Events  │───▶│ Cross-  │───▶│ Insights│
└─────────┘    │ Feature │    └─────────┘
               │ Intel   │
┌─────────┐    │         │    ┌─────────┐
│ Meals   │───▶│ Hook    │───▶│ Week    │
└─────────┘    │         │    │ Char    │
               │         │    └─────────┘
┌─────────┐    │         │
│ Finance │───▶│         │
└─────────┘    └─────────┘

        │
        ▼
┌───────────────────────────────┐
│ Bayesian Surprise (Spending)  │
│ Welford's Algorithm (Online)  │
└───────────────────────────────┘`}
            </div>
          </DebugCard>
        </div>
      )}
    </div>
  );
}
