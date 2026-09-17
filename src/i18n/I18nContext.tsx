import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DICTIONARY, LANGUAGES, interpolate } from './dictionary';
import type { Language, PhraseKey } from './dictionary';

const STORAGE_KEY = 'bal-track:lang';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** The player's own choice, else what their browser asks for, else English. */
export function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // storage unavailable (private mode etc.) — fall through to the browser
  }
  const preferred = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];
  for (const tag of preferred) {
    const base = tag?.split('-')[0];
    if (isLanguage(base)) return base;
  }
  return 'en';
}

export type Translate = (key: PhraseKey, values?: Record<string, string | number>) => string;

interface I18nValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Translate;
}

const Ctx = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(detectLanguage);

  useEffect(() => {
    // Keeps assistive tech and browser features reading the page correctly.
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // not persisting a language preference is survivable
    }
  }, []);

  const t = useCallback<Translate>(
    (key, values) => interpolate(DICTIONARY[lang][key], values),
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

/** Shorthand for the common case of only needing the translator. */
export function useT(): Translate {
  return useI18n().t;
}
