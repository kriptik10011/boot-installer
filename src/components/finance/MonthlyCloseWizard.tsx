/**
 * MonthlyCloseWizard — 3-step guided monthly close process.
 *
 * Research basis: Sunsama shutdown ritual pattern.
 * Steps: 1) Month summary, 2) Category review, 3) Next month intention.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api/client';
import { trapFocus, handleModalKeyDown } from '@/utils/accessibility';

interface MonthlyCloseWizardProps {
  onClose: () => void;
  monthDate?: string;
}

const STEPS = [
  { id: 'summary', label: 'Summary' },
  { id: 'categories', label: 'Categories' },
  { id: 'intention', label: 'Next Month' },
] as const;

function fmt(n: number): string {
  return `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function MonthlyCloseWizard({ onClose, monthDate }: MonthlyCloseWizardProps) {
  const [step, setStep] = useState(0);
  const [intention, setIntention] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const currentMonth = monthDate || new Date().toISOString().slice(0, 10);

  const { data: monthData } = useQuery({
    queryKey: ['reports', 'monthly-close', currentMonth],
    queryFn: () => reportsApi.monthlyClose(currentMonth),
  });

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const firstBtn = dialog.querySelector<HTMLElement>('button');
    firstBtn?.focus();
    const cleanup = trapFocus(dialog);
    return () => {
      cleanup();
      previousFocusRef.current?.focus();
    };
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => handleModalKeyDown(e, onClose),
    [onClose]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onKeyDown={onKeyDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="monthly-close-title"
        className="bg-[#0a1628] border border-slate-700/50 rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 id="monthly-close-title" className="text-lg font-bold text-slate-100">Monthly Close</h1>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-1 mb-6">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step ? 'bg-emerald-500 text-white' :
                i === step ? 'bg-cyan-500 text-white' :
                'bg-slate-700 text-slate-400'
              }`}>
                {i < step ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-12 h-0.5 mx-1 ${i < step ? 'bg-emerald-500' : 'bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[240px]">
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-200">Month Summary</h2>
              {monthData ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-xs text-slate-400">Income</p>
                      <p className="text-xl font-bold text-emerald-400">{fmt(monthData.total_income ?? 0)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                      <p className="text-xs text-slate-400">Expenses</p>
                      <p className="text-xl font-bold text-rose-400">{fmt(monthData.total_expenses ?? 0)}</p>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/50">
                    <p className="text-sm text-slate-300">
                      Net: <span className={`font-bold ${(monthData.total_income ?? 0) - (monthData.total_expenses ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {fmt((monthData.total_income ?? 0) - (monthData.total_expenses ?? 0))}
                      </span>
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">Loading month data...</p>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-200">Category Review</h2>
              {monthData?.category_breakdown ? (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {monthData.category_breakdown.map((cat: any) => (
                    <div key={cat.category} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                      <span className="text-sm text-slate-300">{cat.category}</span>
                      <div className="text-right">
                        <span className="text-sm font-medium text-slate-200">{fmt(cat.spent)}</span>
                        {cat.budget > 0 && (
                          <span className={`ml-2 text-xs ${cat.spent > cat.budget ? 'text-amber-400' : 'text-slate-500'}`}>
                            / {fmt(cat.budget)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No category data available</p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-200">Next Month Focus</h2>
              <p className="text-sm text-slate-400">What's your financial intention for next month?</p>
              <div className="flex gap-2 flex-wrap">
                {['Stay on budget', 'Build savings', 'Reduce dining out', 'Pay extra on debt'].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setIntention(chip)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      intention === chip
                        ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                        : 'border-slate-600 bg-slate-800/50 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <textarea
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                placeholder="Or type your own..."
                className="w-full p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-cyan-500/50"
                rows={3}
              />
              <button
                onClick={onClose}
                className="w-full py-3 rounded-lg bg-cyan-500 text-white font-semibold hover:bg-cyan-400 transition-colors"
              >
                Complete Monthly Close
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        {step < STEPS.length - 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-700/50">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="text-sm text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Back
            </button>
            <div className="text-xs text-slate-600">Step {step + 1} of {STEPS.length}</div>
            <button
              onClick={() => setStep(step + 1)}
              className="px-4 py-2 text-sm rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
