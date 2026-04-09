/**
 * CreateEventForm — Inline form for creating events within the EVENTS sub-arc card.
 * Extracted from WeekEventListOverlay for direct card embedding.
 */

import { useState, useCallback } from 'react';
import { useCreateEvent } from '@/hooks';
import { useCreateRecurrenceRule, useDeleteRecurrenceRule } from '@/hooks/useRecurrence';
import { useToastStore } from '@/stores/toastStore';
import { RecurrencePicker } from '@/components/shared/RecurrencePicker';
import { addDays } from '@/utils/dateUtils';
import type { EventCreate, RecurrenceRuleCreate } from '@/types';

const FONT = "'Space Grotesk', system-ui";

interface CreateEventFormProps {
  weekDates: string[];
  filterDay: string | null;
  today: string;
  weekStart: string;
  onCreated: () => void;
}

export function CreateEventForm({
  weekDates,
  filterDay,
  today,
  weekStart,
  onCreated,
}: CreateEventFormProps) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(filterDay ?? today);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceRuleCreate | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createEvent = useCreateEvent();
  const createRecurrenceRule = useCreateRecurrenceRule();
  const deleteRecurrenceRule = useDeleteRecurrenceRule();
  const addToast = useToastStore((s) => s.addToast);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || isSubmitting) return;
    setIsSubmitting(true);

    try {
      let ruleId: number | null = null;

      if (recurrence) {
        const rule = await createRecurrenceRule.mutateAsync(recurrence);
        ruleId = rule.id;
      }

      const eventData: EventCreate = {
        name: name.trim(),
        date,
        start_time: startTime || null,
        end_time: endTime || null,
        location: location.trim() || null,
        recurrence_rule_id: ruleId,
      };

      try {
        await createEvent.mutateAsync(eventData);
        addToast({ message: `Created "${name.trim()}"`, type: 'success', durationMs: 3000 });
        onCreated();
      } catch {
        if (ruleId) {
          try { await deleteRecurrenceRule.mutateAsync(ruleId); } catch { /* best effort */ }
        }
        addToast({ message: 'Failed to create event', type: 'error', durationMs: 4000 });
      }
    } catch {
      addToast({ message: 'Failed to create recurrence rule', type: 'error', durationMs: 4000 });
    } finally {
      setIsSubmitting(false);
    }
  }, [name, date, startTime, endTime, location, recurrence, isSubmitting, createEvent, createRecurrenceRule, deleteRecurrenceRule, addToast, onCreated]);

  const lastDay = weekDates[weekDates.length - 1] ?? addDays(today, 6);

  const inputStyle = {
    borderRadius: '0.6cqi',
    fontFamily: FONT,
    color: '#e2e8f0',
    backgroundColor: 'rgba(51, 65, 85, 0.3)',
    border: '1px solid rgba(51, 65, 85, 0.4)',
    outline: 'none',
  } as const;

  return (
    <div
      style={{
        marginTop: '1cqi', padding: '1.5cqi', borderRadius: '1cqi',
        backgroundColor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(51, 65, 85, 0.3)',
        flexShrink: 0,
      }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 100))}
        placeholder="Event name"
        maxLength={100}
        style={{ ...inputStyle, width: '100%', padding: '0.5cqi 1cqi', fontSize: '2cqi' }}
      />

      <div style={{ display: 'flex', gap: '0.5cqi', marginTop: '0.6cqi' }}>
        <input
          type="date"
          value={date}
          min={weekStart}
          max={lastDay}
          onChange={(e) => setDate(e.target.value)}
          style={{ ...inputStyle, flex: 1, padding: '0.4cqi 0.6cqi', fontSize: '1.6cqi' }}
        />
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          style={{ ...inputStyle, width: '30%', padding: '0.4cqi 0.6cqi', fontSize: '1.6cqi' }}
        />
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          style={{ ...inputStyle, width: '30%', padding: '0.4cqi 0.6cqi', fontSize: '1.6cqi' }}
        />
      </div>

      <input
        type="text"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Location (optional)"
        style={{ ...inputStyle, width: '100%', padding: '0.5cqi 1cqi', fontSize: '1.8cqi', marginTop: '0.5cqi' }}
      />

      <div style={{ marginTop: '0.6cqi', fontSize: '1.8cqi' }}>
        <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!name.trim() || isSubmitting}
        style={{
          width: '100%', marginTop: '0.8cqi', padding: '0.6cqi',
          borderRadius: '0.6cqi', fontFamily: FONT, fontSize: '2cqi',
          fontWeight: 600, cursor: name.trim() && !isSubmitting ? 'pointer' : 'not-allowed',
          color: '#fff',
          backgroundColor: name.trim() && !isSubmitting ? '#0891b2' : '#334155',
          border: 'none', opacity: isSubmitting ? 0.6 : 1,
        }}
      >
        {isSubmitting ? 'Adding...' : 'Add Event'}
      </button>
    </div>
  );
}
