/**
 * NetWorthTab — Net worth hero + asset list.
 *
 * Extracted verbatim from FinancePanel.tsx L447-481.
 */

import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { useNetWorthCurrent, useAssets } from '@/hooks/useFinanceV2';
import { SectionTitle, EmptyState, fmt } from './FinanceHelpers';

export function NetWorthTab() {
  const { data: nw, isLoading } = useNetWorthCurrent();
  const { data: assets } = useAssets();

  if (isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      {nw && (
        <div className="bg-gradient-to-br from-emerald-900/30 to-slate-800 rounded-xl p-4 text-center">
          <div className="text-xs text-slate-400 mb-1">Net Worth</div>
          <div className={`text-2xl font-bold ${nw.net_worth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmt(nw.net_worth)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Assets {fmt(nw.total_assets)} - Liabilities {fmt(nw.total_liabilities)}
          </div>
        </div>
      )}

      <SectionTitle>Assets</SectionTitle>
      {assets && assets.length > 0 ? (
        <div className="space-y-1">
          {assets.map((asset: any) => (
            <div key={asset.id} className="flex justify-between text-sm py-1">
              <span className="text-slate-300">{asset.name}</span>
              <span className="text-emerald-400">{fmt(asset.current_value)}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No assets tracked" />
      )}
    </div>
  );
}
