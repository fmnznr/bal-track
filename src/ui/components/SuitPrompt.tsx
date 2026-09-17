import { useState } from 'react';
import { useT } from '../../i18n/I18nContext';
import { useRun } from '../../run/RunContext';
import { SUITS } from '../../types';
import type { Suit } from '../../types';

interface Props {
  consumableName: string;
  target: Suit;
  onDone: () => void;
}

export default function SuitPrompt({ consumableName, target, onDone }: Props) {
  const { dispatch } = useRun();
  const t = useT();
  const [from, setFrom] = useState<Partial<Record<Suit, number>>>({});
  const total = Object.values(from).reduce((a, b) => a + (b ?? 0), 0);
  const sources = SUITS.filter(s => s !== target);
  return (
    <div className="suit-prompt">
      <p>{t('convertingTo', { name: consumableName, done: total, suit: t(target) })}</p>
      <div className="row">
        {sources.map(suit => (
          <button
            key={suit}
            type="button"
            aria-label={t('fromSuit', { suit: t(suit) })}
            disabled={total >= 3}
            onClick={() => setFrom(f => ({ ...f, [suit]: (f[suit] ?? 0) + 1 }))}
          >
            {from[suit]
              ? `${t('fromSuit', { suit: t(suit) })} (${from[suit]})`
              : t('fromSuit', { suit: t(suit) })}
          </button>
        ))}
      </div>
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={total === 0}
          onClick={() => {
            dispatch({ type: 'CONVERT_SUITS', to: target, from });
            onDone();
          }}
        >
          {t('bookConversion')}
        </button>
        <button type="button" className="ghost" onClick={onDone}>
          {t('skipAdjustManually')}
        </button>
      </div>
    </div>
  );
}
