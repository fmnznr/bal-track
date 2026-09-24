import type { DeckProfile, JokerDef, Suit } from '../types';
import { TUNING } from './tuning';

const SUIT_TAGS: Record<string, Suit> = {
  'suit-hearts': 'hearts',
  'suit-diamonds': 'diamonds',
  'suit-spades': 'spades',
  'suit-clubs': 'clubs',
};

export function suitShare(profile: DeckProfile, suit: Suit): number {
  return profile.deckSize > 0 ? Math.min(1, profile.suits[suit] / profile.deckSize) : 0;
}

export function faceShare(profile: DeckProfile): number {
  return profile.deckSize > 0 ? Math.min(1, profile.faceCards / profile.deckSize) : 0;
}

export function maxSuitShare(profile: DeckProfile): { suit: Suit; share: number } {
  let best: Suit = 'hearts';
  for (const suit of Object.keys(profile.suits) as Suit[]) {
    if (profile.suits[suit] > profile.suits[best]) best = suit;
  }
  return { suit: best, share: suitShare(profile, best) };
}

/**
 * How the deck's composition multiplies a joker's worth. A joker naming a suit
 * the deck no longer holds is not capped at some arbitrary rating — it is worth
 * a fraction of what it claims, which is what `none` says.
 */
export interface DeckSignal {
  multiplier: number;
  reasons: string[];
}

const { enhanced: ENHANCED, suit: SUIT, face: FACE } = TUNING.deck;

/** Scales a joker with the matching enhanced cards the deck actually holds. */
function scaleWithEnhanced(count: number, label: string): DeckSignal {
  if (count === 0) return { multiplier: ENHANCED.noneYet, reasons: [`No ${label} cards in your deck yet`] };
  return {
    multiplier: Math.min(ENHANCED.cap, ENHANCED.perMatchingCard ** count),
    reasons: [`${count} ${label} card${count === 1 ? '' : 's'} in your deck`],
  };
}

const ENHANCED_HOOKS: Record<string, (p: DeckProfile) => DeckSignal> = {
  // Steel Joker and Driver's License used to be here too. They are now modelled
  // outright from the enhanced counts, so a signal on top of that would charge
  // the same fact twice.
  'glass-joker': p => scaleWithEnhanced(p.enhanced.glass, 'glass'),
};

const FACE_ENABLERS = new Set(['pareidolia']);

/** Deck-composition multiplier for a joker, with the reasons behind it. */
export function deckMultiplierForJoker(def: JokerDef, profile: DeckProfile): DeckSignal {
  let multiplier = 1;
  const reasons: string[] = [];

  const suitTags = def.tags.filter(t => t in SUIT_TAGS);
  if (suitTags.length > 0) {
    const suits = suitTags.map(t => SUIT_TAGS[t]);
    const count = suits.reduce((sum, s) => sum + profile.suits[s], 0);
    const share = profile.deckSize > 0 ? Math.min(1, count / profile.deckSize) : 0;
    const label = suits.join('/');
    const boostThreshold = suits.length > 1 ? SUIT.abundantAboveMulti : SUIT.abundantAboveSingle;
    if (count === 0) {
      multiplier *= SUIT.none;
      reasons.push(`No ${label} cards left in your deck`);
    } else if (profile.deckSize > 0 && share < SUIT.scarceBelow) {
      multiplier *= SUIT.scarce;
      reasons.push(`Few ${label} cards in your deck (${Math.round(share * 100)}%)`);
    } else if (profile.deckSize > 0 && share > boostThreshold) {
      multiplier *= SUIT.abundant;
      reasons.push(`Your deck is loaded with ${label} (${Math.round(share * 100)}%)`);
    }
  }

  if (def.tags.includes('face-cards') && !FACE_ENABLERS.has(def.id)) {
    const share = faceShare(profile);
    if (profile.faceCards === 0) {
      multiplier *= FACE.none;
      reasons.push('No face cards in your deck');
    } else if (profile.deckSize > 0 && share < FACE.scarceBelow) {
      multiplier *= FACE.scarce;
      reasons.push(`Few face cards in your deck (${Math.round(share * 100)}%)`);
    } else if (profile.deckSize > 0 && share > FACE.abundantAbove) {
      multiplier *= FACE.abundant;
      reasons.push(`Face-heavy deck (${Math.round(share * 100)}%)`);
    }
  }

  const hook = ENHANCED_HOOKS[def.id];
  if (hook) {
    const result = hook(profile);
    multiplier *= result.multiplier;
    reasons.push(...result.reasons);
  }

  return { multiplier, reasons };
}
