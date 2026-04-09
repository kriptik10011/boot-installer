/**
 * AlertsFeedCard — Full-width alerts feed sorted by urgency.
 * Bottom row in F-Pattern layout.
 */

import { RadialGlassCard } from './RadialGlassCard';

interface Alert {
  id: number;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
}

interface AlertsFeedCardProps {
  alerts: Alert[];
  runwayMonths: number;
  runwayTrend: 'up' | 'down' | 'stable';
  cardId?: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

const SEVERITY_CONFIG = {
  urgent: { color: '#d97706', label: 'Urgent', icon: '!' },
  warning: { color: '#f59e0b', label: 'Warning', icon: '\u26A0' },
  info: { color: '#3b82f6', label: 'Info', icon: 'i' },
};

export function AlertsFeedCard({
  alerts,
  runwayMonths,
  runwayTrend,
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: AlertsFeedCardProps) {
  const trendIcon = runwayTrend === 'up' ? '\u25B2' : runwayTrend === 'down' ? '\u25BC' : '\u25CF';
  const trendColor = runwayTrend === 'up' ? 'text-emerald-400' : runwayTrend === 'down' ? 'text-rose-400' : 'text-slate-400';
  const hasAnomaly = alerts.some((a) => a.severity === 'urgent');

  return (
    <RadialGlassCard
      accentColor="#22d3ee"
      colSpan={2}
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      hasAnomaly={hasAnomaly}
      onFocus={onFocus}
    >
      <div className="flex items-start justify-between mb-3">
        <h2 className="text-xs font-medium text-cyan-400/70 uppercase tracking-wider">Alerts & Runway</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Runway:</span>
          <span className="text-slate-200 font-medium">{runwayMonths.toFixed(1)} mo</span>
          <span className={trendColor}>{trendIcon}</span>
        </div>
      </div>
      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 text-emerald-400 py-2">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="10" cy="10" r="8" />
            <path d="M7 10l2 2 4-4" />
          </svg>
          <span className="text-sm">All clear — no active alerts</span>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const cfg = SEVERITY_CONFIG[alert.severity];
            return (
              <div
                key={alert.id}
                className="flex items-start gap-3 py-1.5"
                style={{ borderLeft: `2px solid ${cfg.color}`, paddingLeft: 10 }}
              >
                <span
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{ backgroundColor: `${cfg.color}26`, color: cfg.color }}
                >
                  {cfg.icon}
                </span>
                <span className="text-sm text-slate-300">{alert.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </RadialGlassCard>
  );
}
