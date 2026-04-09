/**
 * FinanceClassicView — Tab container for the classic finance experience.
 *
 * Extracted from FinancePanel.tsx orchestrator pattern. Contains the scrollable
 * tab bar and renders the active tab component.
 */

import { useState } from 'react';
import {
  OverviewTab,
  BudgetTab,
  TransactionsTab,
  BillsTab,
  SavingsTab,
  DebtTab,
  NetWorthTab,
  InvestmentsTab,
  ReportsTab,
  ForecastTab,
} from './classic';

type FinanceTab =
  | 'overview'
  | 'budget'
  | 'transactions'
  | 'bills'
  | 'savings'
  | 'debt'
  | 'networth'
  | 'investments'
  | 'reports'
  | 'forecast';

const TABS: { key: FinanceTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'budget', label: 'Budget' },
  { key: 'transactions', label: 'Txns' },
  { key: 'bills', label: 'Bills' },
  { key: 'savings', label: 'Savings' },
  { key: 'debt', label: 'Debt' },
  { key: 'networth', label: 'Net Worth' },
  { key: 'investments', label: 'Invest' },
  { key: 'reports', label: 'Reports' },
  { key: 'forecast', label: 'Forecast' },
];

const TAB_COMPONENTS: Record<FinanceTab, React.ComponentType> = {
  overview: OverviewTab,
  budget: BudgetTab,
  transactions: TransactionsTab,
  bills: BillsTab,
  savings: SavingsTab,
  debt: DebtTab,
  networth: NetWorthTab,
  investments: InvestmentsTab,
  reports: ReportsTab,
  forecast: ForecastTab,
};

export function FinanceClassicView() {
  const [activeTab, setActiveTab] = useState<FinanceTab>('overview');
  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <>
      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-slate-700 px-2 scrollbar-thin">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === key
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ActiveComponent />
      </div>
    </>
  );
}
