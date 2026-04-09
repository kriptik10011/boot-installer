/**
 * Action Registry — maps ActionIds to button metadata.
 * Actions are rendered by ActionBar in the action zone of arc cards.
 */

import type { ActionEntry, ActionId } from './types';

const ACTION_REGISTRY = new Map<ActionId, ActionEntry>([
  ['add-event', { id: 'add-event', label: 'Add Event', domain: 'week', variant: 'cyan' }],
  ['add-bill', { id: 'add-bill', label: 'Add Bill', domain: 'week', variant: 'amber' }],
  ['browse-recipes', { id: 'browse-recipes', label: 'Browse Recipes', domain: 'meals', variant: 'slate' }],
  ['start-cooking', { id: 'start-cooking', label: 'Cook', domain: 'meals', variant: 'emerald' }],
  ['view-finances', { id: 'view-finances', label: 'View Finances', domain: 'finance', variant: 'violet' }],
  ['view-inventory', { id: 'view-inventory', label: 'View Inventory', domain: 'inventory', variant: 'slate' }],
  ['view-week', { id: 'view-week', label: 'View Week', domain: 'week', variant: 'slate' }],
  ['add-meal', { id: 'add-meal', label: 'Plan Meal', domain: 'meals', variant: 'slate' }],
]);

export function getAction(id: ActionId): ActionEntry | undefined {
  return ACTION_REGISTRY.get(id);
}

export function getRegisteredActions(): ActionEntry[] {
  return Array.from(ACTION_REGISTRY.values());
}

export function getActionsForDomain(domain: string): ActionEntry[] {
  return getRegisteredActions().filter((a) => a.domain === domain);
}
