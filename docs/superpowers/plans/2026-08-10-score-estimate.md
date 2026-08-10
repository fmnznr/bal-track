# Score Estimate (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Estimate the score of the player's typical hand, compare it to the ante's blind targets, and show each shop joker's estimated gain — honestly labelled, with every unmodeled joker named.

**Architecture:** Unchanged layering — two curated data tables, an optional numeric field on jokers, a pure `engine/score.ts`, a bounded hook into `recommend.ts`, and a `ScorePanel` on the run screen.

**Spec:** `docs/superpowers/specs/2026-08-10-score-estimate-design.md` (approved).

## Execution notes

- Branch `feature/score-estimate` off current `main`. Baseline **169 tests**.
- TDD per task; commit trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Data honesty rule:** every number in Tasks 1 and 2 is transcribed from the Balatro wiki (`https://balatrowiki.org/w/Poker_Hands`, `.../Blinds`, and each joker's page), never from memory. Where the wiki is ambiguous, leave the joker unmodeled rather than guessing.
- **Neutrality invariant:** a joker with no `score` field contributes nothing, and `estimateJokerDelta` returns 0 for it — so all 169 baseline tests must stay green.

---

### Task 1: Hand values and blind targets

**Files:** Create `src/data/handValues.json`, `src/data/blinds.json`, `src/data/scoreData.test.ts`; Modify `src/types.ts`

- [ ] **Step 1: Write the failing validation test.** `src/data/scoreData.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import handValues from './handValues.json';
import blinds from './blinds.json';
import { HAND_TYPES } from '../types';

describe('handValues.json', () => {
  it('covers every poker hand exactly once', () => {
    expect(handValues).toHaveLength(12);
    expect(new Set(handValues.map(h => h.hand))).toEqual(new Set(HAND_TYPES));
  });

  it('has plausible, positive values everywhere', () => {
    for (const h of handValues) {
      expect(h.baseChips, h.hand).toBeGreaterThan(0);
      expect(h.baseMult, h.hand).toBeGreaterThan(0);
      expect(h.chipsPerLevel, h.hand).toBeGreaterThan(0);
      expect(h.multPerLevel, h.hand).toBeGreaterThan(0);
      expect(h.scoringCards, h.hand).toBeGreaterThanOrEqual(1);
      expect(h.scoringCards, h.hand).toBeLessThanOrEqual(5);
    }
  });

  it('pins the values the engine tests rely on', () => {
    const byHand = new Map(handValues.map(h => [h.hand, h]));
    expect(byHand.get('High Card')).toMatchObject({ baseChips: 5, baseMult: 1, scoringCards: 1 });
    expect(byHand.get('Pair')).toMatchObject({ baseChips: 10, baseMult: 2, scoringCards: 2 });
    expect(byHand.get('Flush')).toMatchObject({ baseChips: 35, baseMult: 4, scoringCards: 5 });
  });

  it('orders stronger hands above weaker ones at level 1', () => {
    const score = (h: (typeof handValues)[number]) => h.baseChips * h.baseMult;
    const byHand = new Map(handValues.map(h => [h.hand, h]));
    expect(score(byHand.get('Pair')!)).toBeLessThan(score(byHand.get('Two Pair')!));
    expect(score(byHand.get('Two Pair')!)).toBeLessThan(score(byHand.get('Straight')!));
    expect(score(byHand.get('Four of a Kind')!)).toBeLessThan(score(byHand.get('Straight Flush')!));
  });
});

describe('blinds.json', () => {
  it('covers antes 1 to 8 and rises monotonically', () => {
    expect(blinds.anteBase).toHaveLength(9); // index 0 unused
    for (let ante = 2; ante <= 8; ante++) {
      expect(blinds.anteBase[ante], `ante ${ante}`).toBeGreaterThan(blinds.anteBase[ante - 1]);
    }
    expect(blinds.anteBase[1]).toBe(300);
    expect(blinds.anteBase[8]).toBe(50000);
  });

  it('scales small, big and boss blinds', () => {
    expect(blinds.multipliers.small).toBe(1);
    expect(blinds.multipliers.big).toBe(1.5);
    expect(blinds.multipliers.boss).toBe(2);
  });
});
```

Run `npm test -- src/data/scoreData.test.ts` → FAIL (files missing).

- [ ] **Step 2: Transcribe the tables from the wiki.**

Fetch `https://balatrowiki.org/w/Poker_Hands` (WebFetch). It lists each hand's base chips/mult and the per-level increase from Planet cards. Write `src/data/handValues.json` as an array of:

```json
{ "hand": "Flush", "baseChips": 35, "baseMult": 4, "chipsPerLevel": 15, "multPerLevel": 2, "scoringCards": 5 }
```

`scoringCards` is how many cards the hand scores: High Card 1, Pair 2, Two Pair 4, Three of a Kind 3, Four of a Kind 4, everything else 5.

Fetch `https://balatrowiki.org/w/Blinds` for the ante base scores. Write `src/data/blinds.json`:

```json
{ "anteBase": [0, 300, 800, 2000, 5000, 11000, 20000, 35000, 50000], "multipliers": { "small": 1, "big": 1.5, "boss": 2 } }
```

If the wiki's numbers differ from those written here, **the wiki wins** — adjust the JSON and report the difference; only the three pinned `toMatchObject` values and the two pinned ante values are contractual.

- [ ] **Step 3: Append the types to `src/types.ts`:**

```ts
export interface HandValueDef {
  hand: HandType;
  baseChips: number;
  baseMult: number;
  chipsPerLevel: number;
  multPerLevel: number;
  scoringCards: number;
}

/** Unconditional score contribution of a joker, if it has one. */
export interface JokerScore {
  chips?: number;
  mult?: number;
  xmult?: number;
}
```

Add `score?: JokerScore;` to `JokerDef`.

- [ ] **Step 4: Verify.** `npm test` → **175**; `npm run build` clean.

- [ ] **Step 5: Commit** `feat: hand value and blind target tables`

---

### Task 2: Numeric joker models

**Files:** Modify `src/data/jokers.json`; Test `src/data/jokerScores.test.ts`

- [ ] **Step 1: Write the failing test.** `src/data/jokerScores.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import jokers from './jokers.json';

const byId = new Map(jokers.map(j => [j.id, j as { id: string; effect: string; score?: Record<string, number> }]));

describe('joker score models', () => {
  it('models the unambiguous flat jokers', () => {
    expect(byId.get('joker')?.score).toEqual({ mult: 4 });
    expect(byId.get('cavendish')?.score).toEqual({ xmult: 3 });
    expect(byId.get('jolly-joker')?.score).toBeDefined();
  });

  it('leaves conditional, scaling and random jokers unmodeled', () => {
    for (const id of ['green-joker', 'ride-the-bus', 'blueprint', 'greedy-joker', 'business-card', 'obelisk']) {
      expect(byId.get(id)?.score, id).toBeUndefined();
    }
  });

  it('models a reasonable share without inventing numbers', () => {
    const modeled = jokers.filter(j => 'score' in j);
    expect(modeled.length).toBeGreaterThanOrEqual(20);
    expect(modeled.length).toBeLessThanOrEqual(70);
  });

  it('only ever uses the three known keys, with positive values', () => {
    for (const j of jokers) {
      const score = (j as { score?: Record<string, number> }).score;
      if (!score) continue;
      for (const [key, value] of Object.entries(score)) {
        expect(['chips', 'mult', 'xmult'], `${j.id}: ${key}`).toContain(key);
        expect(value, `${j.id}: ${key}`).toBeGreaterThan(0);
      }
    }
  });
});
```

Run → FAIL.

- [ ] **Step 2: Add `score` to the unconditional jokers only.**

Walk `src/data/jokers.json` and add the field **only** where the effect text states a flat, always-on contribution with no condition, no counter and no chance. Examples of what qualifies:

- `joker` — "+4 Mult" → `{ "mult": 4 }`
- `jolly-joker` — "+8 Mult if played hand contains a Pair" → **conditional, skip**

Wait — read carefully: a hand-type condition IS a condition, but it is one the reference hand already answers (we estimate a specific hand). Model those too, and record the requirement:

```json
"score": { "mult": 8, "requiresHand": "Pair" }
```

Extend the `JokerScore` type in `src/types.ts` accordingly:

```ts
export interface JokerScore {
  chips?: number;
  mult?: number;
  xmult?: number;
  /** Only contributes when the estimated hand contains this. */
  requiresHand?: HandType;
}
```

and extend the Task-1 test's key whitelist to include `requiresHand` (a string, so exclude it from the positive-number check).

Skip anything that depends on suits, ranks, editions of played cards, held-in-hand cards, counters, chance, money, or other jokers. When in doubt, skip — an unmodeled joker is honest, a guessed one is not.

Verify each modeled value against the joker's wiki page or the `effect` string already in the catalog; report any joker whose catalog text disagrees with the wiki.

- [ ] **Step 3: Verify.** `npm test` → **179**; `npm run build` clean. Report how many jokers ended up modeled.

- [ ] **Step 4: Commit** `feat: numeric score models for unconditional jokers`

---

### Task 3: The estimator

**Files:** Create `src/engine/score.ts` + `src/engine/score.test.ts`

- [ ] **Step 1: Write the failing tests.** `src/engine/score.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { blindTargets, estimateHandScore, estimateJokerDelta, referenceHand } from './score';
import type { HandType, RunState } from '../types';

function runWith(jokerIds: string[] = [], overrides: Partial<RunState> = {}): RunState {
  return {
    ...newRunState('Magic', 'White'),
    jokers: jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const })),
    ...overrides,
  };
}

describe('blindTargets', () => {
  it('scales the ante base by blind type', () => {
    expect(blindTargets(1)).toEqual({ small: 300, big: 450, boss: 600 });
    expect(blindTargets(3).boss).toBe(4000);
  });
  it('clamps out-of-range antes', () => {
    expect(blindTargets(0).small).toBe(300);
    expect(blindTargets(99).small).toBe(50000);
  });
});

describe('referenceHand', () => {
  it('prefers the most played hand, then the highest level, then High Card', () => {
    const base = runWith();
    expect(referenceHand(base)).toBe('High Card');
    const leveled = { ...base, handLevels: { ...base.handLevels, Flush: 4 } };
    expect(referenceHand(leveled)).toBe('Flush');
    const played = { ...leveled, handPlays: { ...base.handPlays, Pair: 9 } };
    expect(referenceHand(played)).toBe('Pair');
  });
});

describe('estimateHandScore', () => {
  it('uses base values and card chips with no jokers', () => {
    const estimate = estimateHandScore(runWith(), 'Pair');
    // 10 base chips + 2 cards of roughly 7 chips each, times 2 mult
    expect(estimate.chips).toBeGreaterThan(20);
    expect(estimate.mult).toBe(2);
    expect(estimate.score).toBe(estimate.chips * estimate.mult);
    expect(estimate.modeled).toEqual([]);
    expect(estimate.unmodeled).toEqual([]);
  });

  it('scales with hand level', () => {
    const base = runWith();
    const leveled = { ...base, handLevels: { ...base.handLevels, Pair: 3 } };
    expect(estimateHandScore(leveled, 'Pair').score).toBeGreaterThan(estimateHandScore(base, 'Pair').score);
  });

  it('adds modeled jokers and names the unmodeled ones', () => {
    const estimate = estimateHandScore(runWith(['joker', 'green-joker']), 'Pair');
    expect(estimate.mult).toBe(6); // 2 base + 4
    expect(estimate.modeled).toContain('Joker');
    expect(estimate.unmodeled).toContain('Green Joker');
  });

  it('applies plus-mult before xmult regardless of list order', () => {
    const additiveFirst = estimateHandScore(runWith(['joker', 'cavendish']), 'Pair');
    const multiplicativeFirst = estimateHandScore(runWith(['cavendish', 'joker']), 'Pair');
    expect(additiveFirst.mult).toBe(18); // (2 + 4) * 3
    expect(multiplicativeFirst.mult).toBe(18);
  });

  it('honours hand requirements', () => {
    const withJolly = runWith(['jolly-joker']);
    expect(estimateHandScore(withJolly, 'Pair').mult).toBeGreaterThan(estimateHandScore(withJolly, 'Flush').mult - 3);
    expect(estimateHandScore(withJolly, 'Flush').modeled).toEqual([]);
  });

  it('counts editions', () => {
    const base = runWith(['joker']);
    const polychrome = { ...base, jokers: [{ jokerId: 'joker', edition: 'polychrome' as const }] };
    expect(estimateHandScore(polychrome, 'Pair').mult).toBeGreaterThan(estimateHandScore(base, 'Pair').mult);
  });
});

describe('estimateJokerDelta', () => {
  it('reports the gain a joker would add', () => {
    const run = runWith();
    expect(estimateJokerDelta(run, 'Pair', 'joker', 'base')).toBeGreaterThan(0);
  });
  it('is zero for unmodeled jokers', () => {
    expect(estimateJokerDelta(runWith(), 'Pair', 'green-joker', 'base')).toBe(0);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Create `src/engine/score.ts`:**

```ts
import handValuesJson from '../data/handValues.json';
import blindsJson from '../data/blinds.json';
import { getJoker } from '../catalog/catalog';
import { HAND_TYPES } from '../types';
import type { Edition, HandType, HandValueDef, RunState } from '../types';
import { mostPlayedHand } from './playSignals';

const handValues = handValuesJson as unknown as HandValueDef[];
const blinds = blindsJson as { anteBase: number[]; multipliers: { small: number; big: number; boss: number } };
const byHand = new Map(handValues.map(h => [h.hand, h]));

/** Chips an average played card contributes, nudged by the deck's face-card share. */
function averageCardChips(run: RunState): number {
  const { deckSize, faceCards } = run.deckProfile;
  if (deckSize <= 0) return 7.3;
  const faceShare = Math.min(1, faceCards / deckSize);
  // Numbered cards average ~6, face cards 10, and aces sit just above face value.
  return 6 + faceShare * 4.5;
}

export function blindTargets(ante: number): { small: number; big: number; boss: number } {
  const index = Math.min(8, Math.max(1, Math.floor(ante)));
  const base = blinds.anteBase[index];
  return {
    small: Math.round(base * blinds.multipliers.small),
    big: Math.round(base * blinds.multipliers.big),
    boss: Math.round(base * blinds.multipliers.boss),
  };
}

/** The hand the estimate should describe: what you play, else what you levelled. */
export function referenceHand(run: RunState): HandType {
  const played = mostPlayedHand(run);
  if (played) return played;
  let best: HandType = 'High Card';
  for (const hand of HAND_TYPES) {
    if (run.handLevels[hand] > run.handLevels[best]) best = hand;
  }
  return best;
}

const EDITION_CHIPS: Record<Edition, number> = { base: 0, foil: 50, holographic: 0, polychrome: 0, negative: 0 };
const EDITION_MULT: Record<Edition, number> = { base: 0, foil: 0, holographic: 10, polychrome: 0, negative: 0 };
const EDITION_XMULT: Record<Edition, number> = { base: 1, foil: 1, holographic: 1, polychrome: 1.5, negative: 1 };

export interface ScoreEstimate {
  chips: number;
  mult: number;
  score: number;
  modeled: string[];
  unmodeled: string[];
}

export function estimateHandScore(run: RunState, hand: HandType): ScoreEstimate {
  const def = byHand.get(hand);
  if (!def) return { chips: 0, mult: 0, score: 0, modeled: [], unmodeled: [] };

  const level = run.handLevels[hand] ?? 1;
  let chips = def.baseChips + def.chipsPerLevel * (level - 1) + def.scoringCards * averageCardChips(run);
  let mult = def.baseMult + def.multPerLevel * (level - 1);
  let xmult = 1;
  const modeled: string[] = [];
  const unmodeled: string[] = [];

  for (const owned of run.jokers) {
    const joker = getJoker(owned.jokerId);
    if (!joker) continue;
    const score = joker.score;
    const applies = score && (!score.requiresHand || score.requiresHand === hand);
    const editionOnly = EDITION_CHIPS[owned.edition] + EDITION_MULT[owned.edition] > 0 || EDITION_XMULT[owned.edition] !== 1;

    if (!score) {
      unmodeled.push(joker.name);
    } else if (!applies) {
      // Modeled, but this hand does not trigger it — neither counted nor flagged.
    } else {
      chips += score.chips ?? 0;
      mult += score.mult ?? 0;
      xmult *= score.xmult ?? 1;
      modeled.push(joker.name);
    }

    if (editionOnly) {
      chips += EDITION_CHIPS[owned.edition];
      mult += EDITION_MULT[owned.edition];
      xmult *= EDITION_XMULT[owned.edition];
      if (!modeled.includes(joker.name) && score && applies) modeled.push(joker.name);
    }
  }

  mult *= xmult;
  const rounded = { chips: Math.round(chips), mult: Math.round(mult * 100) / 100 };
  return { ...rounded, score: Math.round(rounded.chips * rounded.mult), modeled, unmodeled };
}

/** Estimated score gain from adding this joker to the current run. */
export function estimateJokerDelta(run: RunState, hand: HandType, jokerId: string, edition: Edition): number {
  const joker = getJoker(jokerId);
  if (!joker?.score) return 0;
  const before = estimateHandScore(run, hand).score;
  const after = estimateHandScore({ ...run, jokers: [...run.jokers, { jokerId, edition }] }, hand).score;
  return after - before;
}
```

Note the ordering property the tests pin: additive Mult is summed across all jokers before any xMult is applied, so list order cannot change the estimate. That is deliberate — the estimator answers "what is this build worth", while `jokerOrder.ts` separately advises on the ordering itself.

- [ ] **Step 3: Verify.** `npm test` → **189**; `npm run build` clean.

- [ ] **Step 4: Commit** `feat: score estimator for the reference hand`

---

### Task 4: Shop hook and score panel

**Files:** Create `src/ui/components/ScorePanel.tsx`; Modify `src/engine/recommend.ts`, `src/engine/recommend.test.ts`, `src/ui/screens/RunOverview.tsx`, `src/ui/screens/RunOverview.test.tsx`

- [ ] **Step 1: Write the failing tests.**

Append to `src/engine/recommend.test.ts`:

```ts
describe('recommend — score estimate', () => {
  it('reports the estimated gain of a modeled joker', () => {
    const recs = recommend(
      run({ money: 20 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 2 }] }),
    );
    const buy = recs.find(r => r.kind === 'buy-joker');
    expect(buy?.reasons.join(' ')).toMatch(/estimated on your/);
  });

  it('says nothing about jokers it cannot model', () => {
    const recs = recommend(
      run({ money: 20 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'green-joker', edition: 'base', price: 4 }] }),
    );
    const buy = recs.find(r => r.kind === 'buy-joker');
    expect(buy?.reasons.join(' ')).not.toMatch(/estimated/);
  });
});
```

Append to `src/ui/screens/RunOverview.test.tsx`:

```tsx
it('shows the score estimate against the ante targets', async () => {
  render(<App />);
  expect(screen.getByText(/Typical/)).toBeInTheDocument();
  expect(screen.getByText(/targets/)).toBeInTheDocument();
});
```

Run → FAIL.

- [ ] **Step 2: Hook into `src/engine/recommend.ts`.** Import `estimateHandScore, estimateJokerDelta, referenceHand` from `./score`. In `evalShopCard`'s joker branch, after the deck and play signals:

```ts
  const hand = referenceHand(run);
  const delta = estimateJokerDelta(run, hand, def.id, slot.edition);
  if (delta > 0) {
    const current = estimateHandScore(run, hand).score;
    // Capped at ±2: the estimate breaks ties, it does not carry a card.
    rawScore += Math.min(2, current > 0 ? (delta / current) * 2 : 1);
    baseReasons.push(`+${delta.toLocaleString('en-US')} estimated on your ${hand}`);
  }
```

- [ ] **Step 3: Create `src/ui/components/ScorePanel.tsx`:**

```tsx
import { blindTargets, estimateHandScore, referenceHand } from '../../engine/score';
import { useRun } from '../../run/RunContext';

export default function ScorePanel() {
  const { store } = useRun();
  const run = store.current!;
  const hand = referenceHand(run);
  const estimate = estimateHandScore(run, hand);
  const targets = blindTargets(run.ante);
  const fmt = (n: number) => n.toLocaleString('en-US');

  return (
    <p className="muted score-panel">
      Typical {hand} ~{fmt(estimate.score)} · Ante {run.ante} targets {fmt(targets.small)} / {fmt(targets.big)} /{' '}
      {fmt(targets.boss)}
      {estimate.unmodeled.length > 0 && <> · Not counted: {estimate.unmodeled.join(', ')}</>}
    </p>
  );
}
```

- [ ] **Step 4: Mount it** in `src/ui/screens/RunOverview.tsx` directly after `<StrategyPanel />` (import alongside it). Append to `src/styles.css`:

```css
.score-panel {
  border-left: 4px solid var(--panel-2);
  padding-left: 10px;
}
```

- [ ] **Step 5: Verify.** `npm test` → **192**; `npm run build` clean. Existing recommend tests must stay green — their fixtures own no modeled jokers by default, and the shop fixtures that do (`joker`, `blueprint`, `baron`) shift by at most +2; if an existing assertion breaks, report DONE_WITH_CONCERNS with the before/after numbers rather than patching it.

- [ ] **Step 6: Commit** `feat: score estimate in the shop and on the run screen`

---

### Task 5: README + verification

- [ ] **Step 1:** Append to the README feature paragraph:

```
Where a joker's effect is unambiguous, the app also estimates what your
typical hand scores and how far that is from the ante's blind targets —
always labelled as an estimate, and always listing what it could not count.
```

- [ ] **Step 2:** `npm test` → 192; `npm run build` clean. Controller does the browser pass.

- [ ] **Step 3: Commit** `docs: mention score estimate in README`
