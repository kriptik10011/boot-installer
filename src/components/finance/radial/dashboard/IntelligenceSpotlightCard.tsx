/**
 * IntelligenceSpotlightCard — Full-width hero card showing the #1 priority insight.
 *
 * Uses Aurora intelligence to surface the most urgent/relevant item,
 * with Glass Box reasoning explaining WHY this is the top priority.
 */

import { useEffect, useRef } from 'react';
import { RadialGlassCard } from './RadialGlassCard';
import { trackInsightShown } from '@/services/observation';
import type { AuroraIntelligence } from '@/hooks/useAuroraIntelligence';
import type { FinanceIntelligence } from '@/hooks/useFinanceIntelligence';

interface IntelligenceSpotlightCardProps {
  aurora: AuroraIntelligence;
  finance: FinanceIntelligence;
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

interface SpotlightInsight {
  id: string;
  title: string;
  message: string;
  reasoning: string;
  urgency: 'urgent' | 'warning' | 'info';
  action: string | null;
  color: string;
  isTemplate?: boolean;
  learningMessage?: string | null;
}

function getTopInsight(aurora: AuroraIntelligence, finance: FinanceIntelligence): SpotlightInsight {
  // Priority 1: Overdue bills (amber, not red)
  const overdueBill = finance.billInsights.find((b) => b.urgencyLevel === 'overdue');
  if (overdueBill) {
    return {
      id: `bill-overdue-${overdueBill.bill.uid}`,
      title: overdueBill.bill.name,
      message: overdueBill.message,
      reasoning: overdueBill.reasoning,
      urgency: 'urgent' as const,
      action: 'Pay Bill',
      color: '#d97706', // amber
    };
  }

  // Priority 2: Bills approaching (24h)
  const urgentBill = finance.billInsights.find((b) => b.urgencyLevel === 'urgent');
  if (urgentBill) {
    return {
      id: `bill-urgent-${urgentBill.bill.uid}`,
      title: urgentBill.bill.name,
      message: urgentBill.message,
      reasoning: urgentBill.reasoning,
      urgency: 'warning' as const,
      action: 'Review Bill',
      color: '#f59e0b',
    };
  }

  // Priority 3: Aurora cross-feature insights
  const topInsight = aurora.insights[0];
  if (topInsight) {
    return {
      id: `aurora-${topInsight.type}-0`,
      title: 'Financial Insight',
      message: topInsight.message,
      reasoning: topInsight.reasoning,
      urgency: 'info' as const,
      action: 'Review',
      color: '#22d3ee',
    };
  }

  // Fallback: health-based message
  const healthMsg = aurora.healthScore >= 80
    ? 'Your finances are in great shape.'
    : aurora.healthScore >= 60
      ? 'Your financial health is steady.'
      : 'Some areas need attention.';

  return {
    id: 'health-fallback',
    title: 'Financial Health',
    message: `Health score: ${aurora.healthScore}/100. ${healthMsg}`,
    reasoning: `Based on your budget utilization, debt-to-income ratio, and savings rate.`,
    urgency: 'info' as const,
    action: null,
    color: aurora.palette.glowColor,
  };
}

export function IntelligenceSpotlightCard({
  aurora,
  finance,
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: IntelligenceSpotlightCardProps) {
  const insight = getTopInsight(aurora, finance);
  const isUrgent = insight.urgency === 'urgent';

  // Track when a new insight becomes visible (observation loop)
  const lastTrackedRef = useRef<string | null>(null);
  useEffect(() => {
    if (insight.id && insight.id !== lastTrackedRef.current) {
      trackInsightShown({
        insightId: insight.id,
        insightType: insight.urgency,
        shownTimestamp: Date.now(),
      });
      lastTrackedRef.current = insight.id;
    }
  }, [insight.id, insight.urgency]);

  return (
    <RadialGlassCard
      colSpan={3}
      accentColor={insight.color}
      hasAnomaly={isUrgent}
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${insight.color}20` }}
        >
          {isUrgent ? (
            <svg className="w-5 h-5" style={{ color: insight.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" style={{ color: insight.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: `${insight.color}AA` }}>
            Intelligence Spotlight
          </h3>
          <p className="text-base font-semibold text-slate-100 mb-1">{insight.title}</p>
          <p className="text-sm text-slate-300 mb-2">{insight.message}</p>
          {insight.isTemplate && insight.learningMessage && (
            <p className="text-xs text-amber-400/70 mb-1">{insight.learningMessage}</p>
          )}
          <p className="text-xs text-slate-500 italic">{insight.reasoning}</p>
        </div>

        {/* Action button */}
        {insight.action && (
          <button
            className="shrink-0 px-4 py-2 text-xs font-medium rounded-lg transition-colors"
            style={{
              background: `${insight.color}20`,
              color: insight.color,
              border: `1px solid ${insight.color}40`,
            }}
          >
            {insight.action}
          </button>
        )}
      </div>
    </RadialGlassCard>
  );
}
