/**
 * PlanRepairModal Component
 *
 * Graceful handling of missed/overdue items with repair options.
 * From Intelligence Principles: "Deviation is data, not failure"
 *
 * Key design decisions:
 * - Uses amber styling (not red) to avoid shame
 * - Language: "Needs attention" instead of "Overdue"
 * - Three repair paths: Reschedule, Reduce, Drop
 * - No "broken" or "failed" language anywhere
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  Calendar,
  Minimize2,
  Archive,
  X,
  Clock,
  AlertCircle,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export type RepairableItemType = 'event' | 'bill' | 'meal';

export interface RepairableItem {
  id: number;
  type: RepairableItemType;
  name: string;
  date: string;          // Original date (ISO)
  amount?: number;       // For bills
  description?: string;  // Additional context
}

export type RepairAction = 'reschedule' | 'reduce' | 'drop';

export interface PlanRepairModalProps {
  isOpen: boolean;
  item: RepairableItem | null;
  onClose: () => void;
  onRepair: (item: RepairableItem, action: RepairAction, newDate?: string) => void;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get tomorrow's date as ISO string
 */
function getTomorrow(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

/**
 * Get friendly name for item type (no shame language)
 */
function getItemTypeName(type: RepairableItemType): string {
  switch (type) {
    case 'event':
      return 'event';
    case 'bill':
      return 'bill';
    case 'meal':
      return 'meal plan';
  }
}

/**
 * Get action descriptions based on item type
 */
function getActionDescriptions(type: RepairableItemType): {
  reschedule: { title: string; description: string };
  reduce: { title: string; description: string };
  drop: { title: string; description: string };
} {
  switch (type) {
    case 'event':
      return {
        reschedule: {
          title: 'Reschedule to tomorrow',
          description: 'Move this event to tomorrow',
        },
        reduce: {
          title: 'Make it shorter',
          description: 'Reduce the time commitment',
        },
        drop: {
          title: 'Skip this week',
          description: "Archive for now, revisit later",
        },
      };
    case 'bill':
      return {
        reschedule: {
          title: 'Set new due date',
          description: 'Update the payment date',
        },
        reduce: {
          title: 'Make partial payment',
          description: 'Pay what you can now',
        },
        drop: {
          title: 'Defer this cycle',
          description: 'Handle next billing period',
        },
      };
    case 'meal':
      return {
        reschedule: {
          title: 'Move to tomorrow',
          description: 'Plan this meal for tomorrow',
        },
        reduce: {
          title: 'Simplify the meal',
          description: 'Choose something easier',
        },
        drop: {
          title: 'Skip this one',
          description: "It's okay to improvise",
        },
      };
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PlanRepairModal({
  isOpen,
  item,
  onClose,
  onRepair,
}: PlanRepairModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      const timeout = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timeout);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const actions = getActionDescriptions(item.type);
  const itemTypeName = getItemTypeName(item.type);
  const tomorrow = getTomorrow();

  const handleAction = (action: RepairAction) => {
    const newDate = action === 'reschedule' ? tomorrow : undefined;
    onRepair(item, action, newDate);
    onClose();
  };

  return (
    <>
      {/* Backdrop - amber tinted */}
      <div
        className="fixed inset-0 bg-amber-950/40 backdrop-blur-sm z-50 transition-opacity duration-200"
        aria-hidden="true"
      />

      {/* Modal - centered */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={modalRef}
          className="w-full max-w-md bg-slate-800 border border-amber-600/30 rounded-2xl shadow-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="repair-modal-title"
        >
          {/* Header - amber accent */}
          <header className="px-6 py-4 border-b border-slate-700 bg-amber-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2
                    id="repair-modal-title"
                    className="text-lg font-semibold text-white"
                  >
                    Needs Attention
                  </h2>
                  <p className="text-sm text-slate-400">
                    This {itemTypeName} could use some help
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Item details */}
          <div className="px-6 py-4 border-b border-slate-700">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-slate-700 rounded-lg">
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">{item.name}</p>
                <p className="text-sm text-slate-400">
                  Originally scheduled for{' '}
                  {new Date(item.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
                {item.amount !== undefined && (
                  <p className="text-sm text-amber-400 mt-1">
                    ${item.amount.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Repair options */}
          <div className="p-4 space-y-3">
            <p className="text-sm text-slate-400 px-2 mb-4">
              How would you like to handle this?
            </p>

            {/* Reschedule option */}
            <button
              onClick={() => handleAction('reschedule')}
              className="w-full flex items-center gap-4 p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-amber-500/50 rounded-xl transition-all group text-left"
            >
              <div className="p-2 bg-amber-500/20 rounded-lg group-hover:bg-amber-500/30 transition-colors">
                <Calendar className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-white">
                  {actions.reschedule.title}
                </p>
                <p className="text-sm text-slate-400">
                  {actions.reschedule.description}
                </p>
              </div>
            </button>

            {/* Reduce option */}
            <button
              onClick={() => handleAction('reduce')}
              className="w-full flex items-center gap-4 p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500/50 rounded-xl transition-all group text-left"
            >
              <div className="p-2 bg-cyan-500/20 rounded-lg group-hover:bg-cyan-500/30 transition-colors">
                <Minimize2 className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-white">{actions.reduce.title}</p>
                <p className="text-sm text-slate-400">
                  {actions.reduce.description}
                </p>
              </div>
            </button>

            {/* Drop option */}
            <button
              onClick={() => handleAction('drop')}
              className="w-full flex items-center gap-4 p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 rounded-xl transition-all group text-left"
            >
              <div className="p-2 bg-slate-600 rounded-lg group-hover:bg-slate-500 transition-colors">
                <Archive className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-white">{actions.drop.title}</p>
                <p className="text-sm text-slate-400">
                  {actions.drop.description}
                </p>
              </div>
            </button>
          </div>

          {/* Footer - reassuring message */}
          <footer className="px-6 py-3 bg-slate-900/50 border-t border-slate-700">
            <p className="text-xs text-slate-500 text-center">
              Life happens. These options help you stay on track.
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
