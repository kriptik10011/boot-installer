/**
 * HabitJunction — SE junction widget. Habit streaks, check-off, and inline add.
 * Uses unified shapes: JunctionCardLayout, ScrollZone, HeroMetric, PillList (checkable),
 * ActionBar, FormField, InfoBanner.
 */

import { useCallback, useState } from 'react';
import { useHabits, useRecordHabit, formatHabitName } from '@/hooks/useHabits';
import { HeroMetric } from '../shapes/HeroMetric';
import { InfoBanner } from '../shapes/InfoBanner';
import { PillList, type PillListItem } from '../shapes/PillList';
import { ActionBar } from '../shapes/ActionBar';
import { FormField } from '../shapes/FormField';
import { JunctionCardLayout } from '../shapes/JunctionCardLayout';
import { ScrollZone } from '../shapes/ScrollZone';
import { JUNCTION_ACCENTS, COLUMN_HEADER_STYLE } from '../cardTemplate';

function trendColor(score: number): string {
  if (score >= 0.7) return '#34d399';
  if (score >= 0.4) return '#fbbf24';
  return '#64748b';
}

export function HabitJunctionWidget() {
  const { data: habits = [] } = useHabits();
  const recordHabit = useRecordHabit();
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [addInput, setAddInput] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const isRecorded = useCallback((habitName: string): boolean => {
    const override = overrides.get(habitName);
    if (override !== undefined) return override;
    const habit = habits.find((h) => h.habit_name === habitName);
    if (!habit?.last_occurrence) return false;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return new Date(habit.last_occurrence) >= weekStart;
  }, [overrides, habits]);

  const handleToggle = useCallback((habitName: string) => {
    const willRecord = !isRecorded(habitName);
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(habitName, willRecord);
      return next;
    });
    recordHabit.mutate(
      { habitName, occurred: willRecord },
      {
        onError: () => {
          setOverrides((prev) => {
            const next = new Map(prev);
            next.set(habitName, !willRecord);
            return next;
          });
        },
      },
    );
  }, [isRecorded, recordHabit]);

  const handleAddHabit = useCallback(() => {
    const name = addInput.trim().toLowerCase().replace(/\s+/g, '_');
    if (!name || recordHabit.isPending) return;
    recordHabit.mutate(
      { habitName: name, occurred: true },
      {
        onSuccess: () => {
          setAddInput('');
          setShowAdd(false);
          setOverrides((prev) => new Map(prev).set(name, true));
        },
      },
    );
  }, [addInput, recordHabit]);

  const handleAddKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') handleAddHabit();
    else if (e.key === 'Escape') { setShowAdd(false); setAddInput(''); }
  }, [handleAddHabit]);

  const doneCount = habits.filter((h) => isRecorded(h.habit_name)).length;

  // ── PillList items ───────────────────────────────────────────────────────

  const habitItems: PillListItem[] = habits.slice(0, 6).map((h) => {
    const done = isRecorded(h.habit_name);
    return {
      label: formatHabitName(h.habit_name),
      badge: `${h.current_streak}d`,
      checked: done,
      onCheckChange: () => handleToggle(h.habit_name),
      checkColor: done ? '#34d399' : trendColor(h.trend_score),
    };
  });

  // ── Add habit action (morphs pill → form) ───────────────────────────────

  const addAction = {
    label: '+ Add Habit',
    onClick: () => setShowAdd(true),
    variant: 'violet' as const,
    ...(showAdd ? {
      expanded: true,
      expandedContent: (
        <>
          <FormField
            type="text"
            label="Habit"
            value={addInput}
            onChange={setAddInput}
            placeholder="Habit name..."
            onKeyDown={handleAddKeyDown}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            autoFocus
          />
          <ActionBar actions={[
            { label: recordHabit.isPending ? '...' : 'Add', onClick: handleAddHabit, variant: 'violet', disabled: !addInput.trim() || recordHabit.isPending },
            { label: 'Cancel', onClick: () => { setShowAdd(false); setAddInput(''); }, variant: 'slate' },
          ]} borderless />
        </>
      ),
    } : {}),
  };

  // ── Empty state ──────────────────────────────────────────────────────────

  if (habits.length === 0) {
    return (
      <JunctionCardLayout className="items-center justify-center">
        <HeroMetric value="--" label="No Habits" sublabel="Add your first habit below" />
        <ActionBar actions={[addAction]} />
      </JunctionCardLayout>
    );
  }

  // ── Populated state ──────────────────────────────────────────────────────

  return (
    <JunctionCardLayout>
      <HeroMetric
        value={`${doneCount}/${habits.length}`}
        label="Habits"
        color={doneCount === habits.length ? '#34d399' : JUNCTION_ACCENTS.se}
        sublabel={doneCount === habits.length ? 'All done this week' : undefined}
      />

      <ScrollZone>
        <div style={{ ...COLUMN_HEADER_STYLE, color: JUNCTION_ACCENTS.se }}>STREAKS</div>
        <PillList items={habitItems} showCheckboxes maxItems={6} />
      </ScrollZone>

      <ActionBar actions={[addAction]} />
    </JunctionCardLayout>
  );
}
