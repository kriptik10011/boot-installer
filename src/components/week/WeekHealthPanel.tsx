/**
 * WeekHealthPanel Component
 *
 * Container for all "Needs Attention" tiles.
 * Follows UX principle: "One-Tap Repair" - actionable items with immediate options.
 *
 * Groups attention items by type:
 * - Overdue Bills (with individual Mark Paid actions)
 * - Schedule Conflicts (with reschedule options)
 * - Overloaded Days (high event count)
 *
 * Part of the UX compliance improvements.
 */

import { useState } from 'react';
import { NeedsAttentionCard } from './NeedsAttentionCard';
import { useMarkPaid } from '@/hooks/useFinances';
import { useToastStore } from '@/stores/toastStore';
import type { FinancialItem } from '@/types';
import type { DayData } from './types';

interface WeekHealthPanelProps {
  /** Overdue financial items */
  overdueItems: FinancialItem[];
  /** Days with schedule conflicts */
  conflictDays: DayData[];
  /** Days with high event count (overloaded) */
  overloadedDays: { date: string; count: number }[];
  /** Callback when a bill is clicked for details */
  onBillClick: (bill: FinancialItem) => void;
  /** Callback when a day is clicked */
  onDayClick: (date: string) => void;
  /** Whether bills module is enabled */
  billsEnabled: boolean;
  /** Whether events module is enabled */
  eventsEnabled: boolean;
}

export function WeekHealthPanel({
  overdueItems,
  conflictDays,
  overloadedDays,
  onBillClick,
  onDayClick,
  billsEnabled,
  eventsEnabled,
}: WeekHealthPanelProps) {
  const markPaid = useMarkPaid();
  const addToast = useToastStore((s) => s.addToast);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const totalOverdue = overdueItems.reduce((sum, b) => sum + b.amount, 0);
  const hasAnyIssues =
    (billsEnabled && overdueItems.length > 0) ||
    (eventsEnabled && conflictDays.length > 0) ||
    (eventsEnabled && overloadedDays.length > 0);

  // If no issues, show healthy status
  if (!hasAnyIssues) {
    return (
      <div className="px-4 py-3 bg-emerald-500/5 border-t border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-sm font-medium text-emerald-300">
            Week Health: Good
          </span>
          <span className="text-xs text-slate-400 ml-auto">All clear</span>
        </div>
      </div>
    );
  }

  const totalIssues =
    (billsEnabled ? overdueItems.length : 0) +
    (eventsEnabled ? conflictDays.length : 0) +
    (eventsEnabled ? overloadedDays.length : 0);

  return (
    <div className="border-t border-slate-700/50">
      {/* Header */}
      <button
        onClick={() => setExpandedSection(expandedSection ? null : 'all')}
        className="w-full flex items-center justify-between px-4 py-3 bg-amber-500/10 hover:bg-amber-500/15 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-sm font-medium text-amber-300">
            Week Health: Attention
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {totalIssues} item{totalIssues !== 1 ? 's' : ''}
          </span>
          <span className={`text-slate-500 transition-transform ${expandedSection ? 'rotate-180' : ''}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>
      </button>

      {/* Expanded content with attention tiles */}
      {expandedSection && (
        <div className="px-4 py-3 space-y-3 bg-slate-800/30">
          {/* OVERDUE BILLS TILE */}
          {billsEnabled && overdueItems.length > 0 && (
            <NeedsAttentionCard
              variant="overdue"
              title={`${overdueItems.length} Overdue Bill${overdueItems.length > 1 ? 's' : ''}`}
              rightValue={`$${totalOverdue.toFixed(0)}`}
              context={overdueItems.map(b => `${b.name} ($${b.amount})`).join(' • ')}
            >
              {/* Individual bill actions */}
              <div className="mt-3 pl-6 space-y-2">
                {overdueItems.map(bill => (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between bg-slate-800/50 rounded-lg p-2"
                  >
                    <button
                      onClick={() => onBillClick(bill)}
                      className="text-sm text-slate-300 hover:text-white transition-colors"
                    >
                      {bill.name}
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-400">${bill.amount.toFixed(0)}</span>
                      <button
                        onClick={() => markPaid.mutate(bill.id, {
                          onError: () => addToast({ message: `Failed to mark "${bill.name}" as paid`, type: 'error', durationMs: 4000 }),
                        })}
                        disabled={markPaid.isPending}
                        className="px-2 py-1 rounded text-xs font-medium
                                 bg-emerald-500/20 hover:bg-emerald-500/30
                                 text-emerald-400 border border-emerald-500/30
                                 transition-colors disabled:opacity-50"
                      >
                        {markPaid.isPending ? '...' : 'Mark Paid'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </NeedsAttentionCard>
          )}

          {/* SCHEDULE CONFLICTS TILE */}
          {eventsEnabled && conflictDays.length > 0 && (
            <NeedsAttentionCard
              variant="conflict"
              title={`${conflictDays.length} Schedule Conflict${conflictDays.length > 1 ? 's' : ''}`}
              context={conflictDays.map(d => {
                const date = new Date(d.date);
                return date.toLocaleDateString('en-US', { weekday: 'short' });
              }).join(', ')}
              actions={[
                {
                  label: 'Review Schedule',
                  variant: 'primary',
                  onClick: () => {
                    if (conflictDays[0]) onDayClick(conflictDays[0].date);
                  },
                },
              ]}
            >
              {/* Individual conflict days */}
              <div className="mt-2 pl-6 space-y-1">
                {conflictDays.map(day => {
                  const date = new Date(day.date);
                  const dayLabel = date.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  });
                  return (
                    <button
                      key={day.date}
                      onClick={() => onDayClick(day.date)}
                      className="w-full flex items-center justify-between bg-slate-800/50 rounded-lg p-2 hover:bg-slate-700/50 transition-colors"
                    >
                      <span className="text-sm text-slate-300">{dayLabel}</span>
                      <span className="text-xs text-yellow-400">
                        {day.events.length} events overlapping
                      </span>
                    </button>
                  );
                })}
              </div>
            </NeedsAttentionCard>
          )}

          {/* OVERLOADED DAYS TILE */}
          {eventsEnabled && overloadedDays.length > 0 && (
            <NeedsAttentionCard
              variant="overloaded"
              title={`${overloadedDays.length} Overloaded Day${overloadedDays.length > 1 ? 's' : ''}`}
              context={overloadedDays.map(d => {
                const date = new Date(d.date);
                return `${date.toLocaleDateString('en-US', { weekday: 'short' })} (${d.count})`;
              }).join(', ')}
              actions={[
                {
                  label: 'Review Schedule',
                  variant: 'secondary',
                  onClick: () => {
                    if (overloadedDays[0]) onDayClick(overloadedDays[0].date);
                  },
                },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default WeekHealthPanel;
