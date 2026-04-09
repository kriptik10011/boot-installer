/**
 * DebugCard Component
 *
 * Styled card for displaying debug information.
 */

import { ReactNode } from 'react';

interface DebugCardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export function DebugCard({ title, children, className = '', variant = 'default' }: DebugCardProps) {
  const variantStyles = {
    default: 'bg-slate-800',
    success: 'bg-slate-800 border-l-2 border-emerald-500',
    warning: 'bg-slate-800 border-l-2 border-amber-500',
    error: 'bg-slate-800 border-l-2 border-red-500',
  };

  return (
    <div className={`${variantStyles[variant]} p-3 rounded ${className}`}>
      {title && (
        <h4 className="text-sm font-medium text-slate-300 mb-2">{title}</h4>
      )}
      {children}
    </div>
  );
}

interface DebugStatProps {
  label: string;
  value: string | number;
  subtext?: string;
  status?: 'healthy' | 'warning' | 'error' | 'neutral';
}

export function DebugStat({ label, value, subtext, status = 'neutral' }: DebugStatProps) {
  const statusColors = {
    healthy: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    neutral: 'text-cyan-400',
  };

  return (
    <div>
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold font-mono ${statusColors[status]}`}>{value}</div>
      {subtext && <div className="text-xs text-slate-500">{subtext}</div>}
    </div>
  );
}

interface DebugTableProps {
  headers: string[];
  rows: (string | number | ReactNode)[][];
  className?: string;
}

export function DebugTable({ headers, rows, className = '' }: DebugTableProps) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700">
            {headers.map((header, i) => (
              <th key={i} className="text-left py-2 px-2 text-slate-400 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-2 text-slate-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface StatusIndicatorProps {
  status: 'healthy' | 'warning' | 'error' | 'inactive';
  label?: string;
}

export function StatusIndicator({ status, label }: StatusIndicatorProps) {
  const configs = {
    healthy: { color: 'bg-emerald-500', icon: '✓', text: 'text-emerald-400' },
    warning: { color: 'bg-amber-500', icon: '!', text: 'text-amber-400' },
    error: { color: 'bg-red-500', icon: '✕', text: 'text-red-400' },
    inactive: { color: 'bg-slate-600', icon: '○', text: 'text-slate-500' },
  };

  const config = configs[status];

  return (
    <span className={`inline-flex items-center gap-1 ${config.text}`}>
      <span className={`w-2 h-2 rounded-full ${config.color}`} />
      {label && <span className="text-xs">{label}</span>}
    </span>
  );
}

interface ProgressBarProps {
  value: number; // 0-100
  label?: string;
  status?: 'healthy' | 'warning' | 'error' | 'neutral';
}

export function ProgressBar({ value, label, status = 'neutral' }: ProgressBarProps) {
  const statusColors = {
    healthy: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    neutral: 'bg-cyan-500',
  };

  return (
    <div className="flex items-center gap-3">
      {label && <span className="text-sm text-slate-400 w-32 shrink-0">{label}</span>}
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${statusColors[status]} transition-all`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="text-sm font-mono text-slate-400 w-12 text-right">{value}%</span>
    </div>
  );
}
