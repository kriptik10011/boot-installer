/**
 * Hint Catalog — static registry of all contextual hints.
 * Pure data, no React. Add hints by appending to HINT_CATALOG.
 */

export type HintContext = 'radial-root' | 'arc-card' | 'junction-card' | 'settings';
// 'arc-card' and 'junction-card' contexts reserved for Phases 3-5.
export type HintTrigger = 'first-radial-visit' | 'first-arc-open' | 'early-visits'
  | 'settings-lattice' | 'settings-domain' | 'always';
export type HintVariant = 'info' | 'warning';

export interface HintDefinition {
  id: string;
  message: string;
  context: HintContext;
  trigger: HintTrigger;
  /** Auto-dismiss after N ms (0 = manual dismiss only) */
  autoDismissMs: number;
  variant: HintVariant;
  /** Lower = shown first when multiple are eligible */
  priority: number;
}

export const HINT_CATALOG: readonly HintDefinition[] = [
  // Tier 1: First launch (first 3 visits)
  {
    id: 'right-click-back',
    message: 'Right-click anywhere to go back.',
    context: 'radial-root',
    trigger: 'first-radial-visit',
    autoDismissMs: 5000,
    variant: 'info',
    priority: 1,
  },
  {
    id: 'keyboard-nav',
    message: 'Press 1-4 or WASD to jump to sections. H resets the camera.',
    context: 'radial-root',
    trigger: 'first-radial-visit',
    autoDismissMs: 6000,
    variant: 'info',
    priority: 3,
  },
  {
    id: 'drag-rotate',
    message: 'Click and drag to rotate the lattice.',
    context: 'radial-root',
    trigger: 'first-radial-visit',
    autoDismissMs: 5000,
    variant: 'info',
    priority: 4,
  },

  // Tier 4: Settings disclaimers (manual dismiss)
  {
    id: 'gpu-warning',
    message: 'Lattice effects use your GPU. Lower quality in Shaders if it feels slow.',
    context: 'settings',
    trigger: 'settings-lattice',
    autoDismissMs: 0,
    variant: 'warning',
    priority: 1,
  },
  {
    id: 'lattice-wip',
    message: 'Lattice customization is a work in progress. Reset restores safe defaults.',
    context: 'settings',
    trigger: 'settings-domain',
    autoDismissMs: 0,
    variant: 'warning',
    priority: 2,
  },
  {
    id: 'link-toggles',
    message: 'Global applies one value everywhere. Per Domain lets each arc differ.',
    context: 'settings',
    trigger: 'settings-domain',
    autoDismissMs: 6000,
    variant: 'info',
    priority: 3,
  },
];
