/**
 * From a screenshot to a list of recognised cards.
 *
 * The detector's boxes only roughly frame a card: one swallows the price pill
 * above it, another stops short where a pack's light edge is interrupted. Crop
 * framing turns out to matter more than anything else — the same joker scored
 * 86 from a tight crop and 192 from a loose one, a larger effect than card
 * tilt and a wrong-language reference table combined. So rather than tuning
 * edge rules, each box is refined by searching a small window of offsets and
 * scales and keeping the crop the reference table likes best, coarse first and
 * then tighter around the winner.
 *
 * Nothing here writes to the run. A wrong joker would poison every
 * recommendation that follows it, so the caller shows what was found and the
 * player confirms it.
 */
import { distance, fingerprint } from './fingerprint';
import type { Box, Fingerprint, ImageLike } from './fingerprint';

export type CardKind = 'joker' | 'tarot' | 'voucher' | 'pack';

export interface ReferenceCard {
  kind: CardKind;
  /** Cell in the source atlas. */
  cell: [number, number];
  /**
   * The catalog ids drawn from this sprite. Usually one; two where the game
   * draws two cards from one cell, as it does for Joker and Wee Joker; none
   * for a cell that holds no card, such as a legendary's soul face — matching
   * one of those is a reason to report nothing, not to name the nearest card.
   */
  ids: string[];
  print: Fingerprint;
}

export interface DetectedCard {
  kind: CardKind;
  cell: [number, number];
  /** One id normally; two when the sprite is shared and the player must pick. */
  ids: string[];
  box: Box;
  /** Distance to the best match: lower is better, 0 would be identical. */
  score: number;
  /** How much worse the runner-up is. A card nobody recognises scores badly
      on both, so the pair separates "found" from "something card-shaped". */
  margin: number;
}

/**
 * Calibrated on ten real screenshots, 170 refined candidates in total: every
 * card that was really there scored 52-207, and the best-scoring thing that
 * was not a card — a playing card in a fanned hand — scored 225. The threshold
 * sits in that gap, nearer the false side because a miss costs a correction
 * and a false positive costs a wrong run.
 *
 * The margin is a weak second opinion rather than a real filter: true cards
 * kept at least 35 points of daylight to the runner-up, but so did some
 * mismatches, so it only catches the case where two references are equally
 * plausible — the atlas does contain duplicate sprites.
 */
export const MAX_SCORE = 215;
export const MIN_MARGIN = 25;

interface Scored {
  score: number;
  margin: number;
  box: Box;
  card: ReferenceCard;
}

function best(image: ImageLike, box: Box, table: readonly ReferenceCard[]): Scored | null {
  const print = fingerprint(image, box);
  let first: ReferenceCard | null = null;
  let bestScore = Infinity;
  let second = Infinity;
  for (const card of table) {
    const d = distance(print, card.print);
    if (d < bestScore) {
      second = bestScore;
      bestScore = d;
      first = card;
    } else if (d < second) {
      second = d;
    }
  }
  return first ? { score: bestScore, margin: second - bestScore, box, card: first } : null;
}

function search(
  image: ImageLike,
  centre: { cx: number; cy: number; w: number; h: number },
  offsets: readonly number[],
  scalesX: readonly number[],
  scalesY: readonly number[],
  table: readonly ReferenceCard[],
  incumbent: Scored | null,
): Scored | null {
  let winner = incumbent;
  for (const sx of scalesX) {
    for (const sy of scalesY) {
      const w = centre.w * sx;
      const h = centre.h * sy;
      for (const dx of offsets) {
        for (const dy of offsets) {
          const box = {
            x0: Math.round(centre.cx + dx - w / 2),
            y0: Math.round(centre.cy + dy - h / 2),
            x1: Math.round(centre.cx + dx + w / 2),
            y1: Math.round(centre.cy + dy + h / 2),
          };
          if (box.x0 < 0 || box.y0 < 0 || box.x1 > image.width || box.y1 > image.height) continue;
          const scored = best(image, box, table);
          if (scored && (winner === null || scored.score < winner.score)) winner = scored;
        }
      }
    }
  }
  return winner;
}

const middle = (box: Box) => ({
  cx: (box.x0 + box.x1) / 2,
  cy: (box.y0 + box.y1) / 2,
  w: box.x1 - box.x0,
  h: box.y1 - box.y0,
});

export function refine(image: ImageLike, box: Box, table: readonly ReferenceCard[]): Scored | null {
  const coarse = search(image, middle(box), [-14, 0, 14], [0.85, 1, 1.15], [0.85, 1, 1.3], table, null);
  if (!coarse) return null;
  return search(image, middle(coarse.box), [-6, 0, 6], [0.94, 1, 1.06], [0.94, 1, 1.06], table, coarse);
}

const accepted = (s: Scored | null): s is Scored =>
  // A sprite that belongs to no card is a match worth having and a result
  // worth discarding: it is how a soul face or a locked placeholder stops
  // being mistaken for the card whose fingerprint is next closest.
  s !== null && s.card.ids.length > 0 && s.score < MAX_SCORE && s.margin > MIN_MARGIN;

function present(s: Scored): DetectedCard {
  return {
    kind: s.card.kind, cell: s.card.cell, ids: s.card.ids,
    box: s.box, score: Math.round(s.score), margin: Math.round(s.margin),
  };
}

/**
 * A card whose own outline is broken comes out of the detector too short. Its
 * neighbour in the same row is the same size by construction, so lending it
 * that size recovers it without inventing another rule about edges.
 */
function retryWithNeighbourSize(
  image: ImageLike, box: Box, taken: readonly Scored[], table: readonly ReferenceCard[],
): Scored | null {
  const height = box.y1 - box.y0;
  const centreY = (box.y0 + box.y1) / 2;
  const row = taken.filter(t => Math.abs((t.box.y0 + t.box.y1) / 2 - centreY) < 0.6 * height);
  if (row.length === 0) return null;
  const centreX = (box.x0 + box.x1) / 2;
  const near = row.reduce((a, b) =>
    Math.abs((a.box.x0 + a.box.x1) / 2 - centreX) <= Math.abs((b.box.x0 + b.box.x1) / 2 - centreX) ? a : b);
  const w = near.box.x1 - near.box.x0;
  const h = near.box.y1 - near.box.y0;
  // Anchored on the top edge: a truncated box keeps its top and loses its foot.
  return search(image, { cx: centreX, cy: box.y0 + h / 2, w, h },
    [-10, 0, 10], [0.94, 1, 1.06], [0.94, 1, 1.06], table, null);
}

function overlap(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = ix * iy;
  const union = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter;
  return union > 0 ? inter / union : 0;
}

/** Two candidates framing the same card both survive detection on purpose;
    here the better-scoring framing wins and the other is dropped. */
function bestPerCard(found: readonly Scored[]): Scored[] {
  const kept: Scored[] = [];
  for (const card of [...found].sort((a, b) => a.score - b.score)) {
    if (kept.every(k => overlap(card.box, k.box) < 0.4)) kept.push(card);
  }
  return kept;
}

export function recogniseIn(
  image: ImageLike, boxes: readonly Box[], table: readonly ReferenceCard[],
): DetectedCard[] {
  const scored = boxes.map(box => ({ box, result: refine(image, box, table) }));
  const taken = bestPerCard(scored.map(s => s.result).filter(accepted));
  const out = [...taken];
  for (const { box, result } of scored) {
    if (accepted(result)) continue;
    const second = retryWithNeighbourSize(image, box, taken, table);
    if (accepted(second) && out.every(k => overlap(second.box, k.box) < 0.4)) out.push(second);
  }
  return out
    .map(present)
    .sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
}
