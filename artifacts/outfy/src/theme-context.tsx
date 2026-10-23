import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'outfy_theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext =
  createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const storedTheme =
    window.localStorage.getItem(
      THEME_STORAGE_KEY,
    );

  return storedTheme === 'light'
    ? 'light'
    : 'dark';
}

export function applyTheme(theme: Theme) {
  const root =
    document.documentElement;

  root.classList.toggle(
    'dark',
    theme === 'dark',
  );

  root.classList.toggle(
    'light',
    theme === 'light',
  );

  root.style.colorScheme = theme;
}

export function initializeTheme() {
  if (typeof document === 'undefined') {
    return;
  }

  applyTheme(readStoredTheme());
}

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [theme, setThemeState] =
    useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);

    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      theme,
    );
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme: setThemeState,
    }),
    [theme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context =
    useContext(ThemeContext);

  if (!context) {
    throw new Error(
      'useTheme must be used inside ThemeProvider',
    );
  }

  return context;
}