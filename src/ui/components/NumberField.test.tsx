import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import NumberField from './NumberField';

afterEach(cleanup);

it('associates the label with the input and steps the value', async () => {
  const onChange = vi.fn();
  render(<NumberField label="Money $" value={10} min={0} onChange={onChange} />);
  expect(screen.getByLabelText('Money $')).toHaveDisplayValue('10');
  await userEvent.click(screen.getByRole('button', { name: 'increase Money $' }));
  expect(onChange).toHaveBeenCalledWith(11);
  await userEvent.click(screen.getByRole('button', { name: 'decrease Money $' }));
  expect(onChange).toHaveBeenCalledWith(9);
});

it('reports a typed value once on blur, not once per keystroke', async () => {
  const onChange = vi.fn();
  render(<NumberField label="Money $" value={0} min={0} onChange={onChange} />);
  const input = screen.getByLabelText('Money $');

  await userEvent.clear(input);
  await userEvent.type(input, '24');
  // Every digit used to dispatch, costing one undo step and one full save each.
  expect(onChange).not.toHaveBeenCalled();
  expect(input).toHaveDisplayValue('24');

  await userEvent.tab();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(24);
});

it('commits on Enter without waiting for focus to move', async () => {
  const onChange = vi.fn();
  render(<NumberField label="Ante" value={1} min={0} onChange={onChange} />);
  const input = screen.getByLabelText('Ante');

  await userEvent.clear(input);
  await userEvent.type(input, '5{Enter}');
  expect(onChange).toHaveBeenCalledWith(5);
});

it('clamps a committed value to the minimum', async () => {
  const onChange = vi.fn();
  function Controlled() {
    const [value, setValue] = useState(3);
    return (
      <NumberField
        label="Ante"
        value={value}
        min={1}
        onChange={next => {
          onChange(next);
          setValue(next);
        }}
      />
    );
  }
  render(<Controlled />);
  const input = screen.getByLabelText('Ante');

  await userEvent.clear(input);
  await userEvent.type(input, '0');
  await userEvent.tab();
  expect(onChange).toHaveBeenCalledWith(1);
  expect(input).toHaveDisplayValue('1');
});

it('falls back to the stored value when the owner rejects the edit', async () => {
  // The reducer refuses invalid transactions (unaffordable buys, bad slots), so
  // the field must show what was actually stored, not what was typed.
  render(<NumberField label="Money $" value={3} min={0} onChange={vi.fn()} />);
  const input = screen.getByLabelText('Money $');

  await userEvent.clear(input);
  await userEvent.type(input, '99');
  await userEvent.tab();
  expect(input).toHaveDisplayValue('3');
});

it('adopts an outside change while the field is not being edited', () => {
  const { rerender } = render(<NumberField label="Money $" value={10} onChange={vi.fn()} />);
  rerender(<NumberField label="Money $" value={13} onChange={vi.fn()} />);
  // e.g. an undo or a sale booked elsewhere in the app
  expect(screen.getByLabelText('Money $')).toHaveDisplayValue('13');
});
