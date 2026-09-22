import { describe, expect, it } from 'vitest';
import { findCandidates } from './detect';
import { blank, drawCard, fillRect } from './testing';

/** Does a candidate frame this rectangle, give or take a few pixels? */
function framed(boxes: { x0: number; y0: number; x1: number; y1: number }[],
  x: number, y: number, w: number, h: number, slack = 24) {
  return boxes.some(b =>
    Math.abs(b.x0 - x) < slack && Math.abs(b.y0 - y) < slack
    && Math.abs(b.x1 - (x + w)) < slack && Math.abs(b.y1 - (y + h)) < slack);
}

describe('findCandidates', () => {
  it('finds cards on a green field and on a purple one', () => {
    // The felt is green in the shop and purple while a pack is open, which is
    // why the detector must not key on a particular background colour.
    for (const field of [[30, 90, 60], [70, 30, 110]] as [number, number, number][]) {
      const screen = blank(900, 500, field);
      drawCard(screen, 120, 120, 180, 244, [200, 60, 60], 3);
      drawCard(screen, 400, 120, 180, 244, [60, 90, 200], 11);
      const boxes = findCandidates(screen);
      expect(framed(boxes, 120, 120, 180, 244)).toBe(true);
      expect(framed(boxes, 400, 120, 180, 244)).toBe(true);
    }
  });

  it('separates two cards a price pill has joined', () => {
    // A pill bridging two neighbours merges them into one blob; a card is a
    // solid column, so the gap between them shows as a valley to split at.
    const screen = blank(900, 500, [30, 90, 60]);
    drawCard(screen, 200, 140, 180, 244, [200, 60, 60], 5);
    drawCard(screen, 392, 140, 180, 244, [210, 180, 90], 9);
    fillRect(screen, 330, 120, 120, 30, [240, 176, 60]);
    const boxes = findCandidates(screen);
    expect(framed(boxes, 200, 140, 180, 244, 40)).toBe(true);
    expect(framed(boxes, 392, 140, 180, 244, 40)).toBe(true);
  });

  it('keeps a pack, which is taller than a card', () => {
    const screen = blank(900, 600, [30, 90, 60]);
    drawCard(screen, 120, 100, 180, 244, [200, 60, 60], 3);
    drawCard(screen, 400, 100, 190, 310, [120, 60, 190], 21);
    expect(framed(findCandidates(screen), 400, 100, 190, 310, 30)).toBe(true);
  });

  it('ignores things far too small to be a card', () => {
    const screen = blank(900, 500, [30, 90, 60]);
    drawCard(screen, 120, 120, 180, 244, [200, 60, 60]);
    fillRect(screen, 600, 200, 40, 54, [240, 240, 240]); // a UI label
    const boxes = findCandidates(screen);
    expect(boxes.every(b => b.y1 - b.y0 > 80)).toBe(true);
  });

  it('returns nothing for a screen without cards', () => {
    expect(findCandidates(blank(900, 500, [30, 90, 60]))).toEqual([]);
  });
});

it('covers a row of overlapping cards, not just its ends', () => {
  // Six jokers on a phone screen touch each other, and where cards overlap
  // there is no gap to split at — so the row is covered with card-sized boxes
  // instead, and the matcher decides which of them landed on something.
  const screen = blank(1400, 500, [30, 90, 60]);
  const overlap = 130;
  for (let i = 0; i < 6; i++) drawCard(screen, 200 + i * overlap, 100, 180, 244, [190, 60 + i * 20, 60], i + 1);
  const boxes = findCandidates(screen);
  // Every card needs a candidate near enough that the refinement, which may
  // shift a box by a fraction of a card, can settle on it.
  const centres = [0, 1, 2, 3, 4, 5].map(i => 200 + i * overlap + 90);
  const covered = centres.filter(cx =>
    boxes.some(b => Math.abs((b.x0 + b.x1) / 2 - cx) < 50));
  expect(covered).toHaveLength(6);
});
