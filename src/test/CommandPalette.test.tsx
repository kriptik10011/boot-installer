import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  createCommands,
  filterCommands,
  groupByCategory,
  CATEGORY_ORDER,
} from '../commands/commandRegistry';
import { useCommandPalette } from '../hooks/useCommandPalette';
import type { CommandActions } from '../components/week/types';

function createMockActions(): CommandActions {
  return {
    goToPreviousWeek: vi.fn(),
    goToNextWeek: vi.fn(),
    goToThisWeek: vi.fn(),
    openEventPanel: vi.fn(),
    openMealPanel: vi.fn(),
    openShoppingPanel: vi.fn(),
    openInventoryPanel: vi.fn(),
    openRecipeHubPanel: vi.fn(),
    openFinancePanel: vi.fn(),
    openSettingsPanel: vi.fn(),
    addEvent: vi.fn(),
    addMeal: vi.fn(),
    openShoppingMode: vi.fn(),
    startWeeklyReview: vi.fn(),
    whatCanICook: vi.fn(),
    addTransaction: vi.fn(),
    addBill: vi.fn(),
    checkBudget: vi.fn(),
    switchToTraditional: vi.fn(),
    switchToIntelligent: vi.fn(),
    toggleFinanceView: vi.fn(),
    togglePlanningLiving: vi.fn(),
  };
}

// =============================================================================
// COMMAND REGISTRY
// =============================================================================

describe('commandRegistry', () => {
  let actions: CommandActions;

  beforeEach(() => {
    actions = createMockActions();
  });

  it('creates the expected number of commands', () => {
    const commands = createCommands(actions);
    expect(commands.length).toBe(22);
  });

  it('assigns correct categories', () => {
    const commands = createCommands(actions);
    const categories = new Set(commands.map((c) => c.category));
    expect(categories).toEqual(
      new Set(['navigation', 'panels', 'actions', 'view', 'mode'])
    );
  });

  it('navigation commands have shortcuts', () => {
    const commands = createCommands(actions);
    const navCommands = commands.filter((c) => c.category === 'navigation');
    expect(navCommands.length).toBe(3);
    navCommands.forEach((cmd) => {
      expect(cmd.shortcut).toBeDefined();
    });
  });

  it('panel commands have shortcuts', () => {
    const commands = createCommands(actions);
    const panelCommands = commands.filter((c) => c.category === 'panels');
    expect(panelCommands.length).toBe(7);
    panelCommands.forEach((cmd) => {
      expect(cmd.shortcut).toBeDefined();
    });
  });

  it('all commands have unique IDs', () => {
    const commands = createCommands(actions);
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('executes the correct action', () => {
    const commands = createCommands(actions);
    const financeCmd = commands.find((c) => c.id === 'panel-finance');
    financeCmd?.action();
    expect(actions.openFinancePanel).toHaveBeenCalledOnce();
  });
});

// =============================================================================
// FILTER COMMANDS
// =============================================================================

describe('filterCommands', () => {
  let commands: ReturnType<typeof createCommands>;

  beforeEach(() => {
    commands = createCommands(createMockActions());
  });

  it('returns all commands for empty search', () => {
    expect(filterCommands(commands, '')).toHaveLength(commands.length);
    expect(filterCommands(commands, '  ')).toHaveLength(commands.length);
  });

  it('filters by label', () => {
    const result = filterCommands(commands, 'finance');
    expect(result.length).toBe(2); // panel-finance + action-toggle-finance-view
    expect(result.map((r) => r.id)).toContain('panel-finance');
    expect(result.map((r) => r.id)).toContain('action-toggle-finance-view');
  });

  it('filters by keywords', () => {
    const result = filterCommands(commands, 'budget');
    expect(result.length).toBe(2); // panel-finance + action-check-budget
    expect(result.map((r) => r.id)).toContain('panel-finance');
    expect(result.map((r) => r.id)).toContain('action-check-budget');
  });

  it('is case-insensitive', () => {
    const result = filterCommands(commands, 'SHOPPING');
    expect(result.length).toBeGreaterThanOrEqual(2); // panel + action
  });

  it('returns empty for no match', () => {
    const result = filterCommands(commands, 'xyznonexistent');
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// GROUP BY CATEGORY
// =============================================================================

describe('groupByCategory', () => {
  it('groups commands in category order', () => {
    const commands = createCommands(createMockActions());
    const groups = groupByCategory(commands);
    const groupKeys = [...groups.keys()];
    // Groups should follow CATEGORY_ORDER (skipping empty categories)
    const expected = CATEGORY_ORDER.filter((cat) =>
      commands.some((c) => c.category === cat)
    );
    expect(groupKeys).toEqual(expected);
  });

  it('omits categories with no matching commands', () => {
    const commands = createCommands(createMockActions());
    const navOnly = commands.filter((c) => c.category === 'navigation');
    const groups = groupByCategory(navOnly);
    expect(groups.size).toBe(1);
    expect(groups.has('navigation')).toBe(true);
  });
});

// =============================================================================
// useCommandPalette HOOK
// =============================================================================

describe('useCommandPalette', () => {
  let commands: ReturnType<typeof createCommands>;

  beforeEach(() => {
    commands = createCommands(createMockActions());
  });

  it('starts closed', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.search).toBe('');
    expect(result.current.selectedIndex).toBe(0);
  });

  it('opens and shows all commands', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    expect(result.current.filteredCommands).toHaveLength(commands.length);
  });

  it('closes and resets state', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => result.current.open());
    act(() => result.current.setSearch('shopping'));
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.search).toBe('');
    expect(result.current.selectedIndex).toBe(0);
  });

  it('filters commands on search', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => result.current.open());
    act(() => result.current.setSearch('finance'));
    expect(result.current.filteredCommands).toHaveLength(2);
  });

  it('resets selection on search change', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => result.current.open());
    act(() => result.current.moveSelection('down'));
    act(() => result.current.moveSelection('down'));
    expect(result.current.selectedIndex).toBe(2);
    act(() => result.current.setSearch('event'));
    expect(result.current.selectedIndex).toBe(0);
  });

  it('moves selection down and wraps', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => result.current.open());
    // Move to end
    for (let i = 0; i < commands.length; i++) {
      act(() => result.current.moveSelection('down'));
    }
    // Should wrap to 0
    expect(result.current.selectedIndex).toBe(0);
  });

  it('moves selection up and wraps', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => result.current.open());
    act(() => result.current.moveSelection('up'));
    expect(result.current.selectedIndex).toBe(commands.length - 1);
  });

  it('executes selected command and closes', () => {
    const actions = createMockActions();
    const cmds = createCommands(actions);
    const { result } = renderHook(() => useCommandPalette(cmds));
    act(() => result.current.open());
    act(() => result.current.setSearch('finance'));
    act(() => result.current.executeSelected());
    expect(actions.openFinancePanel).toHaveBeenCalledOnce();
    expect(result.current.isOpen).toBe(false);
  });
});
