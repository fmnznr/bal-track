import { useState } from 'react';
import { getConsumable, getJoker, getPack, getVoucher } from '../../catalog/catalog';
import { useT } from '../../i18n/I18nContext';
import type { PhraseKey } from '../../i18n/dictionary';
import type { ReadScreenshot } from '../../vision/client';
import type { ReadCard } from '../../vision/read';
import type { CardKind } from '../../vision/recognise';

/**
 * Reading a shop from a screenshot, with the player having the last word.
 *
 * Nothing recognised reaches the run until it is confirmed here. The
 * recogniser is good but not infallible, and a wrong joker would quietly skew
 * every recommendation that follows, so the cost of a wrong guess is one
 * unticked row rather than a ruined run.
 */
/** Where a confirmed card belongs: the shop's offer, or the run itself. */
export type CardTarget = 'shop' | 'owned';

/** The status column's numbers, each confirmed on its own row. */
export type ValueKind = 'money' | 'reroll' | 'hands' | 'discards' | 'ante' | 'round';

export type Confirmed = Record<ValueKind, number | null> & {
  cards: { kind: CardKind; id: string; price: number | null; target: CardTarget }[];
};

interface Props {
  /** What this screen can use: the shop takes everything, a pack only cards. */
  kinds: CardKind[];
  /** Whether the status column's numbers are of use here. */
  hud?: boolean;
  onAdd: (confirmed: Confirmed) => void;
  /** Injectable so tests need no worker, no canvas and no screenshot. */
  read: ReadScreenshot;
}

/** Only these can be held; a pack or a voucher is bought and gone. */
const canBeOwned = (kind: CardKind) => kind === 'joker' || kind === 'tarot';

/** Cards this high up the screenshot are the ones already owned, not on offer. */
const OWNED_ABOVE = 0.3;

type Row =
  | { type: 'card'; card: ReadCard; id: string; take: boolean; target: CardTarget }
  /** A number the status column shows rather than a card. */
  | { type: 'value'; kind: ValueKind; value: number; take: boolean };

/** The label each status-column number goes under, and whether it is money. */
const VALUES: { kind: ValueKind; label: PhraseKey; dollars: boolean }[] = [
  { kind: 'money', label: 'money', dollars: true },
  { kind: 'reroll', label: 'rerollCost', dollars: true },
  { kind: 'hands', label: 'handsPerRound', dollars: false },
  { kind: 'discards', label: 'discardsPerRound', dollars: false },
  { kind: 'ante', label: 'ante', dollars: false },
  { kind: 'round', label: 'round', dollars: false },
];

export function cardName(kind: CardKind, id: string): string {
  const def = kind === 'joker' ? getJoker(id)
    : kind === 'tarot' ? getConsumable(id)
      : kind === 'voucher' ? getVoucher(id)
        : getPack(id);
  return def?.name ?? id;
}

export default function ScreenshotImport({ kinds, hud = false, onAdd, read }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [skipped, setSkipped] = useState(0);

  const load = async (file: File) => {
    setBusy(true);
    setError(null);
    setRows(null);
    try {
      const reading = await read(file);
      const usable = reading.cards.filter(c => kinds.includes(c.kind));
      setSkipped(reading.cards.length - usable.length);
      const shown: Record<ValueKind, number | null> = { ...reading.hud, reroll: reading.hud.rerollCost };
      const values: Row[] = hud
        ? VALUES.flatMap(({ kind }) => {
          const value = shown[kind];
          return typeof value === 'number' ? [{ type: 'value' as const, kind, value, take: true }] : [];
        })
        : [];
      setRows([
        ...values,
        ...usable.map((card): Row => ({
          type: 'card' as const,
          card,
          id: card.ids[0],
          take: true,
          // The top of a screenshot is what you already have, the rest is what
          // the shop offers. Both are worth keeping, in different places.
          target: card.box.y0 < reading.height * OWNED_ABOVE ? 'owned' : 'shop',
        })),
      ]);
    } catch {
      setError(t('screenshotFailed'));
    } finally {
      setBusy(false);
    }
  };

  const update = (index: number, change: { take?: boolean; id?: string; target?: CardTarget }) =>
    setRows(current => current && current.map((row, i) => (i === index ? { ...row, ...change } : row)));

  const rowKey = (row: Row, i: number) =>
    (row.type === 'card' ? `${row.card.box.x0}-${row.card.box.y0}` : `${row.kind}-${i}`);

  return (
    <div className="screenshot-import">
      <label className="file-button">
        {busy ? t('screenshotReading') : t('screenshotRead')}
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void load(file);
          }}
        />
      </label>

      {error && <p className="muted">{error}</p>}

      {rows?.length === 0 && <p className="muted">{t('screenshotNothing')}</p>}

      {rows && rows.length > 0 && (
        <>
          <ul className="rows">
            {rows.map((row, i) => (
              <li key={rowKey(row, i)} className="row">
                <label className="grow sticker-toggle">
                  <input
                    type="checkbox"
                    checked={row.take}
                    onChange={e => update(i, { take: e.target.checked })}
                  />
                  {row.type === 'value' ? (
                    <span>{t(VALUES.find(v => v.kind === row.kind)!.label)}</span>
                  ) : row.card.ids.length > 1 ? (
                    <select
                      aria-label={t('whichCard')}
                      value={row.id}
                      onChange={e => update(i, { id: e.target.value })}
                    >
                      {row.card.ids.map(id => (
                        <option key={id} value={id}>{cardName(row.card.kind, id)}</option>
                      ))}
                    </select>
                  ) : (
                    <span>{cardName(row.card.kind, row.id)}</span>
                  )}
                </label>
                {/* The price comes off the tag above the card, so a shop with
                    Clearance Sale prices is read as it really is. */}
                {row.type === 'card' && row.card.price !== null && <span className="muted">${row.card.price}</span>}
                {row.type === 'value' && (
                  <span className="muted">
                    {VALUES.find(v => v.kind === row.kind)!.dollars ? `$${row.value}` : row.value}
                  </span>
                )}
                {/* A joker at the top of the screenshot is one you hold; the
                    same card lower down is one on sale. The reading guesses
                    from where it sat, and you correct it here. */}
                {row.type === 'card' && canBeOwned(row.card.kind) && (
                  <select
                    aria-label={t('screenshotWhere', { name: cardName(row.card.kind, row.id) })}
                    value={row.target}
                    onChange={e => update(i, { target: e.target.value as CardTarget })}
                  >
                    <option value="shop">{t('screenshotOnOffer')}</option>
                    <option value="owned">{t('screenshotInRun')}</option>
                  </select>
                )}
              </li>
            ))}
          </ul>
          {skipped > 0 && <p className="muted">{t('screenshotSkipped', { count: String(skipped) })}</p>}
          <button
            className="primary"
            disabled={rows.every(r => !r.take)}
            onClick={() => {
              const taken = rows.filter(r => r.take);
              const value = (kind: ValueKind) => {
                const row = taken.find(r => r.type === 'value' && r.kind === kind);
                return row && row.type === 'value' ? row.value : null;
              };
              onAdd({
                cards: taken
                  .filter(r => r.type === 'card')
                  .map(r => ({ kind: r.card.kind, id: r.id, price: r.card.price, target: r.target })),
                ...Object.fromEntries(VALUES.map(v => [v.kind, value(v.kind)])) as Record<ValueKind, number | null>,
              });
              setRows(null);
            }}
          >
            {t('screenshotAdd')}
          </button>
        </>
      )}
    </div>
  );
}
