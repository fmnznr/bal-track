import { getConsumable, getJoker, getPack, getVoucher } from '../../catalog/catalog';
import { hasFreeJokerSlot } from '../../engine/gameRules';
import { recommend } from '../../engine/recommend';
import { useT } from '../../i18n/I18nContext';
import { useRun } from '../../run/RunContext';
import type { Edition, ShopState } from '../../types';
import { readScreenshot } from '../../vision/client';
import type { CardKind } from '../../vision/recognise';
import AutocompleteInput from '../components/AutocompleteInput';
import JokerStickerFields from '../components/JokerStickerFields';
import NumberField from '../components/NumberField';
import RecommendationList from '../components/RecommendationList';
import ScreenshotImport from '../components/ScreenshotImport';

const EDITIONS: Edition[] = ['base', 'foil', 'holographic', 'polychrome', 'negative'];
const emptyShop: ShopState = { cards: [], voucherId: null, packIds: [], rerollCost: 5 };

interface Props {
  /** Buying a pack means opening it next, so the shell follows you there. */
  onPackBought: () => void;
}

export default function ShopScreen({ onPackBought }: Props) {
  const { store, dispatch } = useRun();
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
  const voucherBlocked = Boolean(
    voucherDef
      && (voucherDef.cost > run.money
        || run.vouchers.includes(voucherDef.id)
        || (voucherDef.requires && !run.vouchers.includes(voucherDef.requires))),
  );

  /** Everything confirmed from one screenshot lands in a single draft update,
      because setShop resolves against the shop as it was rendered. */
  const addFromScreenshot = (found: { kind: CardKind; id: string; price: number | null }[]) =>
    setShop(s => {
      const next = { ...s, cards: [...s.cards], packIds: [...s.packIds] };
      for (const { kind, id, price } of found) {
        // The price on the tag beats the catalog: a shop under Clearance Sale
        // or Liquidation charges less than a card is listed at.
        if (kind === 'joker') {
          next.cards.push({ kind: 'joker', jokerId: id, edition: 'base', price: price ?? getJoker(id)?.cost ?? 0 });
        } else if (kind === 'tarot') {
          next.cards.push({ kind: 'consumable', consumableId: id, price: price ?? getConsumable(id)?.cost ?? 0 });
        } else if (kind === 'voucher') {
          next.voucherId = id;
        } else {
          next.packIds.push(id);
        }
      }
      return next;
    });

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
        read={readScreenshot}
        onAdd={addFromScreenshot}
      />

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
                  onChange={e =>
                    setShop(s => ({
                      ...s,
                      cards: s.cards.map((c, j) =>
                        j === i && c.kind === 'joker' ? { ...c, edition: e.target.value as Edition } : c,
                      ),
                    }))
                  }
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
              ? { ...s, cards: [...s.cards, { kind: 'joker', jokerId: item.id, edition: 'base', price: getJoker(item.id)?.cost ?? 0 }] }
              : { ...s, cards: [...s.cards, { kind: 'consumable', consumableId: item.id, price: getConsumable(item.id)?.cost ?? 0 }] },
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
            {t('redeemed')}
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
          return (
            <li key={i} className="row">
              <span className="grow">{def.name}</span>
              <button
                disabled={def.cost > run.money}
                title={def.cost > run.money ? t('notAffordable') : undefined}
                onClick={() => {
                  dispatch({ type: 'BUY_SHOP_PACK', index: i });
                  onPackBought();
                }}
              >
                {t('bought')} ${def.cost}
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
        <button className="ghost" onClick={() => setShop(emptyShop)}>{t('clearShop')}</button>
      </div>

      <h3>{t('advice')}</h3>
      <RecommendationList recs={recs} />
    </section>
  );
}
