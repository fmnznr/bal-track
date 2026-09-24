import { useState } from 'react';
import { bossesForAnte, getBoss, getConsumable, getJoker, getVoucher } from '../../catalog/catalog';
import { sellValue } from '../../engine/economy';
import { hasFreeJokerSlot, usedJokerSlots } from '../../engine/gameRules';
import { CONVERSION_TARGETS } from '../../run/profileEffects';
import { useT } from '../../i18n/I18nContext';
import { useRun } from '../../run/RunContext';
import { HAND_TYPES } from '../../types';
import type { Edition, HandType, Suit } from '../../types';
import AutocompleteInput from '../components/AutocompleteInput';
import DeckProfileSection from '../components/DeckProfileSection';
import JokerOrderPanel from '../components/JokerOrderPanel';
import JokerStickerFields from '../components/JokerStickerFields';
import NumberField from '../components/NumberField';
import ScorePanel from '../components/ScorePanel';
import StrategyPanel from '../components/StrategyPanel';
import SuitPrompt from '../components/SuitPrompt';

const EDITIONS: Edition[] = ['base', 'foil', 'holographic', 'polychrome', 'negative'];

export default function RunOverview() {
  const { store, dispatch } = useRun();
  const t = useT();
  const run = store.current!;
  const [conversion, setConversion] = useState<{ name: string; target: Suit } | null>(null);
  /** The edition a joker being added has. A Negative one takes no slot, so it
      is the only way to add a sixth joker to a five-slot board — and picking
      the edition after adding is too late, the board is already full. */
  const [addEdition, setAddEdition] = useState<Edition>('base');
  const [addRefused, setAddRefused] = useState(false);
  const current = run.boss ? getBoss(run.boss) : undefined;
  const bossOptions = bossesForAnte(run.ante);
  // A boss picked before the ante was corrected stays selectable rather than vanishing.
  if (current && !bossOptions.includes(current)) bossOptions.unshift(current);
  return (
    <section className="screen">
      <header className="row spread">
        <h2>{run.deck} Deck · {run.stake}</h2>
        <button className="ghost" onClick={() => dispatch({ type: 'UNDO' })} disabled={store.past.length === 0}>
          {t('undo')}
        </button>
      </header>

      <StrategyPanel />
      <ScorePanel />

      <label className="primary-hand">
        <span>{t('primaryHand')}</span>
        <select
          value={run.primaryHand ?? ''}
          onChange={e =>
            dispatch({ type: 'SET_PRIMARY_HAND', hand: (e.target.value || null) as HandType | null })
          }
        >
          <option value="">{t('primaryHandNone')}</option>
          {HAND_TYPES.map(hand => (
            <option key={hand} value={hand}>{hand}</option>
          ))}
        </select>
      </label>

      <label className="primary-hand">
        <span>{t('bossBlind')}</span>
        <select
          value={run.boss ?? ''}
          onChange={e => dispatch({ type: 'SET_BOSS', boss: e.target.value || null })}
        >
          <option value="">{t('bossUnknown')}</option>
          {bossOptions.map(boss => (
            <option key={boss.id} value={boss.id}>{boss.name} — {boss.effect}</option>
          ))}
        </select>
      </label>

      <div className="row">
        <NumberField label={t('money')} value={run.money} onChange={money => dispatch({ type: 'SET_MONEY', money })} />
        <NumberField label={t('ante')} value={run.ante} min={0} onChange={ante => dispatch({ type: 'SET_ANTE', ante })} />
        <NumberField label={t('jokerSlots')} value={run.jokerSlots} min={1} onChange={slots => dispatch({ type: 'SET_JOKER_SLOTS', slots })} />
      </div>

      <h3>{t('jokers')} ({usedJokerSlots(run)}/{run.jokerSlots})</h3>
      <ul className="rows">
        {run.jokers.map((owned, i) => {
          const def = getJoker(owned.jokerId);
          if (!def) return null;
          return (
            <li key={i} className="row">
              <span className="pos">{i + 1}</span>
              <button
                type="button"
                className="move"
                aria-label={t('moveLeft', { name: def.name })}
                disabled={i === 0}
                onClick={() => dispatch({ type: 'MOVE_JOKER', index: i, direction: 'left' })}
              >
                ◀
              </button>
              <button
                type="button"
                className="move"
                aria-label={t('moveRight', { name: def.name })}
                disabled={i === run.jokers.length - 1}
                onClick={() => dispatch({ type: 'MOVE_JOKER', index: i, direction: 'right' })}
              >
                ▶
              </button>
              <span className="grow">{def.name}</span>
              <select
                value={owned.edition}
                aria-label={t('editionOf', { name: def.name })}
                onChange={e => dispatch({ type: 'SET_JOKER_EDITION', index: i, edition: e.target.value as Edition })}
              >
                {EDITIONS.map(ed => (
                  <option key={ed} value={ed}>{ed}</option>
                ))}
              </select>
              <JokerStickerFields
                stickers={owned.stickers}
                onChange={stickers => dispatch({ type: 'SET_JOKER_STICKERS', index: i, stickers })}
              />
              <button
                disabled={owned.stickers?.eternal}
                title={owned.stickers?.eternal ? t('eternalCannotBeSold') : undefined}
                onClick={() => dispatch({ type: 'SELL_JOKER', index: i })}
              >
                {owned.stickers?.eternal
                  ? t('cannotSell')
                  : `${t('sell')} $${sellValue(def.cost, owned.edition, owned.stickers)}`}
              </button>
            </li>
          );
        })}
      </ul>
      <JokerOrderPanel />
      <div className="row">
        <label className="sticker-toggle">
          {t('edition')}
          <select
            aria-label={t('editionOfNew')}
            value={addEdition}
            onChange={e => setAddEdition(e.target.value as Edition)}
          >
            {EDITIONS.map(ed => (
              <option key={ed} value={ed}>{ed}</option>
            ))}
          </select>
        </label>
      </div>
      <AutocompleteInput
        placeholder={t('addJoker')}
        kinds={['joker']}
        onPick={item => {
          if (!hasFreeJokerSlot(run, addEdition)) {
            setAddRefused(true);
            return;
          }
          setAddRefused(false);
          dispatch({ type: 'ADD_JOKER', jokerId: item.id, edition: addEdition });
        }}
      />
      {addRefused && <p className="muted">{t('noSlotUseNegative')}</p>}

      <h3>{t('vouchers')}</h3>
      <ul className="rows">
        {run.vouchers.map((id, i) => (
          <li key={i}>{getVoucher(id)?.name ?? id}</li>
        ))}
      </ul>
      <AutocompleteInput
        placeholder={t('addVoucher')}
        kinds={['voucher']}
        onPick={item => dispatch({ type: 'REDEEM_VOUCHER', voucherId: item.id })}
      />

      <h3>{t('consumables')} ({run.consumables.length}/{run.consumableSlots})</h3>
      <ul className="rows">
        {run.consumables.map((id, i) => {
          const def = getConsumable(id);
          return (
            <li key={i} className="row">
              <span className="grow">{def?.name ?? id}</span>
              <button
                onClick={() => {
                  if (def && CONVERSION_TARGETS[def.id]) {
                    setConversion({ name: def.name, target: CONVERSION_TARGETS[def.id]! });
                  }
                  dispatch({ type: 'USE_CONSUMABLE', index: i });
                }}
              >
                {def?.kind === 'planet' ? t('usePlanet') : t('used')}
              </button>
            </li>
          );
        })}
      </ul>
      <AutocompleteInput
        placeholder={t('addConsumable')}
        kinds={['tarot', 'planet', 'spectral']}
        onPick={item => dispatch({ type: 'ADD_CONSUMABLE', consumableId: item.id })}
      />
      {conversion && (
        <SuitPrompt consumableName={conversion.name} target={conversion.target} onDone={() => setConversion(null)} />
      )}

      <details>
        <summary>{t('corrections')}</summary>
        <p className="muted">{t('correctionsNote')}</p>
        <div className="row">
          <NumberField
            label={t('handsPerRound')}
            value={run.handsPerRound}
            onChange={value => dispatch({ type: 'SET_HANDS_PER_ROUND', value })}
          />
          <NumberField
            label={t('discardsPerRound')}
            value={run.discardsPerRound}
            onChange={value => dispatch({ type: 'SET_DISCARDS_PER_ROUND', value })}
          />
        </div>
        {HAND_TYPES.map(hand => (
          <div className="row" key={hand}>
            <NumberField
              label={t('handLevel', { hand })}
              value={run.handLevels[hand]}
              min={1}
              onChange={level => dispatch({ type: 'SET_HAND_LEVEL', hand, level })}
            />
          </div>
        ))}
        <DeckProfileSection />
      </details>

      <div className="row">
        <button className="primary" onClick={() => confirm(t('confirmWon')) && dispatch({ type: 'END_RUN', result: 'won' })}>
          {t('runWon')}
        </button>
        <button className="danger" onClick={() => confirm(t('confirmLost')) && dispatch({ type: 'END_RUN', result: 'lost' })}>
          {t('runLost')}
        </button>
        <button
          className="ghost"
          onClick={() => confirm(t('confirmAbandon')) && dispatch({ type: 'ABANDON_RUN' })}
        >
          {t('abandonRun')}
        </button>
      </div>
    </section>
  );
}
