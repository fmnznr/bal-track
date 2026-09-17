import { useState } from 'react';
import meta from '../../data/meta.json';
import { useT } from '../../i18n/I18nContext';
import { useRun } from '../../run/RunContext';

export default function RunSetup({ onStarted }: { onStarted: () => void }) {
  const { dispatch } = useRun();
  const t = useT();
  const [deck, setDeck] = useState('Red');
  const [stake, setStake] = useState('White');
  return (
    <section className="screen">
      <h1>{t('appName')}</h1>
      <h2>{t('newRun')}</h2>
      <h3>{t('deck')}</h3>
      <div className="chip-grid">
        {meta.decks.map(d => (
          <button key={d} aria-pressed={d === deck} className={d === deck ? 'chip active' : 'chip'} onClick={() => setDeck(d)}>
            {d}
          </button>
        ))}
      </div>
      <h3>{t('stake')}</h3>
      <div className="chip-grid">
        {meta.stakes.map(s => (
          <button key={s} aria-pressed={s === stake} className={s === stake ? 'chip active' : 'chip'} onClick={() => setStake(s)}>
            {s}
          </button>
        ))}
      </div>
      <button
        className="primary"
        onClick={() => {
          dispatch({ type: 'START_RUN', deck, stake });
          onStarted();
        }}
      >
        {t('startRun')}
      </button>
      <p className="muted">{t('setupNote')}</p>
    </section>
  );
}
