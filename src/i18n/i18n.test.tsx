import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { I18nProvider, detectLanguage, useI18n } from './I18nContext';
import { DICTIONARY, LANGUAGES, interpolate } from './dictionary';

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('dictionary', () => {
  it('carries the same keys in every language', () => {
    const reference = Object.keys(DICTIONARY.en).sort();
    for (const lang of LANGUAGES) {
      expect(Object.keys(DICTIONARY[lang]).sort(), lang).toEqual(reference);
    }
  });

  it('leaves no phrase empty', () => {
    for (const lang of LANGUAGES) {
      for (const [key, text] of Object.entries(DICTIONARY[lang])) {
        expect(text.trim(), `${lang}.${key}`).not.toBe('');
      }
    }
  });

  it('keeps the same placeholders in every translation', () => {
    const slots = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(DICTIONARY.en) as (keyof typeof DICTIONARY.en)[]) {
      for (const lang of LANGUAGES) {
        expect(slots(DICTIONARY[lang][key]), `${lang}.${key}`).toEqual(slots(DICTIONARY.en[key]));
      }
    }
  });

  it('translates something, rather than copying English throughout', () => {
    const differing = (Object.keys(DICTIONARY.en) as (keyof typeof DICTIONARY.en)[])
      .filter(key => DICTIONARY.de[key] !== DICTIONARY.en[key]);
    expect(differing.length).toBeGreaterThan(Object.keys(DICTIONARY.en).length / 2);
  });
});

describe('interpolate', () => {
  it('fills placeholders', () => {
    expect(interpolate('move {name} left', { name: 'Baron' })).toBe('move Baron left');
    expect(interpolate('{a} and {b}', { a: 1, b: 2 })).toBe('1 and 2');
  });

  it('leaves an unknown placeholder visible rather than blanking it', () => {
    expect(interpolate('hello {who}', {})).toBe('hello {who}');
    expect(interpolate('hello {who}')).toBe('hello {who}');
  });
});

describe('detectLanguage', () => {
  it('prefers a stored choice over the browser', () => {
    localStorage.setItem('bal-track:lang', 'de');
    vi.stubGlobal('navigator', { languages: ['en-GB'], language: 'en-GB' });
    expect(detectLanguage()).toBe('de');
  });

  it('falls back to the browser language', () => {
    vi.stubGlobal('navigator', { languages: ['de-AT', 'en'], language: 'de-AT' });
    expect(detectLanguage()).toBe('de');
  });

  it('falls back to English for a language it does not have', () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR'], language: 'fr-FR' });
    expect(detectLanguage()).toBe('en');
  });

  it('ignores a stored value that is not a language it knows', () => {
    localStorage.setItem('bal-track:lang', 'klingon');
    vi.stubGlobal('navigator', { languages: ['en'], language: 'en' });
    expect(detectLanguage()).toBe('en');
  });
});

function Probe() {
  const { lang, t } = useI18n();
  return <p>{lang}: {t('startRun')}</p>;
}

describe('I18nProvider', () => {
  it('serves the detected language', () => {
    localStorage.setItem('bal-track:lang', 'de');
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByText('de: Run starten')).toBeInTheDocument();
  });

  it('marks the document language for assistive tech', () => {
    localStorage.setItem('bal-track:lang', 'de');
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(document.documentElement.lang).toBe('de');
  });
});

describe('the language switch in the app', () => {
  it('switches the whole UI and remembers the choice', async () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Start Run' })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Language'), 'de');
    expect(screen.getByRole('button', { name: 'Run starten' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Run' })).not.toBeInTheDocument();
    expect(localStorage.getItem('bal-track:lang')).toBe('de');

    cleanup();
    render(<App />);
    expect(screen.getByRole('button', { name: 'Run starten' })).toBeInTheDocument();
  });

  it('keeps game terms in English while the chrome is German', async () => {
    render(<App />);
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'de');
    await userEvent.click(screen.getByRole('button', { name: 'Run starten' }));

    // Chrome translated...
    expect(screen.getByText('Joker-Plätze')).toBeInTheDocument();
    // ...while the deck, stake and hand names stay as Balatro prints them.
    expect(screen.getByRole('heading', { name: /Red Deck · White/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Flush' })).toBeInTheDocument();
  });
});
