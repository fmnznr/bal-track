import { useEffect, useId, useState } from 'react';

interface Props {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}

export default function NumberField({ label, value, min = 0, onChange }: Props) {
  const id = useId();
  // Typing is held locally and committed on blur or Enter. Reporting every
  // keystroke would push one undo step and one full store serialization per
  // digit, so "24" cost two undos to take back.
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    // Adopt outside changes (undo, auto-bookings) unless the user is mid-edit.
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = (raw: string) => {
    const next = Math.max(min, Number(raw) || 0);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const step = (delta: number) => {
    setEditing(false);
    commit(String(value + delta));
  };

  return (
    <div className="number-field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button type="button" aria-label={`decrease ${label}`} onClick={() => step(-1)}>−</button>
        <input
          id={id}
          type="number"
          value={draft}
          min={min}
          inputMode="numeric"
          onFocus={() => setEditing(true)}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => {
            setEditing(false);
            commit(e.target.value);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <button type="button" aria-label={`increase ${label}`} onClick={() => step(1)}>+</button>
      </div>
    </div>
  );
}
