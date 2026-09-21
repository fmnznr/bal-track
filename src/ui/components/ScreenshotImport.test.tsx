import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nContext';
import type { ReadCard, ScreenshotReading } from '../../vision/read';
import type { CardKind } from '../../vision/recognise';
import ScreenshotImport from './ScreenshotImport';

afterEach(cleanup);

function card(kind: CardKind, ids: string[], y: number, price: number | null = null): ReadCard {
  return { kind, cell: [0, 0], ids, box: { x0: 100, y0: y, x1: 280, y1: y + 244 }, score: 90, margin: 80, price };
}

const reading = (cards: ReadCard[]): ScreenshotReading => ({ cards, width: 2556, height: 1179 });

function show(cards: ReadCard[], onAdd = vi.fn(), kinds: CardKind[] = ['joker', 'tarot', 'voucher', 'pack']) {
  const read = vi.fn().mockResolvedValue(reading(cards));
  render(
    <I18nProvider>
      <ScreenshotImport kinds={kinds} read={read} onAdd={onAdd} />
    </I18nProvider>,
  );
  return { onAdd };
}

const pick = async () => {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  await userEvent.upload(input, new File(['x'], 'shop.png', { type: 'image/png' }));
};

it('offers what was recognised and adds only the ticked rows', async () => {
  const { onAdd } = show([card('joker', ['blueprint'], 500), card('pack', ['arcana-normal'], 800)]);
  await pick();

  expect(await screen.findByText('Blueprint')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('checkbox', { name: /Arcana Pack/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Add ticked cards' }));

  expect(onAdd).toHaveBeenCalledWith([{ kind: 'joker', id: 'blueprint', price: null }]);
});

it('leaves the cards you already own unticked', async () => {
  // The top of a Balatro screenshot is the jokers in play, not the shop.
  const { onAdd } = show([card('joker', ['blueprint'], 44), card('joker', ['madness'], 500, 7)]);
  await pick();

  expect(await screen.findByRole('checkbox', { name: /Blueprint/ })).not.toBeChecked();
  expect(screen.getByText('$7')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /Madness/ })).toBeChecked();
  expect(screen.getAllByText('owned?')).toHaveLength(1);

  await userEvent.click(screen.getByRole('button', { name: 'Add ticked cards' }));
  expect(onAdd).toHaveBeenCalledWith([{ kind: 'joker', id: 'madness', price: 7 }]);
});

it('asks which card when one sprite serves two', async () => {
  // Joker and Wee Joker are drawn from the same cell, so nothing but the
  // player can settle it.
  const { onAdd } = show([card('joker', ['joker', 'wee-joker'], 500)]);
  await pick();

  const choice = await screen.findByRole('combobox', { name: 'Which card?' });
  await userEvent.selectOptions(choice, 'wee-joker');
  await userEvent.click(screen.getByRole('button', { name: 'Add ticked cards' }));
  expect(onAdd).toHaveBeenCalledWith([{ kind: 'joker', id: 'wee-joker', price: null }]);
});

it('keeps what does not belong on this tab out of the list, and says so', async () => {
  show([card('joker', ['blueprint'], 500), card('voucher', ['overstock'], 800)], vi.fn(), ['joker', 'tarot']);
  await pick();

  expect(await screen.findByText('Blueprint')).toBeInTheDocument();
  expect(screen.queryByText('Overstock')).not.toBeInTheDocument();
  expect(screen.getByText(/1 more found/)).toBeInTheDocument();
});

it('says so when a screenshot yields nothing', async () => {
  show([]);
  await pick();
  await waitFor(() => expect(screen.getByText(/No cards found/)).toBeInTheDocument());
});

it('reports a failure instead of pretending the shop was empty', async () => {
  const read = vi.fn().mockRejectedValue(new Error('boom'));
  render(
    <I18nProvider>
      <ScreenshotImport kinds={['joker']} read={read} onAdd={vi.fn()} />
    </I18nProvider>,
  );
  await pick();
  await waitFor(() => expect(screen.getByText(/could not be read/)).toBeInTheDocument());
});
