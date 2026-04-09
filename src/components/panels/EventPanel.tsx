/**
 * EventPanel Component
 *
 * Contextual panel for viewing/editing events.
 * Shows event details, related events, and edit/delete actions.
 * Supports "Edit this occurrence" vs "Edit all" for recurring events.
 */

import { useState, useEffect } from 'react';
import { useEvent, useCreateEvent, useUpdateEvent, useDeleteEvent, eventKeys } from '@/hooks/useEvents';
import { eventsApi } from '@/api/client';
import { getTodayLocal } from '@/utils/dateUtils';
import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { TimeInput } from '@/components/shared/TimeInput';
import { RecurrencePicker } from '@/components/shared/RecurrencePicker';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { useCreateRecurrenceRule, useRecurrenceRule, useDeleteRecurrenceRule } from '@/hooks/useRecurrence';
import { useToastStore } from '@/stores/toastStore';
import type { EventPanelProps } from './types';
import type { Event, EventCreate, EventUpdate, RecurrenceRuleCreate } from '@/types';

type RecurringEditMode = 'choose' | 'this' | 'all' | null;

export function EventPanel({ eventId, date, isOccurrence, occurrenceDate, onClose }: EventPanelProps) {
  const { data: event, isLoading } = useEvent(eventId);
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const createRecurrenceRule = useCreateRecurrenceRule();
  const deleteRecurrenceRule = useDeleteRecurrenceRule();

  const isNew = eventId === null;
  const isRecurringOccurrence = isOccurrence && event?.recurrence_rule_id !== null;

  // Recurrence state
  const [recurrence, setRecurrence] = useState<RecurrenceRuleCreate | null>(null);
  const { data: existingRule } = useRecurrenceRule(event?.recurrence_rule_id ?? null);

  // For recurring events, track whether user wants to edit this occurrence or all
  const [recurringEditMode, setRecurringEditMode] = useState<RecurringEditMode>(null);

  const addToast = useToastStore((s) => s.addToast);

  // Undo-delete for non-recurring events (recurring uses confirmation modal)
  const { requestDelete } = useUndoDelete<Event>({
    entityLabel: 'event',
    getItemName: (e) => e.name,
    getItemId: (e) => e.id,
    listQueryKeys: [eventKeys.lists(), [...eventKeys.all, 'week']],
    deleteFn: (id) => eventsApi.delete(id),
    invalidateKeys: [eventKeys.all],
  });

  // Form state
  const [form, setForm] = useState<EventCreate>({
    name: '',
    date: date || getTodayLocal(),
    start_time: null,
    end_time: null,
    location: null,
    description: null,
  });

  // Initialize form with existing event data
  useEffect(() => {
    if (event) {
      setForm({
        name: event.name,
        date: event.date,
        start_time: event.start_time,
        end_time: event.end_time,
        location: event.location,
        description: event.description,
      });
    }
  }, [event]);

  // Populate recurrence picker from existing rule
  useEffect(() => {
    if (existingRule) {
      setRecurrence({
        frequency: existingRule.frequency,
        interval: existingRule.interval,
        day_of_week: existingRule.day_of_week,
        day_of_month: existingRule.day_of_month,
        end_type: existingRule.end_type,
        end_count: existingRule.end_count,
        end_date: existingRule.end_date,
      });
    }
  }, [existingRule]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // For recurring occurrences, check if user has chosen edit mode
    if (isRecurringOccurrence && recurringEditMode === null) {
      setRecurringEditMode('choose');
      return;
    }

    let newRuleId: number | null = null;
    try {
      // Create or clear recurrence rule
      let ruleId: number | null = event?.recurrence_rule_id ?? null;
      if (recurrence) {
        const newRule = await createRecurrenceRule.mutateAsync(recurrence);
        ruleId = newRule.id;
        newRuleId = newRule.id;
      } else {
        ruleId = null;
      }

      const formWithRecurrence = { ...form, recurrence_rule_id: ruleId };

      if (isNew) {
        await createEvent.mutateAsync(formWithRecurrence);
      } else if (eventId) {
        if (recurringEditMode === 'this' && occurrenceDate) {
          // Create a new standalone event for this specific occurrence
          await createEvent.mutateAsync({
            ...formWithRecurrence,
            date: occurrenceDate,
            recurrence_rule_id: null, // No recurrence - standalone event
          });
        } else {
          // Edit all (or non-recurring event) - update the master event
          await updateEvent.mutateAsync({ id: eventId, data: formWithRecurrence as EventUpdate });
        }
      }
      addToast({ message: 'Event saved successfully', type: 'success', durationMs: 4000 });
      setTimeout(() => onClose(), 500);
    } catch (error) {
      // Clean up orphaned recurrence rule if event save failed
      if (newRuleId) {
        deleteRecurrenceRule.mutate(newRuleId);
      }
      const detail = error instanceof Error ? error.message : 'Unknown error';
      addToast({ message: `Failed to save event: ${detail}`, type: 'error', durationMs: 4000 });
    }
  };

  const handleEditModeChoice = (mode: 'this' | 'all') => {
    setRecurringEditMode(mode);
    // The actual save will happen when user submits the form again
  };

  const handleDelete = async () => {
    if (!eventId || !event) return;

    if (isRecurringOccurrence) {
      // Recurring events: too destructive for undo — use confirmation modal
      const confirmed = window.confirm('Delete this recurring event and all its occurrences?');
      if (confirmed) {
        try {
          await deleteEvent.mutateAsync(eventId);
          addToast({ message: 'Event deleted successfully', type: 'success', durationMs: 4000 });
          setTimeout(() => onClose(), 500);
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Unknown error';
          addToast({ message: `Failed to delete event: ${detail}`, type: 'error', durationMs: 4000 });
        }
      }
    } else {
      // Non-recurring: undo toast pattern
      requestDelete(event);
      onClose();
    }
  };

  if (isLoading && !isNew) {
    return <PanelSkeleton />;
  }

  // Show choice dialog for recurring events
  if (recurringEditMode === 'choose') {
    return (
      <div className="p-6 space-y-6">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-cyan-500/20 text-cyan-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-white">Edit Recurring Event</h3>
          <p className="text-sm text-slate-400">
            This is a recurring event. What would you like to edit?
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleEditModeChoice('this')}
            className="w-full p-4 text-left rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 transition-colors"
          >
            <div className="font-medium text-white">This occurrence only</div>
            <div className="text-sm text-slate-400 mt-1">
              Creates a standalone event for {occurrenceDate ? new Date(occurrenceDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : 'this date'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleEditModeChoice('all')}
            className="w-full p-4 text-left rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 transition-colors"
          >
            <div className="font-medium text-white">All occurrences</div>
            <div className="text-sm text-slate-400 mt-1">
              Changes apply to this and all future occurrences
            </div>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setRecurringEditMode(null)}
          className="w-full px-4 py-2 text-slate-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      {/* Recurring event indicator */}
      {isRecurringOccurrence && recurringEditMode && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-sm text-cyan-300">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {recurringEditMode === 'this' ? 'Editing this occurrence only' : 'Editing all occurrences'}
          <button
            type="button"
            onClick={() => setRecurringEditMode('choose')}
            className="ml-auto text-xs underline hover:no-underline"
          >
            Change
          </button>
        </div>
      )}

      {/* Event Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
          Event Name
        </label>
        <input
          id="name"
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          placeholder="Enter event name"
          required
        />
      </div>

      {/* Date */}
      <div>
        <label htmlFor="date" className="block text-sm font-medium text-slate-300 mb-2">
          Date
        </label>
        <input
          id="date"
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          required
        />
      </div>

      {/* Time Range */}
      <TimeInput
        startTime={form.start_time ?? null}
        endTime={form.end_time ?? null}
        onStartChange={(t) => setForm({ ...form, start_time: t })}
        onEndChange={(t) => setForm({ ...form, end_time: t })}
      />

      {/* Location */}
      <div>
        <label htmlFor="location" className="block text-sm font-medium text-slate-300 mb-2">
          Location
        </label>
        <input
          id="location"
          type="text"
          value={form.location || ''}
          onChange={(e) => setForm({ ...form, location: e.target.value || null })}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          placeholder="Enter location (optional)"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-slate-300 mb-2">
          Description
        </label>
        <textarea
          id="description"
          value={form.description || ''}
          onChange={(e) => setForm({ ...form, description: e.target.value || null })}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 resize-none"
          placeholder="Add notes (optional)"
          rows={3}
        />
      </div>

      {/* Recurrence */}
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-700">
        {!isNew && (
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors"
          >
            Delete
          </button>
        )}
        <div className={`flex items-center gap-3 ${isNew ? 'ml-auto' : ''}`}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createEvent.isPending || updateEvent.isPending}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isNew ? 'Create Event' : 'Save Changes'}
          </button>
        </div>
      </div>
    </form>
  );
}
