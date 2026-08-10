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
  expect(screen.getByLabelText('Money $')).toHaveDisplayValue('13'); // 10 + 3 refund
  expect(screen.queryByText('Golden Joker')).not.toBeInTheDocument();
});

it('edits the deck profile counters', async () => {
  render(<App />);
  await userEvent.click(screen.getByText('Deck profile'));
  expect(screen.getByLabelText('Hearts')).toHaveDisplayValue('13');
  await userEvent.click(screen.getByRole('button', { name: 'increase Steel' }));
  expect(screen.getByLabelText('Steel')).toHaveDisplayValue('1');
});

it('reorders jokers with the arrow buttons', async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      current: {
        ...newRunState('Red', 'White'),
        ante: 4,
        jokers: [
          { jokerId: 'cavendish', edition: 'base' },
          { jokerId: 'joker', edition: 'base' },
        ],
      },
      past: [],
      finished: [],
    }),
  );
  render(<App />);
  expect(screen.getByText(/sits left of/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'move Cavendish right' }));
  expect(screen.queryByText(/sits left of/)).not.toBeInTheDocument();
  expect(screen.getByText(/Joker order looks good/)).toBeInTheDocument();
});

it('applies the suggested order in one tap', async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      current: {
        ...newRunState('Red', 'White'),
        ante: 4,
        jokers: [
          { jokerId: 'cavendish', edition: 'base' },
          { jokerId: 'joker', edition: 'base' },
        ],
      },
      past: [],
      finished: [],
    }),
  );
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Apply suggested order' }));
  expect(screen.getByText(/Joker order looks good/)).toBeInTheDocument();
});
