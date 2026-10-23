import {
  Moon,
  Sun,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme-context';

export function ThemeSwitcher() {
  const { theme, setTheme } =
    useTheme();

  const { t } =
    useTranslation('common');

  return (
    <div
      className="inline-flex rounded-xl border border-border bg-background/70 p-1"
      aria-label={t('theme.selector')}
    >
      <button
        type="button"
        onClick={() =>
          setTheme('light')
        }
        aria-pressed={
          theme === 'light'
        }
        aria-label={t('theme.light')}
        title={t('theme.light')}
        className={`flex h-7 w-8 items-center justify-center rounded-lg transition ${
          theme === 'light'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        data-testid="button-theme-light"
      >
        <Sun className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() =>
          setTheme('dark')
        }
        aria-pressed={
          theme === 'dark'
        }
        aria-label={t('theme.dark')}
        title={t('theme.dark')}
        className={`flex h-7 w-8 items-center justify-center rounded-lg transition ${
          theme === 'dark'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        data-testid="button-theme-dark"
      >
        <Moon className="h-4 w-4" />
      </button>
    </div>
  );
}