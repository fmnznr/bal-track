import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../../App';

// The recogniser needs a canvas and a worker, neither of which jsdom has; the
// screen's job is what happens to a reading, not how one is produced.
vi.mock('../../vision/client', () => ({
  readScreenshot: vi.fn().mockResolvedValue({
    width: 2556,
    height: 1179,
    hud: { money: 29, rerollCost: 6, hands: 4, discards: 3, ante: 4, round: 10 },
    cards: [
      { kind: 'joker', cell: [0, 0], ids: ['blueprint'], box: { x0: 100, y0: 500, x1: 280, y1: 744 }, score: 90, margin: 80 },
      { kind: 'joker', cell: [0, 1], ids: ['madness'], box: { x0: 100, y0: 44, x1: 280, y1: 288 }, score: 95, margin: 70 },
      { kind: 'pack', cell: [0, 3], ids: ['arcana-normal'], box: { x0: 400, y0: 800, x1: 580, y1: 1110 }, score: 140, margin: 60 },
    ],
  }),
}));
import { STORAGE_KEY, newRunState } from '../../run/runStore';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ current: newRunState('Red', 'White'), past: [], finished: [] }),
  );
});
afterEach(cleanup);

it('recommends a shop joker after entering it', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  await userEvent.type(screen.getByPlaceholderText('Add shop card…'), 'blueprint');
  await userEvent.click(await screen.findByRole('button', { name: /Blueprint/ }));
  expect(screen.getByText(/Buy Blueprint/)).toBeInTheDocument();
});

it('keeps shop entries when switching tabs', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  await userEvent.type(screen.getByPlaceholderText('Add shop card…'), 'blueprint');
  await userEvent.click(await screen.findByRole('button', { name: /Blueprint/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Run' }));
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  expect(screen.getByText(/Buy Blueprint/)).toBeInTheDocument();
});

it('buys a shop card atomically and undo restores the offer', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  await userEvent.type(screen.getByPlaceholderText('Add shop card…'), 'joker');
  await userEvent.click((await screen.findAllByRole('button', { name: /^Joker/ }))[0]);
  await userEvent.click(screen.getByRole('button', { name: 'Bought' }));
  expect(screen.queryByText(/Buy Joker/)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Run' }));
  expect(screen.getByText('Joker')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.queryByText('Joker')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  expect(screen.getByText(/Buy Joker/)).toBeInTheDocument();
});

it('disables purchases that would overdraw the run', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  await userEvent.type(screen.getByPlaceholderText('Add shop card…'), 'blueprint');
  await userEvent.click(await screen.findByRole('button', { name: /Blueprint/ }));
  expect(screen.getByRole('button', { name: 'Bought' })).toBeDisabled();
});

it('sets a Rental shop joker to its fixed $1 price', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  await userEvent.type(screen.getByPlaceholderText('Add shop card…'), 'blueprint');
  await userEvent.click(await screen.findByRole('button', { name: /Blueprint/ }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Rental' }));
  expect(screen.getByText(/Buy Blueprint \(\$1\)/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Bought' })).toBeEnabled();
});

it('opens the pack tab on the bought pack after paying for it', async () => {
  // Buying a pack is always followed by opening it, so the app makes that move
  // instead of leaving you on a shop row you have just paid off.
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  await userEvent.type(screen.getByPlaceholderText('Add pack…'), 'celestial');
  await userEvent.click((await screen.findAllByRole('button', { name: /^Celestial Pack/ }))[0]);
  await userEvent.click(screen.getByRole('button', { name: 'Bought $4' }));

  expect(screen.getByRole('button', { name: 'Pack' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: 'celestial' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByPlaceholderText('Add pack option…')).toBeInTheDocument();
});

it('fills the shop from a screenshot once the reading is confirmed', async () => {
  // The reading itself is tested in the vision module; what matters here is
  // that a confirmed card becomes a real offer with its catalog price, and
  // that nothing enters the draft before the confirmation.
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  await userEvent.upload(input, new File(['x'], 'shop.png', { type: 'image/png' }));

  expect(await screen.findByRole('checkbox', { name: /Blueprint/ })).toBeInTheDocument();
  expect(screen.queryByText(/Buy Blueprint/)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Add ticked cards' }));
  expect(screen.getByText(/Buy Blueprint/)).toBeInTheDocument();
  expect(screen.getByText('Arcana Pack')).toBeInTheDocument();
  // The status column is part of the shop too: what you hold and what a
  // reroll costs decide whether any of it is affordable.
  expect(screen.getByLabelText('Money $')).toHaveDisplayValue('29');
  expect(screen.getByLabelText('Reroll $')).toHaveDisplayValue('6');
});

it('puts the jokers you already hold into the run rather than the offer', async () => {
  // A joker at the top of the screenshot is on your board; the engine cannot
  // judge a shop without knowing what it is judging against.
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  await userEvent.upload(input, new File(['x'], 'shop.png', { type: 'image/png' }));
  await screen.findByRole('button', { name: 'Add ticked cards' });
  await userEvent.click(screen.getByRole('button', { name: 'Add ticked cards' }));

  // Madness sat at the top, so it is now owned and not on offer.
  expect(screen.queryByText(/Buy Madness/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Run' }));
  expect(screen.getByText('Madness')).toBeInTheDocument();
});

it('carries the status column into the run: ante, round, hands and discards', async () => {
  // The screenshot shows where the run stands as well as what is on sale, and
  // the engine judges a shop against both.
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  await userEvent.upload(input, new File(['x'], 'shop.png', { type: 'image/png' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Add ticked cards' }));

  await userEvent.click(screen.getByRole('button', { name: 'Run' }));
  expect(screen.getByLabelText('Ante')).toHaveValue(4);
  expect(screen.getByLabelText('Round')).toHaveValue(10);
  expect(screen.getByLabelText('Money $')).toHaveValue(29);
  await userEvent.click(screen.getByText('Corrections'));
  expect(screen.getByLabelText('Hands per round')).toHaveValue(4);
  expect(screen.getByLabelText('Discards per round')).toHaveValue(3);
});

it('logs what you did against the advice and shows it in the history', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  await userEvent.type(screen.getByPlaceholderText('Add shop card…'), 'cavendish');
  await userEvent.click(await screen.findByRole('button', { name: /Cavendish/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Bought' }));
  await userEvent.click(screen.getByRole('button', { name: 'Left the shop' }));
  await userEvent.click(screen.getByRole('button', { name: 'History' }));
  expect(screen.getByText('Advice log')).toBeInTheDocument();
  // Buying Cavendish, then leaving once the shop was empty: only the buy had a ranking.
  expect(screen.getByText(/^1 decisions · top pick taken/)).toBeInTheDocument();
});
