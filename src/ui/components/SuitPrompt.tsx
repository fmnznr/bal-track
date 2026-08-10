import { useState } from 'react';
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
  const [from, setFrom] = useState<Partial<Record<Suit, number>>>({});
  const total = Object.values(from).reduce((a, b) => a + (b ?? 0), 0);
  const sources = SUITS.filter(s => s !== target);
  return (
    <div className="suit-prompt">
      <p>
        {consumableName}: converting {total}/3 cards to {target}. Tap the source suits:
      </p>
      <div className="row">
        {sources.map(suit => (
          <button
            key={suit}
            type="button"
            aria-label={`from ${suit}`}
            disabled={total >= 3}
            onClick={() => setFrom(f => ({ ...f, [suit]: (f[suit] ?? 0) + 1 }))}
          >
            {from[suit] ? `from ${suit} (${from[suit]})` : `from ${suit}`}
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
          Book conversion
        </button>
        <button type="button" className="ghost" onClick={onDone}>
          Skip (adjust manually)
        </button>
      </div>
    </div>
  );
}
