/**
 * UltimateDebugPanel - Main Container
 *
 * Comprehensive debug workbench for the intelligence stack.
 * Organizes debug sections for: OBSERVE → INFER → DECIDE → SURFACE → ADAPT
 */

import { useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { CollapsibleSection } from './shared';
import { PipelineVisualizer, HealthDashboard } from './StackOverview';
import {
  ObserveSection,
  InferSection,
  DecideSection,
  SurfaceSection,
  AdaptSection,
  HabitsSection,
  MathSection,
  CrossFeatureSection,
  ForceTriggersSection,
} from './sections';
import {
  usePatternConfidence,
  useInsights,
  getCurrentWeekStart,
} from '@/hooks/usePatterns';
import {
  shouldSurfaceInsight,
  loadDismissals,
} from '@/utils/surfacing';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { config } from '@/config';
import type { ObservationStats, ObservationEvent } from '@/types';

const API_BASE = `${config.api.baseUrl}/observation`;

export function UltimateDebugPanel() {
  const queryClient = useQueryClient();
  const weekStart = getCurrentWeekStart();
  const dismissals = loadDismissals();

  // Fetch observation stats for pipeline counts
  const { data: stats, isLoading: statsLoading, refetch: refetchStats, error: statsError } = useQuery<ObservationStats>({
    queryKey: ['observation', 'stats'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/debug/stats`);
      if (!res.ok) throw new Error(`Debug API: ${res.status}`);
      return res.json();
    },
    refetchInterval: 5000,
    retry: false,
  });

  // Fetch recent events for last event time
  const { data: events } = useQuery<ObservationEvent[]>({
    queryKey: ['observation', 'events'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/debug/events?limit=5`);
      if (!res.ok) throw new Error(`Debug API: ${res.status}`);
      return res.json();
    },
    refetchInterval: 5000,
    retry: false,
  });

  // Get pattern confidence
  const { data: confidence } = usePatternConfidence();

  // Get insights
  const { data: insights } = useInsights(weekStart);

  // Calculate pipeline counts
  const pipelineCounts = useMemo(() => {
    const observeCount = stats?.total_events || 0;
    const inferCount = confidence ? Math.round(confidence.overall * 10) : 0; // patterns detected

    // Calculate how many insights pass the decision gates
    let decideCount = 0;
    let surfaceCount = 0;
    if (insights && confidence) {
      insights.forEach(insight => {
        const decision = shouldSurfaceInsight(insight, confidence.overall, dismissals);
        if (decision.score >= 0.3) decideCount++;
        if (decision.shouldShow) surfaceCount++;
      });
    }

    const adaptCount = dismissals.length;

    return { observeCount, inferCount, decideCount, surfaceCount, adaptCount };
  }, [stats, confidence, insights, dismissals]);

  // Calculate pipeline statuses
  const pipelineStatuses = useMemo(() => {
    const observeStatus: 'healthy' | 'warning' | 'error' =
      (stats?.total_events || 0) > 10 ? 'healthy' :
      (stats?.total_events || 0) > 0 ? 'warning' : 'error';

    const inferStatus: 'healthy' | 'warning' | 'error' =
      confidence?.ready_for_surfacing ? 'healthy' :
      (confidence?.overall || 0) > 0.3 ? 'warning' : 'error';

    const decideStatus: 'healthy' | 'warning' | 'error' =
      pipelineCounts.decideCount > 0 ? 'healthy' : 'warning';

    const surfaceStatus: 'healthy' | 'warning' | 'error' =
      pipelineCounts.surfaceCount > 0 ? 'healthy' : 'warning';

    const adaptStatus: 'healthy' | 'warning' | 'error' = 'healthy';

    return { observeStatus, inferStatus, decideStatus, surfaceStatus, adaptStatus };
  }, [stats, confidence, pipelineCounts]);

  // Calculate health metrics
  const healthMetrics = useMemo(() => {
    const dataQuality = Math.min(100, (stats?.total_events || 0) * 5);
    const patternConfidence = Math.round((confidence?.overall || 0) * 100);
    const surfacingAccuracy = confidence?.ready_for_surfacing ? 80 : 50;
    const adaptationActive = dismissals.length > 0 ? 70 : 40;
    const antiPatterns: string[] = [];

    // Check for anti-patterns
    if ((stats?.total_events || 0) < 5) {
      antiPatterns.push('Low observation data');
    }
    if (dismissals.filter(d => d.count >= 3).length > 3) {
      antiPatterns.push('High suppression rate');
    }

    return { dataQuality, patternConfidence, surfacingAccuracy, adaptationActive, antiPatterns };
  }, [stats, confidence, dismissals]);

  // Get last event timestamp
  const lastEventTime = events?.[0]?.timestamp || null;

  // Refresh handler
  const handleRefresh = () => {
    refetchStats();
    queryClient.invalidateQueries({ queryKey: ['patterns'] });
  };

  // Handle pipeline stage click - scroll to section and open it
  const handleStageClick = useCallback((stageId: string) => {
    const sectionId = `debug-${stageId}`;
    const element = document.getElementById(sectionId);

    if (element) {
      // Open the section by updating localStorage
      const STORAGE_KEY = 'ultimate-debug-panel-sections';
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const state = stored ? JSON.parse(stored) : {};
        state[sectionId] = true;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Ignore storage errors
      }

      // Dispatch a custom event to trigger re-render of CollapsibleSection
      window.dispatchEvent(new CustomEvent('debug-section-toggle', { detail: { id: sectionId, open: true } }));

      // Scroll to the section with smooth behavior
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Reset/Delete data state and mutation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${config.api.baseUrl}/backup/database`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Failed to delete data');
      }
      return res.json();
    },
    onSuccess: () => {
      setShowDeleteConfirm(false);
      // Clear all cached queries
      queryClient.clear();
      // Refetch all data
      queryClient.invalidateQueries();
    },
  });

  // Seed test data mutation
  const [seedStatus, setSeedStatus] = useState<string | null>(null);
  const seedMutation = useMutation({
    mutationFn: async (scenario: string) => {
      const res = await fetch(
        `${API_BASE}/debug/seed?scenario=${scenario}&clear_first=true`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        throw new Error(data.message || 'Seed failed');
      }
      return data;
    },
    onSuccess: (data) => {
      const coldStartMsg = data.exits_cold_start ? '(exits cold start)' : '(still in cold start)';
      setSeedStatus(`✅ Seeded: ${data.scenario} • ${data.session_count} sessions ${coldStartMsg}`);
      queryClient.invalidateQueries({ queryKey: ['observation'] });
      queryClient.invalidateQueries({ queryKey: ['patterns'] });
      setTimeout(() => setSeedStatus(null), 8000);
    },
    onError: (error: Error) => {
      setSeedStatus(`❌ ${error.message}`);
      setTimeout(() => setSeedStatus(null), 10000);
    },
  });

  // Show friendly message when debug endpoints return 403
  const isDebugDisabled = statsError?.message?.includes('403');

  if (isDebugDisabled) {
    return (
      <div className="h-full overflow-y-auto bg-slate-900 text-white">
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 p-4">
          <h1 className="text-xl font-bold text-cyan-400">Intelligence Stack Debug</h1>
        </div>
        <div className="p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 mb-4">
            <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Debug Mode Disabled</h2>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            Set <code className="px-1.5 py-0.5 bg-slate-800 rounded text-amber-400 text-xs">WEEKLY_REVIEW_DEV_MODE=true</code> environment variable to enable debug tools.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-900 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 p-4">
        <h1 className="text-xl font-bold text-cyan-400">Intelligence Stack Debug</h1>
        <p className="text-sm text-slate-400 mt-1">
          OBSERVE → INFER → DECIDE → SURFACE → ADAPT
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Stack Overview - Always Visible */}
        <div className="space-y-4">
          <PipelineVisualizer
            observeCount={pipelineCounts.observeCount}
            inferCount={pipelineCounts.inferCount}
            decideCount={pipelineCounts.decideCount}
            surfaceCount={pipelineCounts.surfaceCount}
            adaptCount={pipelineCounts.adaptCount}
            observeStatus={pipelineStatuses.observeStatus}
            inferStatus={pipelineStatuses.inferStatus}
            decideStatus={pipelineStatuses.decideStatus}
            surfaceStatus={pipelineStatuses.surfaceStatus}
            adaptStatus={pipelineStatuses.adaptStatus}
            onStageClick={handleStageClick}
          />
          <HealthDashboard
            dataQuality={healthMetrics.dataQuality}
            patternConfidence={healthMetrics.patternConfidence}
            surfacingAccuracy={healthMetrics.surfacingAccuracy}
            adaptationActive={healthMetrics.adaptationActive}
            antiPatterns={healthMetrics.antiPatterns}
            lastEventTime={lastEventTime}
            isLoading={statsLoading}
            onRefresh={handleRefresh}
          />

          {/* Test Data Seeding */}
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Intelligence Layer (Observation Patterns)</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => seedMutation.mutate('typical')}
                disabled={seedMutation.isPending}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
              >
                {seedMutation.isPending ? 'Seeding...' : 'Seed Typical (6 wks)'}
              </button>
              <button
                onClick={() => seedMutation.mutate('consistent')}
                disabled={seedMutation.isPending}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
              >
                Strong Patterns (6 wks)
              </button>
              <button
                onClick={() => seedMutation.mutate('irregular')}
                disabled={seedMutation.isPending}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
              >
                Weak Patterns (1 wk)
              </button>
            </div>

            <h3 className="text-sm font-medium text-slate-300 mt-4 mb-3">Week Stress Testing (App Data Volume)</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => seedMutation.mutate('light')}
                disabled={seedMutation.isPending}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
              >
                Light Week
              </button>
              <button
                onClick={() => seedMutation.mutate('normal')}
                disabled={seedMutation.isPending}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
              >
                Normal Week
              </button>
              <button
                onClick={() => seedMutation.mutate('heavy')}
                disabled={seedMutation.isPending}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
              >
                Heavy Week
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Light/Normal/Heavy all include 3 weeks of observation sessions (exits cold start). Light: 3 events, 1 bill • Normal: 10 events, 3 bills, 1 conflict • Heavy: 25+ events, 6 bills (2 overdue), conflicts
            </p>

            {seedStatus && (
              <p className={`text-sm mt-2 ${seedStatus.includes('failed') ? 'text-red-400' : 'text-green-400'}`}>
                {seedStatus}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-2">
              Clears all existing data and generates new test data with the selected scenario.
            </p>
          </div>

          {/* Reset Data Section */}
          <div className="bg-slate-800 rounded-lg p-4 border border-red-500/30">
            <h3 className="text-sm font-medium text-red-400 mb-3">Danger Zone</h3>
            <p className="text-xs text-slate-400 mb-3">
              Permanently delete all data (events, meals, bills, recipes, observation sessions).
              The database schema will be recreated empty. This cannot be undone.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30
                       text-red-400 rounded-lg text-sm font-medium transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Reset All Data'}
            </button>
            {deleteMutation.isError && (
              <p className="text-sm text-red-400 mt-2">
                {deleteMutation.error instanceof Error ? deleteMutation.error.message : 'Delete failed'}
              </p>
            )}
            {deleteMutation.isSuccess && (
              <p className="text-sm text-green-400 mt-2">
                All data has been deleted. Database reset complete.
              </p>
            )}
          </div>
        </div>

        {/* Layer Sections - Collapsible */}
        <div id="debug-observe">
          <CollapsibleSection
            id="debug-observe"
            title="OBSERVE - Raw signal collection"
            defaultOpen={false}
          >
            <ObserveSection />
          </CollapsibleSection>
        </div>

        <div id="debug-infer">
          <CollapsibleSection
            id="debug-infer"
            title="INFER - Pattern detection & health scoring"
            defaultOpen={false}
          >
            <InferSection />
          </CollapsibleSection>
        </div>

        <div id="debug-decide">
          <CollapsibleSection
            id="debug-decide"
            title="DECIDE - Gate evaluation & surfacing decisions"
            defaultOpen={false}
          >
            <DecideSection />
          </CollapsibleSection>
        </div>

        <div id="debug-surface">
          <CollapsibleSection
            id="debug-surface"
            title="SURFACE - Mode-aware presentation"
            defaultOpen={false}
          >
            <SurfaceSection />
          </CollapsibleSection>
        </div>

        <div id="debug-adapt">
          <CollapsibleSection
            id="debug-adapt"
            title="ADAPT - Learning & personalization"
            defaultOpen={false}
          >
            <AdaptSection />
          </CollapsibleSection>
        </div>

        <div id="debug-crossfeature">
          <CollapsibleSection
            id="debug-crossfeature"
            title="🔗 CROSS-FEATURE - Multi-feature intelligence & Bayesian Surprise"
            defaultOpen={false}
          >
            <CrossFeatureSection />
          </CollapsibleSection>
        </div>

        <div id="debug-math">
          <CollapsibleSection
            id="debug-math"
            title="📐 MATH - Algorithm documentation & formulas"
            defaultOpen={false}
          >
            <MathSection />
          </CollapsibleSection>
        </div>

        <div id="debug-habits">
          <CollapsibleSection
            id="debug-habits"
            title="HABITS - Streak tracking & forgiveness"
            defaultOpen={false}
          >
            <HabitsSection />
          </CollapsibleSection>
        </div>

        <div id="debug-triggers">
          <CollapsibleSection
            id="debug-triggers"
            title="🎯 FORCE TRIGGERS - Test intelligence features"
            defaultOpen={false}
          >
            <ForceTriggersSection />
          </CollapsibleSection>
        </div>

        <div id="debug-feedback">
          <CollapsibleSection
            id="debug-feedback"
            title="FEEDBACK - Share your thoughts"
            defaultOpen={false}
          >
            <FeedbackForm />
          </CollapsibleSection>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete All Data?"
        message="This will permanently delete all events, meals, recipes, bills, and other data. The database schema will be recreated empty."
        confirmLabel="Delete All Data"
        confirmVariant="danger"
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setShowDeleteConfirm(false)}
        isLoading={deleteMutation.isPending}
        requiresTypedConfirmation="DELETE"
        warningNote="This action cannot be undone. Consider exporting a backup first."
      />
    </div>
  );
}
