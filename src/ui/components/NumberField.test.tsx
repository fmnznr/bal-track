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
