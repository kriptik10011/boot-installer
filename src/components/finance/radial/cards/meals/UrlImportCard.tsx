/**
 * UrlImportCard — Meals sub-arc "IMPORT" interactive card.
 *
 * Rectangular: URL input → full editable preview with ingredients,
 *   coverage score, alternatives, instructions.
 * Circular: URL input → coverage ring → tap Edit for scrollable form.
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  recipesApi,
  type ImportPreviewResponse,
  type ExtractedRecipe,
  type ExtractedIngredient,
  type ImportConfirmRequest,
  type CoverageCheckResponse,
} from '@/api';
import { recipeKeys, useCreateMeal } from '@/hooks';
import type { MealType } from '@/types';
import { useToastStore } from '@/stores/toastStore';
import { CARD_SIZES, SUB_ARC_ACCENTS } from '../../cardTemplate';
import { scaleQuantity } from '@/utils/portionScaling';
import { getMonday, addDays, getTodayLocal } from '@/utils/dateUtils';
type ImportState = 'idle' | 'loading' | 'preview' | 'saving' | 'success' | 'error';

export function UrlImportCard() {
  const queryClient = useQueryClient();

  // URL + state
  const [url, setUrl] = useState('');
  const [state, setState] = useState<ImportState>('idle');
  const [preview, setPreview] = useState<ExtractedRecipe | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Editable fields (initialized from preview)
  const [editName, setEditName] = useState('');
  const [editPrepTime, setEditPrepTime] = useState('');
  const [editCookTime, setEditCookTime] = useState('');
  const [editServings, setEditServings] = useState('');
  const [editIngredients, setEditIngredients] = useState<ExtractedIngredient[]>([]);
  const [editInstructions, setEditInstructions] = useState('');
  const [editCuisineType, setEditCuisineType] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [originalIngredients, setOriginalIngredients] = useState<ExtractedIngredient[]>([]);
  const [originalServings, setOriginalServings] = useState(4);

  // Coverage
  const [coverage, setCoverage] = useState<CoverageCheckResponse | undefined>();

  const coverageMutation = useMutation({
    mutationFn: (names: string[]) => recipesApi.checkCoverage(names),
    onSuccess: setCoverage,
  });

  const previewMutation = useMutation({
    mutationFn: (recipeUrl: string) => recipesApi.importPreview(recipeUrl),
    onSuccess: (response: ImportPreviewResponse) => {
      if (response.success && response.recipe) {
        const r = response.recipe;
        setPreview(r);
        setState('preview');
        setErrorMsg('');
        // Initialize editable fields
        setEditName(r.name);
        setEditPrepTime(r.prep_time_minutes?.toString() ?? '');
        setEditCookTime(r.cook_time_minutes?.toString() ?? '');
        setEditServings(r.servings?.toString() ?? '');
        setEditIngredients(r.ingredients);
        setEditInstructions(r.instructions);
        setEditCuisineType(r.cuisine_type ?? '');
        setEditNotes(r.notes ?? '');
        setOriginalIngredients(r.ingredients);
        setOriginalServings(r.servings ?? 4);
        // Auto-fire coverage check
        const names = r.ingredients.map((i) => i.name).filter(Boolean);
        if (names.length > 0) coverageMutation.mutate(names);
      } else {
        setState('error');
        setErrorMsg(response.error_message ?? 'Could not extract recipe');
      }
    },
    onError: (err: Error) => {
      setState('error');
      setErrorMsg(err.message ?? 'Import failed');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      const data: ImportConfirmRequest = {
        name: editName,
        instructions: editInstructions,
        ingredients: editIngredients
          .filter((i) => i.name.trim())
          .map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, notes: i.notes })),
        prep_time_minutes: editPrepTime ? parseInt(editPrepTime, 10) : null,
        cook_time_minutes: editCookTime ? parseInt(editCookTime, 10) : null,
        servings: editServings ? parseInt(editServings, 10) : null,
        source_url: preview?.source_url ?? url,
        cuisine_type: editCuisineType.trim() || null,
        notes: editNotes.trim() || null,
      };
      return recipesApi.importConfirm(data);
    },
    onSuccess: () => {
      setState('success');
      queryClient.invalidateQueries({ queryKey: recipeKeys.all });
    },
    onError: (err: Error) => {
      setState('error');
      setErrorMsg(err.message ?? 'Save failed');
    },
  });

  const handleImport = useCallback(() => {
    if (!url.trim()) return;
    setState('loading');
    previewMutation.mutate(url.trim());
  }, [url, previewMutation]);

  const handleConfirm = useCallback(() => {
    setState('saving');
    confirmMutation.mutate();
  }, [confirmMutation]);

  const handleReset = useCallback(() => {
    setUrl('');
    setState('idle');
    setPreview(null);
    setErrorMsg('');
    setCoverage(undefined);
    setEditIngredients([]);
    setEditInstructions('');
    setEditName('');
    setEditPrepTime('');
    setEditCookTime('');
    setEditServings('');
  }, []);

  const handleServingsChange = useCallback(
    (newVal: string) => {
      setEditServings(newVal);
      const num = parseInt(newVal, 10);
      if (isNaN(num) || num < 1) return;
      const factor = num / originalServings;
      const scaled = originalIngredients.map((ing) => {
        if (!ing.quantity) return ing;
        try {
          const qtyStr = `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}`;
          const result = scaleQuantity(qtyStr, factor);
          const parts = result.split(' ');
          return { ...ing, quantity: parts[0] };
        } catch {
          return ing;
        }
      });
      setEditIngredients(scaled);
    },
    [originalIngredients, originalServings],
  );

  // Save recipe and return its ID (for circular mode meal assignment)
  const handleSaveAndGetId = useCallback(async (): Promise<number | null> => {
    try {
      const data: ImportConfirmRequest = {
        name: editName,
        instructions: editInstructions,
        ingredients: editIngredients
          .filter((i) => i.name.trim())
          .map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, notes: i.notes })),
        prep_time_minutes: editPrepTime ? parseInt(editPrepTime, 10) : null,
        cook_time_minutes: editCookTime ? parseInt(editCookTime, 10) : null,
        servings: editServings ? parseInt(editServings, 10) : null,
        source_url: preview?.source_url ?? url,
        cuisine_type: editCuisineType.trim() || null,
        notes: editNotes.trim() || null,
      };
      const recipe = await recipesApi.importConfirm(data);
      queryClient.invalidateQueries({ queryKey: recipeKeys.all });
      return recipe.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useToastStore.getState().addToast({
        message: `Save failed: ${msg}`,
        type: 'error',
        durationMs: 6000,
      });
      return null;
    }
  }, [editName, editInstructions, editIngredients, editPrepTime, editCookTime, editServings, preview, url, queryClient]);

  return (
    <UrlImportCircular
      url={url}
      setUrl={setUrl}
      state={state}
      preview={preview}
      errorMsg={errorMsg}
      editName={editName}
      editPrepTime={editPrepTime}
      editCookTime={editCookTime}
      editIngredients={editIngredients}
      editInstructions={editInstructions}
      coverage={coverage}
      coverageLoading={coverageMutation.isPending}
      onImport={handleImport}
      onConfirm={handleConfirm}
      onSaveAndGetId={handleSaveAndGetId}
      onReset={handleReset}
      isSaving={confirmMutation.isPending}
    />
  );
}

// ─── Bezel: Ingredient coverage arcs ────────────────────────────────────────

/** Reusable arc path (matches MealWidgets.tsx arcPath) */
function bezelArcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  if (Math.abs(sweepDeg) < 0.01) return '';
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(startDeg + sweepDeg));
  const y2 = cy + r * Math.sin(toRad(startDeg + sweepDeg));
  const large = Math.abs(sweepDeg) > 180 ? 1 : 0;
  const sweep = sweepDeg > 0 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
}

function bezelCirclePoint(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Ingredient coverage bezel — N arcs across top 180° (190° to 350°).
 * Green = in stock, Amber = missing. Hairline style matching MealsBezelSvg.
 * Rendered inline (sub-arc cards don't get CircularCard's bezel layer).
 */
function IngredientCoverageBezelSvg({
  ingredients,
  coverage,
  size,
}: {
  ingredients: ExtractedIngredient[];
  coverage?: CoverageCheckResponse;
  size: number;
}) {
  const n = ingredients.length;
  if (n === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.92;
  const strokeW = size * 0.004;
  const gapDeg = 4;
  const totalSweep = 160; // 190° to 350° = 160° of arc space
  const segDeg = (totalSweep - (n - 1) * gapDeg) / n;
  const baseStart = 190; // top-left, sweeping clockwise across top

  // Build coverage lookup
  const statusMap = new Map(
    coverage?.ingredients.map((s) => [s.name.toLowerCase().trim(), s.in_stock]) ?? [],
  );

  const arcs = ingredients.map((ing, i) => {
    const inStock = statusMap.get(ing.name.toLowerCase().trim()) ?? false;
    return {
      start: baseStart + i * (segDeg + gapDeg),
      inStock,
      hasCoverage: coverage != null,
    };
  });

  // Junction dots between arcs
  const junctions = arcs.slice(0, -1).map((arc, i) => {
    const gapMid = arc.start + segDeg + gapDeg / 2;
    return bezelCirclePoint(cx, cy, r, gapMid);
  });

  const filterId = 'ing-coverage-glow';

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 5 }}
    >
      <defs>
        <filter id={filterId} x="0" y="0" width={size} height={size} filterUnits="userSpaceOnUse">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>
      </defs>

      {/* Track arcs — dim */}
      {arcs.map((a, i) => (
        <path
          key={`track-${i}`}
          d={bezelArcPath(cx, cy, r, a.start, segDeg)}
          fill="none"
          stroke={a.hasCoverage ? (a.inStock ? '#34d399' : '#fbbf24') : '#64748b'}
          strokeWidth={strokeW}
          strokeOpacity={0.15}
          strokeLinecap="round"
        />
      ))}

      {/* Glow layer behind filled arcs */}
      {arcs.map((a, i) =>
        a.hasCoverage ? (
          <path
            key={`glow-${i}`}
            d={bezelArcPath(cx, cy, r, a.start, segDeg)}
            fill="none"
            stroke={a.inStock ? '#34d399' : '#fbbf24'}
            strokeWidth={strokeW * 2.5}
            strokeOpacity={0.3}
            strokeLinecap="round"
            filter={`url(#${filterId})`}
          />
        ) : null,
      )}

      {/* Filled arcs */}
      {arcs.map((a, i) =>
        a.hasCoverage ? (
          <path
            key={`fill-${i}`}
            d={bezelArcPath(cx, cy, r, a.start, segDeg)}
            fill="none"
            stroke={a.inStock ? '#34d399' : '#fbbf24'}
            strokeWidth={strokeW}
            strokeOpacity={0.7}
            strokeLinecap="round"
          />
        ) : null,
      )}

      {/* Junction dots */}
      {junctions.map((p, i) => (
        <circle key={`junc-${i}`} cx={p.x} cy={p.y} r={size * 0.004} fill="#475569" />
      ))}
    </svg>
  );
}

// ─── Circular mode ──────────────────────────────────────────────────────────

type CircularView = 'preview' | 'datePicker' | 'mealSlot';

interface CircularProps {
  url: string;
  setUrl: (url: string) => void;
  state: ImportState;
  preview: ExtractedRecipe | null;
  errorMsg: string;
  editName: string;
  editPrepTime: string;
  editCookTime: string;
  editIngredients: ExtractedIngredient[];
  editInstructions: string;
  coverage: CoverageCheckResponse | undefined;
  coverageLoading: boolean;
  onImport: () => void;
  onConfirm: () => void;
  onSaveAndGetId: () => Promise<number | null>;
  onReset: () => void;
  isSaving: boolean;
}

/** Day-of-week headers */
const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MEAL_LABELS: { type: MealType; label: string; emoji: string }[] = [
  { type: 'breakfast', label: 'Breakfast', emoji: 'B' },
  { type: 'lunch', label: 'Lunch', emoji: 'L' },
  { type: 'dinner', label: 'Dinner', emoji: 'D' },
];

function UrlImportCircular({
  url,
  setUrl,
  state,
  preview,
  errorMsg,
  editName,
  editPrepTime,
  editCookTime,
  editIngredients,
  editInstructions,
  coverage,
  coverageLoading,
  onImport,
  onConfirm,
  onSaveAndGetId,
  onReset,
  isSaving,
}: CircularProps) {
  const addToast = useToastStore((s) => s.addToast);
  const createMealMutation = useCreateMeal();

  // Circular view state
  const [circularView, setCircularView] = useState<CircularView>('preview');
  const [savedToBook, setSavedToBook] = useState(false);
  const [savedRecipeId, setSavedRecipeId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [savingBook, setSavingBook] = useState(false);

  // Save to recipe book
  const handleSaveToBook = useCallback(async () => {
    if (savedToBook || savingBook) return;
    setSavingBook(true);
    const id = await onSaveAndGetId();
    setSavingBook(false);
    if (id != null) {
      setSavedToBook(true);
      setSavedRecipeId(id);
    }
    // Error toast is shown by handleSaveAndGetId
  }, [savedToBook, savingBook, onSaveAndGetId]);

  // Create meal flow: save first if needed, then → date picker
  const handleCreateMeal = useCallback(async () => {
    if (savingBook) return;
    let recipeId = savedRecipeId;
    if (!savedToBook) {
      setSavingBook(true);
      recipeId = await onSaveAndGetId();
      setSavingBook(false);
      if (recipeId != null) {
        setSavedToBook(true);
        setSavedRecipeId(recipeId);
      } else {
        // Error toast is shown by handleSaveAndGetId
        return;
      }
    }
    if (recipeId != null) {
      setCircularView('datePicker');
    }
  }, [savingBook, savedToBook, savedRecipeId, onSaveAndGetId]);

  // Assign to meal slot
  const handleAssignMeal = useCallback((mealType: MealType) => {
    if (!selectedDate || !savedRecipeId) return;
    createMealMutation.mutate(
      { date: selectedDate, meal_type: mealType, recipe_id: savedRecipeId, description: editName },
      {
        onSuccess: () => {
          const dayLabel = formatShortDate(selectedDate);
          const slotLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
          addToast({ message: `Added to ${dayLabel} ${slotLabel}!`, type: 'success', durationMs: 4000 });
          setCircularView('preview');
          setSelectedDate(null);
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          addToast({ message: `Failed to create meal: ${msg}`, type: 'error', durationMs: 6000 });
        },
      },
    );
  }, [selectedDate, savedRecipeId, editName, createMealMutation, addToast]);

  // Reset circular state on full reset
  const handleFullReset = useCallback(() => {
    setSavedToBook(false);
    setSavedRecipeId(null);
    setSelectedDate(null);
    setCircularView('preview');
    onReset();
  }, [onReset]);

  // Loading
  if (state === 'loading') {
    return (
      <div className="absolute inset-0" style={{ containerType: 'inline-size' }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: '2cqi' }}>
          <div
            className="border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin"
            style={{ width: '10cqi', height: '10cqi' }}
          />
          <span className="text-slate-400" style={{ fontSize: '3cqi' }}>Extracting...</span>
        </div>
      </div>
    );
  }

  // Error
  if (state === 'error') {
    return (
      <div className="absolute inset-0" style={{ containerType: 'inline-size' }}>
        <div
          className="absolute flex flex-col items-center justify-center"
          style={{ top: '20%', bottom: '20%', left: '18%', right: '18%', gap: '2cqi' }}
        >
          <div
            className="text-amber-400 bg-amber-500/10 rounded-lg text-center border border-amber-500/20 max-w-full"
            style={{ fontSize: '2.8cqi', padding: '1.5cqi 2cqi' }}
          >
            {errorMsg}
          </div>
          <button
            onClick={handleFullReset}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            style={{ fontSize: '2.8cqi' }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Preview / saving — 3-view state machine
  if ((state === 'preview' || state === 'saving') && preview) {
    // Build coverage lookup
    const statusMap = new Map(
      coverage?.ingredients.map((s) => [s.name.toLowerCase().trim(), s.in_stock]) ?? [],
    );
    const hasCovData = coverage != null;

    // Time pills
    const timeParts: string[] = [];
    const prep = parseInt(editPrepTime, 10);
    const cook = parseInt(editCookTime, 10);
    if (!isNaN(prep) && prep > 0) timeParts.push(`${prep}m prep`);
    if (!isNaN(cook) && cook > 0) timeParts.push(`${cook}m cook`);

    // Steps from instructions
    const steps = editInstructions
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    // ── View 2: Date Picker ──
    if (circularView === 'datePicker') {
      return (
        <div className="absolute inset-0" style={{ containerType: 'inline-size' }}>
          <IngredientCoverageBezelSvg ingredients={editIngredients} coverage={coverage} size={400} />
          <div
            className="absolute flex flex-col items-center"
            style={{ top: '15%', bottom: '15%', left: '18%', right: '18%' }}
          >
            <button
              onClick={() => setCircularView('preview')}
              className="text-slate-400 hover:text-slate-200 transition-colors self-start"
              style={{ fontSize: '2.8cqi', marginBottom: '1cqi' }}
            >
              ← Back
            </button>

            <span
              className="text-slate-200 font-medium"
              style={{ fontSize: `${CARD_SIZES.labelText}cqi`, marginBottom: '2cqi', fontFamily: "'Space Grotesk', system-ui" }}
            >
              Pick a date
            </span>

            <TwoWeekCalendar onSelectDate={(date) => { setSelectedDate(date); setCircularView('mealSlot'); }} />
          </div>
        </div>
      );
    }

    // ── View 3: Meal Slot Picker ──
    if (circularView === 'mealSlot' && selectedDate) {
      return (
        <div className="absolute inset-0" style={{ containerType: 'inline-size' }}>
          <IngredientCoverageBezelSvg ingredients={editIngredients} coverage={coverage} size={400} />
          <div
            className="absolute flex flex-col items-center justify-center"
            style={{ top: '15%', bottom: '15%', left: '18%', right: '18%' }}
          >
            <button
              onClick={() => setCircularView('datePicker')}
              className="text-slate-400 hover:text-slate-200 transition-colors self-start"
              style={{ fontSize: '2.8cqi', marginBottom: '2cqi' }}
            >
              ← Back
            </button>

            <span
              className="text-slate-200 font-medium"
              style={{ fontSize: `${CARD_SIZES.labelText}cqi`, marginBottom: '3cqi', fontFamily: "'Space Grotesk', system-ui" }}
            >
              {formatShortDate(selectedDate)}
            </span>

            <div className="flex" style={{ gap: '4cqi' }}>
              {MEAL_LABELS.map(({ type, label, emoji }) => (
                <button
                  key={type}
                  onClick={() => handleAssignMeal(type)}
                  disabled={createMealMutation.isPending}
                  className="flex flex-col items-center group"
                  style={{ gap: '1.5cqi' }}
                >
                  <div
                    className="rounded-full border-2 border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center font-bold text-emerald-300 group-hover:bg-emerald-500/25 group-hover:border-emerald-500/50 transition-colors"
                    style={{ width: '14cqi', height: '14cqi', fontSize: '5cqi' }}
                  >
                    {emoji}
                  </div>
                  <span className="text-slate-400 uppercase tracking-wider" style={{ fontSize: '2.2cqi' }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // ── View 1: Preview + Actions (default) ──
    return (
      <div className="absolute inset-0" style={{ containerType: 'inline-size' }}>
        <IngredientCoverageBezelSvg ingredients={editIngredients} coverage={coverage} size={400} />

        {/* Content inscribed within the circle — generous padding for curved edges */}
        <div
          className="absolute flex flex-col"
          style={{ top: '12%', bottom: '10%', left: '16%', right: '16%' }}
        >
          {/* Top: recipe name + time pills */}
          <div className="flex flex-col items-center" style={{ paddingTop: '1cqi' }}>
            <span
              className="font-bold text-slate-200 truncate max-w-full text-center leading-tight"
              style={{ fontSize: '4cqi', fontFamily: "'Space Grotesk', system-ui" }}
            >
              {editName}
            </span>
            {timeParts.length > 0 && (
              <span className="text-slate-500" style={{ fontSize: '2.4cqi', marginTop: '0.5cqi' }}>
                {timeParts.join(' · ')}
              </span>
            )}
          </div>

          {/* Middle: two scrollable columns */}
          <div className="flex min-h-0 flex-1" style={{ marginTop: '2cqi', gap: '1.5cqi' }}>
            {/* Steps column */}
            {steps.length > 0 && (
              <div
                className="flex-1 overflow-y-auto rounded-xl min-h-0"
                style={{ border: '1px solid rgba(100,116,139,0.15)', padding: '1.5cqi 2cqi' }}
              >
                {steps.map((step, i) => (
                  <div key={i} className="flex" style={{ gap: '0.8cqi', marginBottom: '0.6cqi' }}>
                    <span className="text-slate-600 flex-shrink-0" style={{ fontSize: '2.2cqi' }}>{i + 1}.</span>
                    <span className="text-slate-400 leading-snug" style={{ fontSize: '2.2cqi' }}>{step}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Ingredients column with stock dots */}
            {editIngredients.length > 0 && (
              <div
                className="flex-1 overflow-y-auto rounded-xl min-h-0"
                style={{ border: '1px solid rgba(100,116,139,0.15)', padding: '1.5cqi 2cqi' }}
              >
                {editIngredients.map((ing, i) => {
                  const inStock = statusMap.get(ing.name.toLowerCase().trim());
                  const dotColor = !hasCovData ? '#64748b' : inStock ? '#34d399' : '#fbbf24';
                  return (
                    <div
                      key={i}
                      className="flex items-center"
                      style={{ gap: '1cqi', marginBottom: '0.5cqi' }}
                    >
                      <span
                        className="inline-block rounded-full flex-shrink-0"
                        style={{ width: '1.2cqi', height: '1.2cqi', backgroundColor: dotColor }}
                      />
                      <span className="text-slate-300 truncate" style={{ fontSize: '2.2cqi' }}>{ing.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom: two buttons + import another link */}
          <div className="flex flex-col items-center" style={{ gap: '1cqi', marginTop: '1.5cqi' }}>
            <div className="flex" style={{ gap: '2cqi' }}>
              <button
                onClick={handleSaveToBook}
                disabled={savedToBook || savingBook}
                className="font-medium rounded-full transition-colors disabled:opacity-60"
                style={{
                  fontSize: '2.8cqi',
                  padding: '0.8cqi 3cqi',
                  background: savedToBook ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.15)',
                  color: savedToBook ? '#10b981' : '#a7f3d0',
                  border: `1px solid ${savedToBook ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.2)'}`,
                }}
              >
                {savedToBook ? '✓ Saved' : savingBook ? '...' : 'Recipe Book'}
              </button>
              <button
                onClick={handleCreateMeal}
                disabled={savingBook || createMealMutation.isPending}
                className="font-medium rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors disabled:opacity-40"
                style={{ fontSize: '2.8cqi', padding: '0.8cqi 3cqi' }}
              >
                {savingBook ? '...' : 'Create Meal'}
              </button>
            </div>
            <button
              onClick={handleFullReset}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              style={{ fontSize: '2.2cqi' }}
            >
              Import another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Idle
  return (
    <div className="absolute inset-0" style={{ containerType: 'inline-size' }}>
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{ top: '18%', bottom: '18%', left: '18%', right: '18%', gap: '2.5cqi' }}
      >
        <div
          className="rounded-full bg-emerald-500/10 flex items-center justify-center"
          style={{ width: '12cqi', height: '12cqi' }}
        >
          <svg
            className="text-emerald-400/60"
            style={{ width: '6cqi', height: '6cqi' }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </div>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste recipe URL..."
          className="w-full bg-slate-800/80 text-slate-200 rounded-full border border-white/10 placeholder-slate-600 focus:outline-none focus:border-emerald-500/40 text-center"
          style={{ fontSize: '3cqi', padding: '1.5cqi 3cqi' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onImport();
          }}
        />
        <button
          onClick={onImport}
          disabled={!url.trim()}
          className="font-medium rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
          style={{ fontSize: '3cqi', padding: '1.2cqi 5cqi' }}
        >
          Import
        </button>
      </div>
    </div>
  );
}

// ─── Two-week calendar helper ───────────────────────────────────────────────

function TwoWeekCalendar({ onSelectDate }: { onSelectDate: (date: string) => void }) {
  const todayStr = getTodayLocal();
  const monday = getMonday();

  // Build 14 days: current week + next week
  const days: string[] = [];
  for (let i = 0; i < 14; i++) {
    days.push(addDays(monday, i));
  }

  // Month/year header from first day
  const firstDate = new Date(monday + 'T00:00:00');
  const monthYear = firstDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="w-full">
      <div className="text-slate-500 text-center" style={{ fontSize: '2.4cqi', marginBottom: '1.5cqi' }}>
        {monthYear}
      </div>

      {/* DOW headers */}
      <div className="grid grid-cols-7" style={{ gap: '0.5cqi', marginBottom: '1cqi' }}>
        {DOW_LABELS.map((d, i) => (
          <div key={i} className="text-center text-slate-600 uppercase" style={{ fontSize: '2cqi' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7" style={{ gap: '0.5cqi' }}>
        {days.map((dateStr) => {
          const day = parseInt(dateStr.slice(-2), 10);
          const isToday = dateStr === todayStr;
          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className="aspect-square rounded-full flex items-center justify-center transition-colors hover:bg-emerald-500/20"
              style={{
                fontSize: '2.6cqi',
                color: isToday ? '#10b981' : '#cbd5e1',
                border: isToday ? '1.5px solid #10b981' : '1px solid transparent',
                fontWeight: isToday ? 700 : 400,
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Date format helper ─────────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
