import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import App from '../../App';
import { STORAGE_KEY, newRunState } from '../../run/runStore';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: newRunState('Red', 'White'), past: [], finished: [] }));
});
afterEach(cleanup);

it('shows open advice on a fresh run and commits after two flush jokers', async () => {
  render(<App />);
  expect(screen.getByText(/stay flexible/i)).toBeInTheDocument();
  await userEvent.type(screen.getByPlaceholderText('Add joker…'), 'droll');
  await userEvent.click(await screen.findByRole('button', { name: /Droll Joker/ }));
  await userEvent.type(screen.getByPlaceholderText('Add joker…'), 'crafty');
  await userEvent.click(await screen.findByRole('button', { name: /Crafty Joker/ }));
  expect(screen.getByText('Commit: Flush')).toBeInTheDocument();
  expect(screen.getByText(/Look for:/)).toBeInTheDocument();
});
