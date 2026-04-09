/**
 * FinanceHelpers — Shared presentation components for Classic finance tabs.
 *
 * Extracted verbatim from FinancePanel.tsx L120-176 during V2.4 decomposition.
 */

export function StatCard({ label, value, sublabel, color = 'cyan' }: {
  label: string;
  value: string;
  sublabel?: string;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    cyan: 'text-cyan-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    slate: 'text-slate-300',
  };

  return (
    <div className="bg-slate-700/50 rounded-lg p-3">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-lg font-bold ${colorMap[color] || 'text-cyan-400'}`}>{value}</div>
      {sublabel && <div className="text-xs text-slate-500 mt-0.5">{sublabel}</div>}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{children}</h3>;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-8 text-slate-500 text-sm">{message}</div>
  );
}

export { fmtCurrencyRound as fmt } from '@/utils/currencyFormat';

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return '0%';
  return `${n.toFixed(1)}%`;
}

export function ProgressBar({ pct, color = 'cyan' }: { pct: number; color?: string }) {
  const colorMap: Record<string, string> = {
    cyan: 'bg-cyan-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };
  const barColor = pct > 100 ? 'bg-red-500' : (colorMap[color] || 'bg-cyan-500');
  return (
    <div className="w-full bg-slate-600 rounded-full h-1.5">
      <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}
