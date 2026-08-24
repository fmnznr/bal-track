import type { JokerStickers } from '../../types';

const OPTIONS: { key: keyof JokerStickers; label: string }[] = [
  { key: 'eternal', label: 'Eternal' },
  { key: 'perishable', label: 'Perishable' },
  { key: 'rental', label: 'Rental' },
];

export default function JokerStickerFields({
  stickers,
  onChange,
}: {
  stickers?: JokerStickers;
  onChange: (stickers: JokerStickers) => void;
}) {
  return (
    <div className="sticker-fields" aria-label="Joker stickers">
      {OPTIONS.map(({ key, label }) => (
        <label key={key} className="sticker-toggle">
          <input
            type="checkbox"
            checked={Boolean(stickers?.[key])}
            onChange={event => onChange({ ...stickers, [key]: event.target.checked })}
          />
          {label}
        </label>
      ))}
    </div>
  );
}
