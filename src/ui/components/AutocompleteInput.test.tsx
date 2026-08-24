import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import AutocompleteInput from './AutocompleteInput';

afterEach(cleanup);

it('exposes a labeled combobox and supports keyboard selection', async () => {
  const onPick = vi.fn();
  render(<AutocompleteInput placeholder="Add joker…" kinds={['joker']} onPick={onPick} />);

  const input = screen.getByRole('combobox', { name: 'Add joker' });
  await userEvent.type(input, 'blueprint');
  expect(input).toHaveAttribute('aria-expanded', 'true');
  await userEvent.keyboard('{Enter}');

  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'blueprint' }));
  expect(input).toHaveValue('');
});

it('closes results with Escape', async () => {
  render(<AutocompleteInput placeholder="Add joker…" kinds={['joker']} onPick={() => undefined} />);
  const input = screen.getByRole('combobox', { name: 'Add joker' });
  await userEvent.type(input, 'blue');
  await userEvent.keyboard('{Escape}');
  expect(input).toHaveAttribute('aria-expanded', 'false');
});
