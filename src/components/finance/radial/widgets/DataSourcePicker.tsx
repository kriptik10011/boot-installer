/**
 * DataSourcePicker — Scrollable picker for selecting a data source.
 * Uses OverlayPanel for header, COLUMN_HEADER_STYLE for sections,
 * and ActionBar VARIANT pattern for entry styling.
 */

import { getRegisteredSources, getFeaturedSources, getSourcesForDomain } from '../registry/dataSourceRegistry';
import type { DataSourceEntry, DataSourceId, ZoneType } from '../registry/types';
import { FONT_FAMILY, CARD_SIZES, BUTTON_MIN_TEXT, COLUMN_HEADER_STYLE } from '../cardTemplate';
import { VARIANT } from '../shapes/ActionBar';
import { OverlayPanel } from '../shapes';

interface DataSourcePickerProps {
  zone: ZoneType;
  currentId?: DataSourceId;
  usedIds?: Set<DataSourceId>;
  domain: string;
  onSelect: (id: DataSourceId) => void;
  onClose: () => void;
}

const SHAPE_COLORS: Record<string, string> = {
  HeroMetric: '#22d3ee',
  PillList: '#10b981',
  ProgressBar: '#f59e0b',
  GaugeRing: '#a78bfa',
  StatGrid: '#3b82f6',
};

const SHAPE_SHORT: Record<string, string> = {
  HeroMetric: 'Hero',
  PillList: 'List',
  ProgressBar: 'Bar',
  GaugeRing: 'Ring',
  StatGrid: 'Grid',
};

function PickerEntry({
  entry,
  onSelect,
  isCurrent,
  isUsed,
}: {
  entry: DataSourceEntry;
  onSelect: (id: DataSourceId) => void;
  isCurrent?: boolean;
  isUsed?: boolean;
}) {
  const shapeColor = SHAPE_COLORS[entry.shape] ?? '#94a3b8';
  const v = isCurrent ? VARIANT.violet : VARIANT.slate;

  return (
    <button
      onClick={() => onSelect(entry.id)}
      className="font-semibold"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1cqi',
        padding: '0.5cqi 2cqi',
        background: 'transparent',
        border: `1px solid ${v.border}`,
        borderRadius: '9999px',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        fontFamily: FONT_FAMILY,
        opacity: isUsed && !isCurrent ? 0.5 : 1,
      }}
    >
      {/* Shape badge */}
      <span
        style={{
          fontSize: `${CARD_SIZES.sectionContent * 0.75}cqi`,
          color: shapeColor,
          border: `1px solid ${shapeColor}30`,
          borderRadius: '9999px',
          padding: '0.2cqi 0.8cqi',
          flexShrink: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
          background: 'transparent',
        }}
      >
        {SHAPE_SHORT[entry.shape] ?? entry.shape}
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1cqi', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: `${BUTTON_MIN_TEXT}cqi`, color: isCurrent ? v.text : '#cbd5e1', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.label}
          {isUsed && !isCurrent && (
            <span style={{ color: '#64748b', marginLeft: '0.5cqi' }}>(in use)</span>
          )}
        </span>
        <span style={{ fontSize: `${CARD_SIZES.sectionContent * 0.75}cqi`, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 400 }}>
          {entry.description}
        </span>
      </div>
    </button>
  );
}

export function DataSourcePicker({ zone, currentId, usedIds, domain, onSelect, onClose }: DataSourcePickerProps) {
  const allSources = getRegisteredSources().filter((s) => s.zones.includes(zone));
  const featured = getFeaturedSources().filter((s) => s.zones.includes(zone));
  const domainSources = getSourcesForDomain(domain).filter(
    (s) => s.zones.includes(zone) && !featured.some((f) => f.id === s.id),
  );
  const otherSources = allSources.filter(
    (s) => s.domain !== domain && !featured.some((f) => f.id === s.id),
  );

  return (
    <OverlayPanel title="Data Source" onBack={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2cqi' }}>
        {featured.length > 0 && (
          <Section label="Recommended">
            {featured.map((entry) => (
              <PickerEntry key={entry.id} entry={entry} onSelect={onSelect} isCurrent={entry.id === currentId} isUsed={usedIds?.has(entry.id)} />
            ))}
          </Section>
        )}

        {domainSources.length > 0 && (
          <Section label={domain.charAt(0).toUpperCase() + domain.slice(1)}>
            {domainSources.map((entry) => (
              <PickerEntry key={entry.id} entry={entry} onSelect={onSelect} isCurrent={entry.id === currentId} isUsed={usedIds?.has(entry.id)} />
            ))}
          </Section>
        )}

        {otherSources.length > 0 && (
          <Section label="Other">
            {otherSources.map((entry) => (
              <PickerEntry key={entry.id} entry={entry} onSelect={onSelect} isCurrent={entry.id === currentId} isUsed={usedIds?.has(entry.id)} />
            ))}
          </Section>
        )}
      </div>
    </OverlayPanel>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5cqi' }}>
      <div style={COLUMN_HEADER_STYLE}>{label}</div>
      {children}
    </div>
  );
}
