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

type Hud = ScreenshotReading['hud'];
const NO_HUD: Hud = { money: null, rerollCost: null, hands: null, discards: null, ante: null, round: null };
/** What onAdd carries when the status column gave nothing. */
const NO_VALUES = { money: null, reroll: null, hands: null, discards: null, ante: null, round: null };

const reading = (cards: ReadCard[], hud: Hud = NO_HUD): ScreenshotReading =>
  ({ cards, hud, width: 2556, height: 1179 });

function show(
  cards: ReadCard[], onAdd = vi.fn(), kinds: CardKind[] = ['joker', 'tarot', 'voucher', 'pack'],
  hud: Hud = NO_HUD,
) {
  const read = vi.fn().mockResolvedValue(reading(cards, hud));
  render(
    <I18nProvider>
      <ScreenshotImport kinds={kinds} hud read={read} onAdd={onAdd} />
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

  expect(onAdd).toHaveBeenCalledWith({
    cards: [{ kind: 'joker', id: 'blueprint', price: null, target: 'shop' }],
    ...NO_VALUES,
  });
});

it('sends what sat at the top of the screen into the run, not the shop', async () => {
  // The top of a Balatro screenshot is the jokers in play; the same card lower
  // down is one on sale, and the two belong in different places.
  const { onAdd } = show([card('joker', ['blueprint'], 44), card('joker', ['madness'], 500, 7)]);
  await pick();

  expect(await screen.findByRole('combobox', { name: 'Where Blueprint belongs' })).toHaveValue('owned');
  expect(screen.getByRole('combobox', { name: 'Where Madness belongs' })).toHaveValue('shop');
  expect(screen.getByText('$7')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Add ticked cards' }));
  expect(onAdd).toHaveBeenCalledWith({
    cards: [
      { kind: 'joker', id: 'blueprint', price: null, target: 'owned' },
      { kind: 'joker', id: 'madness', price: 7, target: 'shop' },
    ],
    ...NO_VALUES,
  });
});

it('lets a card be moved to the other side when the guess is wrong', async () => {
  const { onAdd } = show([card('joker', ['blueprint'], 44)]);
  await pick();

  await userEvent.selectOptions(
    await screen.findByRole('combobox', { name: 'Where Blueprint belongs' }), 'shop');
  await userEvent.click(screen.getByRole('button', { name: 'Add ticked cards' }));
  expect(onAdd).toHaveBeenCalledWith({
    cards: [{ kind: 'joker', id: 'blueprint', price: null, target: 'shop' }],
    ...NO_VALUES,
  });
});

it('asks which card when one sprite serves two', async () => {
  // Joker and Wee Joker are drawn from the same cell, so nothing but the
  // player can settle it.
  const { onAdd } = show([card('joker', ['joker', 'wee-joker'], 500)]);
  await pick();

  const choice = await screen.findByRole('combobox', { name: 'Which card?' });
  await userEvent.selectOptions(choice, 'wee-joker');
  await userEvent.click(screen.getByRole('button', { name: 'Add ticked cards' }));
  expect(onAdd).toHaveBeenCalledWith({
    cards: [{ kind: 'joker', id: 'wee-joker', price: null, target: 'shop' }],
    ...NO_VALUES,
  });
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
