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

export interface DeckSignal {
  delta: number;
  capAt: number | undefined;
  notes: string[];
}

const { enhanced: ENHANCED } = TUNING.deck;

/** Scales a joker with the matching enhanced cards the deck actually holds. */
function scaleWithEnhanced(count: number, label: string): { delta: number; notes: string[] } {
  if (count === 0) return { delta: ENHANCED.noneYetPenalty, notes: [`No ${label} cards in your deck yet`] };
  return {
    delta: Math.min(ENHANCED.perMatchingCardCap, count * ENHANCED.perMatchingCard),
    notes: [`${count} ${label} card${count === 1 ? '' : 's'} in your deck`],
  };
}

const ENHANCED_HOOKS: Record<string, (p: DeckProfile) => { delta: number; notes: string[] }> = {
  'steel-joker': p => scaleWithEnhanced(p.enhanced.steel, 'steel'),
  'glass-joker': p => scaleWithEnhanced(p.enhanced.glass, 'glass'),
  'drivers-license': p => {
    const total = Object.values(p.enhanced).reduce((a, b) => a + b, 0);
    return total >= ENHANCED.driversLicenseRequirement
      ? { delta: ENHANCED.driversLicenseLive, notes: [`${total} enhanced cards — Driver's License is live`] }
      : {
          delta: ENHANCED.driversLicenseDead,
          notes: [`Only ${total}/${ENHANCED.driversLicenseRequirement} enhanced cards in your deck`],
        };
  },
};

const FACE_ENABLERS = new Set(['pareidolia']);

/** Deck-composition adjustment for a joker: score delta, optional hard cap, reasons. */
export function deckSignalForJoker(def: JokerDef, profile: DeckProfile): DeckSignal {
  let delta = 0;
  let capAt: number | undefined;
  const notes: string[] = [];

  const suitTags = def.tags.filter(t => t in SUIT_TAGS);
  if (suitTags.length > 0) {
    const suits = suitTags.map(t => SUIT_TAGS[t]);
    const count = suits.reduce((sum, s) => sum + profile.suits[s], 0);
    const share = profile.deckSize > 0 ? Math.min(1, count / profile.deckSize) : 0;
    const label = suits.join('/');
    const { suit: SUIT } = TUNING.deck;
    const boostThreshold = suits.length > 1 ? SUIT.abundantAboveMulti : SUIT.abundantAboveSingle;
    if (count === 0) {
      capAt = SUIT.noneCap;
      notes.push(`No ${label} cards left in your deck`);
    } else if (profile.deckSize > 0 && share < SUIT.scarceBelow) {
      delta += SUIT.scarcePenalty;
      notes.push(`Few ${label} cards in your deck (${Math.round(share * 100)}%)`);
    } else if (profile.deckSize > 0 && share > boostThreshold) {
      delta += SUIT.abundantBonus;
      notes.push(`Your deck is loaded with ${label} (${Math.round(share * 100)}%)`);
    }
  }

  if (def.tags.includes('face-cards') && !FACE_ENABLERS.has(def.id)) {
    const { face: FACE } = TUNING.deck;
    const share = faceShare(profile);
    if (profile.faceCards === 0) {
      capAt = Math.min(capAt ?? Infinity, FACE.noneCap);
      notes.push('No face cards in your deck');
    } else if (profile.deckSize > 0 && share < FACE.scarceBelow) {
      delta += FACE.scarcePenalty;
      notes.push(`Few face cards in your deck (${Math.round(share * 100)}%)`);
    } else if (profile.deckSize > 0 && share > FACE.abundantAbove) {
      delta += FACE.abundantBonus;
      notes.push(`Face-heavy deck (${Math.round(share * 100)}%)`);
    }
  }

  const hook = ENHANCED_HOOKS[def.id];
  if (hook) {
    const result = hook(profile);
    delta += result.delta;
    notes.push(...result.notes);
  }

  return { delta, capAt, notes };
}
