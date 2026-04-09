/**
 * WeekHeader Component
 *
 * Week navigation, health indicators, and settings gear.
 * Part of the single-page contextual app - no sidebar, no separate pages.
 *
 * Layout: LEFT (panel buttons) | CENTER (nav + date + health) | RIGHT (Shop + Export + Settings)
 */

import { ExportMenu } from '../export/ExportMenu';
import type { WeekHeaderProps } from './types';

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const year = start.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} - ${end.getDate()}, ${year}`;
  }
  return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${year}`;
}

/** Icon button with hover scale-up + CSS tooltip label */
function HeaderButton({ onClick, label, children }: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative p-2 text-slate-400 hover:text-white hover:bg-slate-700/80 rounded-lg transition-all duration-150 hover:scale-110"
      aria-label={label}
    >
      {children}
      <span className="absolute hidden group-hover:block left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 bg-slate-800 text-xs text-slate-200 rounded-md border border-slate-700 shadow-lg whitespace-nowrap z-50 pointer-events-none">
        {label}
      </span>
    </button>
  );
}

export function WeekHeader({
  weekStart,
  health,
  onPrevWeek,
  onNextWeek,
  onToday,
  onSettingsClick,
  onInventoryClick,
  onShoppingClick,
  onShoppingModeClick,
  onRecipeHubClick,
  onFinanceClick,
  onWeeklyReviewClick,
}: WeekHeaderProps) {
  const hasIssues = health.overdueCount > 0 || health.conflictDays > 0;

  // Diegetic background: Ambient shift based on week health
  const getHeaderBg = () => {
    if (health.overdueCount > 0) {
      return 'bg-gradient-to-r from-slate-900/80 via-amber-950/20 to-slate-900/80';
    }
    if (health.conflictDays > 0) {
      return 'bg-gradient-to-r from-slate-900/80 via-amber-950/10 to-slate-900/80';
    }
    if (!hasIssues) {
      return 'bg-gradient-to-r from-slate-900/80 via-emerald-950/10 to-slate-900/80';
    }
    return 'bg-slate-900/80';
  };

  return (
    <header className={`flex items-center justify-between px-6 py-4 border-b border-slate-700/50 ${getHeaderBg()} backdrop-blur-sm sticky top-0 z-10`}>
      {/* LEFT: Panel shortcut buttons */}
      <div className="flex items-center gap-1">
        {onWeeklyReviewClick && (
          <HeaderButton onClick={onWeeklyReviewClick} label="Weekly Review">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </HeaderButton>
        )}

        {onFinanceClick && (
          <HeaderButton onClick={onFinanceClick} label="Finance">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </HeaderButton>
        )}

        {onRecipeHubClick && (
          <HeaderButton onClick={onRecipeHubClick} label="Recipe Hub">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </HeaderButton>
        )}

        {onInventoryClick && (
          <HeaderButton onClick={onInventoryClick} label="Inventory">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </HeaderButton>
        )}
      </div>

      {/* CENTER: Navigation + Date Range + Health Indicators */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <HeaderButton onClick={onPrevWeek} label="Previous week">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </HeaderButton>
          <button
            onClick={onToday}
            className="px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700/80 rounded-lg transition-all duration-150 hover:scale-105"
          >
            Today
          </button>
          <HeaderButton onClick={onNextWeek} label="Next week">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </HeaderButton>
        </div>

        <h1 className="text-lg font-semibold text-white">
          {formatWeekRange(weekStart)}
        </h1>

        {/* Health Indicators */}
        {health.overdueCount > 0 ? (
          <span
            className="group relative flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 text-amber-400 text-sm rounded-full cursor-default"
          >
            <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            Bills need attention
            <span className="absolute hidden group-hover:block left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 bg-slate-800 text-xs text-slate-300 rounded whitespace-nowrap z-20">
              {health.overdueCount} overdue
            </span>
          </span>
        ) : health.conflictDays > 0 ? (
          <span
            className="group relative flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 text-amber-400 text-sm rounded-full cursor-default"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Schedule conflicts
            <span className="absolute hidden group-hover:block left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 bg-slate-800 text-xs text-slate-300 rounded whitespace-nowrap z-20">
              {health.conflictDays} day{health.conflictDays > 1 ? 's' : ''} affected
            </span>
          </span>
        ) : null}

        {!hasIssues && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 text-emerald-400 text-sm rounded-full">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            All set
          </span>
        )}
      </div>

      {/* RIGHT: Shop + Export + Settings */}
      <div className="flex items-center gap-1">
        {onShoppingModeClick && (
          <button
            onClick={onShoppingModeClick}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-all duration-150 hover:scale-105"
            aria-label="Shopping Mode"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Shop
          </button>
        )}

        {onShoppingClick && !onShoppingModeClick && (
          <HeaderButton onClick={onShoppingClick} label="Shopping List">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </HeaderButton>
        )}

        <ExportMenu />

        <HeaderButton onClick={onSettingsClick} label="Settings">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </HeaderButton>
      </div>
    </header>
  );
}
