/**
 * KpiRibbon — Reusable horizontal metric ribbon for finance sub-arc cards.
 * Displays 4-6 KPIs in a responsive flex row.
 * Optional onClick per metric for drill-down navigation (C1-013).
 */

interface KpiMetric {
  label: string;
  value: string;
  delta?: string;
  color?: string;
  onClick?: () => void;
}

interface KpiRibbonProps {
  metrics: KpiMetric[];
}

export function KpiRibbon({ metrics }: KpiRibbonProps) {
  return (
    <div className="flex flex-wrap gap-2 px-1 py-2">
      {metrics.map((m) => {
        const accentColor = m.color ?? '#e2e8f0';
        const Tag = m.onClick ? 'button' : 'div';
        return (
          <Tag
            key={m.label}
            className={`flex flex-col min-w-0 text-left px-2.5 py-1.5 rounded-lg bg-slate-800/40 border-l-2 ${m.onClick ? 'cursor-pointer hover:bg-slate-700/40 transition-colors' : ''}`}
            style={{ borderLeftColor: accentColor }}
            onClick={m.onClick}
          >
            <span className="text-[9px] uppercase tracking-wider text-slate-500 truncate">
              {m.label}
            </span>
            <div className="flex items-center gap-1">
              <span
                className="text-base font-bold tabular-nums truncate"
                style={{ color: accentColor }}
              >
                {m.value}
              </span>
              {m.delta && (
                <DeltaArrow delta={m.delta} />
              )}
            </div>
          </Tag>
        );
      })}
    </div>
  );
}

function DeltaArrow({ delta }: { delta: string }) {
  const isUp = delta.startsWith('+');
  const isDown = delta.startsWith('-');
  const color = isUp ? '#4ade80' : isDown ? '#d97706' : '#94a3b8';

  return (
    <span className="flex items-center gap-0.5 text-[9px] tabular-nums" style={{ color }}>
      {(isUp || isDown) && (
        <svg className="w-2 h-2" viewBox="0 0 8 8" fill={color}>
          {isUp ? (
            <polygon points="4,1 7,6 1,6" />
          ) : (
            <polygon points="4,7 7,2 1,2" />
          )}
        </svg>
      )}
      {delta}
    </span>
  );
}
