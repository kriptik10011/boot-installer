/**
 * PipelineVisualizer Component
 *
 * Shows the 5-stage intelligence pipeline: OBSERVE → INFER → DECIDE → SURFACE → ADAPT
 * with counts and status indicators for each stage.
 */

import { useMemo } from 'react';

interface PipelineStage {
  id: string;
  label: string;
  count: number;
  status: 'healthy' | 'warning' | 'error';
  description: string;
}

interface PipelineVisualizerProps {
  observeCount: number;
  inferCount: number;
  decideCount: number;
  surfaceCount: number;
  adaptCount: number;
  observeStatus?: 'healthy' | 'warning' | 'error';
  inferStatus?: 'healthy' | 'warning' | 'error';
  decideStatus?: 'healthy' | 'warning' | 'error';
  surfaceStatus?: 'healthy' | 'warning' | 'error';
  adaptStatus?: 'healthy' | 'warning' | 'error';
  onStageClick?: (stageId: string) => void;
}

export function PipelineVisualizer({
  observeCount,
  inferCount,
  decideCount,
  surfaceCount,
  adaptCount,
  observeStatus = 'healthy',
  inferStatus = 'healthy',
  decideStatus = 'healthy',
  surfaceStatus = 'healthy',
  adaptStatus = 'healthy',
  onStageClick,
}: PipelineVisualizerProps) {
  const stages: PipelineStage[] = useMemo(() => [
    { id: 'observe', label: 'OBSERVE', count: observeCount, status: observeStatus, description: 'events' },
    { id: 'infer', label: 'INFER', count: inferCount, status: inferStatus, description: 'patterns' },
    { id: 'decide', label: 'DECIDE', count: decideCount, status: decideStatus, description: 'pass' },
    { id: 'surface', label: 'SURFACE', count: surfaceCount, status: surfaceStatus, description: 'shown' },
    { id: 'adapt', label: 'ADAPT', count: adaptCount, status: adaptStatus, description: 'dismissed' },
  ], [observeCount, inferCount, decideCount, surfaceCount, adaptCount,
      observeStatus, inferStatus, decideStatus, surfaceStatus, adaptStatus]);

  const statusIcons = {
    healthy: '✓',
    warning: '!',
    error: '✕',
  };

  const statusColors = {
    healthy: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    warning: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    error: 'text-red-400 bg-red-500/10 border-red-500/30',
  };

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
      <div className="flex items-center justify-between gap-2 overflow-x-auto">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex items-center">
            {/* Stage box */}
            <button
              onClick={() => onStageClick?.(stage.id)}
              className={`
                flex flex-col items-center px-4 py-2 rounded-lg border transition-all
                hover:scale-105 cursor-pointer
                ${statusColors[stage.status]}
              `}
            >
              <div className="text-xs font-bold tracking-wider">{stage.label}</div>
              <div className="text-lg font-mono font-bold">{stage.count}</div>
              <div className="text-xs opacity-70">{stage.description}</div>
              <div className="text-sm mt-1">{statusIcons[stage.status]}</div>
            </button>

            {/* Arrow between stages */}
            {index < stages.length - 1 && (
              <div className="px-2 text-slate-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="text-emerald-400">✓</span> Healthy
        </span>
        <span className="flex items-center gap-1">
          <span className="text-amber-400">!</span> Warning
        </span>
        <span className="flex items-center gap-1">
          <span className="text-red-400">✕</span> Error
        </span>
        {onStageClick && (
          <>
            <span className="text-slate-600">|</span>
            <span>Click stage to jump to section</span>
          </>
        )}
      </div>
    </div>
  );
}
