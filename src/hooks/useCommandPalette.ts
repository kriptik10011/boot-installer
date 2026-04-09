/**
 * useCommandPalette Hook
 *
 * Manages command palette state: open/close, search filtering,
 * keyboard navigation (ArrowUp/Down/Enter/Escape).
 */

import { useState, useCallback, useMemo } from 'react';
import { filterCommands, groupByCategory } from '@/commands/commandRegistry';
import type { Command } from '@/commands/commandRegistry';

export interface UseCommandPaletteReturn {
  isOpen: boolean;
  search: string;
  selectedIndex: number;
  filteredCommands: Command[];
  groupedCommands: Map<string, Command[]>;
  open: () => void;
  close: () => void;
  setSearch: (value: string) => void;
  setSelectedIndex: (index: number) => void;
  executeSelected: () => void;
  moveSelection: (direction: 'up' | 'down') => void;
}

export function useCommandPalette(commands: Command[]): UseCommandPaletteReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearchValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = useMemo(
    () => filterCommands(commands, search),
    [commands, search]
  );

  const groupedCommands = useMemo(
    () => groupByCategory(filteredCommands),
    [filteredCommands]
  );

  const open = useCallback(() => {
    setIsOpen(true);
    setSearchValue('');
    setSelectedIndex(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchValue('');
    setSelectedIndex(0);
  }, []);

  const setSearch = useCallback((value: string) => {
    setSearchValue(value);
    setSelectedIndex(0);
  }, []);

  const executeSelected = useCallback(() => {
    const cmd = filteredCommands[selectedIndex];
    if (cmd) {
      cmd.action();
      close();
    }
  }, [filteredCommands, selectedIndex, close]);

  const moveSelection = useCallback(
    (direction: 'up' | 'down') => {
      setSelectedIndex((prev) => {
        const max = filteredCommands.length - 1;
        if (max < 0) return 0;
        if (direction === 'down') return prev >= max ? 0 : prev + 1;
        return prev <= 0 ? max : prev - 1;
      });
    },
    [filteredCommands.length]
  );

  return {
    isOpen,
    search,
    selectedIndex,
    filteredCommands,
    groupedCommands,
    open,
    close,
    setSearch,
    setSelectedIndex,
    executeSelected,
    moveSelection,
  };
}
