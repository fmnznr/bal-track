import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import App from '../../App';
import { STORAGE_KEY, newRunState } from '../../run/runStore';

beforeEach(() => {
  localStorage.clear();
  const run = { ...newRunState('Red', 'White'), money: 10, jokers: [{ jokerId: 'golden-joker', edition: 'base' }] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: run, past: [], finished: [] }));
});
afterEach(cleanup);

it('sells a joker and refunds the sell value', async () => {
  render(<App />);
  expect(screen.getByText('Golden Joker')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Sell \$3/ }));
  expect(screen.getByDisplayValue('13')).toBeInTheDocument(); // 10 + 3 refund
  expect(screen.queryByText('Golden Joker')).not.toBeInTheDocument();
});
