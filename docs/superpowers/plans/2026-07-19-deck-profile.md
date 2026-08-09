# Deck Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Semi-automatic aggregate deck profile (suit counts, face cards, deck size, enhanced counts) in the run state, feeding honest deck-aware adjustments into shop/pack/strategy advice.

**Architecture:** Same layering as everything else — types in `types.ts`, profile init + actions in `runStore.ts`, a pure effects table (`run/profileEffects.ts`), a pure signals module (`engine/deckSignals.ts`) hooked into `recommend.ts`/`strategy.ts`, and UI (profile section + SuitPrompt) on top.

**Spec:** `docs/superpowers/specs/2026-07-19-deck-profile-design.md` (approved; note the atomic-conversion clarification).

## Execution notes

- Branch `feature/deck-profile` off current `main` (toolchain is now vitest 4 / jsdom 30 / vite 7; baseline 96 tests).
- TDD per task; usual commit trailer.
- The engine hooks are calibrated so that a STANDARD 52-card profile (25% per suit, 23% face, 0 enhanced) produces ZERO adjustment for all jokers except the three enhanced-specialists (steel-joker, glass-joker, drivers-license get an honest malus on a fresh deck). No committed test fixture uses those three jokers, so all 96 baseline tests must stay green untouched.

## File structure

```
src/types.ts                    # Modify: SUITS, Suit, ENHANCEMENT_TYPES, EnhancementType, DeckProfile; RunState.deckProfile
src/run/profileEffects.ts       # Create: consumable→profile effects table + applyProfileEffects + CONVERSION_TARGETS
src/run/profileEffects.test.ts  # Create
src/run/runStore.ts             # Modify: initialDeckProfile, newRunState, migration, profile actions
src/run/runStore.test.ts        # Modify: append profile tests
src/engine/deckSignals.ts       # Create: suitShare/faceShare/deckSignalForJoker/maxSuitShare
src/engine/deckSignals.test.ts  # Create
src/engine/recommend.ts         # Modify: apply signals in joker evaluations
src/engine/recommend.test.ts    # Modify: append integration tests
src/engine/strategy.ts          # Modify: flush suit-share boost
src/engine/strategy.test.ts     # Modify: append one test
src/ui/components/DeckProfileSection.tsx  # Create
src/ui/components/SuitPrompt.tsx          # Create
src/ui/screens/RunOverview.tsx  # Modify: mount section; SuitPrompt on conversion use
src/ui/screens/PackScreen.tsx   # Modify: APPLY_CONSUMABLE on tarot/spectral picks; SuitPrompt
src/ui/screens/RunOverview.test.tsx / PackScreen.test.tsx  # Modify: append UI tests
README.md                       # Modify: one sentence
```

---

### Task 1: Types, initial profiles, migration, manual counters

**Files:** Modify `src/types.ts`, `src/run/runStore.ts`; Test `src/run/runStore.test.ts`

- [ ] **Step 1: Append failing tests** to `src/run/runStore.test.ts`:

```ts
describe('deck profile', () => {
  it('initializes the profile per deck', () => {
    expect(newRunState('Red', 'White').deckProfile).toEqual({
      suits: { hearts: 13, diamonds: 13, spades: 13, clubs: 13 },
      faceCards: 12,
      deckSize: 52,
      enhanced: { bonus: 0, mult: 0, wild: 0, glass: 0, steel: 0, stone: 0, gold: 0, lucky: 0 },
    });
    expect(newRunState('Checkered', 'White').deckProfile.suits).toEqual({ hearts: 26, diamonds: 0, spades: 26, clubs: 0 });
    const abandoned = newRunState('Abandoned', 'White').deckProfile;
    expect(abandoned.faceCards).toBe(0);
    expect(abandoned.deckSize).toBe(40);
  });

  it('edits profile counters with a floor of zero', () => {
    let s = started();
    s = reduce(s, { type: 'SET_PROFILE_SUIT', suit: 'diamonds', value: 4 });
    s = reduce(s, { type: 'SET_PROFILE_FACE', value: -3 });
    s = reduce(s, { type: 'SET_PROFILE_SIZE', value: 48 });
    s = reduce(s, { type: 'SET_PROFILE_ENHANCED', enhancement: 'steel', value: 2 });
    expect(s.current?.deckProfile.suits.diamonds).toBe(4);
    expect(s.current?.deckProfile.faceCards).toBe(0);
    expect(s.current?.deckProfile.deckSize).toBe(48);
    expect(s.current?.deckProfile.enhanced.steel).toBe(2);
  });

  it('backfills the profile on old saves including undo snapshots', () => {
    const legacyRun = { ...newRunState('Checkered', 'White') } as Record<string, unknown>;
    delete legacyRun.deckProfile;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: legacyRun, past: [legacyRun], finished: [] }));
    const loaded = load();
    expect(loaded?.current?.deckProfile.suits.spades).toBe(26);
    expect(loaded?.past[0]?.deckProfile.deckSize).toBe(52);
  });
});
```

Run `npm test -- src/run/runStore.test.ts` → new tests FAIL (type errors count), 20 existing PASS.

- [ ] **Step 2: Append to `src/types.ts`:**

```ts
export const SUITS = ['hearts', 'diamonds', 'spades', 'clubs'] as const;
export type Suit = (typeof SUITS)[number];

export const ENHANCEMENT_TYPES = ['bonus', 'mult', 'wild', 'glass', 'steel', 'stone', 'gold', 'lucky'] as const;
export type EnhancementType = (typeof ENHANCEMENT_TYPES)[number];

export interface DeckProfile {
  suits: Record<Suit, number>;
  faceCards: number;
  deckSize: number;
  enhanced: Record<EnhancementType, number>;
}
```

Add `deckProfile: DeckProfile;` to `RunState` (after `handLevels`).

- [ ] **Step 3: Extend `src/run/runStore.ts`:**

1. Import `ENHANCEMENT_TYPES` and types `DeckProfile`, `EnhancementType`, `Suit` from `../types`.
2. Add:

```ts
export function initialDeckProfile(deck: string): DeckProfile {
  const enhanced = Object.fromEntries(ENHANCEMENT_TYPES.map(t => [t, 0])) as Record<EnhancementType, number>;
  if (deck === 'Checkered') {
    return { suits: { hearts: 26, diamonds: 0, spades: 26, clubs: 0 }, faceCards: 12, deckSize: 52, enhanced };
  }
  if (deck === 'Abandoned') {
    return { suits: { hearts: 10, diamonds: 10, spades: 10, clubs: 10 }, faceCards: 0, deckSize: 40, enhanced };
  }
  return { suits: { hearts: 13, diamonds: 13, spades: 13, clubs: 13 }, faceCards: 12, deckSize: 52, enhanced };
}
```

3. `newRunState` returns `deckProfile: initialDeckProfile(deck)` (after `handLevels`).
4. `RunAction` union gains:

```ts
  | { type: 'SET_PROFILE_SUIT'; suit: Suit; value: number }
  | { type: 'SET_PROFILE_FACE'; value: number }
  | { type: 'SET_PROFILE_SIZE'; value: number }
  | { type: 'SET_PROFILE_ENHANCED'; enhancement: EnhancementType; value: number }
```

5. Cases (WITH undo snapshot — these are run mutations, use `push` like SET_MONEY):

```ts
    case 'SET_PROFILE_SUIT':
      return push({
        ...run,
        deckProfile: { ...run.deckProfile, suits: { ...run.deckProfile.suits, [action.suit]: Math.max(0, action.value) } },
      });
    case 'SET_PROFILE_FACE':
      return push({ ...run, deckProfile: { ...run.deckProfile, faceCards: Math.max(0, action.value) } });
    case 'SET_PROFILE_SIZE':
      return push({ ...run, deckProfile: { ...run.deckProfile, deckSize: Math.max(0, action.value) } });
    case 'SET_PROFILE_ENHANCED':
      return push({
        ...run,
        deckProfile: {
          ...run.deckProfile,
          enhanced: { ...run.deckProfile.enhanced, [action.enhancement]: Math.max(0, action.value) },
        },
      });
```

6. Migration in `load()` — add above the return:

```ts
    const withProfile = (r: RunState): RunState =>
      r.deckProfile ? r : { ...r, deckProfile: initialDeckProfile(r.deck) };
```

and normalize: `current: parsed.current ? withProfile(parsed.current) : null,` and `past: (parsed.past ?? []).map(withProfile),`.

- [ ] **Step 4: Verify.** Store tests PASS (23 in file); full `npm test` → 99; `npm run build` clean.

- [ ] **Step 5: Commit** `feat: aggregate deck profile with per-deck init and save migration`

---

### Task 2: Consumable profile effects + conversions

**Files:** Create `src/run/profileEffects.ts`; Modify `src/run/runStore.ts`; Tests `src/run/profileEffects.test.ts` + append to `src/run/runStore.test.ts`

- [ ] **Step 1: Write failing tests.**

`src/run/profileEffects.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initialDeckProfile } from './runStore';
import { CONVERSION_TARGETS, applyProfileEffects } from './profileEffects';

describe('applyProfileEffects', () => {
  it('books enhancement tarots', () => {
    const p = applyProfileEffects(initialDeckProfile('Red'), 'the-chariot');
    expect(p.enhanced.steel).toBe(1);
    expect(applyProfileEffects(p, 'the-magician').enhanced.lucky).toBe(2);
  });

  it('books size and face effects with a floor of zero', () => {
    let p = applyProfileEffects(initialDeckProfile('Red'), 'familiar');
    expect(p.deckSize).toBe(54);
    expect(p.faceCards).toBe(15);
    p = applyProfileEffects({ ...p, deckSize: 3 }, 'immolate');
    expect(p.deckSize).toBe(0);
  });

  it('leaves the profile alone for unknown or conversion ids', () => {
    const base = initialDeckProfile('Red');
    expect(applyProfileEffects(base, 'the-hermit')).toEqual(base);
    expect(applyProfileEffects(base, 'the-sun')).toEqual(base);
  });

  it('maps the four conversion tarots to their target suits', () => {
    expect(CONVERSION_TARGETS['the-sun']).toBe('hearts');
    expect(CONVERSION_TARGETS['the-star']).toBe('diamonds');
    expect(CONVERSION_TARGETS['the-moon']).toBe('clubs');
    expect(CONVERSION_TARGETS['the-world']).toBe('spades');
  });
});
```

Append to `src/run/runStore.test.ts` (drafts/profile describe area):

```ts
describe('profile automation', () => {
  it('books effects when a consumable is used from inventory', () => {
    let s = started();
    s = reduce(s, { type: 'ADD_CONSUMABLE', consumableId: 'the-chariot' });
    s = reduce(s, { type: 'USE_CONSUMABLE', index: 0 });
    expect(s.current?.deckProfile.enhanced.steel).toBe(1);
  });

  it('books effects for pack-taken consumables via APPLY_CONSUMABLE', () => {
    const s = reduce(started(), { type: 'APPLY_CONSUMABLE', consumableId: 'justice' });
    expect(s.current?.deckProfile.enhanced.glass).toBe(1);
  });

  it('converts suits atomically', () => {
    const s = reduce(started(), { type: 'CONVERT_SUITS', to: 'hearts', from: { diamonds: 2, clubs: 1 } });
    expect(s.current?.deckProfile.suits).toEqual({ hearts: 16, diamonds: 11, spades: 13, clubs: 12 });
  });
});
```

Run → FAIL.

- [ ] **Step 2: Create `src/run/profileEffects.ts`:**

```ts
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
```

- [ ] **Step 3: Wire into `src/run/runStore.ts`:**

1. `import { applyProfileEffects } from './profileEffects';`
2. `RunAction` gains:

```ts
  | { type: 'APPLY_CONSUMABLE'; consumableId: string }
  | { type: 'CONVERT_SUITS'; to: Suit; from: Partial<Record<Suit, number>> }
```

3. `USE_CONSUMABLE` case: where the new state is built, also run the profile through the effects — change the return to include `deckProfile: applyProfileEffects(run.deckProfile, id)` (planet ids are not in the table, so planets stay no-ops there).
4. New cases (with `push`):

```ts
    case 'APPLY_CONSUMABLE':
      return push({ ...run, deckProfile: applyProfileEffects(run.deckProfile, action.consumableId) });
    case 'CONVERT_SUITS': {
      const suits = { ...run.deckProfile.suits };
      let moved = 0;
      for (const [suit, count] of Object.entries(action.from)) {
        const take = Math.min(suits[suit as Suit], count ?? 0);
        suits[suit as Suit] -= take;
        moved += take;
      }
      suits[action.to] += moved;
      return push({ ...run, deckProfile: { ...run.deckProfile, suits } });
    }
```

- [ ] **Step 4: Verify.** `npm test` → 106 (4 + 3 new); build clean.

- [ ] **Step 5: Commit** `feat: semi-automatic deck-profile bookings for consumables`

---

### Task 3: Deck signals in the engine

**Files:** Create `src/engine/deckSignals.ts` + `src/engine/deckSignals.test.ts`; Modify `src/engine/recommend.ts`, `src/engine/strategy.ts`; append tests to both test files

- [ ] **Step 1: Write failing tests.**

`src/engine/deckSignals.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initialDeckProfile } from '../run/runStore';
import { getJoker } from '../catalog/catalog';
import { deckSignalForJoker, maxSuitShare } from './deckSignals';

const greedy = getJoker('greedy-joker')!;
const photograph = getJoker('photograph')!;
const steelJoker = getJoker('steel-joker')!;
const driversLicense = getJoker('drivers-license')!;
const blueprint = getJoker('blueprint')!;

describe('deckSignalForJoker', () => {
  it('is neutral for untagged jokers and standard decks', () => {
    const std = initialDeckProfile('Red');
    expect(deckSignalForJoker(blueprint, std)).toEqual({ delta: 0, capAt: undefined, notes: [] });
    expect(deckSignalForJoker(greedy, std).delta).toBe(0);
  });

  it('caps suit jokers when their suit is gone', () => {
    const checkered = initialDeckProfile('Checkered');
    const sig = deckSignalForJoker(greedy, checkered);
    expect(sig.capAt).toBe(1);
    expect(sig.notes.join(' ')).toMatch(/No diamonds cards left/);
  });

  it('rewards suit-heavy decks and penalizes thin suits', () => {
    const p = initialDeckProfile('Red');
    const heavy = { ...p, suits: { ...p.suits, diamonds: 26, clubs: 0 } };
    expect(deckSignalForJoker(greedy, heavy).delta).toBe(1.5);
    const thin = { ...p, suits: { ...p.suits, diamonds: 4 } };
    expect(deckSignalForJoker(greedy, thin).delta).toBe(-2);
  });

  it('handles face-card density including zero-face decks', () => {
    expect(deckSignalForJoker(photograph, initialDeckProfile('Abandoned')).capAt).toBe(1);
    const p = initialDeckProfile('Red');
    expect(deckSignalForJoker(photograph, { ...p, faceCards: 18 }).delta).toBe(1);
  });

  it('scores enhanced specialists from real counts', () => {
    const p = initialDeckProfile('Red');
    expect(deckSignalForJoker(steelJoker, p).delta).toBe(-1);
    expect(deckSignalForJoker(steelJoker, { ...p, enhanced: { ...p.enhanced, steel: 4 } }).delta).toBe(2);
    const sig = deckSignalForJoker(driversLicense, p);
    expect(sig.delta).toBe(-2);
    expect(sig.notes.join(' ')).toMatch(/0\/16 enhanced/);
  });
});

describe('maxSuitShare', () => {
  it('finds the dominant suit', () => {
    const { suit, share } = maxSuitShare(initialDeckProfile('Checkered'));
    expect(['hearts', 'spades']).toContain(suit);
    expect(share).toBeCloseTo(0.5);
  });
});
```

Append to `src/engine/recommend.test.ts`:

```ts
describe('recommend — deck-profile awareness', () => {
  it('floors a suit joker whose suit is gone and says why', () => {
    const checkeredRun = { ...run({ money: 20 }), deck: 'Checkered', deckProfile: initialDeckProfile('Checkered') };
    const recs = recommend(checkeredRun, shop({ cards: [{ kind: 'joker', jokerId: 'greedy-joker', edition: 'base', price: 5 }] }));
    const buy = recs.find(r => r.kind === 'buy-joker');
    expect(buy?.score).toBeLessThanOrEqual(1);
    expect(buy?.reasons.join(' ')).toMatch(/No diamonds cards left/);
  });
});
```

(`initialDeckProfile` needs importing in that test file; `run()` uses `newRunState` so profiles already exist for its deck — the override keeps deck and profile consistent.)

Append to `src/engine/strategy.test.ts`:

```ts
  it('boosts flush when one suit dominates the live profile', () => {
    const base = runWith('Red', ['droll-joker']);
    const heavy = {
      ...base,
      deckProfile: { ...base.deckProfile, suits: { hearts: 22, diamonds: 4, spades: 13, clubs: 13 } },
    };
    const advice = adviseStrategy(heavy);
    const flush = advice.candidates.find(c => c.archetypeId === 'flush');
    expect(flush?.score).toBeGreaterThan(adviseStrategy(base).candidates.find(c => c.archetypeId === 'flush')!.score);
    expect(flush?.reasons.join(' ')).toMatch(/% of your deck is hearts/);
  });
```

Run → new tests FAIL.

- [ ] **Step 2: Create `src/engine/deckSignals.ts`:**

```ts
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
      ? { delta: Math.min(3, p.enhanced.steel * 0.5), notes: [`${p.enhanced.steel} steel cards in your deck`] }
      : { delta: -1, notes: ['No steel cards in your deck yet'] },
  'glass-joker': p =>
    p.enhanced.glass > 0
      ? { delta: Math.min(3, p.enhanced.glass * 0.5), notes: [`${p.enhanced.glass} glass cards in your deck`] }
      : { delta: -1, notes: ['No glass cards in your deck yet'] },
  'drivers-license': p => {
    const total = Object.values(p.enhanced).reduce((a, b) => a + b, 0);
    return total >= 16
      ? { delta: 3, notes: [`${total} enhanced cards — Driver's License is live`] }
      : { delta: -2, notes: [`Only ${total}/16 enhanced cards in your deck`] };
  },
};

/** Deck-composition adjustment for a joker: score delta, optional hard cap, reasons. */
export function deckSignalForJoker(def: JokerDef, profile: DeckProfile): DeckSignal {
  let delta = 0;
  let capAt: number | undefined;
  const notes: string[] = [];

  const suitTag = def.tags.find(t => t in SUIT_TAGS);
  if (suitTag) {
    const suit = SUIT_TAGS[suitTag];
    const share = suitShare(profile, suit);
    if (share === 0) {
      capAt = 1;
      notes.push(`No ${suit} cards left in your deck`);
    } else if (share < 0.15) {
      delta -= 2;
      notes.push(`Few ${suit} cards in your deck (${Math.round(share * 100)}%)`);
    } else if (share > 0.4) {
      delta += 1.5;
      notes.push(`Your deck is loaded with ${suit} (${Math.round(share * 100)}%)`);
    }
  }

  if (def.tags.includes('face-cards')) {
    const share = faceShare(profile);
    if (share === 0) {
      capAt = Math.min(capAt ?? Infinity, 1);
      notes.push('No face cards in your deck');
    } else if (share < 0.15) {
      delta -= 1.5;
      notes.push(`Few face cards in your deck (${Math.round(share * 100)}%)`);
    } else if (share > 0.3) {
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
```

- [ ] **Step 3: Hook into `src/engine/recommend.ts`:**

1. `import { deckSignalForJoker } from './deckSignals';`
2. In `evalShopCard`'s joker branch, directly after the plan-bonus addition to `rawScore`/`baseReasons`:

```ts
  const deckSig = deckSignalForJoker(def, run.deckProfile);
  rawScore += deckSig.delta;
  if (deckSig.capAt !== undefined) rawScore = Math.min(rawScore, deckSig.capAt);
  baseReasons.push(...deckSig.notes);
```

3. Same pattern in `recommendPackPick`'s joker branch (on its `score`/`reasons`).
4. In `ownedJokerValue`, after the synergy/edition sum:

```ts
  const deckSig = deckSignalForJoker(def, run.deckProfile);
  let value = def.rating[phase] + Math.min(3, synergy * 1.2) + EDITION_SCORE_BONUS[owned.edition] + deckSig.delta;
  if (deckSig.capAt !== undefined) value = Math.min(value, deckSig.capAt);
  return value;
```

(Adapt to the function's current shape; it returns a number, no reasons.)

- [ ] **Step 4: Hook into `src/engine/strategy.ts`:** import `maxSuitShare`; in the archetype loop after the deck-boost block:

```ts
    if (arch.id === 'flush') {
      const { suit, share } = maxSuitShare(run.deckProfile);
      if (share >= 0.4) {
        score += 1.5;
        reasons.push(`${Math.round(share * 100)}% of your deck is ${suit}`);
      }
    }
```

- [ ] **Step 5: Verify.** New tests PASS; ALL baseline tests must stay green (the calibration note in Execution notes explains why they do — if a baseline test fails, check which fixture hit a non-neutral band before touching anything). `npm test` → 114. Build clean.

Hand-checks: Checkered strategy fixtures gain +1.5 flush (empty Checkered 3→4.5 still `lean`; Checkered+droll 6.5→8 still `commit` — assertions unchanged). The greedy-on-Checkered shop rec: capped at 1 with the no-diamonds reason.

- [ ] **Step 6: Commit** `feat: deck-aware scoring signals for suits, faces and enhancements`

---

### Task 4: UI — profile section and suit prompt

**Files:** Create `src/ui/components/DeckProfileSection.tsx`, `src/ui/components/SuitPrompt.tsx`; Modify `src/ui/screens/RunOverview.tsx`, `src/ui/screens/PackScreen.tsx`, `src/styles.css`; Tests: append to `src/ui/screens/RunOverview.test.tsx` and `src/ui/screens/PackScreen.test.tsx`

- [ ] **Step 1: Append failing UI tests — and adjust ONE existing assertion.**

The profile section adds four suit NumberFields at value 13, so the existing
sell test's `expect(screen.getByDisplayValue('13'))…` (money 10+3) would
match multiple inputs. Change that one assertion to the label-based form
(NumberField has proper label association since the a11y fix):

```tsx
expect(screen.getByLabelText('Money $')).toHaveDisplayValue('13');
```

This is the ONLY permitted existing-test change; document it in the commit
message. Then append the new tests.

To `RunOverview.test.tsx`:

```tsx
it('edits the deck profile counters', async () => {
  render(<App />);
  await userEvent.click(screen.getByText('Deck profile'));
  expect(screen.getByLabelText('Hearts')).toHaveDisplayValue('13');
  await userEvent.click(screen.getByRole('button', { name: 'increase Steel' }));
  expect(screen.getByLabelText('Steel')).toHaveDisplayValue('1');
});
```

To `PackScreen.test.tsx`:

```tsx
it('books a suit conversion through the prompt', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Pack' }));
  await userEvent.click(screen.getByRole('button', { name: 'arcana' }));
  await userEvent.type(screen.getByPlaceholderText('Add pack option…'), 'sun');
  await userEvent.click(await screen.findByRole('button', { name: /The Sun/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Took The Sun' }));
  await userEvent.click(screen.getByRole('button', { name: 'from diamonds' }));
  await userEvent.click(screen.getByRole('button', { name: 'from diamonds' }));
  await userEvent.click(screen.getByRole('button', { name: 'from clubs' }));
  await userEvent.click(screen.getByRole('button', { name: 'Book conversion' }));
  await userEvent.click(screen.getByRole('button', { name: 'Run' }));
  await userEvent.click(screen.getByText('Deck profile'));
  expect(screen.getByLabelText('Hearts')).toHaveDisplayValue('16');
  expect(screen.getByLabelText('Diamonds')).toHaveDisplayValue('11');
});
```

Run → FAIL.

- [ ] **Step 2: Create `src/ui/components/DeckProfileSection.tsx`:**

```tsx
import { useRun } from '../../run/RunContext';
import { ENHANCEMENT_TYPES, SUITS } from '../../types';
import NumberField from './NumberField';

const LABEL: Record<string, string> = {
  hearts: 'Hearts', diamonds: 'Diamonds', spades: 'Spades', clubs: 'Clubs',
  bonus: 'Bonus', mult: 'Mult', wild: 'Wild', glass: 'Glass',
  steel: 'Steel', stone: 'Stone', gold: 'Gold', lucky: 'Lucky',
};

export default function DeckProfileSection() {
  const { store, dispatch } = useRun();
  const run = store.current!;
  const profile = run.deckProfile;
  return (
    <details>
      <summary>Deck profile</summary>
      {run.deck === 'Erratic' && (
        <p className="muted">Erratic deck — check these numbers against your actual starting deck.</p>
      )}
      <div className="row">
        {SUITS.map(suit => (
          <NumberField
            key={suit}
            label={LABEL[suit]}
            value={profile.suits[suit]}
            onChange={value => dispatch({ type: 'SET_PROFILE_SUIT', suit, value })}
          />
        ))}
      </div>
      <div className="row">
        <NumberField label="Face cards" value={profile.faceCards} onChange={value => dispatch({ type: 'SET_PROFILE_FACE', value })} />
        <NumberField label="Deck size" value={profile.deckSize} onChange={value => dispatch({ type: 'SET_PROFILE_SIZE', value })} />
      </div>
      <div className="row">
        {ENHANCEMENT_TYPES.map(enhancement => (
          <NumberField
            key={enhancement}
            label={LABEL[enhancement]}
            value={profile.enhanced[enhancement]}
            onChange={value => dispatch({ type: 'SET_PROFILE_ENHANCED', enhancement, value })}
          />
        ))}
      </div>
    </details>
  );
}
```

- [ ] **Step 3: Create `src/ui/components/SuitPrompt.tsx`:**

```tsx
import { useState } from 'react';
import { useRun } from '../../run/RunContext';
import { SUITS } from '../../types';
import type { Suit } from '../../types';

interface Props {
  consumableName: string;
  target: Suit;
  onDone: () => void;
}

export default function SuitPrompt({ consumableName, target, onDone }: Props) {
  const { dispatch } = useRun();
  const [from, setFrom] = useState<Partial<Record<Suit, number>>>({});
  const total = Object.values(from).reduce((a, b) => a + (b ?? 0), 0);
  const sources = SUITS.filter(s => s !== target);
  return (
    <div className="suit-prompt">
      <p>
        {consumableName}: converting {total}/3 cards to {target}. Tap the source suits:
      </p>
      <div className="row">
        {sources.map(suit => (
          <button
            key={suit}
            type="button"
            disabled={total >= 3}
            onClick={() => setFrom(f => ({ ...f, [suit]: (f[suit] ?? 0) + 1 }))}
          >
            from {suit} {from[suit] ? `(${from[suit]})` : ''}
          </button>
        ))}
      </div>
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={total === 0}
          onClick={() => {
            dispatch({ type: 'CONVERT_SUITS', to: target, from });
            onDone();
          }}
        >
          Book conversion
        </button>
        <button type="button" className="ghost" onClick={onDone}>
          Skip (adjust manually)
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the screens.**

`RunOverview.tsx`: import `DeckProfileSection` and render it directly after the `<details>` block for hand levels. Also: import `CONVERSION_TARGETS` from `../../run/profileEffects` and `SuitPrompt`; add `const [conversion, setConversion] = useState<{ name: string; target: Suit } | null>(null);` (import `useState` and `Suit`). In the consumables list's Use-button handler, before dispatching `USE_CONSUMABLE`, look up the def (already available) and if `CONVERSION_TARGETS[def.id]` set `setConversion({ name: def.name, target: CONVERSION_TARGETS[def.id]! })`. Render `{conversion && <SuitPrompt consumableName={conversion.name} target={conversion.target} onDone={() => setConversion(null)} />}` below the consumables list.

`PackScreen.tsx`: same pattern — in `take()`'s consumable branch, after dispatching `APPLY_CONSUMABLE` (NEW: tarot/spectral picks now dispatch `{ type: 'APPLY_CONSUMABLE', consumableId: id }` where previously nothing was dispatched; keep the existing note texts), check `CONVERSION_TARGETS[id]` and set local `conversion` state; render the prompt below the note. The Soul/planet branches stay as they are.

`src/styles.css` — append:

```css
.suit-prompt {
  background: var(--panel-2);
  border-radius: var(--radius);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

- [ ] **Step 5: Verify.** New UI tests PASS; full `npm test` → 116; build clean.

- [ ] **Step 6: Commit** `feat: deck profile section and suit-conversion prompt`

---

### Task 5: README + final verification

- [ ] **Step 1:** Append to the README feature paragraph:

```
A semi-automatic deck profile (suit, face-card and enhancement counts)
keeps the advice honest about what your deck actually contains.
```

- [ ] **Step 2:** `npm test` → 116; `npm run build` → clean. Controller does the browser pass.

- [ ] **Step 3: Commit** `docs: mention deck profile in README`

---

## Plan complete

5 tasks → merge to main per finishing skill (push auto-deploys).
