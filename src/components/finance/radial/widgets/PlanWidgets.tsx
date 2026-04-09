/**
 * Plan Arc (South — Purple) Widgets:
 * 1. Goal Rings — Savings goal progress (Apple Watch style)
 * 2. Runway — Months of living expenses if income stopped
 * 3. Budget Cap — Monthly allowance remaining
 */

interface GoalRing {
  name: string;
  progress: number; // 0-1
  color: string;
}

interface GoalRingsProps {
  goals: GoalRing[];
}

export function GoalRingsWidget({ goals }: GoalRingsProps) {
  const displayGoals = goals.slice(0, 3);
  const radii = [48, 38, 28]; // outermost to innermost

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0" style={{ width: 110, height: 110 }}>
        <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
          {displayGoals.map((goal, i) => {
            const r = radii[i];
            const circumference = 2 * Math.PI * r;
            const filled = goal.progress * circumference;
            return (
              <g key={goal.name}>
                <circle
                  cx="55" cy="55" r={r}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
                <circle
                  cx="55" cy="55" r={r}
                  fill="none"
                  stroke={goal.color}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - filled}
                  style={{ transition: 'stroke-dashoffset 1s ease-out' }}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <h3 className="text-xs font-medium text-violet-400/70 uppercase tracking-wider mb-1">Goals</h3>
        {displayGoals.map((goal, i) => (
          <div key={goal.name} className="flex items-center gap-2 text-xs">
            <span style={{ color: goal.color }}>{'\u25CF'}</span>
            <span className="text-slate-300 truncate">{goal.name}</span>
            <span className="text-slate-500 ml-auto">{Math.round(goal.progress * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RunwayProps {
  months: number;
  trend: 'up' | 'down' | 'stable';
}

export function RunwayWidget({ months, trend }: RunwayProps) {
  const trendIcon = trend === 'up' ? '\u25B2' : trend === 'down' ? '\u25BC' : '\u25CF';
  const trendColor = trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-rose-400' : 'text-slate-400';

  return (
    <div>
      <h3 className="text-xs font-medium text-violet-400/70 uppercase tracking-wider mb-3">Financial Runway</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-slate-100" style={{ fontFamily: "'Space Grotesk', system-ui" }}>
          {months.toFixed(1)}
        </span>
        <span className="text-lg text-slate-400">months</span>
      </div>
      <p className="text-sm text-slate-500 mt-1">
        <span className={trendColor}>{trendIcon}</span>{' '}
        {trend === 'up' ? 'Growing' : trend === 'down' ? 'Declining' : 'Stable'}
        {' '}if income stopped today
      </p>
    </div>
  );
}

interface BudgetCapProps {
  spent: number;
  budget: number;
}

export function BudgetCapWidget({ spent, budget }: BudgetCapProps) {
  const remaining = Math.max(0, budget - spent);
  const percentUsed = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const barColor = percentUsed > 90 ? '#d97706' : percentUsed > 70 ? '#f59e0b' : '#a78bfa';

  return (
    <div>
      <h3 className="text-xs font-medium text-violet-400/70 uppercase tracking-wider mb-3">Budget Cap</h3>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-slate-400">Spent</span>
        <span className="text-slate-300 font-medium">${spent.toLocaleString()} / ${budget.toLocaleString()}</span>
      </div>
      <div className="h-4 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${percentUsed}%`,
            backgroundColor: barColor,
            transition: 'width 0.5s ease-out',
          }}
        />
      </div>
      <p className="text-sm text-slate-400 mt-2">
        <span className="text-slate-200 font-medium">${remaining.toLocaleString()}</span> remaining
      </p>
    </div>
  );
}
