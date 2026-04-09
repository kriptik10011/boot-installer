/**
 * ArcEditMode — Edit mode overlay for arc card customization.
 * Uses ActionBar and PillList shapes + template constants.
 * All buttons follow the unified thin-border + colored-text pattern.
 */

import { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import type { ArcPosition } from '../utils/arcGeometry';
import { resolveArcConfig, getDataSource } from '../registry/dataSourceRegistry';
import type { DataSourceId, ZoneType } from '../registry/types';
import { MAX_DETAIL_SLOTS } from '../registry/types';
import { FONT_FAMILY, COLUMN_HEADER_STYLE, CARD_SIZES } from '../cardTemplate';
import { ActionBar, PillList } from '../shapes';
import type { PillListItem } from '../shapes';
import { DataSourcePicker } from './DataSourcePicker';

interface ArcEditModeProps {
  arc: ArcPosition;
  onDone: () => void;
}

const ARC_DOMAIN: Record<ArcPosition, string> = {
  north: 'week',
  east: 'meals',
  south: 'finance',
  west: 'inventory',
};

function getFreshConfig(arc: ArcPosition) {
  const current = useAppStore.getState().latticePrefs.arcCardConfig ?? {};
  return { all: current, resolved: resolveArcConfig(arc, current[arc]) };
}

export function ArcEditMode({ arc, onDone }: ArcEditModeProps) {
  const rawConfig = useAppStore((s) => s.latticePrefs.arcCardConfig?.[arc]);
  const setPrefs = useAppStore((s) => s.setLatticePrefs);
  const config = resolveArcConfig(arc, rawConfig);
  const domain = ARC_DOMAIN[arc];

  const [pickerTarget, setPickerTarget] = useState<{ zone: ZoneType; index?: number } | null>(null);

  const usedIds = useMemo(() => {
    const ids = new Set<DataSourceId>();
    ids.add(config.hero);
    for (const id of config.details) ids.add(id);
    return ids;
  }, [config.hero, config.details]);

  const updateConfig = (updates: Partial<typeof config>) => {
    const { all, resolved } = getFreshConfig(arc);
    setPrefs({
      arcCardConfig: { ...all, [arc]: { ...resolved, ...updates } },
    });
  };

  const handlePickerSelect = (id: DataSourceId) => {
    if (!pickerTarget) return;
    if (pickerTarget.zone === 'hero') {
      updateConfig({ hero: id });
    } else if (pickerTarget.index != null) {
      const { resolved: fresh } = getFreshConfig(arc);
      const newDetails = [...fresh.details];
      newDetails[pickerTarget.index] = id;
      updateConfig({ details: newDetails });
    }
    setPickerTarget(null);
  };

  const addDetailSlot = () => {
    const { resolved: fresh } = getFreshConfig(arc);
    if (fresh.details.length >= MAX_DETAIL_SLOTS) return;
    setPickerTarget({ zone: 'detail', index: fresh.details.length });
  };

  const removeDetailSlot = (index: number) => {
    const { resolved: fresh } = getFreshConfig(arc);
    const newDetails = fresh.details.filter((_, i) => i !== index);
    updateConfig({ details: newDetails });
  };

  const heroEntry = getDataSource(config.hero);

  if (pickerTarget) {
    return (
      <DataSourcePicker
        zone={pickerTarget.zone}
        currentId={pickerTarget.zone === 'hero' ? config.hero : config.details[pickerTarget.index ?? 0]}
        usedIds={usedIds}
        domain={domain}
        onSelect={handlePickerSelect}
        onClose={() => setPickerTarget(null)}
      />
    );
  }

  // Detail items for PillList
  const detailItems: PillListItem[] = config.details.map((id, index) => {
    const entry = getDataSource(id);
    return {
      label: entry?.label ?? id,
      badge: entry?.shape,
      onItemClick: () => setPickerTarget({ zone: 'detail', index }),
      onItemAction: () => removeDetailSlot(index),
      actionLabel: '-',
    };
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(8, 16, 32, 0.90)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: '15cqi 20cqi',
        zIndex: 10,
        fontFamily: FONT_FAMILY,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5cqi',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
        }}
      >
        {/* Hero slot — ActionBar with single button */}
        <div>
          <div style={COLUMN_HEADER_STYLE}>Hero</div>
          <ActionBar
            actions={[{
              label: heroEntry?.label ?? config.hero,
              onClick: () => setPickerTarget({ zone: 'hero' }),
              variant: 'violet',
            }]}
          />
        </div>

        {/* Detail slots — PillList */}
        <div>
          <div style={COLUMN_HEADER_STYLE}>
            Details {config.details.length}/{MAX_DETAIL_SLOTS}
          </div>

          {detailItems.length > 0 ? (
            <PillList items={detailItems} maxItems={MAX_DETAIL_SLOTS} />
          ) : (
            <div style={{ fontSize: `${CARD_SIZES.sectionContent}cqi`, color: '#475569', textAlign: 'center', padding: '0.5cqi 0' }}>
              No details. Tap + to add.
            </div>
          )}

          {config.details.length < MAX_DETAIL_SLOTS && (
            <ActionBar
              actions={[{
                label: '+ Add Data Source',
                onClick: addDetailSlot,
                variant: 'violet',
              }]}
            />
          )}
        </div>
      </div>

      {/* Done — ActionBar */}
      <div style={{ paddingTop: '1.5cqi', flexShrink: 0 }}>
        <ActionBar
          actions={[{
            label: 'Done',
            onClick: onDone,
            variant: 'violet',
          }]}
        />
      </div>
    </div>
  );
}
