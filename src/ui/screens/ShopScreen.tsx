import { getConsumable, getJoker, getPack, getVoucher } from '../../catalog/catalog';
import { hasFreeJokerSlot } from '../../engine/gameRules';
import { recommend } from '../../engine/recommend';
import { useRun } from '../../run/RunContext';
import type { Edition, ShopState } from '../../types';
import AutocompleteInput from '../components/AutocompleteInput';
import JokerStickerFields from '../components/JokerStickerFields';
import NumberField from '../components/NumberField';
import RecommendationList from '../components/RecommendationList';

const EDITIONS: Edition[] = ['base', 'foil', 'holographic', 'polychrome', 'negative'];
const emptyShop: ShopState = { cards: [], voucherId: null, packIds: [], rerollCost: 5 };

export default function ShopScreen() {
  const { store, dispatch } = useRun();
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

  const removeCard = (i: number) => setShop(s => ({ ...s, cards: s.cards.filter((_, j) => j !== i) }));
  const removePack = (i: number) => setShop(s => ({ ...s, packIds: s.packIds.filter((_, j) => j !== i) }));

  return (
    <section className="screen">
      <div className="row">
        <NumberField label="Money $" value={run.money} onChange={money => dispatch({ type: 'SET_MONEY', money })} />
        <NumberField label="Reroll $" value={shop.rerollCost} onChange={rerollCost => setShop(s => ({ ...s, rerollCost }))} />
      </div>

      <h3>Cards on offer</h3>
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
                  aria-label={`${name} edition`}
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
                label="$"
                value={slot.price}
                onChange={price =>
                  setShop(s => ({ ...s, cards: s.cards.map((c, j) => (j === i ? { ...c, price } : c)) }))
                }
              />
              <button
                disabled={!canBuy}
                title={!hasRoom ? 'No free slot' : slot.price > run.money ? 'Not affordable' : undefined}
                onClick={() => dispatch({ type: 'BUY_SHOP_CARD', index: i })}
              >
                Bought
              </button>
              <button className="ghost" aria-label={`remove ${name ?? 'card'}`} onClick={() => removeCard(i)}>✕</button>
            </li>
          );
        })}
      </ul>
      <AutocompleteInput
        placeholder="Add shop card…"
        kinds={['shop-joker', 'tarot', 'planet', 'spectral']}
        onPick={item =>
          setShop(s =>
            item.kind === 'shop-joker'
              ? { ...s, cards: [...s.cards, { kind: 'joker', jokerId: item.id, edition: 'base', price: getJoker(item.id)?.cost ?? 0 }] }
              : { ...s, cards: [...s.cards, { kind: 'consumable', consumableId: item.id, price: getConsumable(item.id)?.cost ?? 0 }] },
          )
        }
      />

      <h3>Voucher</h3>
      {shop.voucherId ? (
        <div className="row">
          <span className="grow">{getVoucher(shop.voucherId)?.name}</span>
          <button
            disabled={voucherBlocked}
            title={voucherDef?.requires && !run.vouchers.includes(voucherDef.requires) ? 'Base voucher not redeemed' : undefined}
            onClick={() => dispatch({ type: 'BUY_SHOP_VOUCHER' })}
          >
            Redeemed
          </button>
          <button className="ghost" aria-label="remove voucher" onClick={() => setShop(s => ({ ...s, voucherId: null }))}>✕</button>
        </div>
      ) : (
        <AutocompleteInput placeholder="Add voucher…" kinds={['voucher']} onPick={item => setShop(s => ({ ...s, voucherId: item.id }))} />
      )}

      <h3>Booster packs</h3>
      <ul className="rows">
        {shop.packIds.map((id, i) => {
          const def = getPack(id);
          if (!def) return null;
          return (
            <li key={i} className="row">
              <span className="grow">{def.name}</span>
              <button
                disabled={def.cost > run.money}
                title={def.cost > run.money ? 'Not affordable' : undefined}
                onClick={() => dispatch({ type: 'BUY_SHOP_PACK', index: i })}
              >
                Bought ${def.cost}
              </button>
              <button className="ghost" aria-label={`remove ${def.name}`} onClick={() => removePack(i)}>✕</button>
            </li>
          );
        })}
      </ul>
      <AutocompleteInput placeholder="Add pack…" kinds={['pack']} onPick={item => setShop(s => ({ ...s, packIds: [...s.packIds, item.id] }))} />
      <p className="muted">Bought a pack? Enter its contents on the Pack tab for pick advice.</p>

      <div className="row">
        <button
          disabled={shop.rerollCost > run.money}
          onClick={() => dispatch({ type: 'REROLL_SHOP' })}
        >
          Rerolled
        </button>
        <button className="ghost" onClick={() => setShop(emptyShop)}>Clear shop</button>
      </div>

      <h3>Advice</h3>
      <RecommendationList recs={recs} />
    </section>
  );
}
