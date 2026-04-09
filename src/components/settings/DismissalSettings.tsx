/**
 * Dismissal Settings Component.
 *
 * Allows users to view and manage suppressed insight types.
 * Users can re-enable insights they've previously dismissed.
 */

import { useState, useEffect } from 'react';
import { EyeOff, RefreshCw, Trash2 } from 'lucide-react';
import {
  loadDismissals,
  clearDismissal,
  clearAllDismissals,
  type DismissalRecord,
} from '@/utils/surfacing';

// Human-readable labels for insight types
const INSIGHT_TYPE_LABELS: Record<string, string> = {
  bill_due_soon: 'Bill Due Soon',
  bill_overdue: 'Overdue Bill',
  bills_due: 'Bills Due This Week',
  spending_high: 'High Spending Alert',
  spending_low: 'Low Spending Alert',
  busy_day: 'Busy Day Warning',
  busy_week: 'Busy Week Warning',
  conflict: 'Schedule Conflict',
  conflicts: 'Schedule Conflicts',
  meal_gap: 'Meal Gap',
  planning_time: 'Planning Time',
  pattern_detected: 'Pattern Detected',
  day_health: 'Day Health',
  anomaly: 'Anomaly Detected',
  anomaly_flagged: 'Anomaly Flagged',
  insufficient_data: 'Learning Progress',
};

function getInsightLabel(type: string): string {
  return INSIGHT_TYPE_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

function getDecayInfo(record: DismissalRecord): string {
  const timeSinceDismissal = Date.now() - new Date(record.lastDismissed).getTime();
  const decayPeriod = record.permanent ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const remainingMs = decayPeriod - timeSinceDismissal;

  if (remainingMs <= 0) return 'Will return soon';

  const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (remainingHours >= 24) {
    const days = Math.ceil(remainingHours / 24);
    return `Returns in ${days} day${days > 1 ? 's' : ''}`;
  }
  return `Returns in ${remainingHours} hour${remainingHours > 1 ? 's' : ''}`;
}

interface DismissedItemProps {
  record: DismissalRecord;
  onReEnable: () => void;
}

function DismissedItem({ record, onReEnable }: DismissedItemProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-200">
            {getInsightLabel(record.insightType)}
          </span>
          {record.permanent && (
            <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded">
              30-day
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-slate-500">
            Dismissed {record.count}x
          </span>
          <span className="text-xs text-slate-500">•</span>
          <span className="text-xs text-slate-500">
            {formatTimeAgo(record.lastDismissed)}
          </span>
          <span className="text-xs text-slate-500">•</span>
          <span className="text-xs text-cyan-400">
            {getDecayInfo(record)}
          </span>
        </div>
      </div>
      <button
        onClick={onReEnable}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg transition-colors"
        title="Re-enable this insight type"
      >
        <RefreshCw className="w-3 h-3" />
        Re-enable
      </button>
    </div>
  );
}

export function DismissalSettings() {
  const [dismissals, setDismissals] = useState<DismissalRecord[]>([]);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // Load dismissals on mount
  useEffect(() => {
    setDismissals(loadDismissals());
  }, []);

  // Handle re-enabling a specific insight type
  const handleReEnable = (insightType: string) => {
    const updated = clearDismissal(insightType);
    setDismissals(updated);
  };

  // Handle clearing all dismissals
  const handleClearAll = () => {
    clearAllDismissals();
    setDismissals([]);
    setShowConfirmClear(false);
  };

  // Filter to only active dismissals (those that haven't decayed)
  const activeDismissals = dismissals.filter(d => {
    const timeSinceDismissal = Date.now() - new Date(d.lastDismissed).getTime();
    const decayPeriod = d.permanent ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    return timeSinceDismissal < decayPeriod;
  });

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <EyeOff className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-100">Dismissed Insights</h2>
        </div>
        {activeDismissals.length > 0 && (
          <span className="px-2 py-1 text-xs bg-slate-700 text-slate-400 rounded">
            {activeDismissals.length} suppressed
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-slate-400 mb-6">
        When you dismiss insights, they won't appear again for a while.
        Regular dismissals return after 1 day, "don't show again" dismissals return after 30 days.
        You can re-enable them early here.
      </p>

      {/* Dismissal List */}
      {activeDismissals.length > 0 ? (
        <div className="space-y-2">
          {activeDismissals.map(record => (
            <DismissedItem
              key={record.insightType}
              record={record}
              onReEnable={() => handleReEnable(record.insightType)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <EyeOff className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No dismissed insights</p>
          <p className="text-xs text-slate-600 mt-1">
            Insights you dismiss will appear here
          </p>
        </div>
      )}

      {/* Clear All Button */}
      {activeDismissals.length > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-700/50">
          {showConfirmClear ? (
            <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <span className="text-sm text-amber-400">
                Re-enable all dismissed insights?
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirmClear(false)}
                  className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearAll}
                  className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium rounded-lg transition-colors"
                >
                  Yes, Re-enable All
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirmClear(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-slate-300 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear all dismissals
            </button>
          )}
        </div>
      )}
    </div>
  );
}
