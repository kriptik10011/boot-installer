/**
 * ArcCardRenderer — Unified renderer for all arc main cards.
 * Reads arcCardConfig from store, resolves registry entries, renders shapes.
 * Replaces WeekMainWidget, MealsMainWidget, FinanceMainWidget, InventoryMainWidget.
 *
 * Uses per-arc store selector to prevent all-arc re-render.
 * Each DataSourceSlot uses key={id} to prevent React hook order violations.
 * Long-press (2s) enters edit mode with progressive circular border glow.
 * Add-event/add-bill open inline forms within the card (no navigation).
 */

import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useRadialActions } from '../context/RadialActionsContext';
import type { ArcPosition } from '../utils/arcGeometry';
import { resolveArcConfig, getDataSource } from '../registry/dataSourceRegistry';
import { getAction } from '../registry/actionRegistry';
import { CircularCardLayout, ActionBar, InlineCardForm } from '../shapes';
import type { ActionItem } from '../shapes';
import { DataSourceSlot } from './DataSourceSlot';
import { useEditMode } from './useEditMode';
import { ArcEditMode } from './ArcEditMode';
import { useEventFormAdapter, useBillFormAdapter } from '../registry/adapters/formAdapters';
import { useNextMealActionParams } from '../registry/adapters/mealsAdapters';

interface ArcCardRendererProps {
  arc: ArcPosition;
}

type InlineFormType = 'event' | 'bill' | null;

// Map action IDs to RadialActions callbacks
function useActionCallbacks(
  setInlineForm: (type: InlineFormType) => void,
): Record<string, (() => void) | undefined> {
  const actions = useRadialActions();
  const mealParams = useNextMealActionParams();

  const startCookingCb = mealParams.recipeId != null && mealParams.mealId != null
    ? () => actions.startCooking(mealParams.recipeId!, mealParams.mealId!, mealParams.mealType)
    : undefined;

  return {
    'add-event': () => setInlineForm('event'),
    'add-bill': () => setInlineForm('bill'),
    'browse-recipes': actions.browseRecipes,
    'start-cooking': startCookingCb,
    'view-finances': actions.viewFinances,
    'view-inventory': actions.viewInventory,
    'view-week': actions.viewWeek,
    'add-meal': actions.addMeal,
  };
}

export function ArcCardRenderer({ arc }: ArcCardRendererProps) {
  const rawConfig = useAppStore((s) => s.latticePrefs.arcCardConfig?.[arc]);
  const config = resolveArcConfig(arc, rawConfig);
  const [inlineForm, setInlineForm] = useState<InlineFormType>(null);

  const actionCallbacks = useActionCallbacks(setInlineForm);
  const editMode = useEditMode();

  const heroEntry = getDataSource(config.hero);

  const actionItems: ActionItem[] = config.actions
    .map((actionId) => {
      const action = getAction(actionId);
      if (!action) return null;
      const onClick = actionCallbacks[actionId];
      if (!onClick) {
        if (import.meta.env.DEV) {
          console.warn(`[ArcCardRenderer] Action '${actionId}' has no callback — button hidden`);
        }
        return null;
      }
      return { label: action.label, onClick, variant: action.variant } as ActionItem;
    })
    .filter((a): a is ActionItem => a != null);

  const detailEntries = config.details
    .map((id) => ({ id, entry: getDataSource(id) }))
    .filter((d): d is { id: typeof d.id; entry: Exclude<typeof d.entry, undefined> } => d.entry != null);
  const hasDetails = detailEntries.length > 0;

  // Progressive circular border glow during hold
  const glowOpacity = editMode.pressProgress > 0 ? (editMode.pressProgress / 100) * 0.6 : 0;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        containerType: 'inline-size' as const,
        touchAction: editMode.isEditing ? 'none' : 'auto',
      }}
      onPointerDown={editMode.onPointerDown}
      onPointerUp={editMode.onPointerUp}
      onPointerMove={editMode.onPointerMove}
      onPointerCancel={editMode.onPointerCancel}
      onKeyDown={editMode.onKeyDown}
      tabIndex={0}
    >
      {/* Circular glow overlay — borderRadius matches parent clip */}
      {glowOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            pointerEvents: 'none',
            zIndex: 5,
            boxShadow: `inset 0 0 ${2 + editMode.pressProgress * 0.1}cqi rgba(168, 85, 247, ${glowOpacity})`,
          }}
        />
      )}

      {editMode.isEditing ? (
        <ArcEditMode arc={arc} onDone={editMode.exitEditMode} />
      ) : (
        <CircularCardLayout
          hero={
            <div style={{ transition: 'transform 0.3s ease', transform: inlineForm ? 'scale(0.85)' : 'scale(1)' }}>
              {heroEntry && <DataSourceSlot key={config.hero} entry={heroEntry} />}
              {actionItems.length > 0 && (
                <ActionBar
                  actions={actionItems.map((item) => {
                    const formType = item.label === 'Add Event' ? 'event' : item.label === 'Add Bill' ? 'bill' : null;
                    if (formType && inlineForm === formType) {
                      return {
                        ...item,
                        expanded: true,
                        expandedContent: <InlineFormSlot type={formType} onClose={() => setInlineForm(null)} />,
                      };
                    }
                    return item;
                  })}
                  className="mt-[1cqi]"
                />
              )}
            </div>
          }
          pillZone={hasDetails
            ? detailEntries.map(({ id, entry }) => (
                <div key={id} style={{
                  opacity: inlineForm ? 0.1 : 1,
                  transform: inlineForm ? 'scale(0.8)' : 'scale(1)',
                  transition: 'all 0.3s ease',
                }}>
                  <DataSourceSlot entry={entry} />
                </div>
              ))
            : undefined}
        />
      )}
    </div>
  );
}

// Separate component to satisfy React hook rules (hooks must be called unconditionally)
function InlineFormSlot({ type, onClose }: { type: 'event' | 'bill'; onClose: () => void }) {
  return type === 'event'
    ? <EventFormSlot onClose={onClose} />
    : <BillFormSlot onClose={onClose} />;
}

function EventFormSlot({ onClose }: { onClose: () => void }) {
  const formProps = useEventFormAdapter(onClose);
  return <InlineCardForm {...formProps} />;
}

function BillFormSlot({ onClose }: { onClose: () => void }) {
  const formProps = useBillFormAdapter(onClose);
  return <InlineCardForm {...formProps} />;
}
