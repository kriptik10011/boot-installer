/**
 * SurfaceSection Component
 *
 * Debug section for the SURFACE layer.
 * Shows current mode, what's surfaced, mode comparison.
 */

import { useState, useMemo } from 'react';
import {
  usePatternConfidence,
  useInsights,
  getCurrentWeekStart,
} from '@/hooks/usePatterns';
import {
  shouldSurfaceInsight,
  loadDismissals,
  getEscalationLevel,
} from '@/utils/surfacing';
import { DebugCard, StatusIndicator } from '../shared';

type SurfaceTab = 'mode' | 'surfaced' | 'deferral' | 'comparison';

type SimulatedMode = 'PLANNING' | 'LIVING' | null;

export function SurfaceSection() {
  const [activeTab, setActiveTab] = useState<SurfaceTab>('mode');
  const [dismissals] = useState(() => loadDismissals());
  const [simulatedMode, setSimulatedMode] = useState<SimulatedMode>(null);

  const weekStart = getCurrentWeekStart();
  const { data: confidence } = usePatternConfidence();
  const { data: insights } = useInsights(weekStart);

  const tabs: { id: SurfaceTab; label: string }[] = [
    { id: 'mode', label: 'Mode Indicator' },
    { id: 'surfaced', label: 'Currently Surfaced' },
    { id: 'deferral', label: 'Deferral Queue' },
    { id: 'comparison', label: 'Mode Comparison' },
  ];

  // Deferral queue - insights waiting to be shown
  // Items get deferred when context gates block them (e.g., user is mid-task)
  const deferralQueue = useMemo(() => {
    if (!insights || !confidence) return [];

    const now = Date.now();
    return insights
      .filter(insight => {
        const decision = shouldSurfaceInsight(insight, confidence.overall, dismissals);
        // Deferred = score is high enough but gates blocked it
        return decision.score >= 0.3 && !decision.shouldShow;
      })
      .map((insight, index) => {
        // Calculate TTL - deferred items expire after 30 minutes
        const createdAt = now - (index * 5 * 60 * 1000); // Simulate staggered creation
        const ttlMs = 30 * 60 * 1000; // 30 minutes
        const expiresAt = createdAt + ttlMs;
        const remainingMs = Math.max(0, expiresAt - now);
        const remainingMinutes = Math.floor(remainingMs / 60000);
        const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);

        return {
          insight,
          createdAt,
          expiresAt,
          remainingMs,
          remainingFormatted: `${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')}`,
          ttlPercent: Math.round((remainingMs / ttlMs) * 100),
          waitCondition: insight.priority <= 2 ? 'Waiting for idle state' : 'Waiting for planning mode',
        };
      });
  }, [insights, confidence, dismissals]);

  // Determine current mode (respects simulation override)
  const currentMode = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Auto-detect planning mode: Sunday 6-9pm
    const autoIsPlanningMode = day === 0 && hour >= 18 && hour <= 21;

    // Apply simulation override if set
    const isPlanningMode = simulatedMode
      ? simulatedMode === 'PLANNING'
      : autoIsPlanningMode;

    // Calculate time until next planning window
    let daysUntil = (7 - day) % 7;
    if (day === 0 && hour >= 21) daysUntil = 7;
    if (day === 0 && hour < 18) daysUntil = 0;

    const hoursUntil = daysUntil === 0 ? 18 - hour : 18 + (daysUntil - 1) * 24 + (24 - hour);

    return {
      mode: isPlanningMode ? 'PLANNING' : 'LIVING',
      isSimulated: simulatedMode !== null,
      description: isPlanningMode
        ? 'Full insights visible, review your week'
        : 'Quick glance, minimal interruption',
      currentTime: now.toLocaleString('en-US', {
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
      }),
      nextPlanning: 'Sunday ~7:00 PM',
      timeUntilPlanning: `${Math.floor(hoursUntil / 24)} days, ${hoursUntil % 24} hours`,
    };
  }, [simulatedMode]);

  // Calculate surfaced insights
  const surfacedInsights = useMemo(() => {
    if (!insights || !confidence) return { ambient: [], passive: [], notification: [] };

    const surfaced = insights.filter(insight => {
      const decision = shouldSurfaceInsight(insight, confidence.overall, dismissals);
      return decision.shouldShow;
    });

    return {
      ambient: surfaced.filter(i => getEscalationLevel(i, confidence.overall) === 'ambient'),
      passive: surfaced.filter(i => getEscalationLevel(i, confidence.overall) === 'passive'),
      notification: surfaced.filter(i => getEscalationLevel(i, confidence.overall) === 'notification'),
    };
  }, [insights, confidence, dismissals]);

  // Calculate what would show in each mode
  const modeComparison = useMemo(() => {
    if (!insights || !confidence) return { living: [], planning: [] };

    // Living mode: only critical items
    const livingItems = insights.filter(i => {
      const decision = shouldSurfaceInsight(i, confidence.overall, dismissals);
      return decision.shouldShow && i.priority <= 2;
    });

    // Planning mode: all passing items
    const planningItems = insights.filter(i => {
      const decision = shouldSurfaceInsight(i, confidence.overall, dismissals);
      return decision.shouldShow || decision.score >= 0.3; // Lower threshold for planning
    });

    return { living: livingItems, planning: planningItems };
  }, [insights, confidence, dismissals]);

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

      {/* Mode Indicator */}
      {activeTab === 'mode' && (
        <div className="space-y-4">
          {/* Simulation indicator */}
          {currentMode.isSimulated && (
            <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-sm">⚠</span>
                <span className="text-amber-400 text-xs">
                  Simulating {currentMode.mode} mode
                </span>
              </div>
              <button
                onClick={() => setSimulatedMode(null)}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Reset to Auto
              </button>
            </div>
          )}

          <div className={`
            p-6 rounded-lg text-center border-2
            ${currentMode.mode === 'PLANNING'
              ? 'bg-emerald-500/10 border-emerald-500/50'
              : 'bg-blue-500/10 border-blue-500/50'
            }
          `}>
            <div className="text-xs text-slate-400 mb-2">
              {currentMode.isSimulated ? 'SIMULATED MODE' : 'CURRENT MODE'}
            </div>
            <div className={`text-3xl font-bold mb-2 ${
              currentMode.mode === 'PLANNING' ? 'text-emerald-400' : 'text-blue-400'
            }`}>
              {currentMode.mode}
            </div>
            <div className="text-slate-300 mb-4">{currentMode.currentTime}</div>
            <div className="text-sm text-slate-400">{currentMode.description}</div>
          </div>

          <DebugCard>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Planning mode expected</span>
                <span className="text-cyan-400">{currentMode.nextPlanning}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Time until planning</span>
                <span className="text-slate-300">{currentMode.timeUntilPlanning}</span>
              </div>
            </div>
          </DebugCard>

          <div className="flex gap-2">
            <button
              onClick={() => setSimulatedMode('PLANNING')}
              disabled={simulatedMode === 'PLANNING'}
              className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${
                simulatedMode === 'PLANNING'
                  ? 'bg-emerald-500/40 text-emerald-300 cursor-not-allowed'
                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400'
              }`}
            >
              {simulatedMode === 'PLANNING' ? '✓ Planning Mode' : 'Simulate Planning Mode'}
            </button>
            <button
              onClick={() => setSimulatedMode('LIVING')}
              disabled={simulatedMode === 'LIVING'}
              className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${
                simulatedMode === 'LIVING'
                  ? 'bg-blue-500/40 text-blue-300 cursor-not-allowed'
                  : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400'
              }`}
            >
              {simulatedMode === 'LIVING' ? '✓ Living Mode' : 'Simulate Living Mode'}
            </button>
          </div>
        </div>
      )}

      {/* Currently Surfaced */}
      {activeTab === 'surfaced' && (
        <div className="space-y-4">
          {/* Ambient */}
          <DebugCard title="AMBIENT (always visible)">
            {surfacedInsights.ambient.length > 0 ? (
              <div className="space-y-2">
                {surfacedInsights.ambient.map((insight, i) => (
                  <div key={i} className="p-2 bg-slate-800/50 rounded text-sm">
                    <div className="text-slate-300">{insight.message}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Source: {insight.type} | Surfaced: Always shown
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No ambient items</p>
            )}
          </DebugCard>

          {/* Passive */}
          <DebugCard title="PASSIVE (on app open)">
            {surfacedInsights.passive.length > 0 ? (
              <div className="space-y-2">
                {surfacedInsights.passive.map((insight, i) => (
                  <div key={i} className="p-2 bg-slate-800/50 rounded text-sm">
                    <div className="text-slate-300">{insight.message}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Source: {insight.type} | Priority: {insight.priority}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No passive items</p>
            )}
          </DebugCard>

          {/* Notification */}
          <DebugCard title="NOTIFICATION (critical only)">
            {surfacedInsights.notification.length > 0 ? (
              <div className="space-y-2">
                {surfacedInsights.notification.map((insight, i) => (
                  <div key={i} className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm">
                    <div className="text-red-300">{insight.message}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Critical: Bills due within 24 hours
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No notifications active</p>
            )}
          </DebugCard>
        </div>
      )}

      {/* Deferral Queue */}
      {activeTab === 'deferral' && (
        <div className="space-y-4">
          <DebugCard title={`Deferred Items (${deferralQueue.length})`}>
            <p className="text-xs text-slate-400 mb-3">
              Insights waiting to be shown. Items are deferred when context gates block them.
              Items expire after 30 minutes (TTL).
            </p>

            {deferralQueue.length > 0 ? (
              <div className="space-y-3">
                {deferralQueue.map((item, i) => (
                  <div
                    key={i}
                    className="p-3 bg-slate-800/50 rounded border border-slate-700"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="text-sm text-slate-300">{item.insight.message}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          Type: {item.insight.type} | Priority: P{item.insight.priority}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className={`font-mono text-lg ${
                          item.ttlPercent > 50 ? 'text-emerald-400' :
                          item.ttlPercent > 20 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {item.remainingFormatted}
                        </div>
                        <div className="text-xs text-slate-500">TTL</div>
                      </div>
                    </div>

                    {/* TTL Progress Bar */}
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full transition-all ${
                          item.ttlPercent > 50 ? 'bg-emerald-500' :
                          item.ttlPercent > 20 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${item.ttlPercent}%` }}
                      />
                    </div>

                    {/* Wait Condition */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">Wait:</span>
                      <span className="text-amber-400">{item.waitCondition}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="text-slate-500 text-sm">No deferred items</div>
                <div className="text-xs text-slate-600 mt-1">
                  Items appear here when blocked by context gates
                </div>
              </div>
            )}
          </DebugCard>

          <DebugCard title="Deferral Rules">
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <div>
                  <span className="text-slate-300">Score threshold passed</span>
                  <span className="text-slate-500"> (≥ 0.30)</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-400">⏳</span>
                <div>
                  <span className="text-slate-300">Gate blocked delivery</span>
                  <span className="text-slate-500"> (DND, mid-task, etc.)</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-slate-400">→</span>
                <div>
                  <span className="text-slate-300">Deferred with TTL</span>
                  <span className="text-slate-500"> (30 min default)</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-red-400">✕</span>
                <div>
                  <span className="text-slate-300">Expired items dropped</span>
                  <span className="text-slate-500"> (no longer relevant)</span>
                </div>
              </div>
            </div>
          </DebugCard>

          <DebugCard title="Execution Windows">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-slate-700/50">
                <span className="text-slate-400">Planning Mode</span>
                <span className="text-cyan-400">Sunday 6-9 PM</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-700/50">
                <span className="text-slate-400">Idle Threshold</span>
                <span className="text-cyan-400">30 seconds</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-700/50">
                <span className="text-slate-400">Critical Bypass</span>
                <span className="text-emerald-400">Always allowed</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">DND Mode</span>
                <span className="text-red-400">Blocks all except P0</span>
              </div>
            </div>
          </DebugCard>
        </div>
      )}

      {/* Mode Comparison */}
      {activeTab === 'comparison' && (
        <DebugCard title="What would show in each mode?">
          <div className="grid grid-cols-2 gap-4">
            {/* Living Mode */}
            <div>
              <div className="text-sm font-medium text-blue-400 mb-2">
                LIVING MODE ({modeComparison.living.length} items)
              </div>
              <div className="space-y-1">
                {modeComparison.living.length > 0 ? (
                  modeComparison.living.slice(0, 5).map((insight, i) => (
                    <div key={i} className="text-xs p-2 bg-slate-800/50 rounded text-slate-300">
                      {insight.message.slice(0, 40)}...
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">Only status glyph</p>
                )}
              </div>
            </div>

            {/* Planning Mode */}
            <div>
              <div className="text-sm font-medium text-emerald-400 mb-2">
                PLANNING MODE ({modeComparison.planning.length} items)
              </div>
              <div className="space-y-1">
                {modeComparison.planning.length > 0 ? (
                  modeComparison.planning.slice(0, 5).map((insight, i) => (
                    <div key={i} className="text-xs p-2 bg-slate-800/50 rounded text-slate-300">
                      {insight.message.slice(0, 40)}...
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No insights yet</p>
                )}
                {modeComparison.planning.length > 5 && (
                  <p className="text-xs text-slate-500">
                    +{modeComparison.planning.length - 5} more
                  </p>
                )}
              </div>
            </div>
          </div>
        </DebugCard>
      )}
    </div>
  );
}
