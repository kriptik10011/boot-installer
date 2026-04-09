/**
 * Analyze Arc (East — Blue) Widgets:
 * 1. Monthly Delta — Spend comparison vs last month
 * 2. Category Heatmap — Where money went (proportional bubbles)
 * 3. Recurring Stack — Total monthly fixed costs
 */

interface MonthlyDeltaProps {
  thisMonth: number;
  lastMonth: number;
}

export function MonthlyDeltaWidget({ thisMonth, lastMonth }: MonthlyDeltaProps) {
  const maxVal = Math.max(thisMonth, lastMonth, 1);
  const delta = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;
  const isLess = delta < 0;

  return (
    <div>
      <h3 className="text-xs font-medium text-blue-400/70 uppercase tracking-wider mb-3">Monthly Delta</h3>
      <div className="space-y-2.5">
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>This month</span>
            <span>${thisMonth.toLocaleString()}</span>
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${(thisMonth / maxVal) * 100}%`, transition: 'width 0.5s ease-out' }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Last month</span>
            <span>${lastMonth.toLocaleString()}</span>
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-slate-500"
              style={{ width: `${(lastMonth / maxVal) * 100}%`, transition: 'width 0.5s ease-out' }}
            />
          </div>
        </div>
      </div>
      <p className={`text-sm mt-2 ${isLess ? 'text-emerald-400' : 'text-rose-400'}`}>
        {isLess ? 'Spent' : 'Spent'} {Math.abs(delta).toFixed(0)}% {isLess ? 'less' : 'more'} than last month
      </p>
    </div>
  );
}

interface CategoryBubble {
  name: string;
  amount: number;
  color: string;
}

interface CategoryHeatmapProps {
  categories: CategoryBubble[];
}

export function CategoryHeatmapWidget({ categories }: CategoryHeatmapProps) {
  const maxAmount = Math.max(...categories.map((c) => c.amount), 1);

  return (
    <div>
      <h3 className="text-xs font-medium text-blue-400/70 uppercase tracking-wider mb-3">Spending Categories</h3>
      <div className="flex flex-wrap gap-2 justify-center">
        {categories.slice(0, 6).map((cat) => {
          const size = 28 + (cat.amount / maxAmount) * 32; // 28-60px
          return (
            <div
              key={cat.name}
              className="rounded-full flex items-center justify-center text-xs font-medium"
              style={{
                width: size,
                height: size,
                backgroundColor: `${cat.color}33`,
                color: cat.color,
                border: `1px solid ${cat.color}4D`,
              }}
              title={`${cat.name}: $${cat.amount.toLocaleString()}`}
            >
              {size > 40 ? cat.name.slice(0, 4) : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RecurringStackProps {
  subscriptions: number;
  rent: number;
  utilities: number;
}

export function RecurringStackWidget({ subscriptions, rent, utilities }: RecurringStackProps) {
  const total = subscriptions + rent + utilities;
  const segments = [
    { label: 'Rent', amount: rent, color: '#3b82f6' },
    { label: 'Utils', amount: utilities, color: '#60a5fa' },
    { label: 'Subs', amount: subscriptions, color: '#93c5fd' },
  ];

  return (
    <div>
      <div className="flex justify-between items-baseline mb-3">
        <h3 className="text-xs font-medium text-blue-400/70 uppercase tracking-wider">Fixed Costs</h3>
        <span className="text-lg font-bold text-slate-100" style={{ fontFamily: "'Space Grotesk', system-ui" }}>
          ${total.toLocaleString()}
        </span>
      </div>
      <div className="h-4 bg-slate-700 rounded-full overflow-hidden flex">
        {segments.map((seg) => (
          <div
            key={seg.label}
            style={{
              width: `${total > 0 ? (seg.amount / total) * 100 : 0}%`,
              backgroundColor: seg.color,
              transition: 'width 0.5s ease-out',
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2">
        {segments.map((seg) => (
          <span key={seg.label} className="text-xs text-slate-500">
            <span style={{ color: seg.color }}>{'\u25CF'}</span> {seg.label}
          </span>
        ))}
      </div>
    </div>
  );
}
