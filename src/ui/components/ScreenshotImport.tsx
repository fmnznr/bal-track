import { useState } from 'react';
import { getConsumable, getJoker, getPack, getVoucher } from '../../catalog/catalog';
import { useT } from '../../i18n/I18nContext';
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
interface Props {
  /** What this screen can use: the shop takes everything, a pack only cards. */
  kinds: CardKind[];
  onAdd: (cards: { kind: CardKind; id: string; price: number | null }[]) => void;
  /** Injectable so tests need no worker, no canvas and no screenshot. */
  read: ReadScreenshot;
}

/** Cards this high up the screenshot are the ones already owned, not on offer. */
const OWNED_ABOVE = 0.3;

interface Row {
  card: ReadCard;
  id: string;
  take: boolean;
  owned: boolean;
}

export function cardName(kind: CardKind, id: string): string {
  const def = kind === 'joker' ? getJoker(id)
    : kind === 'tarot' ? getConsumable(id)
      : kind === 'voucher' ? getVoucher(id)
        : getPack(id);
  return def?.name ?? id;
}

export default function ScreenshotImport({ kinds, onAdd, read }: Props) {
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
      setRows(usable.map(card => {
        const owned = card.box.y0 < reading.height * OWNED_ABOVE;
        return { card, id: card.ids[0], take: !owned, owned };
      }));
    } catch {
      setError(t('screenshotFailed'));
    } finally {
      setBusy(false);
    }
  };

  const update = (index: number, change: Partial<Row>) =>
    setRows(current => current && current.map((row, i) => (i === index ? { ...row, ...change } : row)));

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
              <li key={`${row.card.box.x0}-${row.card.box.y0}`} className="row">
                <label className="grow sticker-toggle">
                  <input
                    type="checkbox"
                    checked={row.take}
                    onChange={e => update(i, { take: e.target.checked })}
                  />
                  {row.card.ids.length > 1 ? (
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
                {/* The player is the one who knows which row of the screen a
                    card came from, so say what was assumed and let them fix it. */}
                {/* The price comes off the tag above the card, so a shop with
                    Clearance Sale prices is read as it really is. */}
                {row.card.price !== null && <span className="muted">${row.card.price}</span>}
                {row.owned && <span className="muted">{t('screenshotOwned')}</span>}
              </li>
            ))}
          </ul>
          {skipped > 0 && <p className="muted">{t('screenshotSkipped', { count: String(skipped) })}</p>}
          <button
            className="primary"
            disabled={rows.every(r => !r.take)}
            onClick={() => {
              onAdd(rows.filter(r => r.take).map(r => ({ kind: r.card.kind, id: r.id, price: r.card.price })));
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
