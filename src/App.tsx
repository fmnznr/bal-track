import { useState } from 'react';
import { RunProvider, useRun } from './run/RunContext';
import HistoryScreen from './ui/screens/HistoryScreen';
import PackScreen from './ui/screens/PackScreen';
import RunOverview from './ui/screens/RunOverview';
import RunSetup from './ui/screens/RunSetup';
import ShopScreen from './ui/screens/ShopScreen';

type Screen = 'run' | 'shop' | 'pack' | 'history';

const TABS: { id: Screen; label: string }[] = [
  { id: 'run', label: 'Run' },
  { id: 'shop', label: 'Shop' },
  { id: 'pack', label: 'Pack' },
  { id: 'history', label: 'History' },
];

function Shell() {
  const { store } = useRun();
  const [screen, setScreen] = useState<Screen>('run');

  if (!store.current) {
    if (screen === 'history') {
      return (
        <div className="app">
          <HistoryScreen />
          <button className="primary" onClick={() => setScreen('run')}>New Run</button>
        </div>
      );
    }
    return (
      <div className="app">
        <RunSetup onStarted={() => setScreen('run')} />
        {store.finished.length > 0 && (
          <button className="ghost" onClick={() => setScreen('history')}>History</button>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={t.id === screen ? 'tab active' : 'tab'} onClick={() => setScreen(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {screen === 'run' && <RunOverview />}
      {screen === 'shop' && <ShopScreen />}
      {screen === 'pack' && <PackScreen />}
      {screen === 'history' && <HistoryScreen />}
    </div>
  );
}

export default function App() {
  return (
    <RunProvider>
      <Shell />
    </RunProvider>
  );
}
