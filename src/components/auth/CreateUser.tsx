/**
 * CreateUser — New user registration with PIN setup.
 *
 * Username text input + two PIN entries that must match.
 * PIN: 6+ digits. On success, navigates to PinEntry for the new user.
 */

import { useState } from 'react';
import { createUser } from '@/stores/authStore';

interface CreateUserProps {
  onCreated: (userId: string, username: string) => void;
  onBack: () => void;
  showBack: boolean;
}

export function CreateUser({ onCreated, onBack, showBack }: CreateUserProps) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const pinValid = pin.length >= 6 && /^\d+$/.test(pin);
  const pinsMatch = pin === pinConfirm;
  const canSubmit = username.trim().length > 0 && pinValid && pinsMatch && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setLoading(true);

    try {
      const user = await createUser(username.trim(), pin);
      onCreated(user.id, user.username);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create account';
      setError(
        msg.includes('409')
          ? 'An account already exists on this device. Delete it from settings to create a new one.'
          : msg
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900">
      <div className="w-72">
        <h2 className="text-lg font-medium text-slate-300 text-center mb-6">
          Create Account
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={32}
              autoFocus
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-fuchsia-500/50"
              placeholder="Enter username"
            />
          </div>

          {/* PIN */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">PIN (6+ digits)</label>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                setPin(val);
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-fuchsia-500/50"
              placeholder="Enter PIN"
            />
          </div>

          {/* Confirm PIN */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={pinConfirm}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                setPinConfirm(val);
              }}
              className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none ${
                pinConfirm && !pinsMatch
                  ? 'border-red-500/50'
                  : 'border-slate-700 focus:border-fuchsia-500/50'
              }`}
              placeholder="Confirm PIN"
            />
            {pinConfirm && !pinsMatch && (
              <p className="text-red-400 text-[10px] mt-1">PINs do not match</p>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>

        {/* Back */}
        {showBack && (
          <button
            onClick={onBack}
            className="w-full mt-4 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}
