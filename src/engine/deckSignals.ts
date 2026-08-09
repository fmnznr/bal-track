import type { DeckProfile, JokerDef, Suit } from '../types';

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

const ENHANCED_HOOKS: Record<string, (p: DeckProfile) => { delta: number; notes: string[] }> = {
  'steel-joker': p =>
    p.enhanced.steel > 0
      ? {
          delta: Math.min(3, p.enhanced.steel * 0.5),
          notes: [`${p.enhanced.steel} steel card${p.enhanced.steel === 1 ? '' : 's'} in your deck`],
        }
      : { delta: -1, notes: ['No steel cards in your deck yet'] },
  'glass-joker': p =>
    p.enhanced.glass > 0
      ? {
          delta: Math.min(3, p.enhanced.glass * 0.5),
          notes: [`${p.enhanced.glass} glass card${p.enhanced.glass === 1 ? '' : 's'} in your deck`],
        }
      : { delta: -1, notes: ['No glass cards in your deck yet'] },
  'drivers-license': p => {
    const total = Object.values(p.enhanced).reduce((a, b) => a + b, 0);
    return total >= 16
      ? { delta: 3, notes: [`${total} enhanced cards — Driver's License is live`] }
      : { delta: -2, notes: [`Only ${total}/16 enhanced cards in your deck`] };
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
    const boostThreshold = suits.length > 1 ? 0.7 : 0.4;
    if (count === 0) {
      capAt = 1;
      notes.push(`No ${label} cards left in your deck`);
    } else if (profile.deckSize > 0 && share < 0.15) {
      delta -= 2;
      notes.push(`Few ${label} cards in your deck (${Math.round(share * 100)}%)`);
    } else if (profile.deckSize > 0 && share > boostThreshold) {
      delta += 1.5;
      notes.push(`Your deck is loaded with ${label} (${Math.round(share * 100)}%)`);
    }
  }

  if (def.tags.includes('face-cards') && !FACE_ENABLERS.has(def.id)) {
    const share = faceShare(profile);
    if (profile.faceCards === 0) {
      capAt = Math.min(capAt ?? Infinity, 1);
      notes.push('No face cards in your deck');
    } else if (profile.deckSize > 0 && share < 0.15) {
      delta -= 1.5;
      notes.push(`Few face cards in your deck (${Math.round(share * 100)}%)`);
    } else if (profile.deckSize > 0 && share > 0.3) {
      delta += 1;
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
