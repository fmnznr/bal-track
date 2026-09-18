import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import App from '../../App';
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
