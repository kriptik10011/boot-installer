/**
 * FeedbackForm Component
 *
 * User feedback form for V1 beta testing.
 * Collects feature ratings and optional comments.
 * Auto-fills metadata (timestamp, app version).
 *
 * Part of the user feedback system.
 */

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { StarRating } from './StarRating';

import { config } from '@/config';

const API_BASE = `${config.api.baseUrl}/feedback`;

interface FeedbackRatings {
  events: number;
  meals: number;
  finances: number;
  recipes: number;
  intelligence: number;
}

interface FeedbackResult {
  status: string;
  message: string;
  feedback_id: string;
  filename: string;
  folder: string;
}

interface UsageStats {
  days_since_install: number;
  total_events_created: number;
  total_meals_planned: number;
  total_bills_tracked: number;
  total_recipes_saved: number;
  total_observation_sessions: number;
  intelligence_mode_used: boolean;
}

const FEATURES = [
  { key: 'events', label: 'Events/Calendar' },
  { key: 'meals', label: 'Meal Planning' },
  { key: 'finances', label: 'Bills & Finances' },
  { key: 'recipes', label: 'Recipe Management' },
  { key: 'intelligence', label: 'Intelligent Insights' },
] as const;

export function FeedbackForm() {
  const [ratings, setRatings] = useState<FeedbackRatings>({
    events: 0,
    meals: 0,
    finances: 0,
    recipes: 0,
    intelligence: 0,
  });
  const [workingWell, setWorkingWell] = useState('');
  const [couldBeBetter, setCouldBeBetter] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<FeedbackResult | null>(null);

  // Fetch usage stats
  const { data: stats } = useQuery<UsageStats>({
    queryKey: ['feedback', 'stats'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/stats`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (): Promise<FeedbackResult> => {
      const res = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ratings,
          working_well: workingWell || null,
          could_be_better: couldBeBetter || null,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Failed to submit feedback');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setFeedbackResult(data);
      setSubmitted(true);
    },
  });

  const handleRatingChange = (feature: keyof FeedbackRatings, value: number) => {
    setRatings((prev) => ({ ...prev, [feature]: value }));
  };

  const handleReset = () => {
    setRatings({
      events: 0,
      meals: 0,
      finances: 0,
      recipes: 0,
      intelligence: 0,
    });
    setWorkingWell('');
    setCouldBeBetter('');
    setSubmitted(false);
    setFeedbackResult(null);
  };

  if (submitted) {
    return (
      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-center">
        <div className="text-emerald-400 font-medium mb-2">Thank you for your feedback!</div>
        <p className="text-sm text-slate-400 mb-3">
          Your feedback helps us improve Weekly Review.
        </p>
        {feedbackResult?.filename && (
          <div className="bg-slate-800/50 rounded-lg p-3 mb-3 text-left">
            <p className="text-xs text-slate-500 mb-1">Saved to:</p>
            <p className="text-xs text-cyan-400 font-mono break-all">
              {feedbackResult.filename}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              in folder: <span className="text-slate-400">{feedbackResult.folder}</span>
            </p>
          </div>
        )}
        <button
          onClick={handleReset}
          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Submit another response
        </button>
      </div>
    );
  }

  const hasAnyRating = Object.values(ratings).some((r) => r > 0);

  return (
    <div className="space-y-4">
      {/* Header with auto-filled info */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
        <span>v0.2.0</span>
      </div>

      {/* Usage summary (if available) */}
      {stats && stats.days_since_install > 0 && (
        <div className="text-xs text-slate-500 bg-slate-800/50 rounded-lg p-2">
          Using for {stats.days_since_install} day{stats.days_since_install !== 1 ? 's' : ''} |{' '}
          {stats.total_events_created} events |{' '}
          {stats.total_meals_planned} meals |{' '}
          {stats.total_bills_tracked} bills
        </div>
      )}

      {/* Star ratings */}
      <div className="space-y-3 p-3 bg-slate-800/50 rounded-lg">
        <div className="text-xs text-slate-400 mb-2">Rate each feature (0-5 stars)</div>
        {FEATURES.map(({ key, label }) => (
          <StarRating
            key={key}
            label={label}
            value={ratings[key]}
            onChange={(value) => handleRatingChange(key, value)}
            disabled={submitMutation.isPending}
          />
        ))}
      </div>

      {/* Text feedback */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            What's working well? (optional)
          </label>
          <textarea
            value={workingWell}
            onChange={(e) => setWorkingWell(e.target.value)}
            placeholder="Tell us what you like..."
            disabled={submitMutation.isPending}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700
                     text-slate-100 placeholder-slate-500 text-sm resize-none
                     focus:outline-none focus:border-cyan-500
                     disabled:opacity-50"
            rows={2}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            What could be better? (optional)
          </label>
          <textarea
            value={couldBeBetter}
            onChange={(e) => setCouldBeBetter(e.target.value)}
            placeholder="Suggestions for improvement..."
            disabled={submitMutation.isPending}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700
                     text-slate-100 placeholder-slate-500 text-sm resize-none
                     focus:outline-none focus:border-cyan-500
                     disabled:opacity-50"
            rows={2}
          />
        </div>
      </div>

      {/* Error message */}
      {submitMutation.isError && (
        <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
          {submitMutation.error.message}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleReset}
          disabled={submitMutation.isPending}
          className="flex-1 px-3 py-2 rounded-lg
                   bg-slate-700 hover:bg-slate-600
                   text-slate-300 font-medium text-sm transition-colors
                   disabled:opacity-50"
        >
          Clear
        </button>
        <button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending || !hasAnyRating}
          className="flex-1 px-3 py-2 rounded-lg
                   bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30
                   text-cyan-400 font-medium text-sm transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitMutation.isPending ? 'Submitting...' : 'Save Feedback'}
        </button>
      </div>

      {/* Privacy note */}
      <p className="text-xs text-slate-500 text-center">
        Feedback is saved locally to help improve the app.
      </p>
    </div>
  );
}

export default FeedbackForm;
