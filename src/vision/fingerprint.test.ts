import { describe, expect, it } from 'vitest';
import { distance, fingerprint } from './fingerprint';
import { blank, drawCard, scaled } from './testing';

const whole = (image: { width: number; height: number }) =>
  ({ x0: 0, y0: 0, x1: image.width, y1: image.height });

describe('fingerprint', () => {
  it('is the same card at two sizes', () => {
    // A screenshot's card is never the size of the atlas cell it came from.
    const small = blank(71, 95, [20, 40, 30]);
    drawCard(small, 0, 0, 71, 95, [200, 60, 60]);
    const large = scaled(small, 182, 244);
    expect(distance(fingerprint(small, whole(small)), fingerprint(large, whole(large))))
      .toBeLessThan(120);
  });

  it('tells two cards apart by a wide margin', () => {
    const a = blank(142, 190, [0, 0, 0]);
    const b = blank(142, 190, [0, 0, 0]);
    drawCard(a, 0, 0, 142, 190, [200, 60, 60], 7);
    drawCard(b, 0, 0, 142, 190, [60, 90, 200], 99);
    expect(distance(fingerprint(a, whole(a)), fingerprint(b, whole(b)))).toBeGreaterThan(200);
  });

  it('separates two cards that differ only in colour', () => {
    // Several jokers share a drawing and differ in hue alone; the gradient
    // hash is blind to that, which is why a colour term exists at all.
    const a = blank(142, 190, [0, 0, 0]);
    const b = blank(142, 190, [0, 0, 0]);
    drawCard(a, 0, 0, 142, 190, [200, 60, 60], 5);
    drawCard(b, 0, 0, 142, 190, [60, 200, 60], 5);
    const d = distance(fingerprint(a, whole(a)), fingerprint(b, whole(b)));
    expect(d).toBeGreaterThan(40);
  });

  it('reports no distance between a fingerprint and itself', () => {
    const card = blank(142, 190, [0, 0, 0]);
    drawCard(card, 0, 0, 142, 190, [120, 120, 200]);
    const print = fingerprint(card, whole(card));
    expect(distance(print, print)).toBe(0);
  });
});
