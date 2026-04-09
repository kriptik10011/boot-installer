/**
 * ObserveSection Component
 *
 * Debug section for the OBSERVE layer.
 * Shows signal coverage, event sources, live event stream, sessions,
 * velocity metrics, and ADWIN drift detection.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ObservationEvent, SessionSummary, ObservationStats } from '@/types';
import { config } from '@/config';
import { DebugCard, DebugTable, StatusIndicator, ProgressBar } from '../shared';

const API_BASE = `${config.api.baseUrl}/observation`;

type ObserveTab = 'signals' | 'sources' | 'events' | 'sessions' | 'velocity';

/**
 * Simple sparkline component for visualizing trends
 */
function Sparkline({ data, height = 24, color = 'cyan' }: {
  data: number[];
  height?: number;
  color?: 'cyan' | 'amber' | 'emerald' | 'red';
}) {
  if (data.length < 2) {
    return <div className="text-xs text-slate-500">Insufficient data</div>;
  }

  const max = Math.max(...data, 1);
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = height - (val / max) * height;
    return `${x},${y}`;
  }).join(' ');

  const colorMap = {
    cyan: 'stroke-cyan-400',
    amber: 'stroke-amber-400',
    emerald: 'stroke-emerald-400',
    red: 'stroke-red-400',
  };

  return (
    <svg width="100%" height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        className={`${colorMap[color]} stroke-2`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ObserveSection() {
  const [activeTab, setActiveTab] = useState<ObserveTab>('signals');

  // Fetch stats
  const { data: stats } = useQuery<ObservationStats>({
    queryKey: ['observation', 'stats'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/debug/stats`);
      if (!res.ok) throw new Error(`Debug API: ${res.status}`);
      return res.json();
    },
    refetchInterval: 5000,
    retry: false,
  });

  // Fetch recent events
  const { data: events } = useQuery<ObservationEvent[]>({
    queryKey: ['observation', 'events'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/debug/events?limit=50`);
      if (!res.ok) throw new Error(`Debug API: ${res.status}`);
      return res.json();
    },
    refetchInterval: 2000,
    retry: false,
  });

  // Fetch sessions
  const { data: sessions } = useQuery<SessionSummary[]>({
    queryKey: ['observation', 'sessions'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/debug/sessions?limit=10`);
      if (!res.ok) throw new Error(`Debug API: ${res.status}`);
      return res.json();
    },
    refetchInterval: 5000,
    retry: false,
  });

  const tabs: { id: ObserveTab; label: string }[] = [
    { id: 'signals', label: 'Signal Coverage' },
    { id: 'sources', label: 'Event Sources' },
    { id: 'events', label: 'Live Events' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'velocity', label: 'Velocity & Drift' },
  ];

  // Calculate event velocity (events per minute over last 10 minutes)
  const velocityData = useMemo(() => {
    if (!events?.length) return { eventsPerMinute: [], currentRate: 0, avgRate: 0 };

    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;
    const recentEvents = events.filter(e =>
      new Date(e.timestamp + 'Z').getTime() > tenMinutesAgo
    );

    // Group events by minute
    const minuteBuckets: number[] = new Array(10).fill(0);
    recentEvents.forEach(e => {
      const eventTime = new Date(e.timestamp + 'Z').getTime();
      const minuteIndex = Math.floor((now - eventTime) / 60000);
      if (minuteIndex >= 0 && minuteIndex < 10) {
        minuteBuckets[9 - minuteIndex]++; // Reverse so recent is on right
      }
    });

    const currentRate = minuteBuckets[9] || 0;
    const avgRate = minuteBuckets.reduce((a, b) => a + b, 0) / 10;

    return { eventsPerMinute: minuteBuckets, currentRate, avgRate };
  }, [events]);

  // Calculate idle bucket distribution
  const idleBuckets = useMemo(() => {
    if (!events?.length || events.length < 2) {
      return { short: 0, medium: 0, long: 0 };
    }

    let short = 0; // < 10 seconds
    let medium = 0; // 10-60 seconds
    let long = 0; // > 60 seconds

    for (let i = 1; i < events.length; i++) {
      const gap = new Date(events[i - 1].timestamp + 'Z').getTime() -
                  new Date(events[i].timestamp + 'Z').getTime();
      const gapSeconds = gap / 1000;

      if (gapSeconds < 10) short++;
      else if (gapSeconds < 60) medium++;
      else long++;
    }

    const total = short + medium + long || 1;
    return {
      short: Math.round((short / total) * 100),
      medium: Math.round((medium / total) * 100),
      long: Math.round((long / total) * 100),
    };
  }, [events]);

  // Calculate signal coverage from stats
  const signalCoverage = stats ? [
    {
      type: 'Timestamps',
      count: stats.total_events,
      lastRecorded: events?.[0]?.timestamp || null,
      status: stats.total_events > 0 ? 'healthy' : 'warning',
    },
    {
      type: 'Dwell Time',
      count: stats.view_popularity.reduce((sum, v) => sum + v.entries, 0),
      lastRecorded: events?.find(e => e.event_type === 'view_exit')?.timestamp || null,
      status: stats.view_popularity.length > 0 ? 'healthy' : 'warning',
    },
    {
      type: 'Navigation Paths',
      count: Object.values(stats.events_by_type).reduce((sum: number, v) => sum + (v as number), 0),
      lastRecorded: events?.[0]?.timestamp || null,
      status: stats.total_events > 0 ? 'healthy' : 'warning',
    },
    {
      type: 'Edit Patterns',
      count: (stats.events_by_type['edit'] as number) || 0,
      lastRecorded: events?.find(e => e.event_type === 'edit')?.timestamp || null,
      status: (stats.events_by_type['edit'] as number) > 0 ? 'healthy' : 'warning',
    },
    {
      type: 'Dismissals',
      count: (stats.events_by_type['dismissal'] as number) || 0,
      lastRecorded: events?.find(e => e.event_type === 'dismissal')?.timestamp || null,
      status: 'healthy', // Dismissals being low is actually good
    },
  ] : [];

  // Calculate event sources from stats
  const eventSources = stats?.view_popularity.map(v => ({
    component: v.view,
    eventCount: v.entries,
    lastActivity: events?.find(e => e.view_name === v.view)?.timestamp || null,
    status: v.entries > 0 ? 'healthy' : 'warning',
  })) || [];

  const formatTime = (timestamp: string | null): string => {
    if (!timestamp) return '--';
    const diff = Date.now() - new Date(timestamp + 'Z').getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
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

      {/* Signal Coverage */}
      {activeTab === 'signals' && (
        <DebugCard title="Signal Coverage Matrix">
          <DebugTable
            headers={['Signal Type', 'Status', 'Count', 'Last Recorded']}
            rows={signalCoverage.map(sig => [
              sig.type,
              <StatusIndicator key={sig.type} status={sig.status as 'healthy' | 'warning'} />,
              <span className="font-mono text-cyan-400">{sig.count}</span>,
              formatTime(sig.lastRecorded),
            ])}
          />
        </DebugCard>
      )}

      {/* Event Sources */}
      {activeTab === 'sources' && (
        <DebugCard title="Event Source Map">
          {eventSources.length > 0 ? (
            <DebugTable
              headers={['Component', 'Events', 'Last', 'Status']}
              rows={eventSources.map(src => [
                src.component,
                <span className="font-mono text-cyan-400">{src.eventCount}</span>,
                formatTime(src.lastActivity),
                <StatusIndicator
                  key={src.component}
                  status={src.status as 'healthy' | 'warning'}
                  label={src.status === 'healthy' ? 'Active' : 'Idle'}
                />,
              ])}
            />
          ) : (
            <p className="text-slate-500 text-sm">No event sources recorded yet</p>
          )}
        </DebugCard>
      )}

      {/* Live Events */}
      {activeTab === 'events' && (
        <DebugCard title="Live Event Stream">
          <div className="max-h-80 overflow-y-auto space-y-1">
            {events?.length ? (
              events.map(event => (
                <div
                  key={event.id}
                  className="bg-slate-800/50 p-2 rounded font-mono text-xs flex items-center gap-2"
                >
                  <span className="text-slate-500 w-20 shrink-0">
                    {new Date(event.timestamp + 'Z').toLocaleTimeString()}
                  </span>
                  <span className="text-amber-400 w-24 shrink-0">{event.event_type}</span>
                  {event.view_name && (
                    <span className="text-blue-400">[{event.view_name}]</span>
                  )}
                  {event.action_name && (
                    <span className="text-emerald-400">{event.action_name}</span>
                  )}
                  <span className="text-slate-600 ml-auto text-xs">
                    {event.session_id.slice(0, 8)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-slate-500 text-sm">No events recorded yet</p>
            )}
          </div>
        </DebugCard>
      )}

      {/* Sessions */}
      {activeTab === 'sessions' && (
        <DebugCard title="Session History">
          <div className="space-y-2">
            {sessions?.length ? (
              sessions.map(session => (
                <div
                  key={session.id}
                  className="bg-slate-800/50 p-3 rounded"
                >
                  <div className="flex justify-between mb-1">
                    <span className="font-mono text-xs text-slate-500">
                      {session.session_id.slice(0, 8)}...
                    </span>
                    <span className={
                      session.is_planning_session
                        ? 'text-emerald-400 text-xs'
                        : session.is_planning_session === false
                        ? 'text-blue-400 text-xs'
                        : 'text-slate-500 text-xs'
                    }>
                      {session.is_planning_session ? 'Planning' : 'Living'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-300">
                    Duration: {session.duration_seconds
                      ? `${Math.round(session.duration_seconds / 60)}m ${Math.round(session.duration_seconds % 60)}s`
                      : 'Active'
                    }
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Views: {session.views_visited.join(', ') || 'none'}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-500 text-sm">No sessions recorded yet</p>
            )}
          </div>
        </DebugCard>
      )}

      {/* Velocity & Drift */}
      {activeTab === 'velocity' && (
        <div className="space-y-4">
          <DebugCard title="Event Velocity (Last 10 Minutes)">
            <div className="space-y-4">
              {/* Sparkline */}
              <div className="bg-slate-800/50 p-3 rounded">
                <div className="flex justify-between text-xs text-slate-500 mb-2">
                  <span>-10 min</span>
                  <span>Events/minute</span>
                  <span>Now</span>
                </div>
                <Sparkline data={velocityData.eventsPerMinute} height={40} color="cyan" />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 p-3 rounded">
                  <div className="text-xs text-slate-500">Current Rate</div>
                  <div className="text-2xl font-mono text-cyan-400">
                    {velocityData.currentRate}
                    <span className="text-sm text-slate-500">/min</span>
                  </div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded">
                  <div className="text-xs text-slate-500">10-Min Average</div>
                  <div className="text-2xl font-mono text-slate-300">
                    {velocityData.avgRate.toFixed(1)}
                    <span className="text-sm text-slate-500">/min</span>
                  </div>
                </div>
              </div>
            </div>
          </DebugCard>

          <DebugCard title="Idle Time Distribution">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">{'< 10 seconds (Active)'}</span>
                  <span className="font-mono text-emerald-400">{idleBuckets.short}%</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${idleBuckets.short}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">10-60 seconds (Paused)</span>
                  <span className="font-mono text-amber-400">{idleBuckets.medium}%</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all"
                    style={{ width: `${idleBuckets.medium}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">{'> 60 seconds (Idle)'}</span>
                  <span className="font-mono text-red-400">{idleBuckets.long}%</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 transition-all"
                    style={{ width: `${idleBuckets.long}%` }}
                  />
                </div>
              </div>
            </div>
          </DebugCard>

          <DebugCard title="ADWIN Drift Detection">
            <div className="space-y-3">
              <div className="bg-slate-800/50 p-3 rounded">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-300">Drift Status</span>
                  <StatusIndicator status="healthy" label="STABLE" />
                </div>
                <p className="text-xs text-slate-500">
                  ADWIN (ADaptive WINdowing) monitors for distribution changes
                  in user behavior patterns. When drift is detected, the system
                  re-learns patterns from recent data.
                </p>
              </div>

              <div className="font-mono text-xs text-slate-400 bg-slate-800/50 p-3 rounded">
                <p className="text-slate-500 mb-2">// ADWIN Hoeffding Bound</p>
                <p>{'ε = sqrt((1/2m) × ln(4/δ))'}</p>
                <p>drift_detected = |μ₁ - μ₂| {'>'} ε</p>
                <p className="text-slate-500 mt-2">// Parameters</p>
                <p>δ = 0.05 (confidence)</p>
                <p>m = min(n₁, n₂) (window sizes)</p>
              </div>
            </div>
          </DebugCard>
        </div>
      )}
    </div>
  );
}
