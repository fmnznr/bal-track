import { useId } from 'react';

interface Props {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}

export default function NumberField({ label, value, min = 0, onChange }: Props) {
  const id = useId();
  return (
    <div className="number-field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button type="button" aria-label={`decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <input
          id={id}
          type="number"
          value={value}
          min={min}
          onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
        />
        <button type="button" aria-label={`increase ${label}`} onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  );
}
