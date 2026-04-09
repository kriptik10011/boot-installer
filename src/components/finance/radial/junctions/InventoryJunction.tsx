/**
 * InventoryJunction — Sub-arc SW junction widgets for inventory quick add and bulk add.
 * Extracted from JunctionWidgets.tsx.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { useInventoryItems, useCreateInventoryItem, useBulkCreateInventoryItems } from '@/hooks/useInventory';
import { useInventoryIntelligence } from '@/hooks/useInventoryIntelligence';
import type { StorageLocation, InventoryItemCreate } from '@/api/inventory';
import {
  CARD_SIZES,
  BUTTON_MIN_TEXT,
  PILL_COLUMN_STYLE,
  PILL_RADIUS_SINGLE,
} from '../cardTemplate';
import { ButtonGroup } from '../shapes';
import { arcPath } from '../cards/shared/arcHelpers';
import { lerpHex } from '../utils/bezelHelpers';

// ---- Inventory Add (sub-arc junction) ----

const INV_ITEM_TEXT = 2.4;
const INV_INPUT_TEXT = 2.8;

const LOCATION_OPTIONS: { value: StorageLocation; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'pantry', label: 'Pantry' },
  { value: 'freezer', label: 'Freezer' },
];

function InventoryQuickAddWidget() {
  const [name, setName] = useState('');
  const [location, setLocation] = useState<StorageLocation>('fridge');
  const { data: items } = useInventoryItems();
  const intelligence = useInventoryIntelligence();
  const createItem = useCreateInventoryItem();

  const totalItems = intelligence.activeItemCount;

  const handleAdd = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const trimmed = name.trim();
    if (!trimmed) return;
    createItem.mutate(
      { name: trimmed, quantity: 1, location },
      { onSuccess: () => setName('') },
    );
  }, [name, location, createItem]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation(); // prevent dashboard keyboard nav
    if (e.key === 'Enter') {
      const trimmed = name.trim();
      if (!trimmed) return;
      createItem.mutate(
        { name: trimmed, quantity: 1, location },
        { onSuccess: () => setName('') },
      );
    }
  }, [name, location, createItem]);

  return (
    <div className="flex flex-col h-full w-full" style={{ padding: '8cqi' }}>
      {/* Header */}
      <div className="flex flex-col items-center shrink-0" style={{ paddingBottom: '0.5cqi' }}>
        <span
          className="font-bold tracking-wider uppercase"
          style={{ fontSize: `${CARD_SIZES.labelText}cqi`, color: '#f59e0b', fontFamily: "'Space Grotesk', system-ui" }}
        >
          {totalItems} items
        </span>
      </div>

      {/* Name input — F-2: rounded-full */}
      <div className="shrink-0" style={{ paddingBottom: '0.8cqi' }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          placeholder="Item name..."
          className="w-full rounded-full bg-slate-800/60 border border-amber-500/20 text-slate-200 placeholder-slate-500 outline-none focus:border-amber-500/50 transition-colors"
          style={{
            fontSize: `${INV_INPUT_TEXT}cqi`,
            padding: '0.8cqi 1.2cqi',
            fontFamily: "'Space Grotesk', system-ui",
          }}
        />
      </div>

      {/* Location buttons — ButtonGroup shape */}
      <div className="shrink-0" style={{ paddingBottom: '0.8cqi' }}>
        <ButtonGroup
          options={LOCATION_OPTIONS.map((loc) => ({ label: loc.label, value: loc.value }))}
          value={location}
          onChange={(v) => setLocation(v as StorageLocation)}
          size="sm"
        />
      </div>

      {/* Add button — F-3: padding reduction */}
      <div className="flex justify-center shrink-0" style={{ paddingBottom: '1cqi' }}>
        <button
          onClick={handleAdd}
          disabled={!name.trim() || createItem.isPending}
          className="font-semibold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-colors disabled:opacity-40"
          style={{
            fontSize: `${BUTTON_MIN_TEXT}cqi`,
            fontFamily: "'Space Grotesk', system-ui",
            padding: '0.4cqi 2cqi',
          }}
        >
          {createItem.isPending ? 'Adding...' : 'Add'}
        </button>
      </div>

      {/* Recent items */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="flex flex-col" style={{ gap: '0.4cqi', padding: '0 0.5cqi' }}>
          {(items ?? []).slice(0, 5).map((item) => (
            <div key={item.id} className="flex items-center" style={{ gap: '0.6cqi' }}>
              <span
                className="rounded-full bg-amber-500/30 flex-shrink-0"
                style={{ width: `${INV_ITEM_TEXT * 0.5}cqi`, height: `${INV_ITEM_TEXT * 0.5}cqi` }}
              />
              <span
                className="text-slate-400 truncate"
                style={{ fontSize: `${INV_ITEM_TEXT}cqi`, lineHeight: 1.3 }}
              >
                {item.name}
              </span>
              <span
                className="text-slate-600 ml-auto flex-shrink-0"
                style={{ fontSize: `${INV_ITEM_TEXT * 0.8}cqi` }}
              >
                {item.location}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Bulk CSV parser ----

/** Map category string to StorageLocation */
function categoryToLocation(cat: string): StorageLocation {
  const lower = cat.toLowerCase().trim();
  if (lower === 'fridge' || lower === 'refrigerator') return 'fridge';
  if (lower === 'freezer') return 'freezer';
  return 'pantry'; // pantry, medicine, spices, etc. all map to pantry
}

/** Parse MM/DD/YYYY or MM/DD/YY date to YYYY-MM-DD, returns null for "Unknown" etc. */
function parseExpirationDate(raw: string): string | null {
  const cleaned = raw.replace(/\(Est\.\)/gi, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'unknown') return null;
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  const year = yyyy.length === 2 ? `20${yyyy}` : yyyy;
  return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/** Parse quantity string like "12 packets" → { qty: 12, unit: "packets" } */
function parseQuantityField(raw: string): { qty: number; unit: string | null } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (match) {
    const qty = parseFloat(match[1]);
    const unit = match[2].trim() || null;
    return { qty: isNaN(qty) ? 1 : qty, unit };
  }
  return { qty: 1, unit: null };
}

/** Detect if text looks like CSV (has commas on most lines) */
function isCSVFormat(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;
  const commaLines = lines.filter((l) => l.includes(','));
  return commaLines.length / lines.length > 0.5;
}

/** Header row patterns to skip */
const HEADER_PATTERNS = /^category\s*,\s*item/i;

/** Detect if text looks like JSON (starts with [ or {) */
function isJSONFormat(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('[') || trimmed.startsWith('{');
}

/** Try parsing JSON inventory items. Returns null on failure. */
function parseJSONItems(text: string): InventoryItemCreate[] | null {
  try {
    const raw = JSON.parse(text.trim());
    const entries: unknown[] = Array.isArray(raw) ? raw : [raw];
    const items: InventoryItemCreate[] = [];
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null) continue;
      const obj = entry as Record<string, unknown>;
      const name = String(obj.name ?? obj.item ?? obj.item_name ?? '').trim();
      if (!name) continue;

      // Bug 1: quantity may be string like "12 packets" — parse with parseQuantityField
      let quantity = 1;
      let unit: string | null = null;
      if (typeof obj.quantity === 'number') {
        quantity = obj.quantity;
        unit = typeof obj.unit === 'string' ? obj.unit : null;
      } else if (typeof obj.quantity === 'string') {
        const parsed = parseQuantityField(obj.quantity);
        quantity = parsed.qty;
        unit = parsed.unit ?? (typeof obj.unit === 'string' ? obj.unit : null);
      } else {
        unit = typeof obj.unit === 'string' ? obj.unit : null;
      }

      // Bug 4: category → location mapping (use categoryToLocation for non-standard categories)
      let location: StorageLocation = 'pantry';
      if (['fridge', 'pantry', 'freezer'].includes(String(obj.location ?? ''))) {
        location = String(obj.location) as StorageLocation;
      } else if (typeof obj.category === 'string' && obj.category.trim()) {
        location = categoryToLocation(obj.category);
      }

      // Bug 2: support "expiration" field name in addition to existing ones
      const expRaw = String(obj.expiration_date ?? obj.expiration ?? obj.expiry ?? obj.exp ?? '').trim();
      let expirationDate: string | null = null;
      if (expRaw) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(expRaw)) {
          expirationDate = expRaw;
        } else {
          expirationDate = parseExpirationDate(expRaw);
        }
      }

      // Bug 3: Parse size into package_size/package_unit/package_label
      let package_size: number | null = null;
      let package_unit: string | null = null;
      let package_label: string | null = null;
      if (typeof obj.size === 'string' && obj.size.trim()) {
        const sizeStr = obj.size.trim();
        const sizeParsed = parseQuantityField(sizeStr);
        if (sizeParsed.qty > 0 && sizeParsed.unit) {
          package_size = sizeParsed.qty;
          package_unit = sizeParsed.unit;
          package_label = sizeStr;
        } else {
          // Non-numeric size like "Big Pieces" → store as label only
          package_label = sizeStr;
        }
      }

      // Bug 5: filter "Safe" notes like CSV path does
      const rawNote = typeof (obj.notes ?? obj.note) === 'string'
        ? String(obj.notes ?? obj.note).trim()
        : null;
      const noteParts: string[] = [];
      if (rawNote && rawNote.toLowerCase() !== 'safe') noteParts.push(rawNote);

      // Bug 6: non-standard categories → notes (like CSV path)
      if (typeof obj.category === 'string' && obj.category.trim()) {
        const lowerCat = obj.category.trim().toLowerCase();
        if (lowerCat !== 'pantry' && lowerCat !== 'fridge' && lowerCat !== 'freezer') {
          noteParts.push(`Category: ${obj.category.trim()}`);
        }
      }
      const notes = noteParts.length > 0 ? noteParts.join('; ') : null;

      items.push({
        name, quantity, unit, location,
        expiration_date: expirationDate, notes,
        package_size, package_unit, package_label,
      });
    }
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

/** Parse JSON, CSV, or simple text into InventoryItemCreate[] */
function parseBulkText(text: string, fallbackLocation: StorageLocation): InventoryItemCreate[] {
  // Try JSON first
  if (isJSONFormat(text)) {
    const jsonItems = parseJSONItems(text);
    if (jsonItems) return jsonItems;
    // Fall through to CSV/simple if JSON parsing failed
  }

  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const csv = isCSVFormat(text);

  if (!csv) {
    // Simple mode: one item name per line
    return lines.map((line) => ({
      name: line.trim(),
      quantity: 1,
      location: fallbackLocation,
    }));
  }

  // CSV mode: Category,Item,Size,Quantity,Expiration,Note
  const items: InventoryItemCreate[] = [];
  for (const line of lines) {
    if (HEADER_PATTERNS.test(line)) continue; // skip header row

    const cols = line.split(',').map((c) => c.trim());
    if (cols.length < 2) continue; // need at least category + item

    const category = cols[0] ?? '';
    const itemName = cols[1] ?? '';
    const size = cols[2] ?? '';
    const quantityRaw = cols[3] ?? '1';
    const expirationRaw = cols[4] ?? '';
    const note = cols[5] ?? '';

    if (!itemName) continue;

    const location = categoryToLocation(category);
    const { qty, unit } = parseQuantityField(quantityRaw);
    const expirationDate = parseExpirationDate(expirationRaw);

    // Parse size into package fields instead of appending to name
    let package_size: number | null = null;
    let package_unit: string | null = null;
    let package_label: string | null = null;
    if (size) {
      const sizeParsed = parseQuantityField(size);
      if (sizeParsed.qty > 0 && sizeParsed.unit) {
        package_size = sizeParsed.qty;
        package_unit = sizeParsed.unit;
        package_label = size;
      } else {
        package_label = size;
      }
    }

    // Build notes from Note column + category if non-standard
    const noteParts: string[] = [];
    if (note && note.toLowerCase() !== 'safe') noteParts.push(note);
    const lowerCat = category.toLowerCase();
    if (lowerCat !== 'pantry' && lowerCat !== 'fridge' && lowerCat !== 'freezer' && category) {
      noteParts.push(`Category: ${category}`);
    }
    const notes = noteParts.length > 0 ? noteParts.join('; ') : null;

    items.push({
      name: itemName,
      quantity: qty,
      unit,
      location,
      expiration_date: expirationDate,
      notes,
      package_size,
      package_unit,
      package_label,
    });
  }

  return items;
}

function InventoryBulkAddWidget() {
  const [text, setText] = useState('');
  const [fallbackLocation, setFallbackLocation] = useState<StorageLocation>('pantry');
  const [result, setResult] = useState<{ created: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bulkCreate = useBulkCreateInventoryItems();

  const parsed = parseBulkText(text, fallbackLocation);
  const parsedCount = parsed.length;
  const isJSON = isJSONFormat(text);
  const isCSV = !isJSON && isCSVFormat(text);

  const handleBulkAdd = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (parsed.length === 0) return;
    setError(null);
    setResult(null);
    bulkCreate.mutate(parsed, {
      onSuccess: (data) => {
        setText('');
        setResult({ created: data.total_created, failed: data.failed.length });
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Bulk add failed');
      },
    });
  }, [parsed, bulkCreate]);

  return (
    <div className="flex flex-col h-full w-full" style={{ padding: '3cqi 10cqi' }}>
      {/* Header */}
      <div className="flex flex-col items-center shrink-0" style={{ paddingTop: '1cqi', paddingBottom: '0.5cqi' }}>
        <span
          className="font-bold tracking-wider uppercase"
          style={{ fontSize: `${CARD_SIZES.labelText}cqi`, color: '#f59e0b', fontFamily: "'Space Grotesk', system-ui" }}
        >
          Bulk Add
        </span>
        {parsedCount > 0 && (
          <span className="text-slate-500" style={{ fontSize: `${CARD_SIZES.statusText}cqi` }}>
            {parsedCount} item{parsedCount !== 1 ? 's' : ''} {isJSON ? '(JSON)' : isCSV ? '(CSV)' : '(list)'}
          </span>
        )}
      </div>

      {/* Error/result feedback */}
      {error && (
        <div className="flex items-center justify-center shrink-0" style={{ paddingBottom: '0.5cqi' }}>
          <span style={{ fontSize: `${INV_ITEM_TEXT}cqi`, color: '#d97706' }}>{error}</span>
        </div>
      )}
      {result && (
        <div className="flex items-center justify-center shrink-0" style={{ paddingBottom: '0.5cqi' }}>
          <span className="text-green-400" style={{ fontSize: `${INV_ITEM_TEXT}cqi` }}>
            {result.created} added{result.failed > 0 ? `, ${result.failed} failed` : ''}
          </span>
        </div>
      )}

      {/* Location fallback (only shown for simple list mode — hidden for CSV/JSON) */}
      {!isCSV && !isJSON && (
        <div className="shrink-0" style={{ paddingBottom: '0.8cqi' }}>
          <ButtonGroup
            options={LOCATION_OPTIONS.map((loc) => ({ label: loc.label, value: loc.value }))}
            value={fallbackLocation}
            onChange={(v) => setFallbackLocation(v as StorageLocation)}
            size="sm"
          />
        </div>
      )}

      {/* Format hint when CSV or JSON detected */}
      {isCSV && parsedCount > 0 && (
        <div className="flex items-center justify-center shrink-0" style={{ paddingBottom: '0.5cqi' }}>
          <span className="text-amber-500/60" style={{ fontSize: `${INV_ITEM_TEXT * 0.9}cqi` }}>
            CSV detected — locations from Category column
          </span>
        </div>
      )}
      {isJSON && parsedCount > 0 && (
        <div className="flex items-center justify-center shrink-0" style={{ paddingBottom: '0.5cqi' }}>
          <span className="text-amber-500/60" style={{ fontSize: `${INV_ITEM_TEXT * 0.9}cqi` }}>
            JSON detected — locations from each item
          </span>
        </div>
      )}

      {/* Text area */}
      <div className="flex-1 min-h-0" style={{ paddingBottom: '0.8cqi' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={'Paste CSV, JSON, or one item per line:\n\nCSV: Category,Item,Size,Qty,Exp,Note\nPantry,Rice,5 lbs,1,12/31/2026,Safe\n\nJSON:\n[{"name":"Milk","quantity":2,"location":"fridge"}]\n\nSimple:\nApples\nMilk'}
          className="w-full h-full rounded-lg bg-slate-800/60 border border-amber-500/20 text-slate-200 placeholder-slate-600 outline-none focus:border-amber-500/50 transition-colors resize-none"
          style={{
            fontSize: `${INV_INPUT_TEXT}cqi`,
            padding: '0.8cqi 1.2cqi',
            fontFamily: "'Space Grotesk', system-ui",
          }}
        />
      </div>

      {/* Add All button */}
      <div className="flex justify-center shrink-0" style={{ paddingBottom: '1cqi' }}>
        <button
          onClick={handleBulkAdd}
          disabled={parsedCount === 0 || bulkCreate.isPending}
          className="font-semibold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-colors disabled:opacity-40"
          style={{
            fontSize: `${BUTTON_MIN_TEXT}cqi`,
            fontFamily: "'Space Grotesk', system-ui",
            padding: '0.5cqi 3cqi',
          }}
        >
          {bulkCreate.isPending ? 'Adding...' : `Add All (${parsedCount})`}
        </button>
      </div>
    </div>
  );
}

/**
 * InventoryAddBezelSvg — 360° hairline ring showing inventory health.
 * Red (<40 items) → amber (40–79) → green (80+).
 * Same hairline spec as ShoppingBezelSvg (r=0.98, strokeW=0.004).
 */
function InventoryAddBezelSvg({ itemCount, size }: { itemCount: number; size: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.98;
  const strokeW = size * 0.004;

  // Health: clamp to 0-100 range
  const health = Math.min(100, Math.max(0, itemCount));
  const progress = health / 100;
  const intense = progress >= 0.8;

  // Color: red → amber → green based on item count
  const ringColor = health < 40
    ? lerpHex('#d97706', '#f59e0b', health / 40)
    : lerpHex('#f59e0b', '#4ade80', (health - 40) / 60);

  const trackPath = arcPath(cx, cy, r, -90, 359.99);
  const fillSweep = 359.99 * progress;
  const fillPath = fillSweep > 0.01 ? arcPath(cx, cy, r, -90, fillSweep) : '';

  return (
    <g>
      <defs>
        <filter
          id="inv-add-bezel-glow"
          x="0" y="0"
          width={size} height={size}
          filterUnits="userSpaceOnUse"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation={intense ? 6 : 4} />
        </filter>
      </defs>

      {/* Track */}
      <path
        d={trackPath}
        fill="none"
        stroke={ringColor}
        strokeWidth={strokeW}
        strokeOpacity={0.12}
        strokeLinecap="round"
      />

      {/* Glow */}
      {fillPath && (
        <path
          d={fillPath}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeW * (intense ? 3 : 2)}
          strokeOpacity={intense ? 0.4 : 0.2}
          strokeLinecap="round"
          filter="url(#inv-add-bezel-glow)"
        />
      )}

      {/* Filled arc */}
      {fillPath && (
        <path
          d={fillPath}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeW}
          strokeOpacity={intense ? 0.95 : 0.7}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

/** Connected wrapper that reads activeItemCount from the intelligence hook */
function InventoryAddBezelSvgConnected({ size }: { size: number }) {
  const { activeItemCount } = useInventoryIntelligence();
  return <InventoryAddBezelSvg itemCount={activeItemCount} size={size} />;
}

export { InventoryQuickAddWidget, InventoryBulkAddWidget, InventoryAddBezelSvg, InventoryAddBezelSvgConnected };
