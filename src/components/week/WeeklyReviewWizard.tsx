/**
 * WeeklyReviewWizard — Guided 5-step weekly close process.
 *
 * Steps: REVIEW → FINANCES → MEALS → SHOPPING → INTENTION
 *
 * Uses unified shapes: HeroMetric, MetricList, PillList, ButtonGroup,
 * ActionBar, FormField, TwoColumnLayout, JunctionCardLayout.
 * NO frosted glass backgrounds — shapes have no backgrounds, card edge
 * is the only boundary. Section headers via COLUMN_HEADER_STYLE.
 * Two-column splits via TwoColumnLayout (includes divider).
 *
 * Three exports:
 * - WeeklyReviewWizardWidget — circular card for radial junction
 * - WeeklyReviewPanelContent — headerless embed for ContextPanel
 * - WeeklyReviewPanel — inline panel for Traditional/Smart views
 */

import { useState, useEffect, useRef } from 'react';
import { SUB_ARC_ACCENTS, COLUMN_HEADER_STYLE } from '@/components/finance/radial/cardTemplate';
import { HeroMetric } from '@/components/finance/radial/shapes/HeroMetric';
import { MetricList, type MetricListItem } from '@/components/finance/radial/shapes/MetricList';
import { PillList, type PillListItem } from '@/components/finance/radial/shapes/PillList';
import { ButtonGroup } from '@/components/finance/radial/shapes/ButtonGroup';
import { ActionBar } from '@/components/finance/radial/shapes/ActionBar';
import { FormField } from '@/components/finance/radial/shapes/FormField';
import { TwoColumnLayout } from '@/components/finance/radial/shapes/TwoColumnLayout';
import { JunctionCardLayout } from '@/components/finance/radial/shapes/JunctionCardLayout';
import { useWizardSteps, STEPS } from './useWizardSteps';
import type { WeekReviewSummary, PantrySuggestion } from '@/types';

const WIZARD_ACCENT = SUB_ARC_ACCENTS.week;

/* ── Feeling options ─────────────────────────────── */

const FEELINGS = [
  { value: '1', label: 'Draining' },
  { value: '2', label: 'Tough' },
  { value: '3', label: 'Steady' },
  { value: '4', label: 'Good' },
  { value: '5', label: 'Energizing' },
] as const;

/* ── WizardStepDots (clickable navigation) ────────── */

function WizardStepDots({ currentStep, onStepClick }: {
  currentStep: number;
  onStepClick: (step: number) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '2cqi', padding: '2cqi 0',
    }}>
      {STEPS.map((step, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        return (
          <button
            key={step.id}
            onClick={(e) => { e.stopPropagation(); onStepClick(i); }}
            aria-label={`Go to ${step.label}`}
            style={{
              width: isCurrent ? '2.8cqi' : '2cqi',
              height: isCurrent ? '2.8cqi' : '2cqi',
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.2s ease',
              background: isCompleted
                ? '#10b981'
                : isCurrent ? 'transparent' : 'rgba(100,116,139,0.2)',
              boxShadow: isCurrent
                ? `0 0 0 1.5px ${WIZARD_ACCENT}, 0 0 8px ${WIZARD_ACCENT}40`
                : 'none',
            }}
          />
        );
      })}
    </div>
  );
}

/* ── ReviewStep ─────────────────────────────────── */

function ReviewStep({ review, feeling, onFeelingChange }: {
  review: WeekReviewSummary | undefined;
  feeling: number | null;
  onFeelingChange: (v: number) => void;
}) {
  const mealsCooked = review?.meals_cooked ?? 0;
  const mealsPlanned = review?.meals_planned ?? 0;
  const completionPct = mealsPlanned > 0 ? Math.round((mealsCooked / mealsPlanned) * 100) : undefined;

  const mealMetrics: MetricListItem[] = [
    { label: 'cooked', value: mealsCooked, color: '#34d399' },
    { label: 'skipped', value: review?.meals_skipped ?? 0, color: '#fbbf24' },
    { label: 'events', value: review?.events_total ?? 0 },
    ...(completionPct !== undefined ? [{ label: 'completion', value: `${completionPct}%`, color: mealsCooked === mealsPlanned ? '#34d399' : '#94a3b8' }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1cqi', width: '100%' }}>
      <HeroMetric value={mealsCooked} label="Week in Review" sublabel={mealsPlanned > 0 ? `of ${mealsPlanned} meals cooked` : 'meals cooked'} color={WIZARD_ACCENT} />
      <TwoColumnLayout
        leftHeader="MEALS"
        rightHeader="FEELING"
        headerColor={WIZARD_ACCENT}
        left={<MetricList items={mealMetrics} />}
        right={
          <ButtonGroup
            options={FEELINGS}
            value={feeling != null ? String(feeling) : ''}
            onChange={(v) => onFeelingChange(Number(v))}
            direction="vertical"
            accentColor={WIZARD_ACCENT}
            size="sm"
          />
        }
      />
    </div>
  );
}

/* ── FinancesStep ─────────────────────────────────── */

function FinancesStep({ review }: { review: WeekReviewSummary | undefined }) {
  const income = review?.total_income ?? 0;
  const expenses = review?.total_expenses ?? 0;
  const net = income - expenses;
  const billsPaid = review?.bills_paid ?? 0;
  const billsUnpaid = review?.bills_unpaid ?? 0;
  const overBudget = review?.budget_categories_over ?? 0;

  const incomeMetrics: MetricListItem[] = [
    { label: 'earned', value: `$${income.toFixed(0)}`, color: '#34d399' },
    { label: 'spent', value: `$${expenses.toFixed(0)}`, color: '#d97706' },
  ];

  const statusItems: PillListItem[] = [
    { label: `${billsPaid} bills paid`, dotColor: '#34d399' },
    ...(billsUnpaid > 0 ? [{ label: `${billsUnpaid} unpaid`, dotColor: '#fbbf24' }] : []),
    ...(overBudget > 0 ? [{ label: `${overBudget} over budget`, dotColor: '#fbbf24' }] : []),
    ...(billsUnpaid === 0 && overBudget === 0 ? [{ label: 'All on track', dotColor: '#34d399' }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1cqi', width: '100%' }}>
      <HeroMetric
        value={`${net >= 0 ? '+' : ''}$${net.toFixed(0)}`}
        label="Financial Review"
        sublabel="net this week"
        color={net >= 0 ? '#34d399' : '#d97706'}
      />
      <TwoColumnLayout
        leftHeader="INCOME"
        rightHeader="STATUS"
        headerColor={WIZARD_ACCENT}
        left={<MetricList items={incomeMetrics} />}
        right={<PillList items={statusItems} maxItems={5} />}
      />
    </div>
  );
}

/* ── MealsStep ──────────────────────────────────── */

function MealsStep({ pantry }: { pantry: PantrySuggestion[] | undefined }) {
  const items = pantry?.slice(0, 5) ?? [];

  const recipeItems: PillListItem[] = items.map((s) => ({
    label: s.recipe_name,
    badge: `${s.match_pct}%`,
    dotColor: s.match_pct >= 75 ? '#34d399' : s.match_pct >= 50 ? '#fbbf24' : '#94a3b8',
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1cqi', width: '100%' }}>
      <HeroMetric value={items.length} label="Plan Next Week" sublabel={items.length === 1 ? 'recipe suggestion' : 'recipe suggestions'} color={WIZARD_ACCENT} />
      <div style={{ width: '100%' }}>
        <div style={{ ...COLUMN_HEADER_STYLE, color: WIZARD_ACCENT }}>RECIPES</div>
        {items.length === 0
          ? <PillList items={[]} emptyMessage="No suggestions available" />
          : <PillList items={recipeItems} maxItems={5} />
        }
      </div>
    </div>
  );
}

/* ── ShoppingStep ───────────────────────────────── */

function ShoppingStep({ review }: { review: WeekReviewSummary | undefined }) {
  const completed = review?.shopping_items_completed ?? 0;
  const total = review?.shopping_items_total ?? 0;
  const lowStock = review?.low_stock_count ?? 0;
  const expiring = review?.expiring_soon_count ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const shopMetrics: MetricListItem[] = [
    { label: 'completed', value: completed, color: '#34d399' },
    { label: 'remaining', value: total - completed },
  ];

  const invItems: PillListItem[] = [
    ...(lowStock > 0 ? [{ label: `${lowStock} low stock`, dotColor: '#fbbf24' }] : []),
    ...(expiring > 0 ? [{ label: `${expiring} expiring`, dotColor: '#fbbf24' }] : []),
    ...(lowStock === 0 && expiring === 0 ? [{ label: 'All stocked', dotColor: '#34d399' }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1cqi', width: '100%' }}>
      <HeroMetric
        value={total > 0 ? `${pct}%` : '0'}
        label="Shopping & Inventory"
        sublabel={total > 0 ? `${completed} of ${total} items done` : 'no shopping list'}
        color={WIZARD_ACCENT}
      />
      <TwoColumnLayout
        leftHeader="SHOPPING"
        rightHeader="INVENTORY"
        headerColor={WIZARD_ACCENT}
        left={<MetricList items={shopMetrics} />}
        right={<PillList items={invItems} maxItems={5} />}
      />
    </div>
  );
}

/* ── IntentionStep ──────────────────────────────── */

const QUICK_CHIPS = [
  { label: 'Meal prep Sunday', value: 'Meal prep Sunday' },
  { label: 'Stay on budget', value: 'Stay on budget' },
  { label: 'Try a new recipe', value: 'Try a new recipe' },
  { label: 'Clean out pantry', value: 'Clean out pantry' },
  { label: 'Batch cook', value: 'Batch cook' },
];

function IntentionStep({ onComplete }: { onComplete: () => void }) {
  const [intention, setIntention] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1cqi', width: '100%' }}>
      <HeroMetric value="" label="Set Your Focus" sublabel="What's your intention for next week?" color={WIZARD_ACCENT} compact />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1cqi', width: '100%' }}>
        <div style={{ ...COLUMN_HEADER_STYLE, color: WIZARD_ACCENT }}>FOCUS</div>
        <ButtonGroup
          options={QUICK_CHIPS}
          value={intention}
          onChange={setIntention}
          size="sm"
          accentColor={WIZARD_ACCENT}
        />
        <FormField
          type="textarea"
          label="Focus"
          value={intention}
          onChange={setIntention}
          placeholder="Or type your own..."
          rows={3}
        />
        <ActionBar
          actions={[{
            label: 'Complete Review',
            onClick: onComplete,
            variant: 'cyan',
            filled: true,
          }]}
        />
      </div>
    </div>
  );
}

/* ── Shared step renderer ──────────────────────────── */

function renderStep(ws: ReturnType<typeof useWizardSteps>) {
  switch (ws.step) {
    case 0: return <ReviewStep review={ws.review} feeling={ws.feeling} onFeelingChange={ws.setFeeling} />;
    case 1: return <FinancesStep review={ws.review} />;
    case 2: return <MealsStep pantry={ws.pantry} />;
    case 3: return <ShoppingStep review={ws.review} />;
    case 4: return <IntentionStep onComplete={ws.handleComplete} />;
    default: return null;
  }
}

/* ── WeeklyReviewWizardWidget (radial junction) ── */

export function WeeklyReviewWizardWidget({ onClose }: { onClose: () => void }) {
  const ws = useWizardSteps(onClose);

  return (
    <JunctionCardLayout className="items-center" paddingBottom="1cqi">
      <div
        onClick={() => ws.timing.recordInteraction()}
        style={{ flex: 1, display: 'flex', overflow: 'hidden', width: '100%' }}
      >
        {renderStep(ws)}
      </div>
      <WizardStepDots currentStep={ws.step} onStepClick={ws.handleStepClick} />
    </JunctionCardLayout>
  );
}

/* ── WeeklyReviewPanelContent (headerless, for ContextPanel) ── */

export function WeeklyReviewPanelContent({ onClose }: { onClose: () => void }) {
  const ws = useWizardSteps(onClose);

  return (
    <div
      style={{ padding: '16px 24px', minHeight: '280px' }}
      onClick={() => ws.timing.recordInteraction()}
    >
      <div style={{ display: 'flex', minHeight: '240px' }}>{renderStep(ws)}</div>
      <div className="flex items-center justify-between pt-3 border-t border-slate-700/30 mt-4">
        <ActionBar actions={[
          { label: 'Back', onClick: ws.goBack, variant: 'slate', disabled: ws.step === 0 },
        ]} />
        <WizardStepDots currentStep={ws.step} onStepClick={ws.handleStepClick} />
        <ActionBar actions={[
          { label: ws.step === STEPS.length - 1 ? 'Complete' : 'Next', onClick: ws.goNext, variant: 'cyan' },
        ]} />
      </div>
    </div>
  );
}

/* ── WeeklyReviewPanel (Traditional/Smart inline panel) ── */

export function WeeklyReviewPanel({ onClose }: { onClose: () => void }) {
  const ws = useWizardSteps(onClose);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div ref={panelRef} className="mt-6 mx-6 flex justify-center">
      <div
        className="rounded-xl border border-slate-700/50 bg-slate-800/95 shadow-2xl"
        style={{ containerType: 'inline-size', maxWidth: '680px', width: '100%', maxHeight: '70vh', overflow: 'auto' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/30">
          <h3 className="text-base font-medium text-slate-200">
            Weekly Review — {STEPS[ws.step].label}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-sm">Close</button>
        </div>

        <div
          style={{ padding: '16px 24px', minHeight: '280px' }}
          onClick={() => ws.timing.recordInteraction()}
        >
          <div style={{ display: 'flex', minHeight: '240px' }}>{renderStep(ws)}</div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-700/30">
          <ActionBar actions={[
            { label: 'Back', onClick: ws.goBack, variant: 'slate', disabled: ws.step === 0 },
          ]} />
          <WizardStepDots currentStep={ws.step} onStepClick={ws.handleStepClick} />
          <ActionBar actions={[
            { label: ws.step === STEPS.length - 1 ? 'Complete' : 'Next', onClick: ws.goNext, variant: 'cyan' },
          ]} />
        </div>
      </div>
    </div>
  );
}
