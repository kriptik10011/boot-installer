/**
 * PropertyOverviewCard — Property list with key stats per property.
 * Self-contained: calls useProperties internally.
 * +Add property, −Archive property.
 */

import { useState, useCallback } from 'react';
import { RadialGlassCard } from '../finance/radial/dashboard/RadialGlassCard';
import { useProperties, useCreateProperty, useDeleteProperty } from '@/hooks';
import type { PropertyResponse } from '@/api/property';

interface PropertyOverviewCardProps {
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
  onSelectProperty?: (id: number) => void;
  selectedPropertyId?: number | null;
}

function fmt(n: number): string {
  return `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  single_family: 'SFH',
  multi_family: 'Multi',
  condo: 'Condo',
  townhouse: 'TH',
  commercial: 'Comm',
  other: 'Other',
};

export function PropertyOverviewCard({
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
  onSelectProperty,
  selectedPropertyId,
}: PropertyOverviewCardProps) {
  const { data: properties } = useProperties();
  const createMutation = useCreateProperty();
  const deleteMutation = useDeleteProperty();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('single_family');

  const handleAdd = useCallback(() => {
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim(), property_type: newType }, {
      onSuccess: () => {
        setNewName('');
        setNewType('single_family');
        setShowAdd(false);
      },
    });
  }, [newName, newType, createMutation]);

  const handleArchive = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    deleteMutation.mutate(id);
  }, [deleteMutation]);

  const items = properties ?? [];

  return (
    <RadialGlassCard
      accentColor="#d97706"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="text-xs font-medium text-amber-400/70 uppercase tracking-wider">
          Properties
        </h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-[10px] text-slate-600 hover:text-amber-400 transition-colors"
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAdd && (
        <div className="space-y-2 mb-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Property name..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <div className="flex gap-2">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300"
            >
              <option value="single_family">Single Family</option>
              <option value="multi_family">Multi-Family</option>
              <option value="condo">Condo</option>
              <option value="townhouse">Townhouse</option>
              <option value="commercial">Commercial</option>
              <option value="other">Other</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || createMutation.isPending}
              className="px-3 py-1 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? '...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No properties yet</p>
      ) : (
        <div className="space-y-2 max-h-52 overflow-y-auto">
          {items.map((p: PropertyResponse) => (
            <div
              key={p.id}
              onClick={() => onSelectProperty?.(p.id)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors text-left cursor-pointer ${
                selectedPropertyId === p.id
                  ? 'bg-amber-900/20 border border-amber-700/30'
                  : 'bg-slate-800/40 hover:bg-slate-800/70'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 font-medium truncate">{p.name}</span>
                  <span className="text-[9px] text-amber-500/60 shrink-0">
                    {PROPERTY_TYPE_LABELS[p.property_type] ?? p.property_type}
                  </span>
                </div>
                <div className="flex gap-3 mt-0.5 text-[10px] text-slate-500">
                  <span>{p.unit_count} unit{p.unit_count !== 1 ? 's' : ''}</span>
                  <span>{p.occupied_unit_count} occupied</span>
                  {p.vacancy_rate > 0 && (
                    <span className="text-amber-400/60">{p.vacancy_rate}% vacant</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <div className="text-right">
                  <div className="text-xs text-slate-300 font-medium tabular-nums">
                    {fmt(p.total_monthly_rent)}<span className="text-slate-600">/mo</span>
                  </div>
                  {p.current_value != null && (
                    <div className="text-[10px] text-slate-500 tabular-nums">
                      {fmt(p.current_value)}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => handleArchive(e, p.id)}
                  className="p-1 rounded text-slate-700 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                  title="Archive property"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </RadialGlassCard>
  );
}
