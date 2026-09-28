'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const KEY = 'pp_theme';
const EVENT = 'pp-theme-change';

function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark'; // storage blocked (private mode, previews): fall back to dark
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Theme persisted in localStorage, read through useSyncExternalStore (no setState-in-effect). */
export function useTheme() {
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    try {
      localStorage.setItem(KEY, readTheme() === 'dark' ? 'light' : 'dark');
    } catch {
      // ignore: theme just won't persist
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { theme, isDark: theme === 'dark', toggleTheme };
}
