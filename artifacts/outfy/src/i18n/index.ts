import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import esCommon from './locales/es/common.json';
import esAuth from './locales/es/auth.json';

import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';

export type OutfyLanguage = 'es' | 'en';

const LANGUAGE_STORAGE_KEY = 'outfy_language';

function getInitialLanguage(): OutfyLanguage {
  const storedLanguage =
    window.localStorage.getItem(LANGUAGE_STORAGE_KEY);

  if (storedLanguage === 'es' || storedLanguage === 'en') {
    return storedLanguage;
  }

  return navigator.language.toLowerCase().startsWith('es')
    ? 'es'
    : 'en';
}

const initialLanguage = getInitialLanguage();

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: {
        common: esCommon,
        auth: esAuth,
      },
      en: {
        common: enCommon,
        auth: enAuth,
      },
    },

    lng: initialLanguage,
    fallbackLng: 'es',

    defaultNS: 'common',

    interpolation: {
      escapeValue: false,
    },
  });

document.documentElement.lang = initialLanguage;

i18n.on('languageChanged', (language) => {
  if (language !== 'es' && language !== 'en') {
    return;
  }

  window.localStorage.setItem(
    LANGUAGE_STORAGE_KEY,
    language,
  );

  document.documentElement.lang = language;
});

export default i18n;