import { useRun } from '../../run/RunContext';
import { ENHANCEMENT_TYPES, SUITS } from '../../types';
import NumberField from './NumberField';

const LABEL: Record<string, string> = {
  hearts: 'Hearts', diamonds: 'Diamonds', spades: 'Spades', clubs: 'Clubs',
  bonus: 'Bonus', mult: 'Mult', wild: 'Wild', glass: 'Glass',
  steel: 'Steel', stone: 'Stone', gold: 'Gold', lucky: 'Lucky',
};

export default function DeckProfileSection() {
  const { store, dispatch } = useRun();
  const run = store.current!;
  const profile = run.deckProfile;
  return (
    <details>
      <summary>Deck profile</summary>
      {run.deck === 'Erratic' && (
        <p className="muted">Erratic deck — check these numbers against your actual starting deck.</p>
      )}
      <div className="row">
        {SUITS.map(suit => (
          <NumberField
            key={suit}
            label={LABEL[suit]}
            value={profile.suits[suit]}
            onChange={value => dispatch({ type: 'SET_PROFILE_SUIT', suit, value })}
          />
        ))}
      </div>
      <div className="row">
        <NumberField label="Face cards" value={profile.faceCards} onChange={value => dispatch({ type: 'SET_PROFILE_FACE', value })} />
        <NumberField label="Deck size" value={profile.deckSize} onChange={value => dispatch({ type: 'SET_PROFILE_SIZE', value })} />
      </div>
      <div className="row">
        {ENHANCEMENT_TYPES.map(enhancement => (
          <NumberField
            key={enhancement}
            label={LABEL[enhancement]}
            value={profile.enhanced[enhancement]}
            onChange={value => dispatch({ type: 'SET_PROFILE_ENHANCED', enhancement, value })}
          />
        ))}
      </div>
    </details>
  );
}
