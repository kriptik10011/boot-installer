/**
 * UserSelect — Auth router for single-user builds.
 *
 * Weekly Review is single-user-per-machine. This component no longer renders
 * a picker; it exists only as a transition that fetches the user list and
 * routes to the appropriate next screen:
 *
 *   - zero users → CreateUser (first-time setup)
 *   - one user   → PinEntry (auto-select the only account)
 *   - N > 1      → impossible state; show a data-corruption recovery screen
 *                  (backend enforces single-user via 409 on create)
 */

import { useState, useEffect } from 'react';
import { fetchUsers } from '@/stores/authStore';

interface UserInfo {
  id: string;
  username: string;
}

interface UserSelectProps {
  onSelectUser: (userId: string, username: string) => void;
  onCreateUser: () => void;
}

export function UserSelect({ onSelectUser, onCreateUser }: UserSelectProps) {
  const [corruption, setCorruption] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchUsers()
      .then((data: UserInfo[]) => {
        if (cancelled) return;
        if (data.length === 0) {
          onCreateUser();
          return;
        }
        if (data.length === 1) {
          onSelectUser(data[0].id, data[0].username);
          return;
        }
        // data.length > 1 is impossible under the single-user invariant.
        // The backend refuses create_user with 409 when any user exists, and
        // initialize_auth_db() refuses startup on user_count > 1. If we get
        // here, the auth.db has been corrupted externally.
        setCorruption(data.length);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load account');
      });
    return () => {
      cancelled = true;
    };
  }, [onCreateUser, onSelectUser]);

  if (corruption !== null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 gap-4 px-6 text-center">
        <p className="text-red-400 text-sm">
          Account data is in an unexpected state ({corruption} records found).
        </p>
        <p className="text-slate-400 text-xs max-w-md">
          Weekly Review supports one account per device. Close the app and delete
          the auth database file, then restart.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 gap-4">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fuchsia-500" />
    </div>
  );
}
