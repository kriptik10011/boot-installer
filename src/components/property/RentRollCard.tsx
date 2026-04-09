/**
 * RentRollCard — Rent roll for a selected property.
 * Shows each unit's occupancy, tenant, rent amount, and lease end.
 * +Add unit, −Archive unit.
 */

import { useState, useCallback } from 'react';
import { RadialGlassCard } from '../finance/radial/dashboard/RadialGlassCard';
import { useRentRoll, useCreateUnit, useUpdateUnit } from '@/hooks';

interface RentRollCardProps {
  cardId: string;
  propertyId: number;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

function fmt(n: number): string {
  return `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function RentRollCard({
  cardId,
  propertyId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: RentRollCardProps) {
  const { data: rentRoll } = useRentRoll(propertyId);
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();

  const [showAdd, setShowAdd] = useState(false);
  const [unitNumber, setUnitNumber] = useState('');
  const [unitRent, setUnitRent] = useState('');

  const entries = rentRoll?.entries ?? [];
  const collectionRate =
    rentRoll && rentRoll.total_potential_rent > 0
      ? Math.round((rentRoll.total_collected / rentRoll.total_potential_rent) * 100)
      : 0;

  const handleAddUnit = useCallback(() => {
    if (!unitNumber.trim()) return;
    createUnit.mutate(
      {
        propertyId,
        data: {
          unit_number: unitNumber.trim(),
          monthly_rent: unitRent ? parseFloat(unitRent) : undefined,
        },
      },
      {
        onSuccess: () => {
          setUnitNumber('');
          setUnitRent('');
          setShowAdd(false);
        },
      },
    );
  }, [propertyId, unitNumber, unitRent, createUnit]);

  const handleArchiveUnit = useCallback(
    (unitId: number) => {
      updateUnit.mutate({ unitId, data: { is_active: false } });
    },
    [updateUnit],
  );

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
          Rent Roll
        </h2>
        <div className="flex items-center gap-2">
          {rentRoll && (
            <span className="text-[10px] text-slate-500">{collectionRate}% collected</span>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-[10px] text-slate-600 hover:text-amber-400 transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Unit'}
          </button>
        </div>
      </div>

      {/* Add unit form */}
      {showAdd && (
        <div className="space-y-2 mb-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <div className="flex gap-2">
            <input
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              placeholder="Unit # (e.g. 1A)"
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
              onKeyDown={(e) => e.key === 'Enter' && handleAddUnit()}
            />
            <input
              value={unitRent}
              onChange={(e) => setUnitRent(e.target.value)}
              placeholder="Rent/mo"
              type="number"
              className="w-20 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
              onKeyDown={(e) => e.key === 'Enter' && handleAddUnit()}
            />
          </div>
          <button
            onClick={handleAddUnit}
            disabled={!unitNumber.trim() || createUnit.isPending}
            className="w-full px-2 py-1 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded transition-colors disabled:opacity-50"
          >
            {createUnit.isPending ? 'Adding...' : 'Add Unit'}
          </button>
        </div>
      )}

      {/* Summary */}
      {rentRoll && (
        <div className="flex gap-4 mb-3 text-[10px]">
          <div>
            <span className="text-slate-500">Potential: </span>
            <span className="text-slate-300 tabular-nums">{fmt(rentRoll.total_potential_rent)}</span>
          </div>
          <div>
            <span className="text-slate-500">Collected: </span>
            <span className="text-emerald-400 tabular-nums">{fmt(rentRoll.total_collected)}</span>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">
          {showAdd ? 'Add your first unit above' : 'No units'}
        </p>
      ) : (
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {entries.map((entry) => (
            <div
              key={entry.unit_id}
              className={`flex items-center justify-between px-2 py-1.5 rounded text-xs group ${
                entry.status === 'occupied'
                  ? 'bg-slate-800/40'
                  : 'bg-amber-900/15 border border-amber-800/20'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-slate-300 font-medium">{entry.unit_number}</span>
                  <span
                    className={`text-[9px] ${
                      entry.status === 'occupied' ? 'text-emerald-400/60' : 'text-amber-400/60'
                    }`}
                  >
                    {entry.status}
                  </span>
                </div>
                {entry.tenant_name && (
                  <span className="text-[10px] text-slate-500 truncate block">
                    {entry.tenant_name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <div className="text-right">
                  <span className="text-slate-300 tabular-nums">{fmt(entry.monthly_rent)}</span>
                  {entry.lease_end && (
                    <span className="text-[10px] text-slate-600 block">exp {entry.lease_end}</span>
                  )}
                </div>
                <button
                  onClick={() => handleArchiveUnit(entry.unit_id)}
                  className="p-0.5 rounded text-slate-700 opacity-0 group-hover:opacity-100 hover:text-amber-400 transition-all"
                  title="Archive unit"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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
