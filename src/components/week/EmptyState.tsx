/**
 * EmptyState Component
 *
 * "Warm nudge" empty states that make users WANT to fill in their data.
 * Follows intelligence layer principles:
 * - No shame language
 * - Positive framing ("Ready to plan" not "Empty")
 * - Inviting action prompts
 * - Subtle but appealing visuals
 */

import type { MealType } from '@/types';

type EmptyStateVariant = 'events' | 'meals' | 'bills' | 'generic';

interface EmptyStateProps {
  variant: EmptyStateVariant;
  mealType?: MealType;
  onAction?: () => void;
  compact?: boolean;
}

// Warm, inviting messages for each variant
const MESSAGES: Record<EmptyStateVariant, { title: string; subtitle?: string; action?: string }> = {
  events: {
    title: 'Day is open',
    subtitle: 'Perfect for planning or just relaxing',
    action: 'Add something',
  },
  meals: {
    title: 'Ready to plan',
    subtitle: undefined,
    action: 'Choose a meal',
  },
  bills: {
    title: 'All clear',
    subtitle: 'No bills due this day',
  },
  generic: {
    title: 'Nothing here yet',
    subtitle: 'Add something to get started',
  },
};

// Meal-specific messages
const MEAL_MESSAGES: Record<MealType, { title: string; subtitle?: string }> = {
  breakfast: {
    title: 'Morning is open',
    subtitle: 'Start fresh with something good',
  },
  lunch: {
    title: 'Midday break',
    subtitle: 'What sounds good?',
  },
  dinner: {
    title: 'Evening awaits',
    subtitle: 'Time to plan something nice',
  },
};

// Subtle icons for each variant
function EmptyStateIcon({ variant, className }: { variant: EmptyStateVariant; className?: string }) {
  const baseClass = `${className} opacity-50`;

  switch (variant) {
    case 'events':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'meals':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case 'bills':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
        </svg>
      );
    default:
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      );
  }
}

export function EmptyState({ variant, mealType, onAction, compact = false }: EmptyStateProps) {
  // Get messages
  const messages = variant === 'meals' && mealType
    ? MEAL_MESSAGES[mealType]
    : MESSAGES[variant];

  // Variant-specific styling
  const getVariantStyles = () => {
    switch (variant) {
      case 'events':
        return {
          bg: 'bg-cyan-500/5 hover:bg-cyan-500/10',
          border: 'border-dashed border-cyan-500/20 hover:border-cyan-500/30',
          text: 'text-cyan-400/70',
          icon: 'text-cyan-400',
        };
      case 'meals':
        return {
          bg: 'bg-emerald-500/5 hover:bg-emerald-500/10',
          border: 'border-dashed border-emerald-500/20 hover:border-emerald-500/30',
          text: 'text-emerald-400/70',
          icon: 'text-emerald-400',
        };
      case 'bills':
        return {
          bg: 'bg-emerald-500/5',
          border: 'border-transparent',
          text: 'text-emerald-400/60',
          icon: 'text-emerald-400',
        };
      default:
        return {
          bg: 'bg-slate-700/20 hover:bg-slate-700/30',
          border: 'border-dashed border-slate-600/30 hover:border-slate-500/30',
          text: 'text-slate-500',
          icon: 'text-slate-400',
        };
    }
  };

  const styles = getVariantStyles();
  const hasAction = !!onAction && variant !== 'bills';

  // Compact mode (for inline use in day cards)
  if (compact) {
    return (
      <button
        onClick={onAction}
        disabled={!hasAction}
        className={`
          w-full p-2 rounded-lg text-center transition-all
          ${styles.bg} ${styles.border} border
          ${hasAction ? 'cursor-pointer' : 'cursor-default'}
        `}
      >
        <span className={`text-xs ${styles.text}`}>
          {messages.title}
        </span>
      </button>
    );
  }

  // Full mode (for expanded sections)
  return (
    <button
      onClick={onAction}
      disabled={!hasAction}
      className={`
        w-full flex flex-col items-center justify-center p-4 rounded-xl transition-all
        ${styles.bg} ${styles.border} border
        ${hasAction ? 'cursor-pointer group' : 'cursor-default'}
      `}
    >
      <EmptyStateIcon variant={variant} className={`w-8 h-8 mb-2 ${styles.icon}`} />
      <div className={`text-sm font-medium mb-0.5 ${styles.text}`}>
        {messages.title}
      </div>
      {messages.subtitle && (
        <div className="text-xs text-slate-500">
          {messages.subtitle}
        </div>
      )}
      {hasAction && MESSAGES[variant].action && (
        <div className={`
          mt-2 text-xs px-2 py-1 rounded-md transition-all
          opacity-0 group-hover:opacity-100
          bg-slate-700/50 ${styles.text}
        `}>
          {MESSAGES[variant].action}
        </div>
      )}
    </button>
  );
}
