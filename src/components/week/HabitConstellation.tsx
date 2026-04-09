/**
 * HabitConstellation — Night Sky Star Map
 *
 * SVG-based constellation visualization for habit tracking.
 * Each habit is a star node. Completed habits glow emerald.
 * Constellation lines connect completed stars.
 *
 * UX principles:
 * - No-shame: dim stars are possibilities, not failures
 * - Calm Technology: ambient density, not nagging metrics
 * - 100ms Rule: click → instant visual feedback
 * - Diegetic UI: sky brightness reflects progress
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { HabitStreak } from '@/api/client';
import { useRecordHabit } from '@/hooks/useHabitStreaks';
import { getStarPositions, getConstellationLines } from './constellation-positions';

interface HabitConstellationProps {
  habits: HabitStreak[];
}

// Format habit name for display
function formatHabitName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function HabitConstellation({ habits }: HabitConstellationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 200 });
  const [undoTarget, setUndoTarget] = useState<string | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordHabit = useRecordHabit();

  // Optimistic state: track which habits we've optimistically toggled
  const [optimisticStates, setOptimisticStates] = useState<Record<string, boolean>>({});

  // Measure SVG container
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          setDimensions({ width, height: Math.max(160, Math.min(220, width * 0.4)) });
        }
      }
    });
    observer.observe(svg.parentElement!);
    return () => observer.disconnect();
  }, []);

  // Get resolved "recorded this week" state (optimistic overrides server)
  const getRecordedState = useCallback((habit: HabitStreak): boolean | null => {
    if (habit.habit_name in optimisticStates) {
      return optimisticStates[habit.habit_name];
    }
    return habit.display.recorded_this_week;
  }, [optimisticStates]);

  // Count completed habits
  const completedCount = habits.filter(h => getRecordedState(h) === true).length;
  const progress = habits.length > 0 ? completedCount / habits.length : 0;

  // Star positions
  const positions = getStarPositions(habits.length, dimensions.width, dimensions.height);
  const lines = getConstellationLines(habits.length);

  // Handle star click
  const handleStarClick = useCallback((habit: HabitStreak) => {
    const currentState = getRecordedState(habit);

    if (currentState === true) {
      // Already completed — show undo tooltip
      setUndoTarget(habit.habit_name);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setUndoTarget(null), 5000);
      return;
    }

    // Not recorded or was false — mark as done
    setOptimisticStates(prev => ({ ...prev, [habit.habit_name]: true }));
    recordHabit.mutate(
      { habitName: habit.habit_name, occurred: true },
      {
        onError: () => {
          // Revert optimistic update on error
          setOptimisticStates(prev => {
            const next = { ...prev };
            delete next[habit.habit_name];
            return next;
          });
        },
        onSuccess: () => {
          // Clear optimistic state once server confirms
          setOptimisticStates(prev => {
            const next = { ...prev };
            delete next[habit.habit_name];
            return next;
          });
        },
      }
    );
  }, [getRecordedState, recordHabit]);

  // Handle undo confirm
  const handleUndoConfirm = useCallback((habitName: string) => {
    setUndoTarget(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    setOptimisticStates(prev => ({ ...prev, [habitName]: false }));
    recordHabit.mutate(
      { habitName, occurred: false },
      {
        onError: () => {
          setOptimisticStates(prev => {
            const next = { ...prev };
            delete next[habitName];
            return next;
          });
        },
        onSuccess: () => {
          setOptimisticStates(prev => {
            const next = { ...prev };
            delete next[habitName];
            return next;
          });
        },
      }
    );
  }, [recordHabit]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Sky brightness based on completion progress
  const skyBrightness = 1 + progress * 0.15;

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          Habits
        </h4>
        <span className="text-xs text-slate-500">
          {completedCount}/{habits.length}
        </span>
      </div>

      {/* Constellation Canvas */}
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #030b1a, #0a1628)',
          filter: `brightness(${skyBrightness})`,
          transition: 'filter 300ms ease',
        }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height={dimensions.height}
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          className="block"
        >
          {/* Glow filter definition */}
          <defs>
            <filter id="star-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="star-glow-bright" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Ambient background particles */}
          {Array.from({ length: 20 }, (_, i) => (
            <circle
              key={`particle-${i}`}
              cx={((i * 37 + 13) % dimensions.width)}
              cy={((i * 23 + 7) % dimensions.height)}
              r={0.5 + (i % 3) * 0.3}
              fill="#94a3b8"
              opacity={0.08 + (i % 5) * 0.03}
            />
          ))}

          {/* Constellation lines (only between completed stars) */}
          {lines.map(([a, b]) => {
            const habitA = habits[a];
            const habitB = habits[b];
            if (!habitA || !habitB) return null;
            const isACompleted = getRecordedState(habitA) === true;
            const isBCompleted = getRecordedState(habitB) === true;

            if (!isACompleted || !isBCompleted) return null;

            const posA = positions[a];
            const posB = positions[b];
            if (!posA || !posB) return null;

            return (
              <line
                key={`line-${a}-${b}`}
                x1={posA.x}
                y1={posA.y}
                x2={posB.x}
                y2={posB.y}
                stroke="#34d399"
                strokeOpacity={0.2}
                strokeWidth={1}
                className="transition-opacity duration-500"
              />
            );
          })}

          {/* Star nodes */}
          {habits.map((habit, i) => {
            const pos = positions[i];
            if (!pos) return null;
            const recorded = getRecordedState(habit);
            const isCompleted = recorded === true;
            const isMissed = recorded === false;

            return (
              <g key={habit.habit_name}>
                {/* Clickable hit area */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={20}
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={() => handleStarClick(habit)}
                />

                {/* Star visual */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isCompleted ? 8 : isMissed ? 5 : 6}
                  fill={isCompleted ? '#34d399' : isMissed ? '#475569' : '#64748b'}
                  opacity={isCompleted ? 1 : isMissed ? 0.25 : 0.4}
                  filter={isCompleted ? 'url(#star-glow)' : undefined}
                  className="transition-all duration-200"
                />

                {/* Outer ring for unrecorded stars (clickable affordance) */}
                {recorded === null && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={10}
                    fill="none"
                    stroke="#64748b"
                    strokeWidth={0.5}
                    opacity={0.3}
                    className="animate-pulse"
                    style={{ animationDuration: '3s' }}
                  />
                )}

                {/* Label */}
                <text
                  x={pos.x}
                  y={pos.y + (isCompleted ? 18 : 16)}
                  textAnchor="middle"
                  className="text-[9px] fill-slate-400 select-none pointer-events-none"
                  style={{ fontSize: '9px' }}
                >
                  {formatHabitName(habit.habit_name)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Undo tooltip (positioned over the SVG) */}
        {undoTarget && (() => {
          const idx = habits.findIndex(h => h.habit_name === undoTarget);
          const pos = positions[idx];
          if (!pos) return null;

          return (
            <div
              className="absolute z-10 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 shadow-lg"
              style={{
                left: Math.min(Math.max(pos.x - 30, 8), dimensions.width - 80),
                top: Math.max(pos.y - 40, 4),
              }}
            >
              <button
                onClick={() => handleUndoConfirm(undoTarget)}
                className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors"
              >
                Undo?
              </button>
            </div>
          );
        })()}
      </div>

      {/* Forgiveness tokens info */}
      {habits.length > 0 && (() => {
        const totalTokens = habits.reduce((sum, h) => sum + h.forgiveness_tokens, 0);
        if (totalTokens <= 0) return null;
        return (
          <div className="mt-1.5 text-[10px] text-slate-600">
            {totalTokens} forgiveness token{totalTokens !== 1 ? 's' : ''} available
          </div>
        );
      })()}
    </div>
  );
}
