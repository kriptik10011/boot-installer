/**
 * StarRating Component
 *
 * Reusable 0-5 star rating component with hover and click states.
 * Accessible with keyboard navigation.
 */

import { useState } from 'react';

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
}

export function StarRating({ value, onChange, label, disabled = false }: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const displayValue = hoverValue !== null ? hoverValue : value;

  const handleClick = (rating: number) => {
    if (!disabled) {
      // Clicking the same star again clears the rating
      onChange(value === rating ? 0 : rating);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, rating: number) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(rating);
    } else if (e.key === 'ArrowRight' && value < 5) {
      onChange(value + 1);
    } else if (e.key === 'ArrowLeft' && value > 0) {
      onChange(value - 1);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-300 min-w-[100px]">{label}</span>
      <div
        className="flex gap-1"
        role="radiogroup"
        aria-label={`Rate ${label}`}
      >
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => handleClick(rating)}
            onMouseEnter={() => !disabled && setHoverValue(rating)}
            onMouseLeave={() => setHoverValue(null)}
            onKeyDown={(e) => handleKeyDown(e, rating)}
            disabled={disabled}
            className={`
              w-7 h-7 flex items-center justify-center rounded transition-all
              ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
              ${rating <= displayValue
                ? 'text-amber-400'
                : 'text-slate-600 hover:text-slate-500'
              }
            `}
            role="radio"
            aria-checked={value === rating}
            aria-label={`${rating} star${rating !== 1 ? 's' : ''}`}
          >
            <svg
              className="w-5 h-5"
              fill={rating <= displayValue ? 'currentColor' : 'none'}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

export default StarRating;
