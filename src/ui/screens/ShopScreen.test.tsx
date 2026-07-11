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
