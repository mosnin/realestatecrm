'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({ theme: 'light', toggleTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    // The logged-out / public surface follows the OS when no explicit choice
    // is stored; the realtor dashboard keeps its light default. (Mirrors the
    // no-flash script in app/layout.tsx so there's no flicker.)
    const isApp =
      /^\/(s|broker|setup|subscribe|billing|billing-required|onboarding|admin|trial|authorize)(\/|$)/.test(
        window.location.pathname,
      );
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const initial: Theme = stored ?? (!isApp && mq?.matches ? 'dark' : 'light');
    setTheme(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');
    setMounted(true);

    // When the visitor hasn't chosen and we're on a public page, follow live
    // OS theme changes.
    if (!stored && !isApp && mq) {
      const onChange = (e: MediaQueryListEvent) => {
        setTheme(e.matches ? 'dark' : 'light');
        document.documentElement.classList.toggle('dark', e.matches);
      };
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }

  // Prevent flash of wrong theme
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
