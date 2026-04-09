/**
 * SettingsPanel Component
 *
 * App settings accessed via gear icon in header.
 * Theme, backup/restore, preferences, about.
 */

import { useRef, useEffect, useState, lazy, Suspense } from 'react';
import { useExportBackup, useRestoreBackup } from '@/hooks/useBackup';
import { useAppStore, type ThemeMode, type ModuleSettings, type UiMode } from '@/stores/appStore';
import { useCurrentMode } from '@/hooks/useCurrentMode';
import { HabitsSettings } from '@/components/settings/HabitsSettings';
import { FinancialImportPanel } from '@/components/finance/FinancialImportPanel';
import type { SettingsPanelProps } from './types';

// Lazy import — dev-only, prevents Three.js/R3F from loading in production builds
const ShaderLabLazy = import.meta.env.DEV
  ? lazy(() => import('@/components/debug/ShaderLab'))
  : null;

// Module configuration
const MODULE_OPTIONS: { key: keyof ModuleSettings; label: string; description: string; icon: React.ReactNode }[] = [
  {
    key: 'events',
    label: 'Events',
    description: 'Schedule and appointments',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'meals',
    label: 'Meals',
    description: 'Meal planning and recipes',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    key: 'bills',
    label: 'Bills & Finances',
    description: 'Track bills and expenses',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  {
    value: 'dark',
    label: 'Dark',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    ),
  },
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    value: 'system',
    label: 'System',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
];

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportBackup = useExportBackup();
  const restoreBackup = useRestoreBackup();
  const { theme, setTheme, uiMode, setUiMode, defaultView, setDefaultView, modules, toggleModule, showInventory, toggleInventory, planningLivingMode, setPlanningLivingMode } = useAppStore();
  const [showFinancialImport, setShowFinancialImport] = useState(false);
  const [showShaderLab, setShowShaderLab] = useState(false); // dev-only, gated by import.meta.env.DEV

  // Status message state
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-dismiss status message after 4 seconds
  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // Register this view visit for session tracking
  const { registerViewVisit } = useCurrentMode();
  useEffect(() => {
    registerViewVisit('settings');
  }, [registerViewVisit]);

  const handleBackup = async () => {
    try {
      await exportBackup.mutateAsync();
      setStatusMessage({ type: 'success', text: 'Backup exported successfully' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setStatusMessage({ type: 'error', text: `Failed to export backup: ${detail}` });
    }
  };

  const handleRestore = async () => {
    // Trigger file input click
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (window.confirm('This will replace all your data. Are you sure?')) {
      try {
        await restoreBackup.mutateAsync(file);
        setStatusMessage({ type: 'success', text: 'Backup restored successfully' });
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown error';
        setStatusMessage({ type: 'error', text: `Failed to restore backup: ${detail}` });
      }
    }

    // Reset file input
    e.target.value = '';
  };

  return (
    <div className="p-6 space-y-8">
      {/* Hidden file input for restore */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".db"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Status Message */}
      {statusMessage && (
        <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
          statusMessage.type === 'success'
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
        }`}>
          {statusMessage.text}
        </div>
      )}

      {/* Theme Editor */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
          Theme
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={`
                flex flex-col items-center gap-2 p-4 rounded-xl transition-all
                ${theme === option.value
                  ? 'bg-cyan-500/20 border-2 border-cyan-500/50 text-cyan-400'
                  : 'bg-slate-700/50 border-2 border-transparent hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                }
              `}
            >
              {option.icon}
              <span className="text-sm font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Default View */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
          Default View
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Choose which view appears when the app starts. Switching will navigate you there.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'radial' as const, label: 'Radial Hub', description: 'Domain-focused arcs' },
            { value: 'week' as const, label: 'Weekly Grid', description: 'Date-focused overview' },
          ]).map((option) => (
            <button
              key={option.value}
              onClick={() => setDefaultView(option.value)}
              className={`
                flex flex-col items-center gap-1.5 p-4 rounded-xl transition-all
                ${defaultView === option.value
                  ? 'bg-cyan-500/20 border-2 border-cyan-500/50 text-cyan-400'
                  : 'bg-slate-700/50 border-2 border-transparent hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                }
              `}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-[10px] text-slate-500 text-center">{option.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Week View Theme */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
          Week View Theme
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Choose how the comprehensive week dashboard looks.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'intelligent' as UiMode, label: 'Smart', description: 'Compact grid with intelligence insights' },
            { value: 'traditional' as UiMode, label: 'Traditional', description: 'Full day cards with all details' },
          ]).map((option) => (
            <button
              key={option.value}
              onClick={() => setUiMode(option.value)}
              className={`
                flex flex-col items-center gap-1.5 p-4 rounded-xl transition-all
                ${uiMode === option.value
                  ? 'bg-cyan-500/20 border-2 border-cyan-500/50 text-cyan-400'
                  : 'bg-slate-700/50 border-2 border-transparent hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                }
              `}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-[10px] text-slate-500 text-center">{option.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Planning / Living Mode */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
          Week Mode
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Planning mode surfaces prep tasks. Living mode focuses on today.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'planning' as const, label: 'Planning', description: 'Weekly prep and scheduling' },
            { value: 'living' as const, label: 'Living', description: 'Daily check-in focus' },
          ]).map((option) => (
            <button
              key={option.value}
              onClick={() => setPlanningLivingMode(option.value)}
              className={`
                flex flex-col items-center gap-1.5 p-4 rounded-xl transition-all
                ${planningLivingMode === option.value
                  ? 'bg-cyan-500/20 border-2 border-cyan-500/50 text-cyan-400'
                  : 'bg-slate-700/50 border-2 border-transparent hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                }
              `}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-[10px] text-slate-500 text-center">{option.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
          Tracking Modules
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Choose which features to show. Disabled modules are hidden from the week view.
        </p>
        <div className="space-y-3">
          {MODULE_OPTIONS.map((option) => {
            const isEnabled = modules[option.key];
            return (
              <button
                key={option.key}
                onClick={() => toggleModule(option.key)}
                className={`
                  w-full flex items-center gap-3 p-4 rounded-xl transition-all
                  ${isEnabled
                    ? 'bg-cyan-500/15 border border-cyan-500/30'
                    : 'bg-slate-700/30 border border-transparent hover:bg-slate-700/50'
                  }
                `}
              >
                <div className={`shrink-0 ${isEnabled ? 'text-cyan-400' : 'text-slate-500'}`}>
                  {option.icon}
                </div>
                <div className="flex-1 text-left">
                  <div className={`font-medium ${isEnabled ? 'text-white' : 'text-slate-400'}`}>
                    {option.label}
                  </div>
                  <div className="text-sm text-slate-500">
                    {option.description}
                  </div>
                </div>
                {/* Toggle switch */}
                <div
                  className={`
                    relative w-11 h-6 rounded-full transition-colors shrink-0
                    ${isEnabled ? 'bg-cyan-500' : 'bg-slate-600'}
                  `}
                >
                  <div
                    className={`
                      absolute top-1 w-4 h-4 bg-white rounded-full transition-transform
                      ${isEnabled ? 'translate-x-6' : 'translate-x-1'}
                    `}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Features */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
          Features
        </h3>
        <div className="space-y-3">
          <button
            onClick={toggleInventory}
            className={`
              w-full flex items-center gap-3 p-4 rounded-xl transition-all
              ${showInventory
                ? 'bg-cyan-500/15 border border-cyan-500/30'
                : 'bg-slate-700/30 border border-transparent hover:bg-slate-700/50'
              }
            `}
          >
            <div className={`shrink-0 ${showInventory ? 'text-cyan-400' : 'text-slate-500'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <div className={`font-medium ${showInventory ? 'text-white' : 'text-slate-400'}`}>
                Inventory Tracking
              </div>
              <div className="text-sm text-slate-500">
                Track pantry, fridge, and freezer items
              </div>
            </div>
            <div
              className={`
                relative w-11 h-6 rounded-full transition-colors shrink-0
                ${showInventory ? 'bg-cyan-500' : 'bg-slate-600'}
              `}
            >
              <div
                className={`
                  absolute top-1 w-4 h-4 bg-white rounded-full transition-transform
                  ${showInventory ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </div>
          </button>
        </div>
      </section>

      {/* Habit Tracking */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
          Habit Tracking
        </h3>
        <HabitsSettings />
      </section>

      {/* Data Management */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
          Data Management
        </h3>
        <div className="space-y-3">
          <button
            onClick={handleBackup}
            disabled={exportBackup.isPending}
            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <div className="text-left">
              <div className="text-white font-medium">Export Backup</div>
              <div className="text-sm text-slate-400">Save your data to a file</div>
            </div>
          </button>

          <button
            onClick={handleRestore}
            disabled={restoreBackup.isPending}
            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <div className="text-left">
              <div className="text-white font-medium">Restore from Backup</div>
              <div className="text-sm text-slate-400">Import data from a file</div>
            </div>
          </button>

          <button
            onClick={() => setShowFinancialImport(true)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="text-left">
              <div className="text-white font-medium">Import Financial Data</div>
              <div className="text-sm text-slate-400">Import bills from CSV or Excel</div>
            </div>
          </button>
        </div>
      </section>

      {/* Health Indicators Reference */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
          Week Health Indicators
        </h3>
        <div className="p-4 bg-slate-700/50 rounded-lg space-y-4">
          <p className="text-sm text-slate-400">
            The "Week Health" status is calculated from these factors:
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <div>
                <div className="text-sm text-white font-medium">Schedule Conflicts</div>
                <div className="text-xs text-slate-400">Events with overlapping times on the same day</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <div>
                <div className="text-sm text-white font-medium">Overdue Bills</div>
                <div className="text-xs text-slate-400">Unpaid bills past their due date</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
              <div>
                <div className="text-sm text-white font-medium">Overloaded Days</div>
                <div className="text-xs text-slate-400">Days with 5 or more events scheduled</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-slate-400 mt-1.5 shrink-0" />
              <div>
                <div className="text-sm text-white font-medium">Unplanned Meals</div>
                <div className="text-xs text-slate-400">Breakfast, lunch, or dinner slots without a meal planned</div>
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-600">
            <div className="text-xs text-slate-500">
              <span className="text-emerald-400 font-medium">Good</span> = No conflicts, no overdue bills
              <br />
              <span className="text-amber-400 font-medium">Attention</span> = Has conflicts or overdue items
            </div>
          </div>
        </div>
      </section>

      {/* Developer Tools — dev-only, hidden in production builds */}
      {import.meta.env.DEV && (
        <section>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
            Developer Tools
          </h3>
          <button
            onClick={() => setShowShaderLab(true)}
            className="w-full flex items-center gap-3 p-4 rounded-xl bg-cyan-500/15 border border-cyan-500/30 hover:bg-cyan-500/25 transition-colors text-left"
          >
            <div className="shrink-0 text-cyan-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-medium text-white">Shader Lab</div>
              <div className="text-sm text-slate-400">
                Infinite TPMS lattice prototype — WASD fly-through
              </div>
            </div>
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </section>
      )}

      {/* About */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
          About
        </h3>
        <div className="p-4 bg-slate-700/50 rounded-lg space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <div className="text-white font-medium">Weekly Review</div>
              <div className="text-sm text-slate-400">Version 1.0.0</div>
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-3">
            Your personal weekly command center. Plan your week, track your finances, and meal prep - all in one place.
          </p>
        </div>
      </section>

      {/* Privacy Note */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
          Privacy
        </h3>
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-emerald-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <div className="text-emerald-400 font-medium">Your data stays private</div>
              <p className="text-sm text-slate-400 mt-1">
                All your data is stored locally on your device. Nothing is sent to the cloud.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Close Button */}
      <div className="pt-4 border-t border-slate-700">
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          Close Settings
        </button>
      </div>

      {/* Financial Import Modal */}
      {showFinancialImport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowFinancialImport(false)}
          />
          <div className="relative w-full max-w-2xl max-h-[90vh] mx-4 bg-slate-900 rounded-xl border border-slate-800 shadow-2xl overflow-y-auto">
            <FinancialImportPanel
              onClose={() => setShowFinancialImport(false)}
              onSuccess={() => setShowFinancialImport(false)}
            />
          </div>
        </div>
      )}

      {/* Shader Lab Full-Screen Overlay — dev-only */}
      {import.meta.env.DEV && showShaderLab && ShaderLabLazy && (
        <Suspense fallback={null}>
          <ShaderLabLazy onClose={() => setShowShaderLab(false)} />
        </Suspense>
      )}
    </div>
  );
}
