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

it('keeps pack options when switching tabs', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Pack' }));
  await userEvent.click(screen.getByRole('button', { name: 'celestial' }));
  await userEvent.type(screen.getByPlaceholderText('Add pack option…'), 'jup');
  await userEvent.click(await screen.findByRole('button', { name: /Jupiter/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Run' }));
  await userEvent.click(screen.getByRole('button', { name: 'Pack' }));
  expect(screen.getByRole('button', { name: 'Took Jupiter' })).toBeInTheDocument();
});

it('books a suit conversion through the prompt', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Pack' }));
  await userEvent.click(screen.getByRole('button', { name: 'arcana' }));
  await userEvent.type(screen.getByPlaceholderText('Add pack option…'), 'sun');
  await userEvent.click(await screen.findByRole('button', { name: /The Sun/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Took The Sun' }));
  await userEvent.click(screen.getByRole('button', { name: 'from diamonds' }));
  await userEvent.click(screen.getByRole('button', { name: 'from diamonds' }));
  await userEvent.click(screen.getByRole('button', { name: 'from clubs' }));
  await userEvent.click(screen.getByRole('button', { name: 'Book conversion' }));
  await userEvent.click(screen.getByRole('button', { name: 'Run' }));
  await userEvent.click(screen.getByText('Deck profile'));
  expect(screen.getByLabelText('Hearts')).toHaveDisplayValue('16');
  expect(screen.getByLabelText('Diamonds')).toHaveDisplayValue('11');
});

it('reports honestly whether a taken consumable updated the profile', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Pack' }));
  await userEvent.click(screen.getByRole('button', { name: 'arcana' }));
  await userEvent.type(screen.getByPlaceholderText('Add pack option…'), 'chariot');
  await userEvent.click(await screen.findByRole('button', { name: /The Chariot/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Took The Chariot' }));
  expect(screen.getByText(/deck profile updated/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Run' }));
  await userEvent.click(screen.getByText('Deck profile'));
  expect(screen.getByLabelText('Steel')).toHaveDisplayValue('1');
});
