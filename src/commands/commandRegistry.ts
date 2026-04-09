/**
 * Command Registry
 *
 * Central registry of all commands available in the command palette.
 * Each command has an id, label, category, optional keyboard shortcut, and action.
 */

import type { CommandActions } from '@/components/week/types';

export type CommandCategory = 'navigation' | 'panels' | 'actions' | 'view' | 'mode';

export interface Command {
  id: string;
  label: string;
  category: CommandCategory;
  shortcut?: string;
  keywords?: string[];
  action: () => void;
}

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  navigation: 'Navigation',
  panels: 'Panels',
  actions: 'Quick Actions',
  view: 'View',
  mode: 'Mode',
};

export const CATEGORY_ORDER: CommandCategory[] = [
  'actions',
  'panels',
  'navigation',
  'view',
  'mode',
];

export function getCategoryLabel(category: CommandCategory): string {
  return CATEGORY_LABELS[category];
}

export function createCommands(actions: CommandActions): Command[] {
  return [
    // Navigation
    {
      id: 'nav-prev-week',
      label: 'Previous Week',
      category: 'navigation',
      shortcut: 'Alt+\u2190',
      keywords: ['back', 'week', 'navigate'],
      action: actions.goToPreviousWeek,
    },
    {
      id: 'nav-next-week',
      label: 'Next Week',
      category: 'navigation',
      shortcut: 'Alt+\u2192',
      keywords: ['forward', 'week', 'navigate'],
      action: actions.goToNextWeek,
    },
    {
      id: 'nav-today',
      label: 'Go to Today',
      category: 'navigation',
      shortcut: 'Alt+T',
      keywords: ['today', 'current', 'now', 'this week'],
      action: actions.goToThisWeek,
    },

    // Panels
    {
      id: 'panel-events',
      label: 'Open Events',
      category: 'panels',
      shortcut: 'Alt+E',
      keywords: ['event', 'calendar', 'schedule'],
      action: actions.openEventPanel,
    },
    {
      id: 'panel-meals',
      label: 'Open Meals',
      category: 'panels',
      shortcut: 'Alt+M',
      keywords: ['meal', 'food', 'dinner', 'lunch', 'breakfast'],
      action: actions.openMealPanel,
    },
    {
      id: 'panel-shopping',
      label: 'Open Shopping List',
      category: 'panels',
      shortcut: 'Alt+S',
      keywords: ['shopping', 'groceries', 'buy', 'list'],
      action: actions.openShoppingPanel,
    },
    {
      id: 'panel-inventory',
      label: 'Open Inventory',
      category: 'panels',
      shortcut: 'Alt+I',
      keywords: ['inventory', 'pantry', 'stock', 'fridge'],
      action: actions.openInventoryPanel,
    },
    {
      id: 'panel-recipes',
      label: 'Open Recipe Hub',
      category: 'panels',
      shortcut: 'Alt+R',
      keywords: ['recipe', 'cook', 'cookbook'],
      action: actions.openRecipeHubPanel,
    },
    {
      id: 'panel-finance',
      label: 'Open Finance',
      category: 'panels',
      shortcut: 'Alt+F',
      keywords: ['finance', 'budget', 'money', 'bills', 'spending'],
      action: actions.openFinancePanel,
    },
    {
      id: 'panel-settings',
      label: 'Open Settings',
      category: 'panels',
      shortcut: 'Alt+,',
      keywords: ['settings', 'preferences', 'config'],
      action: actions.openSettingsPanel,
    },

    // Quick Actions
    {
      id: 'action-new-event',
      label: 'New Event',
      category: 'actions',
      keywords: ['create', 'add', 'event'],
      action: actions.addEvent,
    },
    {
      id: 'action-new-meal',
      label: 'New Meal',
      category: 'actions',
      keywords: ['create', 'add', 'meal', 'plan'],
      action: actions.addMeal,
    },
    {
      id: 'action-shopping-mode',
      label: 'Start Shopping Mode',
      category: 'actions',
      keywords: ['shopping', 'store', 'fullscreen', 'at the store'],
      action: actions.openShoppingMode,
    },
    {
      id: 'action-weekly-review',
      label: 'Start Weekly Review',
      category: 'actions',
      keywords: ['review', 'wizard', 'weekly', 'reflect'],
      action: actions.startWeeklyReview,
    },
    {
      id: 'action-what-can-i-cook',
      label: 'What Can I Cook?',
      category: 'actions',
      keywords: ['cook', 'pantry', 'ingredients', 'recipe', 'suggest'],
      action: actions.whatCanICook,
    },
    {
      id: 'action-add-transaction',
      label: 'Add Transaction',
      category: 'actions',
      keywords: ['spend', 'expense', 'bought', 'transaction', 'purchase'],
      action: actions.addTransaction,
    },
    {
      id: 'action-add-bill',
      label: 'Add Bill',
      category: 'actions',
      keywords: ['bill', 'due', 'pay', 'payment'],
      action: actions.addBill,
    },
    {
      id: 'action-check-budget',
      label: 'Check Budget',
      category: 'actions',
      keywords: ['budget', 'remaining', 'safe to spend', 'money left'],
      action: actions.checkBudget,
    },

    // View
    {
      id: 'view-traditional',
      label: 'Switch to Grid View',
      category: 'view',
      keywords: ['traditional', 'grid', 'cards', 'list'],
      action: actions.switchToTraditional,
    },
    {
      id: 'view-intelligent',
      label: 'Switch to Smart View',
      category: 'view',
      keywords: ['intelligent', 'smart', 'insights'],
      action: actions.switchToIntelligent,
    },

    // View - Finance
    {
      id: 'action-toggle-finance-view',
      label: 'Toggle Finance View (Classic / Living)',
      category: 'view',
      keywords: ['living', 'vitals', 'classic', 'view', 'finance', 'dashboard'],
      action: actions.toggleFinanceView,
    },

    // Mode
    {
      id: 'mode-planning-living',
      label: 'Toggle Planning / Living',
      category: 'mode',
      keywords: ['planning', 'living', 'mode'],
      action: actions.togglePlanningLiving,
    },
  ];
}

export function filterCommands(commands: Command[], search: string): Command[] {
  if (!search.trim()) return commands;
  const query = search.toLowerCase();
  return commands.filter((cmd) => {
    if (cmd.label.toLowerCase().includes(query)) return true;
    if (cmd.keywords?.some((kw) => kw.includes(query))) return true;
    return false;
  });
}

export function groupByCategory(commands: Command[]): Map<CommandCategory, Command[]> {
  const groups = new Map<CommandCategory, Command[]>();
  for (const category of CATEGORY_ORDER) {
    const cmds = commands.filter((c) => c.category === category);
    if (cmds.length > 0) {
      groups.set(category, cmds);
    }
  }
  return groups;
}
