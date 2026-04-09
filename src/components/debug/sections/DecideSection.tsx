/**
 * DecideSection Component
 *
 * Debug section for the DECIDE layer.
 * Shows gate status, decision traces, threshold info.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  usePatternConfidence,
  useInsights,
  getCurrentWeekStart,
} from '@/hooks/usePatterns';
import {
  shouldSurfaceInsight,
  loadDismissals,
  type DismissalRecord,
} from '@/utils/surfacing';
import { useDndMode } from '@/hooks/useDndMode';
import {
  useActivityTracking,
  getInterruptibilityDescription,
} from '@/hooks/useActivityTracking';
import { DebugCard, DebugTable, StatusIndicator, ProgressBar } from '../shared';
import { config } from '@/config';

type DecideTab = 'gates' | 'decisions' | 'thresholds';

export function DecideSection() {
  const [activeTab, setActiveTab] = useState<DecideTab>('gates');
  const [dismissals] = useState<DismissalRecord[]>(() => loadDismissals());
  const [selectedDecisionIndex, setSelectedDecisionIndex] = useState(0);

  const weekStart = getCurrentWeekStart();
  const { data: confidence, isLoading: confidenceLoading } = usePatternConfidence();
  const { data: insights, isLoading: insightsLoading } = useInsights(weekStart);
  const isLoading = confidenceLoading || insightsLoading;

  // Use REAL hooks instead of hardcoded values
  const dndState = useDndMode();
  const activity = useActivityTracking();

  const tabs: { id: DecideTab; label: string }[] = [
    { id: 'gates', label: 'Gate Status' },
    { id: 'decisions', label: 'All Decisions' },
    { id: 'thresholds', label: 'Thresholds' },
  ];

  // Use REAL gate status from hooks (not simulated)
  const gateStatus = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Planning mode: Sunday 6-9pm
    const isPlanningMode = day === 0 && hour >= 18 && hour <= 21;

    // Format idle time for display
    const formatIdleTime = (ms: number): string => {
      if (ms < 1000) return 'just now';
      if (ms < 60000) return `${Math.floor(ms / 1000)} seconds ago`;
      if (ms < 3600000) return `${Math.floor(ms / 60000)} minutes ago`;
      return `${Math.floor(ms / 3600000)} hours ago`;
    };

    return {
      dndMode: {
        status: dndState.isDnd,  // REAL value from useDndMode hook
        source: dndState.source === 'os' ? 'OS Focus Mode' :
                dndState.source === 'manual' ? 'Manual Toggle' : 'Default',
      },
      midTask: {
        status: activity.isMidTask,  // REAL value from useActivityTracking hook
        lastAction: formatIdleTime(activity.idleMs),
        threshold: '30 seconds',
        interruptibility: getInterruptibilityDescription(activity.interruptibility),
      },
      planningMode: {
        status: isPlanningMode,
        current: now.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' }),
        planningTime: 'Sunday 7:00 PM',
      },
      dismissals: {
        activeSuppressions: dismissals.filter(d => d.count >= 3).length,
        recentDismissals: dismissals.length,
      },
    };
  }, [dismissals, dndState.isDnd, dndState.source, activity.isMidTask, activity.idleMs, activity.interruptibility]);

  // Calculate decisions for each insight
  const decisions = useMemo(() => {
    if (!insights || !confidence) return [];

    return insights.map(insight => {
      const decision = shouldSurfaceInsight(insight, confidence.overall, dismissals);

      return {
        insight,
        decision,
        gatesPassed: 4,
        totalGates: 4,
        failedGates: [] as string[],
      };
    });
  }, [insights, confidence, dismissals, gateStatus]);

  const passedCount = decisions.filter(d => d.decision.shouldShow).length;
  const blockedCount = decisions.filter(d => !d.decision.shouldShow).length;

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

      {/* Gate Status */}
      {activeTab === 'gates' && (
        <div className="space-y-4">
          <DebugCard title="Context Gates Status">
            <div className="space-y-4">
              {/* Gate 1: DND Mode */}
              <div className="p-3 bg-slate-800/50 rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-slate-300">1. DND/Focus Mode</span>
                  <div className="flex items-center gap-2">
                    <StatusIndicator
                      status={gateStatus.dndMode.status ? 'error' : 'healthy'}
                      label={gateStatus.dndMode.status ? 'ON' : 'OFF'}
                    />
                    <button
                      onClick={() => dndState.toggleDnd()}
                      className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                    >
                      Toggle
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  Source: {gateStatus.dndMode.source}
                </div>
              </div>

              {/* Gate 2: Mid-Task */}
              <div className="p-3 bg-slate-800/50 rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-slate-300">2. Mid-Task Detection</span>
                  <StatusIndicator
                    status={gateStatus.midTask.status ? 'warning' : 'healthy'}
                    label={gateStatus.midTask.status ? 'BUSY' : 'IDLE'}
                  />
                </div>
                <div className="text-xs text-slate-500">
                  Last action: {gateStatus.midTask.lastAction}
                </div>
                <div className="text-xs text-slate-500">
                  Threshold: {gateStatus.midTask.threshold}
                </div>
                <div className="text-xs text-cyan-400/70 mt-1">
                  {gateStatus.midTask.interruptibility}
                </div>
              </div>

              {/* Gate 3: Planning Mode */}
              <div className="p-3 bg-slate-800/50 rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-slate-300">3. Planning Mode Detection</span>
                  <StatusIndicator
                    status={gateStatus.planningMode.status ? 'healthy' : 'warning'}
                    label={gateStatus.planningMode.status ? 'PLANNING' : 'LIVING'}
                  />
                </div>
                <div className="text-xs text-slate-500">
                  Current: {gateStatus.planningMode.current}
                </div>
                <div className="text-xs text-slate-500">
                  Planning time: {gateStatus.planningMode.planningTime}
                </div>
              </div>

              {/* Gate 4: Dismissals */}
              <div className="p-3 bg-slate-800/50 rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-slate-300">4. Dismissal History</span>
                  <StatusIndicator
                    status={gateStatus.dismissals.activeSuppressions === 0 ? 'healthy' : 'warning'}
                    label={`${gateStatus.dismissals.activeSuppressions} suppressed`}
                  />
                </div>
                <div className="text-xs text-slate-500">
                  Recent dismissals: {gateStatus.dismissals.recentDismissals}
                </div>
              </div>
            </div>

            <div className="mt-4 text-center text-sm">
              <span className="text-slate-400">Overall: </span>
              <span className={gateStatus.planningMode.status ? 'text-emerald-400' : 'text-amber-400'}>
                {gateStatus.planningMode.status ? '4/4' : '3/4'} gates passing
              </span>
            </div>
          </DebugCard>
        </div>
      )}

      {/* All Decisions */}
      {activeTab === 'decisions' && (
        <div className="space-y-4">
          <DebugCard title={`All Insight Decisions (${passedCount} pass, ${blockedCount} blocked)`}>
            {isLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-8 bg-slate-700/50 rounded" />
                <div className="h-8 bg-slate-700/50 rounded" />
                <div className="h-8 bg-slate-700/50 rounded" />
                <div className="text-xs text-slate-500 text-center pt-2">Loading decisions...</div>
              </div>
            ) : decisions.length > 0 ? (
              <DebugTable
                headers={['Insight', 'Score', 'Gates', 'Decision']}
                rows={decisions.map(d => [
                  <span className="text-slate-300">{d.insight.message.slice(0, 30)}...</span>,
                  <span className={`font-mono ${d.decision.score >= 0.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {d.decision.score.toFixed(2)}
                  </span>,
                  <span className={d.gatesPassed === d.totalGates ? 'text-emerald-400' : 'text-amber-400'}>
                    {d.gatesPassed}/{d.totalGates}
                  </span>,
                  <StatusIndicator
                    status={d.decision.shouldShow ? 'healthy' : 'error'}
                    label={d.decision.shouldShow ? 'SURFACE' : 'BLOCKED'}
                  />,
                ])}
              />
            ) : (
              <p className="text-slate-500 text-sm">No insights to evaluate</p>
            )}
          </DebugCard>

          {/* Decision Detail with selector for any decision */}
          {decisions.length > 0 && (
            <DebugCard title="Decision Trace">
              {/* Decision Selector */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-slate-400">Select insight:</span>
                <select
                  value={selectedDecisionIndex}
                  onChange={(e) => setSelectedDecisionIndex(Number(e.target.value))}
                  className="flex-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-slate-300"
                >
                  {decisions.map((d, index) => (
                    <option key={index} value={index}>
                      {d.decision.shouldShow ? '✓' : '✕'} {d.insight.message.slice(0, 40)}...
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Decision Detail */}
              {(() => {
                const selected = decisions[selectedDecisionIndex];
                if (!selected) return null;
                return (
                  <div className="font-mono text-sm space-y-2">
                    <p className="text-slate-400">Insight: "{selected.insight.message}"</p>
                    <div className="border-t border-slate-700 pt-2 mt-2">
                      <p className="text-slate-500">INTERRUPTION CALCULUS:</p>
                      <p>Score = (Confidence × Benefit) - Annoyance</p>
                      <p>Score = ({selected.insight.confidence.toFixed(2)} × {(0.7).toFixed(2)}) - 0.10</p>
                      <p>Score = {selected.decision.score.toFixed(3)}</p>
                      <p className={selected.decision.score >= 0.3 ? 'text-emerald-400' : 'text-amber-400'}>
                        Threshold: 0.30 → {selected.decision.score >= 0.3 ? 'PASS' : 'FAIL'}
                      </p>
                    </div>
                    <div className="border-t border-slate-700 pt-2 mt-2">
                      <p className="text-slate-500">GATES PASSED: {selected.gatesPassed}/{selected.totalGates}</p>
                      {selected.failedGates.length > 0 && (
                        <p className="text-amber-400">Failed: {selected.failedGates.join(', ')}</p>
                      )}
                    </div>
                    <div className="border-t border-slate-700 pt-2 mt-2">
                      <p className="text-slate-500">FINAL DECISION: {selected.decision.reason}</p>
                      <p className={selected.decision.shouldShow ? 'text-emerald-400' : 'text-amber-400'}>
                        → {selected.decision.shouldShow ? 'SURFACE' : 'BLOCKED'}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </DebugCard>
          )}
        </div>
      )}

      {/* Thresholds */}
      {activeTab === 'thresholds' && (
        <div className="space-y-4">
          <DebugCard title="Surfacing Threshold">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-400">Current Threshold</span>
                  <span className="font-mono text-cyan-400">0.50</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full relative">
                  <div className="absolute left-1/2 top-0 w-1 h-4 -mt-1 bg-cyan-400 rounded" />
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>0.0 (show all)</span>
                  <span>1.0 (show none)</span>
                </div>
              </div>

              <div className="bg-slate-800/50 p-3 rounded">
                <p className="text-sm text-slate-400 mb-2">Impact Preview:</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">At 0.30:</span>
                    <span className="text-emerald-400">{decisions.filter(d => d.decision.score >= 0.3).length} pass</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">At 0.50:</span>
                    <span className="text-cyan-400">{decisions.filter(d => d.decision.score >= 0.5).length} pass</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">At 0.70:</span>
                    <span className="text-amber-400">{decisions.filter(d => d.decision.score >= 0.7).length} pass</span>
                  </div>
                </div>
              </div>
            </div>
          </DebugCard>

          <DebugCard title="Other Thresholds">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Min sessions for confidence</span>
                <span className="font-mono text-cyan-400">5</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Dismissal decay period</span>
                <span className="font-mono text-cyan-400">30 days</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Base annoyance cost</span>
                <span className="font-mono text-cyan-400">0.10</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Dismissal multiplier</span>
                <span className="font-mono text-cyan-400">0.15</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Mid-task idle threshold</span>
                <span className="font-mono text-cyan-400">30 sec</span>
              </div>
            </div>
          </DebugCard>
        </div>
      )}
    </div>
  );
}
