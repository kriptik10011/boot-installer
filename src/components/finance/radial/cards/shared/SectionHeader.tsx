/**
 * SectionHeader — Reusable section header for sub-arc cards.
 * Icon + label + optional count badge.
 */

import type { ReactNode } from 'react';

interface SectionHeaderProps {
  icon?: ReactNode;
  label: string;
  count?: number;
  color?: string;
}

export function SectionHeader({ icon, label, count, color = '#94a3b8' }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      {icon && (
        <span className="w-3 h-3 flex items-center justify-center" style={{ color }}>
          {icon}
        </span>
      )}
      <span className="text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
      {count !== undefined && (
        <span
          className="text-[9px] font-mono px-1.5 py-0 rounded-full"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {count}
        </span>
      )}
    </div>
  );
}
