import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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

it('corrects the per-round resource', async () => {
  render(<App />);
  await userEvent.click(screen.getByText('Corrections'));
  expect(screen.getByLabelText('Hands per round')).toHaveDisplayValue('4');
  await userEvent.click(screen.getByRole('button', { name: 'increase Discards per round' }));
  expect(screen.getByLabelText('Discards per round')).toHaveDisplayValue('5');
});

it('declares the hand you build around and feeds it to the advice', async () => {
  render(<App />);
  const select = screen.getByLabelText('Hand you build around');
  expect(select).toHaveDisplayValue('Not decided yet');

  await userEvent.selectOptions(select, 'Flush');
  expect(select).toHaveDisplayValue('Flush');
  // The score estimate describes the declared hand from here on.
  expect(screen.getByText(/Typical Flush/)).toBeInTheDocument();
});

it('shows the score estimate against the ante targets', async () => {
  render(<App />);
  expect(screen.getByText(/Typical/)).toBeInTheDocument();
  expect(screen.getByText(/targets/)).toBeInTheDocument();
});

it('abandons a run without recording a result, and offers an undo afterwards', async () => {
  // beforeEach seeds an active run holding Golden Joker.
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<App />);
  expect(screen.getByText('Golden Joker')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Abandon run' }));
  expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/not appear in your history/));
  // Back on the setup screen, with nothing added to the history.
  expect(screen.getByRole('button', { name: 'Start Run' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByText('Golden Joker')).toBeInTheDocument();
  confirmSpy.mockRestore();
});

it('clears the history from the history screen', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Run won' }));

  await userEvent.click(screen.getByRole('button', { name: 'History' }));
  expect(screen.getByText(/1 runs · 1 wins/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Clear history' }));
  expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/Delete all 1 finished runs/));
  expect(screen.getByText('No finished runs yet.')).toBeInTheDocument();
  confirmSpy.mockRestore();
});

it('adds a sixth joker to a full board when it is Negative', async () => {
  // A Negative joker takes no slot, which is the whole point of it — but the
  // edition could only be set after adding, and a full board refuses the add.
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    current: {
      ...newRunState('Red', 'White'),
      jokerSlots: 2,
      jokers: [
        { jokerId: 'joker', edition: 'base', stickers: {} },
        { jokerId: 'blueprint', edition: 'base', stickers: {} },
      ],
    },
    past: [], finished: [],
  }));
  render(<App />);

  const add = screen.getByPlaceholderText('Add joker…');
  await userEvent.type(add, 'madness');
  await userEvent.click(await screen.findByRole('button', { name: /Madness/ }));
  expect(screen.getByText(/No free joker slot/)).toBeInTheDocument();
  expect(screen.queryByText('Madness')).not.toBeInTheDocument();

  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Edition of the joker being added' }), 'negative');
  await userEvent.type(add, 'madness');
  await userEvent.click(await screen.findByRole('button', { name: /Madness/ }));
  expect(screen.getByText('Madness')).toBeInTheDocument();
});
