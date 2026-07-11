import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import App from './App';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it('starts a new run from the setup screen', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Yellow' }));
  await userEvent.click(screen.getByRole('button', { name: 'White' }));
  await userEvent.click(screen.getByRole('button', { name: 'Start Run' }));
  expect(screen.getByText('Ante')).toBeInTheDocument();
  expect(screen.getByDisplayValue('14')).toBeInTheDocument(); // Yellow deck starts with $14
});
