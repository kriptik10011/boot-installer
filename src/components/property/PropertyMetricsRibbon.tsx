/**
 * PropertyMetricsRibbon — Key investment metrics for a selected property.
 * NOI, Cash Flow, Cap Rate, Cash-on-Cash, LTV, DSCR.
 */

import { KpiRibbon } from '../finance/radial/cards/KpiRibbon';
import { usePropertyMetrics } from '@/hooks';

interface PropertyMetricsRibbonProps {
  propertyId: number;
}

function fmtDollar(n: number): string {
  return `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(1)}%`;
}

export function PropertyMetricsRibbon({ propertyId }: PropertyMetricsRibbonProps) {
  const { data: metrics } = usePropertyMetrics(propertyId);

  if (!metrics) return null;

  const kpis = [
    {
      label: 'NOI',
      value: fmtDollar(metrics.noi),
      color: metrics.noi >= 0 ? '#34d399' : '#f59e0b',
    },
    {
      label: 'Cash Flow',
      value: fmtDollar(metrics.cash_flow),
      color: metrics.cash_flow >= 0 ? '#34d399' : '#f59e0b',
    },
    {
      label: 'Cap Rate',
      value: fmtPct(metrics.cap_rate),
      color: '#e2e8f0',
    },
    {
      label: 'CoC Return',
      value: fmtPct(metrics.cash_on_cash),
      color: '#e2e8f0',
    },
    {
      label: 'LTV',
      value: fmtPct(metrics.ltv),
      color: metrics.ltv != null && metrics.ltv > 80 ? '#f59e0b' : '#e2e8f0',
    },
    {
      label: 'DSCR',
      value: metrics.dscr != null ? metrics.dscr.toFixed(2) : '—',
      color: metrics.dscr != null && metrics.dscr < 1.2 ? '#f59e0b' : '#e2e8f0',
    },
  ];

  return <KpiRibbon metrics={kpis} />;
}
