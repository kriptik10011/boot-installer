/**
 * PinEntry — PIN code input with dot indicators and numpad.
 *
 * Digits shown as filled/empty circles. Wrong PIN triggers shake animation.
 * Keyboard input supported.
 *
 * Submission rules:
 * - Auto-submits when PIN_LENGTH (6) digits are entered
 * - Enter key submits whatever has been typed (allows users with PINs shorter
 *   than PIN_LENGTH from prior policy versions to authenticate)
 */

import { useState, useEffect, useCallback } from 'react';
import { attemptLogin } from '@/stores/authStore';

interface PinEntryProps {
  userId: string;
  username: string;
  onSuccess: (token: string, userId: string, username: string) => void;
  onBack: () => void;
}

export function PinEntry({ userId, username, onSuccess, onBack }: PinEntryProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const PIN_LENGTH = 6;
  const MAX_PIN_LENGTH = 16;

  const submitPin = useCallback(
    async (pin: string) => {
      if (loading || success || pin.length === 0) return;
      setLoading(true);
      const result = await attemptLogin(userId, pin);
      if (result.ok) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess(result.data.token, result.data.user_id, result.data.username);
        }, 400);
      } else {
        setError(true);
        setTimeout(() => {
          setError(false);
          setDigits([]);
          setLoading(false);
        }, 600);
      }
    },
    [loading, success, userId, onSuccess]
  );

  const handleDigit = useCallback(
    (d: string) => {
      if (digits.length >= MAX_PIN_LENGTH || loading || success) return;
      const next = [...digits, d];
      setDigits(next);
      if (next.length === PIN_LENGTH) {
        void submitPin(next.join(''));
      }
    },
    [digits, loading, success, submitPin]
  );

  const handleBackspace = useCallback(() => {
    if (loading || success) return;
    setDigits((d) => d.slice(0, -1));
  }, [loading, success]);

  const handleEnter = useCallback(() => {
    if (loading || success) return;
    if (digits.length === 0) return;
    if (digits.length === PIN_LENGTH) return; // already auto-submitted
    void submitPin(digits.join(''));
  }, [digits, loading, success, submitPin]);

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key);
      if (e.key === 'Backspace') handleBackspace();
      if (e.key === 'Enter') handleEnter();
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDigit, handleBackspace, handleEnter, onBack]);

  const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 select-none">
      {/* Username */}
      <div className="text-lg font-medium text-slate-300 mb-8">{username}</div>

      {/* PIN dots */}
      <div
        className={`flex gap-3 mb-10 ${error ? 'animate-shake' : ''}`}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              success
                ? 'bg-emerald-400 border-emerald-400 scale-110'
                : i < digits.length
                  ? 'bg-fuchsia-400 border-fuchsia-400 scale-110'
                  : 'bg-transparent border-slate-600'
            }`}
          />
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="text-red-400 text-xs mb-4">Wrong PIN</div>
      )}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-56">
        {NUMPAD_KEYS.map((key, i) => {
          if (key === '') {
            return <div key={i} />;
          }
          if (key === 'back') {
            return (
              <button
                key={i}
                onClick={handleBackspace}
                disabled={loading || success}
                className="w-16 h-14 rounded-xl text-slate-400 hover:bg-slate-800 transition-colors flex items-center justify-center disabled:opacity-40"
                aria-label="Backspace"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l-7-7 7-7M19 12H5" />
                </svg>
              </button>
            );
          }
          return (
            <button
              key={i}
              onClick={() => handleDigit(key)}
              disabled={loading || success}
              className="w-16 h-14 rounded-xl text-xl font-medium text-slate-200 hover:bg-slate-800 active:bg-slate-700 transition-colors disabled:opacity-40"
            >
              {key}
            </button>
          );
        })}
      </div>

      {/* Back button */}
      <button
        onClick={onBack}
        className="mt-8 text-sm text-slate-500 hover:text-slate-300 transition-colors"
      >
        Back
      </button>

      {/* Shake animation style */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
}
