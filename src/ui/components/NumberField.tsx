interface Props {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}

export default function NumberField({ label, value, min = 0, onChange }: Props) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="stepper">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <input
          type="number"
          value={value}
          min={min}
          onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
        />
        <button type="button" onClick={() => onChange(value + 1)}>+</button>
      </div>
    </label>
  );
}
