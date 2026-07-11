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

it('levels a hand when a planet is taken from a celestial pack', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Pack' }));
  await userEvent.click(screen.getByRole('button', { name: 'celestial' }));
  await userEvent.type(screen.getByPlaceholderText('Add pack option…'), 'jup');
  await userEvent.click(await screen.findByRole('button', { name: /Jupiter/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Took Jupiter' }));
  await userEvent.click(screen.getByRole('button', { name: 'Run' }));
  expect(screen.getByDisplayValue('2')).toBeInTheDocument(); // Flush is now level 2
});
