import { useState } from 'react';
import { I18nProvider, useI18n } from './i18n/I18nContext';
import { LANGUAGES } from './i18n/dictionary';
import type { Language } from './i18n/dictionary';
import { RunProvider, useRun } from './run/RunContext';
import HistoryScreen from './ui/screens/HistoryScreen';
import PackScreen from './ui/screens/PackScreen';
import RunOverview from './ui/screens/RunOverview';
import RunSetup from './ui/screens/RunSetup';
import ShopScreen from './ui/screens/ShopScreen';

type Screen = 'run' | 'shop' | 'pack' | 'history';

const TABS = [
  { id: 'run', key: 'tabRun' },
  { id: 'shop', key: 'tabShop' },
  { id: 'pack', key: 'tabPack' },
  { id: 'history', key: 'tabHistory' },
] as const;

function LanguagePicker() {
  const { lang, setLang, t } = useI18n();
  return (
    <label className="lang-picker">
      <span className="sr-only">{t('language')}</span>
      <select
        aria-label={t('language')}
        value={lang}
        onChange={e => setLang(e.target.value as Language)}
      >
        {LANGUAGES.map(code => (
          <option key={code} value={code}>{code.toUpperCase()}</option>
        ))}
      </select>
    </label>
  );
}

function Shell() {
  const { store, dispatch } = useRun();
  const { t } = useI18n();
  const [screen, setScreen] = useState<Screen>('run');

  if (!store.current) {
    if (screen === 'history') {
      return (
        <div className="app">
          <HistoryScreen />
          <button className="primary" onClick={() => setScreen('run')}>{t('newRun')}</button>
        </div>
      );
    }
    return (
      <div className="app">
        <LanguagePicker />
        <RunSetup onStarted={() => setScreen('run')} />
        <div className="row">
          {store.finished.length > 0 && (
            <button className="ghost" onClick={() => setScreen('history')}>{t('tabHistory')}</button>
          )}
          {/* Ending or abandoning a run leaves you here, and the store still holds
              the snapshot — without this the undo exists but cannot be reached. */}
          {store.past.length > 0 && (
            <button className="ghost" onClick={() => dispatch({ type: 'UNDO' })}>{t('undo')}</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="tabs" aria-label={t('runSections')}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            aria-current={tab.id === screen ? 'page' : undefined}
            className={tab.id === screen ? 'tab active' : 'tab'}
            onClick={() => setScreen(tab.id)}
          >
            {t(tab.key)}
          </button>
        ))}
        <LanguagePicker />
      </nav>
      {screen === 'run' && <RunOverview />}
      {screen === 'shop' && <ShopScreen onPackBought={() => setScreen('pack')} />}
      {screen === 'pack' && <PackScreen />}
      {screen === 'history' && <HistoryScreen />}
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <RunProvider>
        <Shell />
      </RunProvider>
    </I18nProvider>
  );
}
