/**
 * useTheme Hook
 *
 * Applies theme to document root and handles system preference detection.
 */

import { useEffect } from 'react';
import { useAppStore, type ThemeMode } from '@/stores/appStore';

export function useTheme() {
  const { theme, setTheme } = useAppStore();

  useEffect(() => {
    // Determine effective theme
    let effectiveTheme: 'dark' | 'light' = 'dark';

    if (theme === 'system') {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      effectiveTheme = prefersDark ? 'dark' : 'light';
    } else {
      effectiveTheme = theme;
    }

    // Apply to document root
    document.documentElement.setAttribute('data-theme', effectiveTheme);

    // Listen for system preference changes if using system theme
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  return { theme, setTheme };
}

export function useThemeValue(): 'dark' | 'light' {
  const { theme } = useAppStore();

  if (theme === 'system') {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }

  return theme;
}
