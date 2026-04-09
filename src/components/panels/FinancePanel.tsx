/**
 * FinancePanel — Orchestrator for Dashboard, Classic, and Living finance views.
 *
 * Toggle cycles: Dashboard → Classic → Living.
 * "Dashboard" shows ComprehensiveDashboard (bento-grid financial overview).
 * View preference persists via appStore.
 */

import { useAppStore } from '@/stores/appStore';
import { FinanceClassicView } from '@/components/finance/FinanceClassicView';
import { FinanceLivingView } from '@/components/finance/vitals/FinanceLivingView';
import { ComprehensiveDashboard } from '@/components/finance/radial/dashboard/ComprehensiveDashboard';

interface FinancePanelProps {
  onClose: () => void;
}

const VIEW_LABELS: Record<string, string> = {
  radial: 'Dashboard',
  classic: 'Classic',
  living: 'Living',
};

const VIEW_STYLES: Record<string, string> = {
  radial: 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30',
  classic: 'bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600',
  living: 'bg-violet-500/20 text-violet-400 hover:bg-violet-500/30',
};

function FinanceDashboardView({ onClose }: { onClose: () => void }) {
  return <ComprehensiveDashboard onBack={onClose} />;
}

export function FinancePanel({ onClose }: FinancePanelProps) {
  const financeViewMode = useAppStore((s) => s.financeViewMode);
  const cycleFinanceViewMode = useAppStore((s) => s.cycleFinanceViewMode);

  const isDashboard = financeViewMode === 'radial';

  // Dashboard mode: fullscreen bento-grid financial dashboard
  if (isDashboard) {
    return (
      <div className="h-full relative">
        <FinanceDashboardView onClose={onClose} />
        {/* Floating view-cycle button — Dashboard has no header, so we add one */}
        <button
          onClick={cycleFinanceViewMode}
          className="absolute top-3 right-14 z-50 px-2.5 py-1 text-xs font-medium rounded-md bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
          aria-label="Switch finance view"
          title="Cycle view mode"
        >
          Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-800 text-white">
      {/* Standard header for classic/living modes */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <h2 className="text-lg font-semibold">Finances</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={cycleFinanceViewMode}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              VIEW_STYLES[financeViewMode] ?? VIEW_STYLES.classic
            }`}
            aria-label={`Switch finance view (current: ${VIEW_LABELS[financeViewMode] ?? 'Classic'})`}
            title="Cycle view mode (Ctrl+Shift+A)"
          >
            {VIEW_LABELS[financeViewMode] ?? 'Classic'}
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* View content */}
      <div className="flex-1 min-h-0">
        {financeViewMode === 'living' && <FinanceLivingView />}
        {financeViewMode === 'classic' && <FinanceClassicView />}
      </div>
    </div>
  );
}
