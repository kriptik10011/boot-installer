/**
 * PropertyDashboard — Full property management view.
 * Composed of overview, rent roll, P&L, maintenance, and metrics.
 * Accessible from the Finance/Property tab in ComprehensiveDashboard.
 */

import { useState, useCallback } from 'react';
import { PropertyOverviewCard } from './PropertyOverviewCard';
import { RentRollCard } from './RentRollCard';
import { PropertyPNLCard } from './PropertyPNLCard';
import { MaintenanceCard } from './MaintenanceCard';
import { PropertyMetricsRibbon } from './PropertyMetricsRibbon';
import { useProperties, useVacancies } from '@/hooks';

interface PropertyDashboardProps {
  onBack?: () => void;
}

function fmt(n: number): string {
  return `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function PropertyDashboard({ onBack }: PropertyDashboardProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [focusedCard, setFocusedCard] = useState<string | null>(null);
  const { data: properties } = useProperties();
  const { data: vacancies } = useVacancies();

  const handleFocus = useCallback((cardId: string) => {
    setFocusedCard((prev) => (prev === cardId ? null : cardId));
  }, []);

  const getCardProps = (cardId: string) => ({
    cardId,
    isBlurred: focusedCard !== null && focusedCard !== cardId,
    opacity: focusedCard !== null && focusedCard !== cardId ? 0.5 : 1,
    scale: focusedCard === cardId ? 1.02 : 1,
    onFocus: handleFocus,
  });

  // Portfolio summary
  const totalRent = properties?.reduce((s, p) => s + p.total_monthly_rent, 0) ?? 0;
  const totalValue = properties?.reduce((s, p) => s + (p.current_value ?? 0), 0) ?? 0;
  const totalUnits = properties?.reduce((s, p) => s + p.unit_count, 0) ?? 0;
  const totalOccupied = properties?.reduce((s, p) => s + p.occupied_unit_count, 0) ?? 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-800/50">
        {onBack && (
          <button
            onClick={onBack}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Back
          </button>
        )}

        {/* Portfolio KPIs */}
        <div className="flex gap-5 ml-auto text-xs">
          <div>
            <span className="text-[9px] text-slate-500 uppercase block">Rent/mo</span>
            <span className="text-emerald-400 tabular-nums font-medium">{fmt(totalRent)}</span>
          </div>
          <div>
            <span className="text-[9px] text-slate-500 uppercase block">Portfolio</span>
            <span className="text-slate-300 tabular-nums font-medium">{fmt(totalValue)}</span>
          </div>
          <div>
            <span className="text-[9px] text-slate-500 uppercase block">Occupancy</span>
            <span className="text-slate-300 tabular-nums font-medium">
              {totalOccupied}/{totalUnits}
            </span>
          </div>
          {vacancies && vacancies.total_vacant_units > 0 && (
            <div>
              <span className="text-[9px] text-slate-500 uppercase block">Vacant</span>
              <span className="text-amber-400 tabular-nums font-medium">
                {vacancies.total_vacant_units}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Metrics ribbon for selected property */}
      {selectedPropertyId && (
        <div className="px-6 py-2 border-b border-slate-800/30">
          <PropertyMetricsRibbon propertyId={selectedPropertyId} />
        </div>
      )}

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 gap-4 max-w-5xl mx-auto">
          {/* Row 1: Overview + Rent Roll */}
          <PropertyOverviewCard
            {...getCardProps('property-overview')}
            onSelectProperty={setSelectedPropertyId}
            selectedPropertyId={selectedPropertyId}
          />
          {selectedPropertyId ? (
            <RentRollCard
              {...getCardProps('rent-roll')}
              propertyId={selectedPropertyId}
            />
          ) : (
            <div
              className="rounded-2xl p-5 flex items-center justify-center"
              style={{ background: 'rgba(8, 16, 32, 0.5)', border: '1px solid rgba(217, 119, 6, 0.1)' }}
            >
              <p className="text-xs text-slate-600">Select a property to see details</p>
            </div>
          )}

          {/* Row 2: P&L + Maintenance */}
          {selectedPropertyId ? (
            <PropertyPNLCard
              {...getCardProps('property-pnl')}
              propertyId={selectedPropertyId}
            />
          ) : (
            <div
              className="rounded-2xl p-5 flex items-center justify-center"
              style={{ background: 'rgba(8, 16, 32, 0.5)', border: '1px solid rgba(217, 119, 6, 0.1)' }}
            >
              <p className="text-xs text-slate-600">P&L available after selection</p>
            </div>
          )}
          <MaintenanceCard
            {...getCardProps('maintenance')}
            propertyId={selectedPropertyId}
          />
        </div>
      </div>
    </div>
  );
}
