import { getConsumable, getJoker, getVoucher } from '../../catalog/catalog';
import { sellValue } from '../../engine/economy';
import { useRun } from '../../run/RunContext';
import { HAND_TYPES } from '../../types';
import type { Edition } from '../../types';
import AutocompleteInput from '../components/AutocompleteInput';
import NumberField from '../components/NumberField';
import StrategyPanel from '../components/StrategyPanel';

const EDITIONS: Edition[] = ['base', 'foil', 'holographic', 'polychrome', 'negative'];

export default function RunOverview() {
  const { store, dispatch } = useRun();
  const run = store.current!;
  return (
    <section className="screen">
      <header className="row spread">
        <h2>{run.deck} Deck · {run.stake}</h2>
        <button className="ghost" onClick={() => dispatch({ type: 'UNDO' })} disabled={store.past.length === 0}>
          Undo
        </button>
      </header>

      <StrategyPanel />

      <div className="row">
        <NumberField label="Money $" value={run.money} onChange={money => dispatch({ type: 'SET_MONEY', money })} />
        <NumberField label="Ante" value={run.ante} min={1} onChange={ante => dispatch({ type: 'SET_ANTE', ante })} />
        <NumberField label="Joker slots" value={run.jokerSlots} min={1} onChange={slots => dispatch({ type: 'SET_JOKER_SLOTS', slots })} />
      </div>

      <h3>Jokers ({run.jokers.filter(j => j.edition !== 'negative').length}/{run.jokerSlots})</h3>
      <ul className="rows">
        {run.jokers.map((owned, i) => {
          const def = getJoker(owned.jokerId);
          if (!def) return null;
          return (
            <li key={i} className="row">
              <span className="grow">{def.name}</span>
              <select
                value={owned.edition}
                aria-label={`${def.name} edition`}
                onChange={e => dispatch({ type: 'SET_JOKER_EDITION', index: i, edition: e.target.value as Edition })}
              >
                {EDITIONS.map(ed => (
                  <option key={ed} value={ed}>{ed}</option>
                ))}
              </select>
              <button onClick={() => dispatch({ type: 'SELL_JOKER', index: i })}>
                Sell ${sellValue(def.cost, owned.edition)}
              </button>
            </li>
          );
        })}
      </ul>
      <AutocompleteInput
        placeholder="Add joker…"
        kinds={['joker']}
        onPick={item => dispatch({ type: 'ADD_JOKER', jokerId: item.id, edition: 'base' })}
      />

      <h3>Vouchers</h3>
      <ul className="rows">
        {run.vouchers.map((id, i) => (
          <li key={i}>{getVoucher(id)?.name ?? id}</li>
        ))}
      </ul>
      <AutocompleteInput
        placeholder="Add redeemed voucher…"
        kinds={['voucher']}
        onPick={item => dispatch({ type: 'REDEEM_VOUCHER', voucherId: item.id })}
      />

      <h3>Consumables ({run.consumables.length}/{run.consumableSlots})</h3>
      <ul className="rows">
        {run.consumables.map((id, i) => {
          const def = getConsumable(id);
          return (
            <li key={i} className="row">
              <span className="grow">{def?.name ?? id}</span>
              <button onClick={() => dispatch({ type: 'USE_CONSUMABLE', index: i })}>
                {def?.kind === 'planet' ? 'Use (+1 level)' : 'Used'}
              </button>
            </li>
          );
        })}
      </ul>
      <AutocompleteInput
        placeholder="Add consumable…"
        kinds={['tarot', 'planet', 'spectral']}
        onPick={item => dispatch({ type: 'ADD_CONSUMABLE', consumableId: item.id })}
      />

      <details>
        <summary>Hand levels</summary>
        {HAND_TYPES.map(hand => (
          <NumberField
            key={hand}
            label={hand}
            value={run.handLevels[hand]}
            min={1}
            onChange={level => dispatch({ type: 'SET_HAND_LEVEL', hand, level })}
          />
        ))}
      </details>

      <div className="row">
        <button className="primary" onClick={() => confirm('End this run as WON?') && dispatch({ type: 'END_RUN', result: 'won' })}>
          Run won
        </button>
        <button className="danger" onClick={() => confirm('End this run as LOST?') && dispatch({ type: 'END_RUN', result: 'lost' })}>
          Run lost
        </button>
      </div>
    </section>
  );
}
