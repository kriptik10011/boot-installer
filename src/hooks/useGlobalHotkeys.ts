/**
 * useGlobalHotkeys Hook
 *
 * Attaches global keyboard shortcuts to the document.
 * Ctrl+K opens the command palette. Alt+key shortcuts execute commands directly.
 * Suppressed when: cooking mode active, input/textarea focused.
 */

import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import type { Command } from '@/commands/commandRegistry';

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
}

const SHORTCUT_MAP: Record<string, string> = {
  'alt+arrowleft': 'nav-prev-week',
  'alt+arrowright': 'nav-next-week',
  'alt+t': 'nav-today',
  'alt+e': 'panel-events',
  'alt+m': 'panel-meals',
  'alt+s': 'panel-shopping',
  'alt+i': 'panel-inventory',
  'alt+r': 'panel-recipes',
  'alt+f': 'panel-finance',
  'alt+,': 'panel-settings',
};

export function useGlobalHotkeys(
  commands: Command[],
  openPalette: () => void,
  isPaletteOpen: boolean
): void {
  const isCookingMode = useAppStore((s) => s.isCookingMode);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Suppress all hotkeys during cooking mode
      if (isCookingMode) return;

      // Ctrl+K / Cmd+K: open palette (works even in input fields)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openPalette();
        return;
      }

      // Don't process Alt shortcuts when palette is open (palette handles its own keys)
      if (isPaletteOpen) return;

      // Don't process Alt shortcuts when input is focused
      if (isInputFocused()) return;

      // Alt+key shortcuts
      if (e.altKey) {
        const key = `alt+${e.key.toLowerCase()}`;
        const commandId = SHORTCUT_MAP[key];
        if (commandId) {
          const cmd = commands.find((c) => c.id === commandId);
          if (cmd) {
            e.preventDefault();
            cmd.action();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [commands, openPalette, isPaletteOpen, isCookingMode]);
}
