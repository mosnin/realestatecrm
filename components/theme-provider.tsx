'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';

type Theme = 'light' | 'dark';
function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem('theme');
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({ theme: 'light', toggleTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const explicitChoice = useRef<Theme | null>(null);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (next: Theme) => {
      setTheme(next);
      document.documentElement.classList.toggle('dark', next === 'dark');
    };
    explicitChoice.current = storedTheme();
    apply(explicitChoice.current ?? (mql.matches ? 'dark' : 'light'));
    const onChange = (event: MediaQueryListEvent) => {
      if (explicitChoice.current || storedTheme()) return;
      apply(event.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    explicitChoice.current = next;
    setTheme(next);
    // Storage is an enhancement. Restricted browsers must still be usable.
    try { localStorage.setItem('theme', next); } catch {}
    document.documentElement.classList.toggle('dark', next === 'dark');
  }

  // Keep the provider tree stable through hydration: introducing it only after
  // mount tears down every descendant, including forms and active chat effects.
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
