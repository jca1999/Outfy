import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation('common');

  const currentLanguage =
    i18n.resolvedLanguage?.startsWith('en')
      ? 'en'
      : 'es';

  function changeLanguage(language: 'es' | 'en') {
    void i18n.changeLanguage(language);
  }

  return (
    <div
      className="inline-flex rounded-xl border border-border bg-background/70 p-1"
      aria-label={t('language.selector')}
    >
      <button
        type="button"
        onClick={() => changeLanguage('es')}
        aria-pressed={currentLanguage === 'es'}
        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
          currentLanguage === 'es'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        ES
      </button>

      <button
        type="button"
        onClick={() => changeLanguage('en')}
        aria-pressed={currentLanguage === 'en'}
        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
          currentLanguage === 'en'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        EN
      </button>
    </div>
  );
}