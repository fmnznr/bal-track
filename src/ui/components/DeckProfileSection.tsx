import { useT } from '../../i18n/I18nContext';
import { useRun } from '../../run/RunContext';
import { ENHANCEMENT_TYPES, SUITS } from '../../types';
import NumberField from './NumberField';



export default function DeckProfileSection() {
  const { store, dispatch } = useRun();
  const t = useT();
  const run = store.current!;
  const profile = run.deckProfile;
  return (
    <details>
      <summary>{t('deckProfile')}</summary>
      {run.deck === 'Erratic' && (
        <p className="muted">{t('erraticNote')}</p>
      )}
      <div className="row">
        {SUITS.map(suit => (
          <NumberField
            key={suit}
            label={t(suit)}
            value={profile.suits[suit]}
            onChange={value => dispatch({ type: 'SET_PROFILE_SUIT', suit, value })}
          />
        ))}
      </div>
      <div className="row">
        <NumberField label={t('faceCards')} value={profile.faceCards} onChange={value => dispatch({ type: 'SET_PROFILE_FACE', value })} />
        <NumberField label={t('deckSize')} value={profile.deckSize} onChange={value => dispatch({ type: 'SET_PROFILE_SIZE', value })} />
      </div>
      <div className="row">
        {ENHANCEMENT_TYPES.map(enhancement => (
          <NumberField
            key={enhancement}
            label={t(enhancement)}
            value={profile.enhanced[enhancement]}
            onChange={value => dispatch({ type: 'SET_PROFILE_ENHANCED', enhancement, value })}
          />
        ))}
      </div>
    </details>
  );
}
