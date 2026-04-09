/**
 * DetailZoneLayout — Renders detail zone data sources as siblings.
 * Returns a fragment of DataSourceSlot elements so CircularCardLayout's
 * addDividers can insert vertical dividers between them.
 *
 * V1: auto-layout in natural order. Future: column control via { id, column }.
 */

import { getDataSource } from '../registry/dataSourceRegistry';
import { DataSourceSlot } from './DataSourceSlot';
import type { DataSourceId, DataSourceEntry } from '../registry/types';

interface DetailZoneLayoutProps {
  details: readonly DataSourceId[];
}

export function DetailZoneLayout({ details }: DetailZoneLayoutProps) {
  if (details.length === 0) return null;

  const entries = details
    .map((id) => ({ id, entry: getDataSource(id) }))
    .filter((d): d is { id: DataSourceId; entry: DataSourceEntry } => d.entry != null);

  if (entries.length === 0) return null;

  // Return as fragment — siblings enable CircularCardLayout's addDividers
  return (
    <>
      {entries.map(({ id, entry }) => (
        <DataSourceSlot key={id} entry={entry} />
      ))}
    </>
  );
}
