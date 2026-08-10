# Hand Play Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Track how often each poker hand was played plus hands/discards per round, and feed both into the advice — closing the "flush build is ignored" gap.

**Architecture:** Unchanged layering — state in `runStore.ts`, a pure `engine/playSignals.ts` alongside `deckSignals.ts`, hooks in `strategy.ts`/`recommend.ts`, UI in the existing hand-levels section.

**Spec:** `docs/superpowers/specs/2026-08-10-hand-play-tracking-design.md` (approved).

## Execution notes

- Branch `feature/hand-play-tracking` off current `main`. Baseline **151 tests**.
- TDD per task; commit trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Calibration invariant:** with defaults (4 hands, 3 discards, all play counters 0) every new signal contributes exactly 0. All 151 baseline tests must stay green untouched. If one breaks, a signal is not neutral at defaults — fix the signal, never the test.

---

### Task 1: State, deck defaults, migration, voucher automation

**Files:** Modify `src/types.ts`, `src/run/runStore.ts`, `src/run/runStore.test.ts`

- [ ] **Step 1: Append the failing tests** to `src/run/runStore.test.ts`:

```ts
describe('hand play tracking', () => {
  it('starts with zeroed play counters and deck-specific resources', () => {
    const red = newRunState('Red', 'White');
    expect(red.handPlays['Flush']).toBe(0);
    expect(red.handsPerRound).toBe(4);
    expect(red.discardsPerRound).toBe(4);
    expect(newRunState('Blue', 'White').handsPerRound).toBe(5);
    expect(newRunState('Black', 'White').handsPerRound).toBe(3);
    expect(newRunState('Magic', 'White').discardsPerRound).toBe(3);
  });

  it('edits counters with a floor of zero', () => {
    let s = started();
    s = reduce(s, { type: 'SET_HAND_PLAYS', hand: 'Flush', value: 7 });
    s = reduce(s, { type: 'SET_HANDS_PER_ROUND', value: -2 });
    s = reduce(s, { type: 'SET_DISCARDS_PER_ROUND', value: 5 });
    expect(s.current?.handPlays['Flush']).toBe(7);
    expect(s.current?.handsPerRound).toBe(0);
    expect(s.current?.discardsPerRound).toBe(5);
  });

  it('books resource vouchers automatically', () => {
    let s = started();
    s = reduce(s, { type: 'REDEEM_VOUCHER', voucherId: 'grabber' });
    s = reduce(s, { type: 'REDEEM_VOUCHER', voucherId: 'nacho-tong' });
    s = reduce(s, { type: 'REDEEM_VOUCHER', voucherId: 'wasteful' });
    expect(s.current?.handsPerRound).toBe(6);
    expect(s.current?.discardsPerRound).toBe(4);
  });

  it('backfills the new fields on old saves including snapshots', () => {
    const legacy = { ...newRunState('Blue', 'White') } as Record<string, unknown>;
    delete legacy.handPlays;
    delete legacy.handsPerRound;
    delete legacy.discardsPerRound;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: legacy, past: [legacy], finished: [] }));
    const loaded = load();
    expect(loaded?.current?.handPlays['Pair']).toBe(0);
    expect(loaded?.current?.handsPerRound).toBe(5);
    expect(loaded?.past[0]?.discardsPerRound).toBe(3);
  });
});
```

Run `npm test -- src/run/runStore.test.ts` → new tests FAIL, existing PASS.

- [ ] **Step 2: Extend `src/types.ts`.** Add to `RunState`, after `handLevels`:

```ts
  handPlays: Record<HandType, number>;
  handsPerRound: number;
  discardsPerRound: number;
```

- [ ] **Step 3: Extend `src/run/runStore.ts`.**

Add next to `DECK_JOKER_SLOTS`:

```ts
const DECK_HANDS: Record<string, number> = { Blue: 5, Black: 3 };
const DECK_DISCARDS: Record<string, number> = { Red: 4 };

/** Hands/discards a voucher permanently adds to every round. */
const RESOURCE_VOUCHERS: Record<string, { hands?: number; discards?: number }> = {
  grabber: { hands: 1 },
  'nacho-tong': { hands: 1 },
  wasteful: { discards: 1 },
  recyclomancy: { discards: 1 },
};
```

In `newRunState`, after `handLevels`:

```ts
    handPlays: Object.fromEntries(HAND_TYPES.map(h => [h, 0])) as Record<HandType, number>,
    handsPerRound: DECK_HANDS[deck] ?? 4,
    discardsPerRound: DECK_DISCARDS[deck] ?? 3,
```

Add to the `RunAction` union:

```ts
  | { type: 'SET_HAND_PLAYS'; hand: HandType; value: number }
  | { type: 'SET_HANDS_PER_ROUND'; value: number }
  | { type: 'SET_DISCARDS_PER_ROUND'; value: number }
```

Add the cases (with `push`, like the other manual edits):

```ts
    case 'SET_HAND_PLAYS':
      return push({
        ...run,
        handPlays: { ...run.handPlays, [action.hand]: Math.max(0, action.value) },
      });
    case 'SET_HANDS_PER_ROUND':
      return push({ ...run, handsPerRound: Math.max(0, action.value) });
    case 'SET_DISCARDS_PER_ROUND':
      return push({ ...run, discardsPerRound: Math.max(0, action.value) });
```

In the `REDEEM_VOUCHER` case, alongside the existing slot/ante handling, add:

```ts
      const resource = RESOURCE_VOUCHERS[action.voucherId];
```

and include in the pushed state:

```ts
        handsPerRound: run.handsPerRound + (resource?.hands ?? 0),
        discardsPerRound: run.discardsPerRound + (resource?.discards ?? 0),
```

Extend the `withProfile` migration helper in `load()` to also backfill these
fields (rename it to `withDefaults` and keep the deckProfile backfill):

```ts
    const withDefaults = (r: RunState): RunState => ({
      ...r,
      deckProfile: r.deckProfile ?? initialDeckProfile(r.deck),
      handPlays: r.handPlays ?? (Object.fromEntries(HAND_TYPES.map(h => [h, 0])) as Record<HandType, number>),
      handsPerRound: r.handsPerRound ?? DECK_HANDS[r.deck] ?? 4,
      discardsPerRound: r.discardsPerRound ?? DECK_DISCARDS[r.deck] ?? 3,
    });
```

(Update both call sites — `current` and `past.map(...)`.)

- [ ] **Step 4: Verify.** `npm test` → **155**; `npm run build` clean.

- [ ] **Step 5: Commit** `feat: track hands played and per-round resources`

---

### Task 2: Engine — play share, planet bonus, joker signals

**Files:** Create `src/engine/playSignals.ts` + `src/engine/playSignals.test.ts`; Modify `src/engine/strategy.ts`, `src/engine/strategy.test.ts`, `src/engine/recommend.ts`, `src/engine/recommend.test.ts`

- [ ] **Step 1: Write the failing tests.**

`src/engine/playSignals.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { getJoker } from '../catalog/catalog';
import { mostPlayedHand, playShare, playSignalForJoker, totalPlays } from './playSignals';
import type { HandType, RunState } from '../types';

function runWith(plays: Partial<Record<HandType, number>> = {}, resource: Partial<RunState> = {}): RunState {
  const base = newRunState('Magic', 'White');
  return { ...base, handPlays: { ...base.handPlays, ...plays }, ...resource };
}

describe('play statistics', () => {
  it('sums plays and finds the most played hand', () => {
    const run = runWith({ Flush: 8, Pair: 4 });
    expect(totalPlays(run)).toBe(12);
    expect(mostPlayedHand(run)).toBe('Flush');
    expect(playShare(run, ['Flush'])).toBeCloseTo(8 / 12);
    expect(mostPlayedHand(runWith())).toBeNull();
  });
});

describe('playSignalForJoker', () => {
  const supernova = getJoker('supernova')!;
  const obelisk = getJoker('obelisk')!;
  const greenJoker = getJoker('green-joker')!;
  const iceCream = getJoker('ice-cream')!;
  const banner = getJoker('banner')!;
  const blueprint = getJoker('blueprint')!;

  it('is neutral at default resources with nothing played', () => {
    const fresh = runWith();
    for (const def of [supernova, obelisk, greenJoker, iceCream, banner, blueprint]) {
      expect(playSignalForJoker(def, fresh), def.id).toEqual({ delta: 0, notes: [] });
    }
  });

  it('rewards Supernova for a well-played hand', () => {
    const signal = playSignalForJoker(supernova, runWith({ Flush: 10 }));
    expect(signal.delta).toBeCloseTo(1.5);
    expect(signal.notes.join(' ')).toMatch(/10 plays/);
  });

  it('warns that Obelisk wants variety in a focused build', () => {
    const signal = playSignalForJoker(obelisk, runWith({ Flush: 9, Pair: 1 }));
    expect(signal.delta).toBe(-2);
    expect(signal.notes.join(' ')).toMatch(/90%/);
  });

  it('scales Green Joker up and Ice Cream down with hands played', () => {
    const run = runWith({ Flush: 10 });
    expect(playSignalForJoker(greenJoker, run).delta).toBeCloseTo(0.8);
    expect(playSignalForJoker(iceCream, run).delta).toBeCloseTo(-0.8);
  });

  it('scales Banner with discards per round', () => {
    expect(playSignalForJoker(banner, runWith({}, { discardsPerRound: 5 })).delta).toBeCloseTo(1);
    expect(playSignalForJoker(banner, runWith({}, { discardsPerRound: 2 })).delta).toBeCloseTo(-0.5);
  });

  it('ignores untouched jokers', () => {
    expect(playSignalForJoker(blueprint, runWith({ Flush: 10 }))).toEqual({ delta: 0, notes: [] });
  });
});
```

Append to `src/engine/strategy.test.ts` (inside the `adviseStrategy` describe):

```ts
  it('recognises a flush build from the hands actually played', () => {
    const base = runWith('Red');
    const flushPlayer = { ...base, handPlays: { ...base.handPlays, Flush: 8, Pair: 4 } };
    const advice = adviseStrategy(flushPlayer);
    expect(advice.commitment).not.toBe('open');
    expect(advice.candidates[0].archetypeId).toBe('flush');
    expect(advice.candidates[0].reasons.join(' ')).toMatch(/8 of 12 hands/);
  });

  it('ignores a handful of plays as noise', () => {
    const base = runWith('Red');
    const barely = { ...base, handPlays: { ...base.handPlays, Flush: 2 } };
    expect(adviseStrategy(barely).commitment).toBe('open');
  });
```

Append to `src/engine/recommend.test.ts`:

```ts
describe('recommend — play statistics', () => {
  it('prefers the planet for the hand you actually play', () => {
    const base = run({ money: 20 });
    const flushPlayer = { ...base, handPlays: { ...base.handPlays, Flush: 9 } };
    const picks = recommendPackPick(flushPlayer, ['mercury', 'jupiter']);
    expect(picks[0].action).toBe('Take Jupiter');
    expect(picks[0].reasons.join(' ')).toMatch(/most played hand/);
  });
});
```

Run → new tests FAIL.

- [ ] **Step 2: Create `src/engine/playSignals.ts`:**

```ts
import { HAND_TYPES } from '../types';
import type { HandType, JokerDef, RunState } from '../types';

export function totalPlays(run: RunState): number {
  return HAND_TYPES.reduce((sum, hand) => sum + (run.handPlays[hand] ?? 0), 0);
}

export function mostPlayedHand(run: RunState): HandType | null {
  let best: HandType | null = null;
  for (const hand of HAND_TYPES) {
    const plays = run.handPlays[hand] ?? 0;
    if (plays > 0 && (best === null || plays > run.handPlays[best])) best = hand;
  }
  return best;
}

export function playShare(run: RunState, hands: readonly HandType[]): number {
  const total = totalPlays(run);
  if (total === 0) return 0;
  return hands.reduce((sum, hand) => sum + (run.handPlays[hand] ?? 0), 0) / total;
}

/** Below this many hands the statistic is noise, not a signal. */
export const MIN_PLAYS = 3;

export interface PlaySignal {
  delta: number;
  notes: string[];
}

const NEUTRAL: PlaySignal = { delta: 0, notes: [] };

/**
 * Score adjustment from what the player actually does — hands played and the
 * per-round resource. Returns a neutral signal at default values so a fresh
 * run scores exactly as before.
 */
export function playSignalForJoker(def: JokerDef, run: RunState): PlaySignal {
  const total = totalPlays(run);
  const extraDiscards = run.discardsPerRound - 3;

  switch (def.id) {
    case 'supernova': {
      const best = mostPlayedHand(run);
      if (!best || total < MIN_PLAYS) return NEUTRAL;
      const plays = run.handPlays[best];
      return {
        delta: Math.min(3, plays * 0.15),
        notes: [`Your most played hand (${best}) has ${plays} plays`],
      };
    }
    case 'obelisk': {
      if (total < MIN_PLAYS) return NEUTRAL;
      const best = mostPlayedHand(run);
      const share = best ? run.handPlays[best] / total : 0;
      if (share <= 0.6) return NEUTRAL;
      return {
        delta: -2,
        notes: [`Obelisk wants hand variety, but ${Math.round(share * 100)}% of your hands are ${best}`],
      };
    }
    case 'green-joker':
      if (total < MIN_PLAYS) return NEUTRAL;
      return { delta: Math.min(2, total * 0.08), notes: [`${total} hands played so far`] };
    case 'ice-cream':
      if (total < MIN_PLAYS) return NEUTRAL;
      return { delta: -Math.min(2, total * 0.08), notes: [`Ice Cream has already melted through ${total} hands`] };
    case 'banner':
    case 'delayed-gratification': {
      if (extraDiscards === 0) return NEUTRAL;
      return {
        delta: extraDiscards * 0.5,
        notes: [`${run.discardsPerRound} discards per round`],
      };
    }
    default:
      return NEUTRAL;
  }
}
```

- [ ] **Step 3: Hook into `src/engine/strategy.ts`.** Import `playShare, totalPlays, MIN_PLAYS` from `./playSignals`. In the archetype loop, after the flush suit-share block:

```ts
    if (arch.hands.length > 0 && totalPlays(run) >= MIN_PLAYS) {
      const share = playShare(run, arch.hands);
      const played = Math.round(share * totalPlays(run));
      if (share >= 0.5) {
        score += 3.5;
        reasons.push(`You played ${arch.name} in ${played} of ${totalPlays(run)} hands (${Math.round(share * 100)}%)`);
      } else if (share >= 0.3) {
        score += 1.5;
        reasons.push(`You played ${arch.name} in ${played} of ${totalPlays(run)} hands (${Math.round(share * 100)}%)`);
      }
    }
```

- [ ] **Step 4: Hook into `src/engine/recommend.ts`.** Import `mostPlayedHand` and `playSignalForJoker` from `./playSignals`.

In `planetBonus`, before the `return`:

```ts
  if (def.hand === mostPlayedHand(run)) {
    bonus += 1.5;
    notes.push(`${def.hand} is your most played hand (${run.handPlays[def.hand]} plays)`);
  }
```

Apply the joker signal in the same three places the deck signal is applied — `evalShopCard`'s joker branch, `recommendPackPick`'s joker branch, and `ownedJokerValue` — directly after the existing `deckSig` handling:

```ts
  const playSig = playSignalForJoker(def, run);
  rawScore += playSig.delta;
  baseReasons.push(...playSig.notes);
```

(in `ownedJokerValue` add only `playSignalForJoker(def, run).delta` to the value — that function returns a bare number and carries no reasons.)

- [ ] **Step 5: Verify.** `npm test` → **165**; `npm run build` clean. Every baseline test must still pass: all fixtures use `newRunState`, so `totalPlays` is 0 and `discardsPerRound` is 3 except on the Red deck. **Watch the Red deck**: `DECK_DISCARDS.Red = 4`, so `banner`/`delayed-gratification` would score +0.5 on Red-deck fixtures — grep the test files for those two ids first; if any fixture uses them, report DONE_WITH_CONCERNS rather than patching the test.

- [ ] **Step 6: Commit** `feat: advice driven by hands actually played`

---

### Task 3: UI — hands section

**Files:** Modify `src/ui/screens/RunOverview.tsx`, `src/ui/screens/RunOverview.test.tsx`

- [ ] **Step 1: Append the failing test** to `src/ui/screens/RunOverview.test.tsx`:

```tsx
it('edits hand plays and the per-round resource', async () => {
  render(<App />);
  await userEvent.click(screen.getByText('Hands'));
  expect(screen.getByLabelText('Hands per round')).toHaveDisplayValue('4');
  await userEvent.click(screen.getByRole('button', { name: 'increase Discards per round' }));
  expect(screen.getByLabelText('Discards per round')).toHaveDisplayValue('4');
  await userEvent.click(screen.getByRole('button', { name: 'increase Flush played' }));
  expect(screen.getByLabelText('Flush played')).toHaveDisplayValue('1');
});
```

Run → FAIL.

- [ ] **Step 2: Replace the hand-levels `<details>` block in `src/ui/screens/RunOverview.tsx`** with:

```tsx
      <details>
        <summary>Hands</summary>
        <div className="row">
          <NumberField
            label="Hands per round"
            value={run.handsPerRound}
            onChange={value => dispatch({ type: 'SET_HANDS_PER_ROUND', value })}
          />
          <NumberField
            label="Discards per round"
            value={run.discardsPerRound}
            onChange={value => dispatch({ type: 'SET_DISCARDS_PER_ROUND', value })}
          />
        </div>
        {HAND_TYPES.map(hand => (
          <div className="row" key={hand}>
            <NumberField
              label={`${hand} level`}
              value={run.handLevels[hand]}
              min={1}
              onChange={level => dispatch({ type: 'SET_HAND_LEVEL', hand, level })}
            />
            <NumberField
              label={`${hand} played`}
              value={run.handPlays[hand]}
              onChange={value => dispatch({ type: 'SET_HAND_PLAYS', hand, value })}
            />
          </div>
        ))}
      </details>
```

Note the label change: the level fields are now `"{hand} level"`, not `"{hand}"`. Check whether any existing test queries a bare hand label (`getByLabelText('Flush')`) and report it rather than patching — the deck-profile and pack tests use `Hearts`/`Steel`, which are unaffected.

- [ ] **Step 3: Verify.** `npm test` → **166**; `npm run build` clean.

- [ ] **Step 4: Commit** `feat: hands section with play counters and round resources`

---

### Task 4: README + verification

- [ ] **Step 1:** Append to the README feature paragraph:

```
Telling it how often you played each poker hand sharpens the plan further —
a flush build is recognised from your actual hands, not just your jokers.
```

- [ ] **Step 2:** `npm test` → 166; `npm run build` clean. Controller does the browser pass.

- [ ] **Step 3: Commit** `docs: mention hand play tracking in README`
