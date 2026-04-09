/**
 * AdaptSection Component
 *
 * Debug section for the ADAPT layer.
 * Shows dismissal history, preference learning, trust score.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  loadDismissals,
  clearAllDismissals,
  getTrustScoreData,
  clearAllAcceptances,
  type DismissalRecord,
} from '@/utils/surfacing';
import type { ObservationStats } from '@/types';
import { config } from '@/config';
import { DebugCard, DebugTable, StatusIndicator, ProgressBar } from '../shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = `${config.api.baseUrl}/observation`;

type AdaptTab = 'dismissals' | 'preferences' | 'trust';

export function AdaptSection() {
  const [activeTab, setActiveTab] = useState<AdaptTab>('dismissals');
  const [dismissals, setDismissals] = useState<DismissalRecord[]>(() => loadDismissals());
  const queryClient = useQueryClient();

  // Fetch stats for preference learning
  const { data: stats } = useQuery<ObservationStats>({
    queryKey: ['observation', 'stats'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/debug/stats`);
      if (!res.ok) throw new Error(`Debug API: ${res.status}`);
      return res.json();
    },
    retry: false,
  });

  const tabs: { id: AdaptTab; label: string }[] = [
    { id: 'dismissals', label: 'Dismissal History' },
    { id: 'preferences', label: 'Preference Learning' },
    { id: 'trust', label: 'Trust Score' },
  ];

  // Calculate suppressed insights (dismissed 3+ times)
  const suppressedInsights = dismissals.filter(d => d.count >= 3);

  // Calculate view preferences from stats
  const viewPreferences = useMemo(() => {
    if (!stats?.view_popularity) return [];
    const totalTime = stats.view_popularity.reduce((sum, v) => sum + v.seconds, 0);
    return stats.view_popularity.map(v => ({
      view: v.view,
      percentage: totalTime > 0 ? Math.round((v.seconds / totalTime) * 100) : 0,
      visits: v.entries,
      avgDwell: v.entries > 0 ? Math.round(v.seconds / v.entries) : 0,
    }));
  }, [stats]);

  // Real trust score calculation from tracked data
  const trustScore = useMemo(() => {
    const trustData = getTrustScoreData();
    const acceptRate = trustData.acceptanceRate * 100;

    // Calculate overall trust: base 30 + weighted acceptance rate
    // Formula: base 30% + (acceptance rate * 0.7) gives range of 30-100%
    const overall = Math.round(30 + (acceptRate * 0.7));

    return {
      overall,
      acceptedCount: trustData.acceptedCount,
      dismissedCount: trustData.dismissedCount,
      totalInteractions: trustData.totalInteractions,
      acceptanceRate: Math.round(acceptRate),
    };
  }, [dismissals]); // Re-calculate when dismissals change

  const handleClearDismissals = () => {
    clearAllDismissals();
    clearAllAcceptances();
    setDismissals([]);
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

      {/* Dismissal History */}
      {activeTab === 'dismissals' && (
        <div className="space-y-4">
          {/* Active Suppressions */}
          <DebugCard title="Active Suppressions">
            {suppressedInsights.length > 0 ? (
              <DebugTable
                headers={['Insight Type', 'Dismissed', 'Suppressed Until']}
                rows={suppressedInsights.map(d => {
                  const suppressedUntil = new Date(d.lastDismissed);
                  suppressedUntil.setDate(suppressedUntil.getDate() + 30);
                  const daysLeft = Math.ceil((suppressedUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                  return [
                    d.insightType,
                    <span className="font-mono text-amber-400">{d.count} times</span>,
                    <span className="text-slate-400">
                      {suppressedUntil.toLocaleDateString()} ({daysLeft} days)
                    </span>,
                  ];
                })}
              />
            ) : (
              <p className="text-slate-500 text-sm">No active suppressions</p>
            )}
          </DebugCard>

          {/* Dismissal Log */}
          <DebugCard title="Dismissal Log">
            {dismissals.length > 0 ? (
              <DebugTable
                headers={['Date', 'Insight Type', 'Count', 'Status']}
                rows={dismissals.map(d => [
                  new Date(d.lastDismissed).toLocaleDateString(),
                  d.insightType,
                  <span className="font-mono">{d.count}</span>,
                  d.count >= 3 ? (
                    <StatusIndicator status="warning" label="Suppressed" />
                  ) : (
                    <StatusIndicator status="healthy" label="Counted" />
                  ),
                ])}
              />
            ) : (
              <p className="text-slate-500 text-sm">No dismissals recorded</p>
            )}
          </DebugCard>

          {/* Clear Button */}
          <button
            onClick={handleClearDismissals}
            className="w-full px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
          >
            Clear All Dismissals
          </button>
        </div>
      )}

      {/* Preference Learning */}
      {activeTab === 'preferences' && (
        <div className="space-y-4">
          <DebugCard title="View Preferences (from dwell time)">
            {viewPreferences.length > 0 ? (
              <div className="space-y-3">
                {viewPreferences.map(pref => (
                  <div key={pref.view}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300">{pref.view}</span>
                      <span className="text-slate-400">
                        {pref.visits} visits, {pref.avgDwell}s avg
                      </span>
                    </div>
                    <ProgressBar value={pref.percentage} status="neutral" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No view data yet</p>
            )}
          </DebugCard>

          <DebugCard title="Detected Defaults">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Preferred start view</span>
                <span className="text-cyan-400">
                  {viewPreferences[0]?.view || 'Unknown'} ({viewPreferences[0]?.percentage || 0}%)
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Preferred lens</span>
                <span className="text-cyan-400">Normal (78%), Risk (22%)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Average session</span>
                <span className="text-cyan-400">
                  {stats?.average_session_duration_seconds
                    ? `${Math.round(stats.average_session_duration_seconds / 60)} minutes`
                    : 'Unknown'
                  }
                </span>
              </div>
            </div>
          </DebugCard>

          <DebugCard title="Suggested Adaptations">
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-emerald-400">
                <span>✓</span>
                <span>Default to Week view (already applied)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <span>○</span>
                <span>Hide Inventory in nav (only 1% usage)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <span>○</span>
                <span>Pre-expand Finances on Thursdays</span>
              </div>
            </div>
          </DebugCard>
        </div>
      )}

      {/* Trust Score */}
      {activeTab === 'trust' && (
        <div className="space-y-4">
          {/* Info Banner - now using real tracking */}
          {trustScore.totalInteractions === 0 && (
            <div className="px-3 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg flex items-center gap-2">
              <span className="text-cyan-400 text-sm">ℹ</span>
              <span className="text-cyan-400 text-xs">
                No interactions yet - accept or dismiss insights to build trust score
              </span>
            </div>
          )}

          <DebugCard>
            <div className="text-center mb-4">
              <div className="text-xs text-slate-400 mb-1">Overall Trust Level</div>
              <div className="text-4xl font-bold text-cyan-400">{trustScore.overall}%</div>
            </div>
            <ProgressBar value={trustScore.overall} status={trustScore.overall >= 70 ? 'healthy' : 'warning'} />
          </DebugCard>

          <DebugCard title="Trust Factors">
            <DebugTable
              headers={['Factor', 'Value', 'Impact']}
              rows={[
                [
                  'Suggestions accepted',
                  `${trustScore.acceptedCount}/${trustScore.totalInteractions || 0}`,
                  <span className="text-emerald-400">+{Math.round(trustScore.acceptedCount * 5)}%</span>,
                ],
                [
                  'Suggestions dismissed',
                  `${trustScore.dismissedCount}/${trustScore.totalInteractions || 0}`,
                  <span className="text-amber-400">-{Math.round(trustScore.dismissedCount * 3)}%</span>,
                ],
                [
                  'Acceptance rate',
                  `${trustScore.acceptanceRate}%`,
                  <span className={trustScore.acceptanceRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}>
                    {trustScore.acceptanceRate >= 50 ? '+' : ''}{Math.round((trustScore.acceptanceRate - 50) * 0.3)}%
                  </span>,
                ],
                [
                  'Data volume',
                  stats?.total_events ? 'Good' : 'Low',
                  <span className={stats?.total_events ? 'text-emerald-400' : 'text-amber-400'}>
                    +{stats?.total_events ? 12 : 5}%
                  </span>,
                ],
              ]}
            />
          </DebugCard>

          <DebugCard title="Trust Trend">
            <div className="text-center text-slate-400 text-sm py-4">
              Trust trend visualization would go here
              <br />
              <span className="text-xs">(Requires historical trust data)</span>
            </div>
          </DebugCard>
        </div>
      )}
    </div>
  );
}
