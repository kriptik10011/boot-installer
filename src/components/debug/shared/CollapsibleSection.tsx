/**
 * CollapsibleSection Component
 *
 * Reusable collapsible wrapper for debug sections.
 * State is persisted to localStorage.
 */

import { useState, useEffect, ReactNode } from 'react';

interface CollapsibleSectionProps {
  id: string;
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
  status?: 'healthy' | 'warning' | 'error';
  onToggle?: (isOpen: boolean) => void;
  children: ReactNode;
}

const STORAGE_KEY = 'ultimate-debug-panel-sections';

function loadSectionState(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveSectionState(state: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function CollapsibleSection({
  id,
  title,
  icon,
  defaultOpen = false,
  badge,
  status,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(() => {
    const stored = loadSectionState();
    return stored[id] !== undefined ? stored[id] : defaultOpen;
  });

  useEffect(() => {
    const state = loadSectionState();
    state[id] = isOpen;
    saveSectionState(state);
  }, [id, isOpen]);

  // Listen for external toggle events (from pipeline visualizer clicks)
  useEffect(() => {
    const handleExternalToggle = (event: CustomEvent<{ id: string; open: boolean }>) => {
      if (event.detail.id === id && event.detail.open !== isOpen) {
        setIsOpen(event.detail.open);
        onToggle?.(event.detail.open);
      }
    };

    window.addEventListener('debug-section-toggle', handleExternalToggle as EventListener);
    return () => {
      window.removeEventListener('debug-section-toggle', handleExternalToggle as EventListener);
    };
  }, [id, isOpen, onToggle]);

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    onToggle?.(newState);
  };

  const statusColors = {
    healthy: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
  };

  return (
    <div className="border border-slate-700/50 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between p-3 bg-slate-800/70 hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Expand/collapse indicator */}
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          {/* Icon */}
          {icon && <span className="text-slate-400">{icon}</span>}

          {/* Title */}
          <span className="font-medium text-slate-200">{title}</span>

          {/* Badge */}
          {badge !== undefined && (
            <span className="px-2 py-0.5 bg-slate-700 rounded text-xs font-mono text-cyan-400">
              {badge}
            </span>
          )}
        </div>

        {/* Status indicator */}
        {status && (
          <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
        )}
      </button>

      {/* Content */}
      {isOpen && (
        <div className="p-4 bg-slate-900/50 border-t border-slate-700/50">
          {children}
        </div>
      )}
    </div>
  );
}
