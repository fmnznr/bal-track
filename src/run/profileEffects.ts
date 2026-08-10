import type { DeckProfile, EnhancementType, Suit } from '../types';

interface ProfileEffect {
  enhanced?: Partial<Record<EnhancementType, number>>;
  deckSize?: number;
  faceCards?: number;
}

/** Deck-profile bookings the app can do on its own when a consumable is used. */
const EFFECTS: Record<string, ProfileEffect> = {
  'the-chariot': { enhanced: { steel: 1 } },
  justice: { enhanced: { glass: 1 } },
  'the-devil': { enhanced: { gold: 1 } },
  'the-tower': { enhanced: { stone: 1 } },
  'the-lovers': { enhanced: { wild: 1 } },
  'the-magician': { enhanced: { lucky: 2 } },
  'the-empress': { enhanced: { mult: 2 } },
  'the-hierophant': { enhanced: { bonus: 2 } },
  familiar: { deckSize: 2, faceCards: 3 },
  grim: { deckSize: 1 },
  incantation: { deckSize: 3 },
  'the-hanged-man': { deckSize: -2 },
  immolate: { deckSize: -5 },
};

/** Conversion tarots need user input for the source suits — only the target is known. */
export const CONVERSION_TARGETS: Partial<Record<string, Suit>> = {
  'the-star': 'diamonds',
  'the-sun': 'hearts',
  'the-moon': 'clubs',
  'the-world': 'spades',
};

/** True when using this consumable books a profile change on its own. */
export function hasProfileEffect(consumableId: string): boolean {
  return consumableId in EFFECTS;
}

export function applyProfileEffects(profile: DeckProfile, consumableId: string): DeckProfile {
  const effect = EFFECTS[consumableId];
  if (!effect) return profile;
  const enhanced = { ...profile.enhanced };
  for (const [key, delta] of Object.entries(effect.enhanced ?? {})) {
    const k = key as EnhancementType;
    enhanced[k] = Math.max(0, enhanced[k] + (delta ?? 0));
  }
  return {
    ...profile,
    enhanced,
    deckSize: Math.max(0, profile.deckSize + (effect.deckSize ?? 0)),
    faceCards: Math.max(0, profile.faceCards + (effect.faceCards ?? 0)),
  };
}
