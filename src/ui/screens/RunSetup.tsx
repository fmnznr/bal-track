import { useState } from 'react';
import meta from '../../data/meta.json';
import { useRun } from '../../run/RunContext';

export default function RunSetup({ onStarted }: { onStarted: () => void }) {
  const { dispatch } = useRun();
  const [deck, setDeck] = useState('Red');
  const [stake, setStake] = useState('White');
  return (
    <section className="screen">
      <h1>Bal-Track</h1>
      <h2>New Run</h2>
      <h3>Deck</h3>
      <div className="chip-grid">
        {meta.decks.map(d => (
          <button key={d} className={d === deck ? 'chip active' : 'chip'} onClick={() => setDeck(d)}>
            {d}
          </button>
        ))}
      </div>
      <h3>Stake</h3>
      <div className="chip-grid">
        {meta.stakes.map(s => (
          <button key={s} className={s === stake ? 'chip active' : 'chip'} onClick={() => setStake(s)}>
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
        Start Run
      </button>
      <p className="muted">Special decks: check money and joker slots on the Run screen after starting.</p>
    </section>
  );
}
