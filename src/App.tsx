/**
 * App.tsx - Application Root
 *
 * Auth gate: PIN required before app unlocks.
 * Single-page contextual app: WeekView (Grid/Smart) + slide-in context panels.
 * Cooking mode renders as full app takeover at this level.
 * No sidebar, no separate pages, no legacy routes.
 */

import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useAppStore } from './stores/appStore';
import { useAuthStore } from './stores/authStore';
import { useNotificationService } from './hooks';
import { useTheme } from './hooks/useTheme';
import { useBackendReady, useHasEverConnected } from './hooks/useBackendReady';
import { useSessionHeartbeat } from './hooks/useSessionHeartbeat';
import { startNewSession, endSession } from './services/observation';

// Auth UI
import { UserSelect } from './components/auth/UserSelect';
import { PinEntry } from './components/auth/PinEntry';
import { CreateUser } from './components/auth/CreateUser';

// Main UI
import { WeekView } from './components/week';
const RadialDashboard = lazy(() => import('./components/finance/radial/RadialDashboard').then(m => ({ default: m.RadialDashboard })));
import { CookingLayout } from './components/panels/CookingLayout';
import { SkipLink } from './components/shared/SkipLink';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useRecipe } from './hooks/useRecipes';
import { useMeals } from './hooks/useMeals';

// Auto-updater notification

// Backend health status banner
import { BackendStatus } from './components/shared/BackendStatus';

// Toast notifications
import { ToastContainer } from './components/shared/ToastContainer';

// ─── Auth Flow ───────────────────────────────────────────────────────────────

type AuthScreen = 'select' | 'pin' | 'create';

function AuthFlow() {
  const login = useAuthStore((s) => s.login);
  const [screen, setScreen] = useState<AuthScreen>('select');
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string } | null>(null);

  const handleSelectUser = useCallback((id: string, username: string) => {
    setSelectedUser({ id, username });
    setScreen('pin');
  }, []);

  const handleCreateUser = useCallback(() => {
    setScreen('create');
  }, []);

  const handleUserCreated = useCallback((userId: string, username: string) => {
    setSelectedUser({ id: userId, username });
    setScreen('pin');
  }, []);

  const handlePinSuccess = useCallback(
    (token: string, userId: string, username: string) => {
      login(token, userId, username);
    },
    [login]
  );

  const handleBack = useCallback(() => {
    setSelectedUser(null);
    setScreen('select');
  }, []);

  if (screen === 'pin' && selectedUser) {
    return (
      <PinEntry
        userId={selectedUser.id}
        username={selectedUser.username}
        onSuccess={handlePinSuccess}
        onBack={handleBack}
      />
    );
  }

  if (screen === 'create') {
    return (
      <CreateUser
        onCreated={handleUserCreated}
        onBack={handleBack}
        showBack={true}
      />
    );
  }

  return (
    <UserSelect
      onSelectUser={handleSelectUser}
      onCreateUser={handleCreateUser}
    />
  );
}

// ─── Default View Choice ─────────────────────────────────────────────────────

function DefaultViewModal({ onChoose }: { onChoose: (view: 'radial' | 'week') => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full mx-4 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-slate-100">Choose Your Default View</h2>
          <p className="text-sm text-slate-400">You can change this later in Settings.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onChoose('radial')}
            className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/60 transition-colors"
          >
            <div className="w-12 h-12 rounded-full border-2 border-cyan-400 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full bg-cyan-400/30" />
            </div>
            <span className="text-sm font-semibold text-cyan-300">Radial Hub</span>
            <span className="text-xs text-slate-500 text-center">Domain-focused arcs</span>
          </button>
          <button
            onClick={() => onChoose('week')}
            className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-slate-600 bg-slate-800/50 hover:bg-slate-700/50 hover:border-slate-500 transition-colors"
          >
            <div className="w-12 h-12 rounded-lg border-2 border-slate-400 flex items-center justify-center">
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="w-1 h-3 bg-slate-400/40 rounded-sm" />
                ))}
              </div>
            </div>
            <span className="text-sm font-semibold text-slate-300">Weekly Grid</span>
            <span className="text-xs text-slate-500 text-center">Date-focused overview</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

function MainApp() {
  // Initialize notification service
  useNotificationService();

  // Backend readiness gate
  const backendReady = useBackendReady();

  // Get app-level state from Zustand store
  const {
    activeView,
    setActiveView,
    isCookingMode,
    cookingRecipeId,
    cookingMealId,
    exitCookingMode,
    hasChosenDefaultView,
    setDefaultView,
  } = useAppStore();

  // Fetch meals for cooking mode lookup
  const { data: meals = [] } = useMeals();

  // Fetch full recipe with ingredients when in cooking mode
  const { data: fullCookingRecipe } = useRecipe(cookingRecipeId ?? 0);

  // Start observation session only after backend is ready
  useEffect(() => {
    if (!backendReady) return;

    startNewSession();

    const handleBeforeUnload = () => {
      endSession();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      endSession();
    };
  }, [backendReady]);

  // Cooking mode lookup
  const cookingRecipe = isCookingMode && fullCookingRecipe ? fullCookingRecipe : null;
  const cookingMeal = isCookingMode && cookingMealId
    ? meals.find(m => m.id === cookingMealId)
    : null;

  // DEFAULT VIEW CHOICE: Show modal on first launch
  if (!hasChosenDefaultView) {
    return (
      <>
        <BackendStatus />
        <DefaultViewModal onChoose={setDefaultView} />
      </>
    );
  }

  // COOKING MODE: Full app takeover (cognitive mode shift, not an overlay)
  if (isCookingMode && cookingRecipeId) {
    if (!cookingRecipe) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4" />
            <p className="text-slate-400">Loading recipe...</p>
          </div>
        </div>
      );
    }
    return (
      <>
        <BackendStatus />
        <ErrorBoundary>
          <CookingLayout
            recipe={cookingRecipe}
            meal={cookingMeal ?? null}
            onClose={exitCookingMode}
            onDone={exitCookingMode}
          />
        </ErrorBoundary>
        <ToastContainer />
      </>
    );
  }

  // RADIAL HUB: Default app view — the radial dashboard IS the app
  if (activeView === 'radial') {
    return (
      <>
        <SkipLink />
        <BackendStatus />
        <ErrorBoundary>
          <Suspense fallback={
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
            </div>
          }>
            <RadialDashboard />
          </Suspense>
        </ErrorBoundary>
        <ToastContainer />
        <div id="a11y-announcer" role="status" aria-live="polite" className="sr-only" />
      </>
    );
  }

  // WEEK VIEW: Traditional week grid + context panels
  return (
    <>
      <SkipLink />
      <BackendStatus />
      <main id="main-content" role="main">
        <ErrorBoundary>
          <WeekView />
        </ErrorBoundary>
      </main>
      <ToastContainer />
      <div id="a11y-announcer" role="status" aria-live="polite" className="sr-only" />
    </>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const backendReady = useBackendReady();
  const hasEverConnected = useHasEverConnected();

  // Theme must be initialized at root level
  useTheme();

  // Keep session alive while app is open (prevents 5-min idle timeout)
  useSessionHeartbeat();

  // Hard gate ONLY during initial startup (backend never responded yet).
  // After first successful connection, let the dashboard render with a
  // reconnection banner instead of dropping back to a blank loading screen.
  if (!backendReady && !hasEverConnected) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fuchsia-500 mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Starting backend...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthFlow />;
  }

  return <MainApp />;
}

export default App;
