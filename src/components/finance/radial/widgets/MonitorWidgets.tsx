/**
 * Monitor Arc (North — Cyan) Widgets:
 * 1. Life Battery — Health score 0-100% with narrative
 * 2. Net Worth — Big bold number with month-over-month delta
 * 3. Alerts — Active issues only
 */

interface LifeBatteryProps {
  healthScore: number;
  narrative: string;
}

export function LifeBatteryWidget({ healthScore, narrative }: LifeBatteryProps) {
  const circumference = 2 * Math.PI * 52; // radius 52
  const filled = (healthScore / 100) * circumference;
  const scoreColor = healthScore > 75 ? '#22d3ee' : healthScore > 50 ? '#3b82f6' : healthScore > 25 ? '#f59e0b' : '#d97706';

  return (
    <div className="flex items-center gap-5">
      <div className="relative flex-shrink-0" style={{ width: 120, height: 120 }}>
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          {/* Track */}
          <circle
            cx="60" cy="60" r="52"
            fill="none"
            stroke="#1e293b"
            strokeWidth="8"
          />
          {/* Fill */}
          <circle
            cx="60" cy="60" r="52"
            fill="none"
            stroke={scoreColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - filled}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-slate-100" style={{ fontFamily: "'Space Grotesk', system-ui" }}>
            {healthScore}%
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-xs font-medium text-cyan-400/70 uppercase tracking-wider mb-1">Life Battery</h3>
        <p className="text-sm text-slate-300 leading-relaxed">{narrative}</p>
      </div>
    </div>
  );
}

interface NetWorthProps {
  amount: number;
  deltaPercent: number;
}

export function NetWorthWidget({ amount, deltaPercent }: NetWorthProps) {
  const isPositive = deltaPercent >= 0;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

  return (
    <div>
      <h3 className="text-xs font-medium text-cyan-400/70 uppercase tracking-wider mb-2">Net Worth</h3>
      <p className="text-4xl font-bold text-slate-100 mb-2" style={{ fontFamily: "'Space Grotesk', system-ui" }}>
        {formatted}
      </p>
      <div className="flex items-center gap-1.5">
        <span className={`text-sm font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isPositive ? '\u25B2' : '\u25BC'} {Math.abs(deltaPercent).toFixed(1)}%
        </span>
        <span className="text-xs text-slate-500">vs last month</span>
      </div>
    </div>
  );
}

interface Alert {
  id: number;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
}

interface AlertsProps {
  alerts: Alert[];
}

export function AlertsWidget({ alerts }: AlertsProps) {
  if (alerts.length === 0) {
    return (
      <div>
        <h3 className="text-xs font-medium text-cyan-400/70 uppercase tracking-wider mb-3">Alerts</h3>
        <div className="flex items-center gap-2 text-emerald-400">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="10" cy="10" r="8" />
            <path d="M7 10l2 2 4-4" />
          </svg>
          <span className="text-sm">All Clear</span>
        </div>
      </div>
    );
  }

  const severityColor = { info: '#3b82f6', warning: '#f59e0b', urgent: '#d97706' };

  return (
    <div>
      <h3 className="text-xs font-medium text-cyan-400/70 uppercase tracking-wider mb-2">Alerts</h3>
      <div className="space-y-2">
        {alerts.slice(0, 3).map((alert) => (
          <div
            key={alert.id}
            className="flex items-start gap-2 text-sm text-slate-300"
            style={{ borderLeft: `2px solid ${severityColor[alert.severity]}`, paddingLeft: 8 }}
          >
            {alert.message}
          </div>
        ))}
      </div>
    </div>
  );
}
