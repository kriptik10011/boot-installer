/**
 * CommandPalette Component
 *
 * Full-screen overlay command palette triggered by Ctrl+K.
 * Search input at top, grouped commands below, keyboard navigation.
 * Matches existing modal pattern (z-[100], backdrop-blur).
 */

import { useEffect, useRef, useMemo, useCallback } from 'react';
import {
  createCommands,
  getCategoryLabel,
  CATEGORY_ORDER,
} from '@/commands/commandRegistry';
import type { Command, CommandCategory } from '@/commands/commandRegistry';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys';
import type { CommandActions } from '@/components/week/types';

interface CommandPaletteProps {
  actions: CommandActions;
}

export function CommandPalette({ actions }: CommandPaletteProps) {
  const commands = useMemo(() => createCommands(actions), [actions]);

  const palette = useCommandPalette(commands);
  useGlobalHotkeys(commands, palette.open, palette.isOpen);

  if (!palette.isOpen) return null;

  return (
    <CommandPaletteOverlay
      palette={palette}
    />
  );
}

// Separated so hooks aren't called conditionally
interface OverlayProps {
  palette: ReturnType<typeof useCommandPalette>;
}

interface CategoryGroup {
  category: CommandCategory;
  commands: Command[];
  startIndex: number;
}

function CommandPaletteOverlay({ palette }: OverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = listRef.current?.querySelector('[data-selected="true"]');
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [palette.selectedIndex]);

  // Compute grouped commands with stable flat indices
  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    let idx = 0;
    return CATEGORY_ORDER.reduce<CategoryGroup[]>((groups, category) => {
      const cmds = palette.filteredCommands.filter(
        (c) => c.category === category
      );
      if (cmds.length > 0) {
        groups.push({ category, commands: cmds, startIndex: idx });
        idx += cmds.length;
      }
      return groups;
    }, []);
  }, [palette.filteredCommands]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!['Escape', 'ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          palette.close();
          break;
        case 'ArrowDown':
          e.preventDefault();
          palette.moveSelection('down');
          break;
        case 'ArrowUp':
          e.preventDefault();
          palette.moveSelection('up');
          break;
        case 'Enter':
          e.preventDefault();
          palette.executeSelected();
          break;
      }
    },
    [palette]
  );

  const setSelectedIndex = palette.setSelectedIndex;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={palette.close}
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg rounded-xl border border-slate-600/50 bg-[#0a1628] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-slate-700/50 px-4 py-3">
          <svg
            className="h-5 w-5 text-slate-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search commands"
            aria-autocomplete="list"
            aria-controls="command-list"
            aria-expanded="true"
            aria-activedescendant={
              palette.filteredCommands[palette.selectedIndex]
                ? `cmd-${palette.filteredCommands[palette.selectedIndex].id}`
                : undefined
            }
            value={palette.search}
            onChange={(e) => palette.setSearch(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-slate-600/50 bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div id="command-list" role="listbox" ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {palette.filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No commands found
            </div>
          ) : (
            categoryGroups.map(({ category, commands, startIndex }) => (
              <CommandGroup
                key={category}
                category={category}
                commands={commands}
                selectedIndex={palette.selectedIndex}
                startIndex={startIndex}
                onExecute={(cmd) => {
                  cmd.action();
                  palette.close();
                }}
                onHover={setSelectedIndex}
              />
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-slate-700/50 px-4 py-2 text-[10px] text-slate-500 flex items-center gap-4">
          <span>
            <kbd className="font-mono">&uarr;&darr;</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono">Enter</kbd> select
          </span>
          <span>
            <kbd className="font-mono">Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

interface CommandGroupProps {
  category: CommandCategory;
  commands: Command[];
  selectedIndex: number;
  startIndex: number;
  onExecute: (cmd: Command) => void;
  onHover: (globalIndex: number) => void;
}

function CommandGroup({
  category,
  commands,
  selectedIndex,
  startIndex,
  onExecute,
  onHover,
}: CommandGroupProps) {
  return (
    <div className="mb-1">
      <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {getCategoryLabel(category)}
      </div>
      {commands.map((cmd, i) => {
        const globalIndex = startIndex + i;
        const isSelected = globalIndex === selectedIndex;
        return (
          <button
            key={cmd.id}
            id={`cmd-${cmd.id}`}
            role="option"
            aria-selected={isSelected}
            data-selected={isSelected}
            onClick={() => onExecute(cmd)}
            onMouseEnter={() => onHover(globalIndex)}
            className={`flex w-full items-center justify-between px-4 py-2 text-sm transition-colors ${
              isSelected
                ? 'bg-[#1c2d4a] text-white'
                : 'text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <span>{cmd.label}</span>
            {cmd.shortcut && (
              <kbd className="ml-4 shrink-0 rounded border border-slate-600/50 bg-slate-800/50 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                {cmd.shortcut}
              </kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}
