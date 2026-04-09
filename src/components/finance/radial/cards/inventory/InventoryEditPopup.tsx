/**
 * InventoryEditForm — Form content for editing inventory item properties.
 * Pure props, zero hooks (except useMemo for computed total).
 * Renders inside CircularCardLayout formZone (no backdrop, no positioning).
 */

import { useMemo } from 'react';
import { COMMON_UNITS } from '@/components/panels/inventory/InventoryForms';
import { isLegacyScale } from '@/utils/inventoryHelpers';
import type { InventoryItem, InventoryCategory, StorageLocation } from '@/api/client';
import { FONT_FAMILY, TEXT_COLORS, SUB_ARC_ACCENTS } from '../../cardTemplate';
import { ScrollZone, ButtonGroup } from '../../shapes';
import { ActionBar } from '../../shapes/ActionBar';

const ACCENT = SUB_ARC_ACCENTS.inventory;

const LOCATIONS: { value: StorageLocation; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'pantry', label: 'Pantry' },
  { value: 'freezer', label: 'Freezer' },
];

export interface EditForm {
  name: string;
  category_id: number | null;
  location: StorageLocation;
  quantity: number;
  unit: string | null;
  package_size: number | null;
  package_unit: string | null;
  packages_count: number | null;
  adjustment_step: number | null;
  expiration_date: string | null;
  expiration_auto_filled: boolean;
  notes: string | null;
}

const inputStyle = {
  width: '100%',
  padding: '0.6cqi 1cqi',
  fontSize: '1.7cqi',
  color: '#e2e8f0',
  backgroundColor: 'rgba(51, 65, 85, 0.4)',
  border: '1px solid rgba(71, 85, 105, 0.5)',
  borderRadius: '1cqi',
  outline: 'none',
  fontFamily: FONT_FAMILY,
} as const;

const labelStyle = {
  fontSize: '1.4cqi',
  color: TEXT_COLORS.secondary,
  fontFamily: FONT_FAMILY,
  marginBottom: '0.2cqi',
  display: 'block' as const,
} as const;

interface EditFormProps {
  editItem: InventoryItem;
  editForm: EditForm;
  categories: InventoryCategory[];
  updateField: <K extends keyof EditForm>(key: K, value: EditForm[K]) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: (item: InventoryItem) => void;
  onOpenNext: () => void;
  isSaving: boolean;
}

/** Renders inside CircularCardLayout formZone — no wrapper, no backdrop */
export function InventoryEditForm({
  editItem,
  editForm,
  categories,
  updateField,
  onSave,
  onCancel,
  onDelete,
  onOpenNext,
  isSaving,
}: EditFormProps) {
  const legacy = isLegacyScale(editItem);
  const MB = '0.8cqi';

  const countTotal = useMemo(() => {
    const pkgCount = editForm.packages_count ?? 1;
    const pkgSize = editForm.package_size;
    if (pkgSize && pkgCount > 1) {
      return `${pkgCount * pkgSize} ${editForm.package_unit ?? editForm.unit ?? ''}`.trim();
    }
    return null;
  }, [editForm.packages_count, editForm.package_size, editForm.package_unit, editForm.unit]);

  const showOpenNext = (editForm.quantity ?? 0) <= 0
    && (editForm.packages_count ?? 0) > 1;

  return (
    <>
      <ScrollZone paddingX="6cqi" paddingBottom="4cqi">
        {/* Name */}
        <div style={{ marginBottom: MB }}>
          <span style={labelStyle}>Name</span>
          <input type="text" value={editForm.name}
            onChange={(e) => updateField('name', e.target.value)} style={inputStyle} />
        </div>

        {/* Category */}
        <div style={{ marginBottom: MB }}>
          <span style={labelStyle}>Category</span>
          <ButtonGroup
            options={[{ value: '', label: 'None' }, ...categories.map((cat) => ({ value: String(cat.id), label: cat.name }))]}
            value={editForm.category_id != null ? String(editForm.category_id) : ''}
            onChange={(v) => updateField('category_id', v ? Number(v) : null)}
            size="sm" wrap accentColor={ACCENT}
          />
        </div>

        {/* Location toggle */}
        <div style={{ marginBottom: MB }}>
          <span style={labelStyle}>Location</span>
          <ButtonGroup
            options={LOCATIONS.map(({ value, label }) => ({ value, label }))}
            value={editForm.location}
            onChange={(v) => updateField('location', v as StorageLocation)}
            size="sm" accentColor={ACCENT}
          />
        </div>

        {/* Quantity + Unit */}
        <div style={{ display: 'flex', gap: '0.4cqi', marginBottom: MB }}>
          <div style={{ flex: 1 }}>
            <span style={labelStyle}>Quantity</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4cqi' }}>
              <input type="number" min="0" max={legacy ? 100 : undefined} step="any"
                value={editForm.quantity}
                onChange={(e) => updateField('quantity', Number(e.target.value) || 0)}
                style={{ ...inputStyle, flex: 1 }} />
              {legacy && <span style={{ fontSize: '1.7cqi', color: TEXT_COLORS.secondary, fontFamily: FONT_FAMILY }}>%</span>}
            </div>
          </div>
          {!legacy && (
            <div style={{ flex: 1 }}>
              <span style={labelStyle}>Unit</span>
              <ButtonGroup
                options={[{ value: '', label: 'None' }, ...COMMON_UNITS.map((u) => ({ value: u.value, label: u.label }))]}
                value={editForm.unit ?? ''}
                onChange={(v) => updateField('unit', v || null)}
                size="sm" wrap accentColor={ACCENT}
              />
            </div>
          )}
        </div>

        {/* Open next */}
        {showOpenNext && (
          <button onClick={onOpenNext} style={{
            width: '100%', padding: '0.6cqi', fontSize: '1.5cqi',
            color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '1cqi',
            cursor: 'pointer', fontFamily: FONT_FAMILY, fontWeight: 600, marginBottom: MB,
          }}>Open Next Package</button>
        )}

        {/* Package size + unit */}
        <div style={{ display: 'flex', gap: '0.4cqi', marginBottom: MB }}>
          <div style={{ flex: 1 }}>
            <span style={labelStyle}>Pkg Size</span>
            <input type="number" min="0" step="any"
              value={editForm.package_size ?? ''}
              onChange={(e) => updateField('package_size', e.target.value === '' ? null : Number(e.target.value))}
              placeholder="Size" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={labelStyle}>Pkg Unit</span>
            <ButtonGroup
              options={[{ value: '', label: 'None' }, ...COMMON_UNITS.map((u) => ({ value: u.value, label: u.label }))]}
              value={editForm.package_unit ?? ''}
              onChange={(v) => updateField('package_unit', v || null)}
              size="sm" wrap accentColor={ACCENT}
            />
          </div>
        </div>

        {/* Packages count */}
        <div style={{ marginBottom: MB }}>
          <span style={labelStyle}>Packages</span>
          <input type="number" min="0"
            value={editForm.packages_count ?? ''}
            onChange={(e) => updateField('packages_count', e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
            style={inputStyle} />
        </div>

        {countTotal && (
          <div style={{ fontSize: '1.4cqi', color: TEXT_COLORS.secondary, fontFamily: FONT_FAMILY, marginBottom: MB, textAlign: 'right' }}>
            Total: {countTotal}
          </div>
        )}

        {/* Step size */}
        <div style={{ marginBottom: MB }}>
          <span style={labelStyle}>Step Size</span>
          <input type="number" min="0.0001" step="any"
            value={editForm.adjustment_step ?? ''}
            onChange={(e) => updateField('adjustment_step', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={legacy ? '10' : '1'} style={inputStyle} />
        </div>

        {/* Expiration */}
        <div style={{ marginBottom: MB }}>
          <span style={labelStyle}>Expiration{editForm.expiration_auto_filled ? ' (Auto)' : ''}</span>
          <input type="date" value={editForm.expiration_date ?? ''}
            onChange={(e) => {
              updateField('expiration_date', e.target.value || null);
              if (editForm.expiration_auto_filled) updateField('expiration_auto_filled', false);
            }}
            style={inputStyle} />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: MB }}>
          <span style={labelStyle}>Notes</span>
          <textarea value={editForm.notes ?? ''}
            onChange={(e) => updateField('notes', e.target.value || null)}
            rows={2} style={{ ...inputStyle, resize: 'none' as const }} />
        </div>
      </ScrollZone>
      <ActionBar actions={[
        { label: 'Delete', variant: 'slate' as const, onClick: () => onDelete(editItem) },
        { label: 'Save', variant: 'emerald' as const, onClick: onSave },
        { label: 'Back', variant: 'slate' as const, onClick: onCancel },
      ]} />
    </>
  );
}

// Re-export for backward compat with old import name
export { InventoryEditForm as EditPopup };
