import { useT } from '../../i18n/I18nContext';
import type { JokerStickers } from '../../types';

const OPTIONS = [
  { key: 'eternal' },
  { key: 'perishable' },
  { key: 'rental' },
] as const satisfies readonly { key: keyof JokerStickers }[];

export default function JokerStickerFields({
  stickers,
  onChange,
}: {
  stickers?: JokerStickers;
  onChange: (stickers: JokerStickers) => void;
}) {
  const t = useT();
  return (
    <div className="sticker-fields" aria-label={t('jokerStickers')}>
      {OPTIONS.map(({ key }) => (
        <label key={key} className="sticker-toggle">
          <input
            type="checkbox"
            checked={Boolean(stickers?.[key])}
            onChange={event => onChange({ ...stickers, [key]: event.target.checked })}
          />
          {t(key)}
        </label>
      ))}
    </div>
  );
}
