/**
 * UrlImportCard — Render tests for the multi-state URL import flow.
 *
 * State machine covered: idle, loading (isPending), preview, error.
 * The exported UrlImportCard wraps UrlImportCircular; tests drive state
 * transitions through useMutation mock behaviour.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Module mocks declared BEFORE component import ────────────────────────────

vi.mock('@/stores/toastStore', () => ({
  useToastStore: vi.fn((selector: (s: { addToast: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ addToast: vi.fn() }),
  ),
}));

vi.mock('@/utils/dateUtils', () => ({
  getMonday: vi.fn(() => '2026-03-16'),
  getTodayLocal: vi.fn(() => '2026-03-16'),
  addDays: vi.fn((_base: string, days: number) => {
    const d = new Date('2026-03-16T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }),
}));

vi.mock('@/utils/portionScaling', () => ({
  scaleQuantity: vi.fn((qty: string) => qty),
}));

vi.mock('@/components/finance/radial/cards/subArcCardTemplate', () => ({
  CARD_SIZES: { labelText: 3.5 },
  SUB_ARC_ACCENTS: { meals: '#10b981' },
}));

vi.mock('@/components/finance/radial/cards/shared/arcHelpers', () => ({
  arcPath: vi.fn(() => 'M 0 0'),
  circlePoint: vi.fn(() => ({ x: 0, y: 0 })),
}));

// Mutable behaviour flags — changed per test to simulate different mutation states.
// UrlImportCard calls useMutation three times in this order:
//   1. coverageMutation  (ingredient stock check)
//   2. previewMutation   (URL import preview)
//   3. confirmMutation   (save recipe)
// We only want to control the previewMutation (call #2).

type MutationOpts = {
  mutationFn: (arg: unknown) => Promise<unknown>;
  onSuccess?: (data: unknown) => void;
  onError?: (err: Error) => void;
};

let overrideMutationBehaviour: 'idle' | 'pending' | 'resolve' | 'reject' = 'idle';
let resolvePayload: unknown = null;
let rejectError: Error = new Error('Import failed');

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useMutation: vi.fn((opts: MutationOpts) => {
      // Identify the mutation by which API function it references.
      // We inspect the toString() of mutationFn to distinguish them —
      // this is stable across test re-renders and does not rely on call order.
      const fnStr = opts.mutationFn.toString();
      const isPreviewMutation = fnStr.includes('importPreview');

      const mutate = vi.fn((_arg: unknown) => {
        if (!isPreviewMutation) return;
        if (overrideMutationBehaviour === 'resolve' && opts.onSuccess) {
          opts.onSuccess(resolvePayload);
        } else if (overrideMutationBehaviour === 'reject' && opts.onError) {
          opts.onError(rejectError);
        }
      });

      return {
        mutate,
        mutateAsync: vi.fn(),
        isPending: isPreviewMutation && overrideMutationBehaviour === 'pending',
        isError: false,
        isSuccess: false,
        reset: vi.fn(),
      };
    }),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  };
});

vi.mock('@/hooks', () => ({
  recipeKeys: { all: ['recipes'] },
  useCreateMeal: vi.fn(() => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

vi.mock('@/api', () => ({
  recipesApi: {
    importPreview: vi.fn(),
    importConfirm: vi.fn(),
    checkCoverage: vi.fn(),
  },
}));

// Import AFTER mocks are registered.
import { UrlImportCard } from '@/components/finance/radial/cards/meals/UrlImportCard';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderCard() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <UrlImportCard />
    </QueryClientProvider>,
  );
}

const VALID_URL = 'https://example.com/recipe';

const MOCK_RECIPE = {
  name: 'Spaghetti Carbonara',
  instructions: 'Step 1.\nStep 2.',
  ingredients: [
    { name: 'pasta', quantity: '200', unit: 'g', notes: null, raw_text: '200g pasta' },
  ],
  prep_time_minutes: 10,
  cook_time_minutes: 20,
  total_time_minutes: 30,
  servings: 4,
  source_url: VALID_URL,
  source_site: 'example.com',
  image_url: null,
  cuisine_type: null,
  notes: null,
  confidence: 0.9,
  extraction_method: 'schema',
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('UrlImportCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overrideMutationBehaviour = 'idle';
    resolvePayload = null;
    rejectError = new Error('Import failed');
  });

  // ── Idle state ──────────────────────────────────────────────────────────────

  describe('idle state', () => {
    it('renders the URL input field', () => {
      renderCard();
      expect(screen.getByPlaceholderText('Paste recipe URL...')).toBeDefined();
    });

    it('renders the Import button', () => {
      renderCard();
      expect(screen.getByRole('button', { name: /^import$/i })).toBeDefined();
    });

    it('Import button is disabled when URL input is empty', () => {
      renderCard();
      const btn = screen.getByRole('button', { name: /^import$/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('Import button becomes enabled after typing a URL', () => {
      renderCard();
      const input = screen.getByPlaceholderText('Paste recipe URL...');
      fireEvent.change(input, { target: { value: VALID_URL } });
      const btn = screen.getByRole('button', { name: /^import$/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
  });

  // ── Loading state ───────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows the extracting label when the mutation is pending', () => {
      // With isPending=true the mutation fires but never resolves, so the
      // component transitions to 'loading' and stays there.
      overrideMutationBehaviour = 'pending';

      renderCard();
      const input = screen.getByPlaceholderText('Paste recipe URL...');
      fireEvent.change(input, { target: { value: VALID_URL } });
      fireEvent.click(screen.getByRole('button', { name: /^import$/i }));

      expect(screen.getByText(/extracting/i)).toBeDefined();
    });
  });

  // ── Error state ─────────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows an error message when the preview mutation rejects', () => {
      overrideMutationBehaviour = 'reject';
      rejectError = new Error('Could not extract recipe');

      renderCard();
      const input = screen.getByPlaceholderText('Paste recipe URL...');
      fireEvent.change(input, { target: { value: VALID_URL } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /^import$/i }));
      });

      expect(screen.getByText(/could not extract recipe/i)).toBeDefined();
    });

    it('shows a Try again button in the error state', () => {
      overrideMutationBehaviour = 'reject';
      rejectError = new Error('Server error');

      renderCard();
      const input = screen.getByPlaceholderText('Paste recipe URL...');
      fireEvent.change(input, { target: { value: VALID_URL } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /^import$/i }));
      });

      expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
    });
  });

  // ── Preview state ───────────────────────────────────────────────────────────

  describe('preview state', () => {
    function triggerPreview() {
      overrideMutationBehaviour = 'resolve';
      resolvePayload = {
        success: true,
        recipe: MOCK_RECIPE,
        error_message: null,
        ai_prompt: null,
        source_url: VALID_URL,
      };

      renderCard();
      const input = screen.getByPlaceholderText('Paste recipe URL...');
      fireEvent.change(input, { target: { value: VALID_URL } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /^import$/i }));
      });
    }

    it('shows the recipe name after a successful preview', () => {
      triggerPreview();
      expect(screen.getByText('Spaghetti Carbonara')).toBeDefined();
    });

    it('shows the Recipe Book action button in preview state', () => {
      triggerPreview();
      expect(screen.getByRole('button', { name: /recipe book/i })).toBeDefined();
    });

    it('shows the Create Meal action button in preview state', () => {
      triggerPreview();
      expect(screen.getByRole('button', { name: /create meal/i })).toBeDefined();
    });

    it('shows the Import another link in preview state', () => {
      triggerPreview();
      expect(screen.getByRole('button', { name: /import another/i })).toBeDefined();
    });
  });
});
