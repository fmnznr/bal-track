import { describe, expect, it } from 'vitest';
import { findCandidates } from './detect';
import { fingerprint } from './fingerprint';
import type { ImageLike } from './fingerprint';
import { recogniseIn } from './recognise';
import type { ReferenceCard } from './recognise';
import { blank, drawCard } from './testing';

/** A reference card drawn at atlas size, the way the build script makes one. */
function reference(
  kind: ReferenceCard['kind'], cell: [number, number], face: [number, number, number],
  seed: number, ids = ['a-card'], w = 142, h = 190,
): ReferenceCard {
  const art = blank(w, h, [255, 255, 255]);
  drawCard(art, 0, 0, w, h, face, seed);
  return { kind, cell, ids, print: fingerprint(art, { x0: 0, y0: 0, x1: w, y1: h }) };
}

const RED = reference('joker', [0, 0], [200, 60, 60], 3);
const BLUE = reference('joker', [0, 1], [60, 90, 200], 11);
const GOLD = reference('tarot', [1, 0], [210, 180, 90], 21, ['a-card'], 180, 296);
const TABLE = [RED, BLUE, GOLD];

/** The same card as the reference, drawn onto a screen at screenshot size. */
function place(screen: ImageLike, x: number, y: number, w: number, h: number, card: ReferenceCard, face: [number, number, number], seed: number) {
  drawCard(screen, x, y, w, h, face, seed);
  return card;
}

/** A sprite the game draws but no card uses: a legendary's soul face. */
const DECORATION = reference('joker', [9, 2], [140, 140, 140], 55, []);

describe('recogniseIn', () => {
  it('stays silent about a sprite that belongs to no card', () => {
    const screen = blank(1000, 600, [30, 90, 60]);
    drawCard(screen, 100, 100, 182, 244, [140, 140, 140], 55);
    expect(recogniseIn(screen, findCandidates(screen), [...TABLE, DECORATION])).toEqual([]);
  });

  it('names the cards it knows and stays quiet about the rest', () => {
    const screen = blank(1000, 600, [30, 90, 60]);
    place(screen, 100, 100, 182, 244, RED, [200, 60, 60], 3);
    place(screen, 400, 100, 182, 244, GOLD, [210, 180, 90], 21);
    drawCard(screen, 700, 100, 182, 244, [90, 200, 120], 77); // not in the table

    const found = recogniseIn(screen, findCandidates(screen), TABLE);
    expect(found.map(c => `${c.kind} r${c.cell[0]}c${c.cell[1]}`))
      .toEqual(['joker r0c0', 'tarot r1c0']);
  });

  it('reports each card once, however many candidates framed it', () => {
    const screen = blank(1000, 600, [30, 90, 60]);
    place(screen, 100, 100, 182, 244, BLUE, [60, 90, 200], 11);
    const boxes = findCandidates(screen);
    // Both detector cues usually return their own framing of the same card.
    const doubled = [...boxes, ...boxes.map(b => ({ ...b, x0: b.x0 - 6, y1: b.y1 + 8 }))];
    expect(recogniseIn(screen, doubled, TABLE)).toHaveLength(1);
  });

  it('recovers a card whose box was cut short, using its neighbour size', () => {
    // A pack whose light edge is interrupted comes out of the detector too
    // short; the card beside it is the same size by construction.
    const screen = blank(1000, 600, [30, 90, 60]);
    place(screen, 100, 100, 182, 244, RED, [200, 60, 60], 3);
    place(screen, 400, 100, 182, 244, BLUE, [60, 90, 200], 11);
    const good = { x0: 100, y0: 100, x1: 282, y1: 344 };
    const truncated = { x0: 400, y0: 100, x1: 582, y1: 250 };

    expect(recogniseIn(screen, [good], TABLE).map(c => c.cell)).toEqual([[0, 0]]);
    const both = recogniseIn(screen, [good, truncated], TABLE);
    expect(both.map(c => c.cell)).toEqual([[0, 0], [0, 1]]);
  });

  it('gives back a box tight enough to have driven the match', () => {
    const screen = blank(1000, 600, [30, 90, 60]);
    place(screen, 100, 100, 182, 244, RED, [200, 60, 60], 3);
    const [found] = recogniseIn(screen, findCandidates(screen), TABLE);
    expect(Math.abs(found.box.x0 - 100)).toBeLessThan(20);
    expect(Math.abs(found.box.y0 - 100)).toBeLessThan(20);
    expect(found.score).toBeLessThan(215);
    expect(found.margin).toBeGreaterThan(25);
  });
});

it('finds a pack whose outline broke, from the proportions a card can have', () => {
  // A booster wrapper is narrower and taller than a joker. Where its light
  // edge is interrupted, the blob comes back a fraction of its true height,
  // and scaling it blindly never reaches the real card.
  const screen = blank(1000, 700, [30, 90, 60]);
  place(screen, 300, 200, 180, 296, GOLD, [210, 180, 90], 21);
  const cutShort = { x0: 300, y0: 200, x1: 480, y1: 320 };
  expect(recogniseIn(screen, [cutShort], TABLE).map(c => c.cell)).toEqual([[1, 0]]);
});
