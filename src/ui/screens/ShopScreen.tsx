import { useState } from 'react';
import { getConsumable, getJoker, getPack, getVoucher } from '../../catalog/catalog';
import { hasFreeJokerSlot } from '../../engine/gameRules';
import { consumablePrice, editionFromPrice, jokerPrice, packPrice, voucherPrice } from '../../engine/prices';
import { recommend } from '../../engine/recommend';
import { useT } from '../../i18n/I18nContext';
import { useRun } from '../../run/RunContext';
import type { Edition, ShopState } from '../../types';
import { readScreenshot } from '../../vision/client';
import AutocompleteInput from '../components/AutocompleteInput';
import JokerStickerFields from '../components/JokerStickerFields';
import NumberField from '../components/NumberField';
import RecommendationList from '../components/RecommendationList';
import ScreenshotImport from '../components/ScreenshotImport';
import type { Confirmed } from '../components/ScreenshotImport';

const EDITIONS: Edition[] = ['base', 'foil', 'holographic', 'polychrome', 'negative'];
const emptyShop: ShopState = { cards: [], voucherId: null, packIds: [], rerollCost: 5 };

interface Props {
  /** Buying a pack means opening it next, so the shell follows you there. */
  onPackBought: () => void;
}

export default function ShopScreen({ onPackBought }: Props) {
  const { store, dispatch } = useRun();
  /** Jokers a reading could not place because the board is full. */
  const [refused, setRefused] = useState(0);
  const t = useT();
  const run = store.current!;
  const shop = store.shopDraft ?? emptyShop;
  // Resolves against the render-time `shop`, not live reducer state: at most
  // one setShop call per event handler, or later calls see stale data.
  const setShop = (update: ShopState | ((s: ShopState) => ShopState)) =>
    dispatch({ type: 'SET_SHOP_DRAFT', draft: typeof update === 'function' ? update(shop) : update });
  const hasItems = shop.cards.length > 0 || shop.voucherId !== null || shop.packIds.length > 0;
  const recs = hasItems ? recommend(run, shop) : [];
  const voucherDef = shop.voucherId ? getVoucher(shop.voucherId) : undefined;
  const voucherCost = voucherDef ? voucherPrice(run, voucherDef) : 0;
  const voucherBlocked = Boolean(
    voucherDef
      && (voucherCost > run.money
        || run.vouchers.includes(voucherDef.id)
        || (voucherDef.requires && !run.vouchers.includes(voucherDef.requires))),
  );

  /** Everything confirmed from one screenshot lands in a single draft update,
      because setShop resolves against the shop as it was rendered. */
  const addFromScreenshot = ({ cards, money, reroll, hands, discards, ante, round }: Confirmed) => {
    if (money !== null) dispatch({ type: 'SET_MONEY', money });
    // The status column also carries where the run stands. In a shop the hands
    // and discards it shows are the next round's full allowance, which is what
    // the run tracks — so they can be taken as they are.
    if (ante !== null) dispatch({ type: 'SET_ANTE', ante });
    if (round !== null) dispatch({ type: 'SET_ROUND', round });
    if (hands !== null) dispatch({ type: 'SET_HANDS_PER_ROUND', value: hands });
    if (discards !== null) dispatch({ type: 'SET_DISCARDS_PER_ROUND', value: discards });

    // What the screenshot showed you already holding goes into the run, not
    // into the offer: the engine needs your board to judge anything at all.
    const held = cards.filter(c => c.target === 'owned');
    let free = held.filter(c => c.kind === 'joker').length;
    for (const { kind, id } of held) {
      if (kind === 'joker') {
        if (!hasFreeJokerSlot(run, 'base')) continue;
        dispatch({ type: 'ADD_JOKER', jokerId: id, edition: 'base' });
        free--;
      } else {
        dispatch({ type: 'ADD_CONSUMABLE', consumableId: id });
      }
    }
    setRefused(free > 0 ? free : 0);

    setShop(s => {
      const next = { ...s, cards: [...s.cards], packIds: [...s.packIds] };
      if (reroll !== null) next.rerollCost = reroll;
      for (const { kind, id, price, target } of cards) {
        if (target === 'owned') continue;
        // The price on the tag beats the catalog: a shop under Clearance Sale
        // or Liquidation charges less than a card is listed at.
        if (kind === 'joker') {
          // The picture does not show an edition the reader can trust, but the
          // tag does: a $5 joker selling for $10 is Polychrome. It lands in the
          // row's edition select, where a wrong guess is one tap to undo.
          const def = getJoker(id);
          const edition = (price !== null && def ? editionFromPrice(run, def, price) : null) ?? 'base';
          next.cards.push({ kind: 'joker', jokerId: id, edition, price: price ?? defaultJokerPrice(id, edition) });
        } else if (kind === 'tarot') {
          next.cards.push({ kind: 'consumable', consumableId: id, price: price ?? defaultConsumablePrice(id) });
        } else if (kind === 'voucher') {
          next.voucherId = id;
        } else {
          next.packIds.push(id);
        }
      }
      return next;
    });
  };

  /** What the shop charges for a card by default: catalog price, edition, discounts. */
  const defaultJokerPrice = (id: string, edition: Edition) => {
    const def = getJoker(id);
    return def ? jokerPrice(run, def, edition) : 0;
  };
  const defaultConsumablePrice = (id: string) => {
    const def = getConsumable(id);
    return def ? consumablePrice(run, def) : 0;
  };

  const removeCard = (i: number) => setShop(s => ({ ...s, cards: s.cards.filter((_, j) => j !== i) }));
  const removePack = (i: number) => setShop(s => ({ ...s, packIds: s.packIds.filter((_, j) => j !== i) }));

  return (
    <section className="screen">
      <div className="row">
        <NumberField label={t('money')} value={run.money} onChange={money => dispatch({ type: 'SET_MONEY', money })} />
        <NumberField label={t('rerollCost')} value={shop.rerollCost} onChange={rerollCost => setShop(s => ({ ...s, rerollCost }))} />
      </div>

      <ScreenshotImport
        kinds={['joker', 'tarot', 'voucher', 'pack']}
        hud
        read={readScreenshot}
        onAdd={addFromScreenshot}
      />
      {refused > 0 && <p className="muted">{t('screenshotNoSlots', { count: String(refused) })}</p>}

      <h3>{t('cardsOnOffer')}</h3>
      <ul className="rows">
        {shop.cards.map((slot, i) => {
          const name = slot.kind === 'joker' ? getJoker(slot.jokerId)?.name : getConsumable(slot.consumableId)?.name;
          const hasRoom = slot.kind === 'joker'
            ? hasFreeJokerSlot(run, slot.edition)
            : run.consumables.length < run.consumableSlots;
          const canBuy = slot.price <= run.money && hasRoom;
          return (
            <li key={i} className="row">
              <span className="grow">{name}</span>
              {slot.kind === 'joker' && (
                <select
                  value={slot.edition}
                  aria-label={t('editionOf', { name: name ?? '' })}
                  onChange={e => {
                    const edition = e.target.value as Edition;
                    setShop(s => ({
                      ...s,
                      cards: s.cards.map((c, j) => {
                        if (j !== i || c.kind !== 'joker') return c;
                        // An edition costs extra. Follow it unless the price was typed in by hand.
                        const followsDefault = c.price === defaultJokerPrice(c.jokerId, c.edition);
                        return { ...c, edition, price: followsDefault ? defaultJokerPrice(c.jokerId, edition) : c.price };
                      }),
                    }));
                  }}
                >
                  {EDITIONS.map(ed => (
                    <option key={ed} value={ed}>{ed}</option>
                  ))}
                </select>
              )}
              {slot.kind === 'joker' && (
                <JokerStickerFields
                  stickers={slot.stickers}
                  onChange={stickers =>
                    setShop(s => ({
                      ...s,
                      cards: s.cards.map((card, j) =>
                        j === i && card.kind === 'joker'
                          ? { ...card, stickers, price: stickers.rental ? 1 : card.price }
                          : card,
                      ),
                    }))
                  }
                />
              )}
              <NumberField
                label={t('price')}
                value={slot.price}
                onChange={price =>
                  setShop(s => ({ ...s, cards: s.cards.map((c, j) => (j === i ? { ...c, price } : c)) }))
                }
              />
              <button
                disabled={!canBuy}
                title={!hasRoom ? t('noRoom') : slot.price > run.money ? t('notAffordable') : undefined}
                onClick={() => dispatch({ type: 'BUY_SHOP_CARD', index: i })}
              >
                {t('bought')}
              </button>
              <button className="ghost" aria-label={t('removeX', { name: name ?? '' })} onClick={() => removeCard(i)}>✕</button>
            </li>
          );
        })}
      </ul>
      <AutocompleteInput
        placeholder={t('addShopCard')}
        kinds={['shop-joker', 'tarot', 'planet', 'spectral']}
        onPick={item =>
          setShop(s =>
            item.kind === 'shop-joker'
              ? { ...s, cards: [...s.cards, { kind: 'joker', jokerId: item.id, edition: 'base', price: defaultJokerPrice(item.id, 'base') }] }
              : { ...s, cards: [...s.cards, { kind: 'consumable', consumableId: item.id, price: defaultConsumablePrice(item.id) }] },
          )
        }
      />

      <h3>{t('voucher')}</h3>
      {shop.voucherId ? (
        <div className="row">
          <span className="grow">{getVoucher(shop.voucherId)?.name}</span>
          <button
            disabled={voucherBlocked}
            title={voucherDef?.requires && !run.vouchers.includes(voucherDef.requires)
              ? t('baseVoucherMissing')
              : undefined}
            onClick={() => dispatch({ type: 'BUY_SHOP_VOUCHER' })}
          >
            {t('redeemed')} ${voucherCost}
          </button>
          <button className="ghost" aria-label={t('removeVoucher')} onClick={() => setShop(s => ({ ...s, voucherId: null }))}>✕</button>
        </div>
      ) : (
        <AutocompleteInput placeholder={t('addShopVoucher')} kinds={['voucher']} onPick={item => setShop(s => ({ ...s, voucherId: item.id }))} />
      )}

      <h3>{t('boosterPacks')}</h3>
      <ul className="rows">
        {shop.packIds.map((id, i) => {
          const def = getPack(id);
          if (!def) return null;
          const cost = packPrice(run, def);
          return (
            <li key={i} className="row">
              <span className="grow">{def.name}</span>
              <button
                disabled={cost > run.money}
                title={cost > run.money ? t('notAffordable') : undefined}
                onClick={() => {
                  dispatch({ type: 'BUY_SHOP_PACK', index: i });
                  onPackBought();
                }}
              >
                {t('bought')} ${cost}
              </button>
              <button className="ghost" aria-label={t('removeX', { name: def.name })} onClick={() => removePack(i)}>✕</button>
            </li>
          );
        })}
      </ul>
      <AutocompleteInput placeholder={t('addPack')} kinds={['pack']} onPick={item => setShop(s => ({ ...s, packIds: [...s.packIds, item.id] }))} />
      <p className="muted">{t('packHint')}</p>

      <div className="row">
        <button
          disabled={shop.rerollCost > run.money}
          onClick={() => dispatch({ type: 'REROLL_SHOP' })}
        >
          {t('rerolled')}
        </button>
        <button className="ghost" onClick={() => dispatch({ type: 'LEAVE_SHOP' })}>{t('leftShop')}</button>
        <button className="ghost" onClick={() => setShop(emptyShop)}>{t('clearShop')}</button>
      </div>

      <h3>{t('advice')}</h3>
      <RecommendationList recs={recs} />
    </section>
  );
}
