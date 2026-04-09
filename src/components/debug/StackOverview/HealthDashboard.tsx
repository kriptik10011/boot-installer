/**
 * HealthDashboard Component
 *
 * Shows overall health metrics for the intelligence system.
 * Includes (?) help tooltips to explain each metric.
 */

import { ProgressBar, StatusIndicator, HelpTooltip } from '../shared';

interface HealthDashboardProps {
  dataQuality: number; // 0-100
  patternConfidence: number; // 0-100
  surfacingAccuracy: number; // 0-100
  adaptationActive: number; // 0-100
  antiPatterns: string[];
  lastEventTime: string | null;
  isLoading?: boolean;
  onRefresh?: () => void;
}

/**
 * Help text for each metric explaining what it measures,
 * how to interpret it, and what "good" looks like.
 */
const METRIC_HELP = {
  dataQuality: 'How much observation data exists. Higher = more patterns can be detected. Above 50% means the system has enough data to start making predictions.',
  patternConfidence: 'How confident the system is in detected patterns. Above 50% = ready for insights. Below 50% = still learning your habits.',
  surfacingAccuracy: 'How often surfaced insights are accepted vs dismissed. Higher = insights are more relevant to you.',
  adaptationActive: 'Whether the system is learning from your dismissals. 100% = fully adapting to your preferences.',
  antiPatterns: 'Issues that may reduce intelligence quality. Examples: stale data, conflicting patterns, missing observations.',
  privacy: 'All data stays on your device. Nothing is sent to servers.',
  lastEvent: 'Time since the last observation event was recorded. Events track app usage for pattern detection.',
};

export function HealthDashboard({
  dataQuality,
  patternConfidence,
  surfacingAccuracy,
  adaptationActive,
  antiPatterns,
  lastEventTime,
  isLoading,
  onRefresh,
}: HealthDashboardProps) {
  const getStatus = (value: number): 'healthy' | 'warning' | 'error' => {
    if (value >= 80) return 'healthy';
    if (value >= 50) return 'warning';
    return 'error';
  };

  const formatLastEvent = (time: string | null): string => {
    if (!time) return 'No events';
    const diff = Date.now() - new Date(time + 'Z').getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds} sec ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  };

  const lastEventStatus = (): 'healthy' | 'warning' | 'error' => {
    if (!lastEventTime) return 'error';
    const diff = Date.now() - new Date(lastEventTime + 'Z').getTime();
    const minutes = diff / (1000 * 60);
    if (minutes < 5) return 'healthy';
    if (minutes < 30) return 'warning';
    return 'error';
  };

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300">INTELLIGENCE HEALTH</h3>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Metrics */}
      <div className="p-4 space-y-3">
        {/* Data Quality with help tooltip */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <ProgressBar
              label="Data Quality"
              value={dataQuality}
              status={getStatus(dataQuality)}
            />
          </div>
          <HelpTooltip text={METRIC_HELP.dataQuality} position="left" />
        </div>

        {/* Pattern Confidence with help tooltip */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <ProgressBar
              label="Pattern Confidence"
              value={patternConfidence}
              status={getStatus(patternConfidence)}
            />
          </div>
          <HelpTooltip text={METRIC_HELP.patternConfidence} position="left" />
        </div>

        {/* Surfacing Accuracy with help tooltip */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <ProgressBar
              label="Surfacing Accuracy"
              value={surfacingAccuracy}
              status={getStatus(surfacingAccuracy)}
            />
          </div>
          <HelpTooltip text={METRIC_HELP.surfacingAccuracy} position="left" />
        </div>

        {/* Adaptation Active with help tooltip */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <ProgressBar
              label="Adaptation Active"
              value={adaptationActive}
              status={getStatus(adaptationActive)}
            />
          </div>
          <HelpTooltip text={METRIC_HELP.adaptationActive} position="left" />
        </div>

        {/* Anti-patterns with help tooltip */}
        <div className="flex items-center justify-between py-2">
          <span className="flex items-center gap-2 text-sm text-slate-400">
            Anti-Patterns
            <HelpTooltip text={METRIC_HELP.antiPatterns} position="right" />
          </span>
          <StatusIndicator
            status={antiPatterns.length === 0 ? 'healthy' : 'warning'}
            label={antiPatterns.length === 0 ? 'None detected' : `${antiPatterns.length} found`}
          />
        </div>

        {/* Privacy Traffic Light */}
        <div className="flex items-center justify-between py-2">
          <span className="flex items-center gap-2 text-sm text-slate-400">
            Privacy Traffic Light
            <HelpTooltip text={METRIC_HELP.privacy} position="right" />
          </span>
          <div className="flex items-center gap-2">
            {/* Traffic Light Visual */}
            <div className="flex gap-1">
              <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              <div className="w-3 h-3 rounded-full bg-slate-600" />
              <div className="w-3 h-3 rounded-full bg-slate-600" />
            </div>
            <span className="text-xs text-emerald-400 font-medium">LOCAL ONLY</span>
          </div>
        </div>

        {/* Last Event with help tooltip */}
        <div className="flex items-center justify-between py-2">
          <span className="flex items-center gap-2 text-sm text-slate-400">
            Last Event
            <HelpTooltip text={METRIC_HELP.lastEvent} position="right" />
          </span>
          <StatusIndicator
            status={lastEventStatus()}
            label={formatLastEvent(lastEventTime)}
          />
        </div>
      </div>
    </div>
  );
}
