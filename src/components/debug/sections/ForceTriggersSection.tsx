/**
 * ForceTriggersSection Component
 *
 * Debug section for manually triggering intelligence features.
 * Allows developers to test each insight type, reset dismissals,
 * and simulate various system states.
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  clearAllDismissals,
  clearAllAcceptances,
  recordDismissal,
} from '@/utils/surfacing';
import { DebugCard } from '../shared';

type TriggerStatus = 'idle' | 'triggering' | 'success' | 'error';

interface TriggerResult {
  status: TriggerStatus;
  message?: string;
}

export function ForceTriggersSection() {
  const queryClient = useQueryClient();
  const [results, setResults] = useState<Record<string, TriggerResult>>({});
  const [coldStartMode, setColdStartMode] = useState(false);

  const updateResult = (key: string, result: TriggerResult) => {
    setResults(prev => ({ ...prev, [key]: result }));
    // Clear after 5 seconds
    setTimeout(() => {
      setResults(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 5000);
  };

  const triggerInsight = useCallback(async (type: string) => {
    updateResult(type, { status: 'triggering' });

    try {
      // Simulate insight generation by invalidating queries
      await queryClient.invalidateQueries({ queryKey: ['patterns'] });
      await queryClient.invalidateQueries({ queryKey: ['insights'] });

      // For specific insight types, we can simulate triggering
      switch (type) {
        case 'busy_week_meals':
          // This insight triggers when 2+ overloaded days AND 3+ unplanned meals
          updateResult(type, {
            status: 'success',
            message: 'Check INFER section for pattern detection'
          });
          break;
        case 'spending_anomaly':
          // This uses Bayesian Surprise
          updateResult(type, {
            status: 'success',
            message: 'Check Cross-Feature section for Bayesian analysis'
          });
          break;
        case 'overdue_bill':
          updateResult(type, {
            status: 'success',
            message: 'Requires overdue bills in data - seed Heavy Week'
          });
          break;
        case 'meal_planning':
          updateResult(type, {
            status: 'success',
            message: 'Check for unplanned meals in current week'
          });
          break;
        default:
          updateResult(type, { status: 'success', message: 'Queries invalidated' });
      }
    } catch (err) {
      updateResult(type, {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed'
      });
    }
  }, [queryClient]);

  const handleResetDismissals = useCallback(() => {
    updateResult('reset_dismissals', { status: 'triggering' });
    try {
      clearAllDismissals();
      clearAllAcceptances();
      queryClient.invalidateQueries({ queryKey: ['patterns'] });
      updateResult('reset_dismissals', {
        status: 'success',
        message: 'All dismissals cleared'
      });
    } catch (err) {
      updateResult('reset_dismissals', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed'
      });
    }
  }, [queryClient]);

  const handleForceColdStart = useCallback(() => {
    updateResult('cold_start', { status: 'triggering' });
    try {
      // Toggle cold start mode by clearing observation data
      localStorage.setItem('debug-force-cold-start', String(!coldStartMode));
      setColdStartMode(!coldStartMode);
      queryClient.invalidateQueries({ queryKey: ['observation'] });
      queryClient.invalidateQueries({ queryKey: ['patterns'] });
      updateResult('cold_start', {
        status: 'success',
        message: !coldStartMode ? 'Cold start mode enabled' : 'Cold start mode disabled'
      });
    } catch (err) {
      updateResult('cold_start', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed'
      });
    }
  }, [coldStartMode, queryClient]);

  const handleSimulateDrift = useCallback(() => {
    updateResult('drift', { status: 'triggering' });
    try {
      // Mark that a drift event should be simulated
      localStorage.setItem('debug-simulate-drift', String(Date.now()));
      queryClient.invalidateQueries({ queryKey: ['observation'] });
      updateResult('drift', {
        status: 'success',
        message: 'Drift event marker set - check ADWIN section'
      });
    } catch (err) {
      updateResult('drift', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed'
      });
    }
  }, [queryClient]);

  const getButtonClass = (key: string) => {
    const result = results[key];
    if (result?.status === 'triggering') return 'bg-amber-600 cursor-wait';
    if (result?.status === 'success') return 'bg-emerald-600';
    if (result?.status === 'error') return 'bg-red-600';
    return 'bg-slate-700 hover:bg-slate-600';
  };

  const insightTypes = [
    { id: 'busy_week_meals', label: 'Busy Week + Meals', description: '2+ overloaded days, 3+ unplanned meals' },
    { id: 'spending_anomaly', label: 'Spending Anomaly', description: 'Bayesian Surprise z > 2.0' },
    { id: 'overdue_bill', label: 'Overdue Bill', description: 'Bills past due date' },
    { id: 'meal_planning', label: 'Meal Planning', description: 'Unplanned meals detected' },
    { id: 'event_conflict', label: 'Event Conflict', description: 'Overlapping events' },
    { id: 'light_week', label: 'Light Week', description: '4+ light days, opportunity insight' },
  ];

  return (
    <div className="space-y-4">
      <DebugCard title="Force Trigger Insight Types">
        <p className="text-sm text-slate-400 mb-4">
          Manually trigger insight generation for testing. These actions invalidate
          relevant queries and check if conditions are met.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {insightTypes.map(insight => (
            <button
              key={insight.id}
              onClick={() => triggerInsight(insight.id)}
              disabled={results[insight.id]?.status === 'triggering'}
              className={`
                px-3 py-2 rounded text-sm font-medium transition-colors text-left
                ${getButtonClass(insight.id)}
              `}
            >
              <div className="text-white">{insight.label}</div>
              <div className="text-xs text-slate-400">{insight.description}</div>
              {results[insight.id]?.message && (
                <div className={`text-xs mt-1 ${
                  results[insight.id]?.status === 'success' ? 'text-emerald-300' : 'text-red-300'
                }`}>
                  {results[insight.id]?.message}
                </div>
              )}
            </button>
          ))}
        </div>
      </DebugCard>

      <DebugCard title="System State Controls">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-300">Reset Dismissal History</div>
              <div className="text-xs text-slate-500">Clear all dismissals and acceptances</div>
            </div>
            <button
              onClick={handleResetDismissals}
              disabled={results['reset_dismissals']?.status === 'triggering'}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${getButtonClass('reset_dismissals')}`}
            >
              {results['reset_dismissals']?.status === 'triggering' ? 'Resetting...' : 'Reset'}
            </button>
          </div>
          {results['reset_dismissals']?.message && (
            <div className={`text-xs ${
              results['reset_dismissals']?.status === 'success' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {results['reset_dismissals']?.message}
            </div>
          )}

          <div className="border-t border-slate-700 pt-3 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-300">Force Cold Start Mode</div>
              <div className="text-xs text-slate-500">
                Simulate first-time user experience (no patterns)
              </div>
            </div>
            <button
              onClick={handleForceColdStart}
              disabled={results['cold_start']?.status === 'triggering'}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                coldStartMode ? 'bg-amber-600 hover:bg-amber-700' : getButtonClass('cold_start')
              }`}
            >
              {coldStartMode ? 'Disable Cold Start' : 'Enable Cold Start'}
            </button>
          </div>
          {results['cold_start']?.message && (
            <div className={`text-xs ${
              results['cold_start']?.status === 'success' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {results['cold_start']?.message}
            </div>
          )}

          <div className="border-t border-slate-700 pt-3 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-300">Simulate Drift Event</div>
              <div className="text-xs text-slate-500">
                Trigger ADWIN drift detection for pattern reset
              </div>
            </div>
            <button
              onClick={handleSimulateDrift}
              disabled={results['drift']?.status === 'triggering'}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${getButtonClass('drift')}`}
            >
              Trigger Drift
            </button>
          </div>
          {results['drift']?.message && (
            <div className={`text-xs ${
              results['drift']?.status === 'success' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {results['drift']?.message}
            </div>
          )}
        </div>
      </DebugCard>

      <DebugCard title="Quick Reference">
        <div className="text-xs text-slate-400 space-y-2">
          <p><strong>To test insight surfacing:</strong></p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Seed data using "Heavy Week" above</li>
            <li>Force trigger an insight type</li>
            <li>Check DECIDE section for gate status</li>
            <li>Check SURFACE section for what shows</li>
          </ol>
          <p className="mt-3"><strong>To test adaptation:</strong></p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Dismiss an insight 3 times</li>
            <li>Check ADAPT section for suppression</li>
            <li>Reset dismissals to test again</li>
          </ol>
        </div>
      </DebugCard>
    </div>
  );
}
