# Strategy Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a strategy advisor to bal-track: archetype candidates ranked from owned jokers + deck, shown in a panel on the Run screen, with moderate feedback into shop/pack scoring.

**Architecture:** Same pattern as v1 — curated JSON data (`archetypes.json`, `deckStrategy.json`), a pure engine module (`strategy.ts`), a presentational component (`StrategyPanel`), and a small additive hook into `recommend.ts`. No new dependencies.

**Tech Stack:** unchanged (Vite + React 18 + TS strict + Vitest).

**Spec:** `docs/superpowers/specs/2026-07-19-strategy-advisor-design.md` (approved).

---

## Execution notes

- Working directory: `/Users/franzmuenzner/Downloads/aufheben/bal-track`. Branch off current `main` (`git checkout -b feature/strategy-advisor`).
- Commit after every task; append the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- TDD as in v1: failing test → implement → pass → full suite → commit.
- Baseline: 66 tests green on main.
- **Coordination note:** a separate session may land a small additive change to `src/engine/recommend.ts` (inserting `def.effect` as first reason in the two joker branches). If `git log origin/main` shows it when you start Task 3, rebase the feature branch first; the changes don't conflict logically (both are additive `reasons` entries).

## File structure

```
src/types.ts                       # Modify: add ArchetypeDef, DeckStrategyDef, Commitment, StrategyCandidate, StrategyAdvice
src/data/archetypes.json           # Create: 6 archetypes
src/data/deckStrategy.json         # Create: 15 deck entries
src/data/strategyData.test.ts      # Create: validation tests
src/engine/strategy.ts             # Create: adviseStrategy + thresholds
src/engine/strategy.test.ts        # Create
src/engine/recommend.ts            # Modify: strategy feedback (jokers + planets)
src/engine/recommend.test.ts       # Modify: feedback tests
src/ui/components/StrategyPanel.tsx        # Create
src/ui/components/StrategyPanel.test.tsx   # Create
src/ui/screens/RunOverview.tsx     # Modify: mount panel
src/styles.css                     # Modify: panel styles
README.md                          # Modify: one feature bullet
```

---

### Task 1: Types and strategy data

**Files:**
- Modify: `src/types.ts` (append at end)
- Create: `src/data/archetypes.json`, `src/data/deckStrategy.json`
- Test: `src/data/strategyData.test.ts`

- [ ] **Step 1: Write the failing validation test**

`src/data/strategyData.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import archetypes from './archetypes.json';
import deckStrategy from './deckStrategy.json';
import meta from './meta.json';
import { HAND_TYPES, SYNERGY_TAGS } from '../types';
import { getJoker } from '../catalog/catalog';

describe('archetypes.json', () => {
  it('contains 6 archetypes with unique ids', () => {
    expect(archetypes).toHaveLength(6);
    expect(new Set(archetypes.map(a => a.id)).size).toBe(6);
  });

  it('references only valid tags, jokers and hands', () => {
    const tagSet = new Set<string>(SYNERGY_TAGS);
    const handSet = new Set<string>(HAND_TYPES);
    for (const a of archetypes) {
      expect(a.name, a.id).toBeTruthy();
      expect(a.description, a.id).toBeTruthy();
      expect(a.coreTags.length, a.id).toBeGreaterThanOrEqual(1);
      for (const t of a.coreTags) expect(tagSet.has(t), `${a.id}: ${t}`).toBe(true);
      expect(a.keyJokers.length, a.id).toBeGreaterThanOrEqual(4);
      expect(a.keyJokers.length, a.id).toBeLessThanOrEqual(6);
      for (const j of a.keyJokers) expect(getJoker(j), `${a.id}: ${j}`).toBeDefined();
      for (const h of a.hands) expect(handSet.has(h), `${a.id}: ${h}`).toBe(true);
    }
  });
});

describe('deckStrategy.json', () => {
  it('covers exactly the 15 decks from meta.json', () => {
    expect(new Set(deckStrategy.map(d => d.deck))).toEqual(new Set(meta.decks));
    expect(deckStrategy).toHaveLength(15);
  });

  it('references only valid archetype ids', () => {
    const ids = new Set(archetypes.map(a => a.id));
    for (const d of deckStrategy) {
      for (const key of Object.keys(d.boosts)) expect(ids.has(key), `${d.deck}: ${key}`).toBe(true);
      for (const ex of d.excluded) expect(ids.has(ex), `${d.deck}: ${ex}`).toBe(true);
    }
  });

  it('excludes face-cards on Abandoned and boosts flush on Checkered', () => {
    expect(deckStrategy.find(d => d.deck === 'Abandoned')?.excluded).toContain('face-cards');
    expect(deckStrategy.find(d => d.deck === 'Checkered')?.boosts['flush']).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/data/strategyData.test.ts`
Expected: FAIL — JSON files missing.

- [ ] **Step 3: Append the types to `src/types.ts`** (after `phaseForAnte`)

```ts
export interface ArchetypeDef {
  id: string;
  name: string;
  description: string;
  coreTags: SynergyTag[];
  keyJokers: string[]; // joker ids worth watching for
  hands: HandType[]; // hands to level for this build
}

export interface DeckStrategyDef {
  deck: string;
  boosts: Record<string, number>; // archetype id -> score modifier
  excluded: string[]; // archetype ids unplayable on this deck
  note?: string;
}

export type Commitment = 'open' | 'lean' | 'commit';

export interface StrategyCandidate {
  archetypeId: string;
  name: string;
  score: number;
  reasons: string[];
  watchlist: string[]; // names of key jokers not yet owned
  hands: HandType[];
}

export interface StrategyAdvice {
  commitment: Commitment;
  candidates: StrategyCandidate[]; // top 3, best first
}
```

- [ ] **Step 4: Write the data files**

`src/data/archetypes.json`:

```json
[
  { "id": "flush", "name": "Flush", "description": "Focus one suit and play flushes every hand", "coreTags": ["flush-support", "suit-hearts", "suit-diamonds", "suit-spades", "suit-clubs"], "keyJokers": ["droll-joker", "crafty-joker", "smeared-joker", "four-fingers", "the-tribe", "bloodstone"], "hands": ["Flush"] },
  { "id": "straight", "name": "Straight", "description": "Chain connected ranks into straights", "coreTags": ["straight-support"], "keyJokers": ["crazy-joker", "devious-joker", "four-fingers", "shortcut", "runner", "the-order"], "hands": ["Straight"] },
  { "id": "pairs", "name": "Pairs & Quads", "description": "Stack multiples of a rank, from pairs to four of a kind", "coreTags": ["pair-support"], "keyJokers": ["jolly-joker", "sly-joker", "zany-joker", "spare-trousers", "the-duo", "the-family"], "hands": ["Pair", "Two Pair", "Full House", "Four of a Kind"] },
  { "id": "face-cards", "name": "Face Cards", "description": "Kings, queens and jacks carry the scoring", "coreTags": ["face-cards"], "keyJokers": ["photograph", "baron", "scary-face", "smiley-face", "sock-and-buskin", "midas-mask"], "hands": [] },
  { "id": "scaling", "name": "Scaling Engine", "description": "Grow permanent value every round and outscale the antes", "coreTags": ["scaling", "xmult"], "keyJokers": ["ride-the-bus", "green-joker", "constellation", "hologram", "obelisk", "campfire"], "hands": [] },
  { "id": "economy", "name": "Economy Start", "description": "Bank money early, convert interest into power later", "coreTags": ["economy"], "keyJokers": ["golden-joker", "bull", "rocket", "cloud-9", "to-the-moon", "egg"], "hands": [] }
]
```

If a `keyJokers` id fails the validation test (id mismatch against `jokers.json`), check the actual id with `grep '"name": "<Name>"' src/data/jokers.json` and correct the archetype entry — never invent jokers.

`src/data/deckStrategy.json`:

```json
[
  { "deck": "Red", "boosts": {}, "excluded": [] },
  { "deck": "Blue", "boosts": {}, "excluded": [] },
  { "deck": "Yellow", "boosts": { "economy": 1 }, "excluded": [], "note": "extra starting money makes an interest start easy" },
  { "deck": "Green", "boosts": {}, "excluded": [], "note": "no interest on this deck — prefer flat money jokers over interest payoffs" },
  { "deck": "Black", "boosts": { "scaling": 1 }, "excluded": [], "note": "the extra joker slot supports engine builds" },
  { "deck": "Magic", "boosts": {}, "excluded": [] },
  { "deck": "Nebula", "boosts": {}, "excluded": [], "note": "Telescope start — celestial packs level your most played hand" },
  { "deck": "Ghost", "boosts": {}, "excluded": [] },
  { "deck": "Abandoned", "boosts": { "pairs": 1, "straight": 1 }, "excluded": ["face-cards"], "note": "no face cards in the deck; 40 cards mean denser ranks" },
  { "deck": "Checkered", "boosts": { "flush": 3 }, "excluded": [], "note": "only spades and hearts — flushes come naturally" },
  { "deck": "Zodiac", "boosts": {}, "excluded": [], "note": "merchant vouchers give early planet and tarot access" },
  { "deck": "Painted", "boosts": { "flush": 1, "straight": 1 }, "excluded": [], "note": "+2 hand size helps you draw into big hands" },
  { "deck": "Anaglyph", "boosts": {}, "excluded": [] },
  { "deck": "Plasma", "boosts": { "scaling": 1 }, "excluded": [], "note": "balanced chipsxmult scoring rewards one big engine" },
  { "deck": "Erratic", "boosts": {}, "excluded": [], "note": "random deck — check your actual suit and rank distribution first" }
]
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/data/strategyData.test.ts`
Expected: PASS (5 tests). Then full `npm test` (expect 71) and `npm run build` — green.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/data/archetypes.json src/data/deckStrategy.json src/data/strategyData.test.ts
git commit -m "feat: archetype and deck-strategy catalogs with validation"
```

---

### Task 2: Strategy engine

**Files:**
- Create: `src/engine/strategy.ts`
- Test: `src/engine/strategy.test.ts`

- [ ] **Step 1: Write the failing test**

`src/engine/strategy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { adviseStrategy, COMMIT_THRESHOLD, LEAN_THRESHOLD } from './strategy';
import type { RunState } from '../types';

function runWith(deck: string, jokerIds: string[] = []): RunState {
  return { ...newRunState(deck, 'White'), jokers: jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const })) };
}

describe('adviseStrategy', () => {
  it('stays open on a fresh neutral run', () => {
    const advice = adviseStrategy(runWith('Red'));
    expect(advice.commitment).toBe('open');
    expect(advice.candidates).toHaveLength(3);
  });

  it('leans flush on an empty Checkered run because of the deck alone', () => {
    const advice = adviseStrategy(runWith('Checkered'));
    expect(advice.commitment).toBe('lean');
    expect(advice.candidates[0].archetypeId).toBe('flush');
    expect(advice.candidates[0].reasons.join(' ')).toMatch(/Checkered/);
  });

  it('commits to flush with one flush joker on Checkered', () => {
    const advice = adviseStrategy(runWith('Checkered', ['droll-joker']));
    expect(advice.commitment).toBe('commit');
    expect(advice.candidates[0].archetypeId).toBe('flush');
  });

  it('never offers face-cards on Abandoned, even when owning a face joker', () => {
    const advice = adviseStrategy(runWith('Abandoned', ['photograph']));
    expect(advice.candidates.some(c => c.archetypeId === 'face-cards')).toBe(false);
  });

  it('ranks flush above pairs with two flush jokers on a neutral deck', () => {
    const advice = adviseStrategy(runWith('Red', ['droll-joker', 'crafty-joker']));
    expect(advice.candidates[0].archetypeId).toBe('flush');
    expect(advice.commitment).toBe('commit');
  });

  it('lists only unowned key jokers on the watchlist', () => {
    const advice = adviseStrategy(runWith('Red', ['droll-joker', 'crafty-joker']));
    const watchlist = advice.candidates[0].watchlist;
    expect(watchlist).not.toContain('Droll Joker');
    expect(watchlist).not.toContain('Crafty Joker');
    expect(watchlist).toContain('Smeared Joker');
  });

  it('exposes sane thresholds', () => {
    expect(COMMIT_THRESHOLD).toBeGreaterThan(LEAN_THRESHOLD);
    expect(LEAN_THRESHOLD).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/strategy.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

`src/engine/strategy.ts`:

```ts
import archetypesJson from '../data/archetypes.json';
import deckStrategyJson from '../data/deckStrategy.json';
import { getJoker } from '../catalog/catalog';
import type { ArchetypeDef, DeckStrategyDef, RunState, StrategyAdvice, StrategyCandidate } from '../types';

export const archetypes = archetypesJson as unknown as ArchetypeDef[];
export const deckStrategies = deckStrategyJson as unknown as DeckStrategyDef[];

const archetypeById = new Map(archetypes.map(a => [a.id, a]));
const deckByName = new Map(deckStrategies.map(d => [d.deck, d]));

export function getArchetype(id: string): ArchetypeDef | undefined {
  return archetypeById.get(id);
}

/** Top score needed before the advisor commits to / leans toward a plan. */
export const COMMIT_THRESHOLD = 6;
export const LEAN_THRESHOLD = 3;

export function adviseStrategy(run: RunState): StrategyAdvice {
  const deck = deckByName.get(run.deck);
  const ownedIds = new Set(run.jokers.map(j => j.jokerId));
  const candidates: StrategyCandidate[] = [];

  for (const arch of archetypes) {
    if (deck?.excluded.includes(arch.id)) continue;

    let score = 0;
    const reasons: string[] = [];

    let tagHits = 0;
    for (const owned of run.jokers) {
      const def = getJoker(owned.jokerId);
      if (def?.tags.some(t => arch.coreTags.includes(t))) tagHits += 1;
    }
    const keyOwned = arch.keyJokers.filter(id => ownedIds.has(id)).length;
    score += tagHits * 2 + keyOwned * 1.5;
    if (tagHits > 0) reasons.push(`${tagHits} of your jokers support this direction`);
    if (keyOwned > 0) reasons.push(`You already own ${keyOwned} key joker${keyOwned > 1 ? 's' : ''}`);

    const boost = deck?.boosts[arch.id] ?? 0;
    if (boost !== 0) {
      score += boost;
      reasons.push(deck?.note ? `${run.deck} Deck: ${deck.note}` : `${run.deck} Deck favors this`);
    }

    const leveled = arch.hands.reduce((sum, hand) => sum + Math.max(0, run.handLevels[hand] - 1), 0);
    if (leveled > 0) {
      score += Math.min(3, leveled * 0.75);
      reasons.push('You already leveled the matching hands');
    }

    if (reasons.length === 0) reasons.push(arch.description);

    const watchlist = arch.keyJokers
      .filter(id => !ownedIds.has(id))
      .map(id => getJoker(id)?.name ?? id);

    candidates.push({ archetypeId: arch.id, name: arch.name, score, reasons, watchlist, hands: arch.hands });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0]?.score ?? 0;
  const commitment = top >= COMMIT_THRESHOLD ? 'commit' : top >= LEAN_THRESHOLD ? 'lean' : 'open';
  return { commitment, candidates: candidates.slice(0, 3) };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/engine/strategy.test.ts`
Expected: PASS (7 tests). Hand-check: Checkered empty → flush score 3 (boost) → lean; Checkered + droll → 2 (tag) + 1.5 (key) + 3 = 6.5 → commit; droll+crafty neutral → 4 + 3 = 7 → commit.

Full `npm test` (expect 78) and `npm run build` — green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/strategy.ts src/engine/strategy.test.ts
git commit -m "feat: strategy engine ranking archetypes by jokers, deck and hand levels"
```

---

### Task 3: Shop and pack feedback

**Files:**
- Modify: `src/engine/recommend.ts`
- Modify: `src/engine/recommend.test.ts` (append a describe block)

**Before starting:** run `git fetch origin && git log origin/main --oneline -2`. If a commit about joker effect text landed, rebase the feature branch onto it first (`git rebase origin/main`) — its change adds `def.effect` reasons in the same functions you are editing; keep both.

- [ ] **Step 1: Write the failing tests (append to `src/engine/recommend.test.ts`)**

```ts
describe('recommend — strategy feedback', () => {
  it('boosts a watchlist joker when a plan is recommended', () => {
    const flushRun = { ...run({ money: 20, jokers: owned('droll-joker') }), deck: 'Checkered' };
    const recs = recommend(flushRun, shop({ cards: [{ kind: 'joker', jokerId: 'smeared-joker', edition: 'base', price: 7 }] }));
    const buy = recs.find(r => r.kind === 'buy-joker');
    expect(buy?.reasons.join(' ')).toMatch(/watchlist for your recommended Flush plan/);
  });

  it('adds no strategy reasons while the advisor is open', () => {
    const recs = recommend(run({ money: 20 }), shop({ cards: [{ kind: 'joker', jokerId: 'crafty-joker', edition: 'base', price: 4 }] }));
    const buy = recs.find(r => r.kind === 'buy-joker');
    expect(buy?.reasons.join(' ')).not.toMatch(/recommended/);
  });

  it('boosts plan planets in pack picks', () => {
    const flushRun = { ...run({ jokers: owned('droll-joker') }), deck: 'Checkered' };
    const picks = recommendPackPick(flushRun, ['mercury', 'jupiter']);
    expect(picks[0].action).toBe('Take Jupiter');
    expect(picks[0].reasons.join(' ')).toMatch(/for your recommended Flush plan/);
  });
});
```

Note: `smeared-joker` must exist in `jokers.json` (it does — validation ran in Task 1) and is on the flush watchlist.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test -- src/engine/recommend.test.ts`
Expected: the 3 new tests FAIL (no strategy reasons yet), the existing ones PASS.

- [ ] **Step 3: Implement the feedback in `src/engine/recommend.ts`**

Add imports:

```ts
import { adviseStrategy, getArchetype } from './strategy';
import type { ArchetypeDef, StrategyCandidate } from '../types';
```

Add two helpers next to `planetBonus`:

```ts
function activePlan(run: RunState): StrategyCandidate | null {
  const advice = adviseStrategy(run);
  if (advice.commitment === 'open') return null;
  return advice.candidates[0] ?? null;
}

function planJokerBonus(defId: string, tags: readonly string[], plan: StrategyCandidate | null): { bonus: number; notes: string[] } {
  if (!plan) return { bonus: 0, notes: [] };
  const arch = getArchetype(plan.archetypeId);
  if (!arch) return { bonus: 0, notes: [] };
  if (arch.keyJokers.includes(defId)) {
    return { bonus: 1.2, notes: [`On the watchlist for your recommended ${plan.name} plan`] };
  }
  if (tags.some(t => (arch.coreTags as readonly string[]).includes(t))) {
    return { bonus: 0.8, notes: [`Fits your recommended ${plan.name} plan`] };
  }
  return { bonus: 0, notes: [] };
}

function planPlanetBonus(consumableId: string, plan: StrategyCandidate | null): { bonus: number; notes: string[] } {
  if (!plan) return { bonus: 0, notes: [] };
  const def = getConsumable(consumableId);
  if (def?.kind !== 'planet' || !def.hand || !plan.hands.includes(def.hand)) return { bonus: 0, notes: [] };
  return { bonus: 1.5, notes: [`Levels ${def.hand} for your recommended ${plan.name} plan`] };
}
```

Wire them in:

1. `recommend()`: compute `const plan = activePlan(run);` once, pass it to `evalShopCard` (new last parameter).
2. `evalShopCard(run, slot, phase, profile, plan)`:
   - joker branch: after the synergy/edition additions to `rawScore` and `baseReasons`, add
     ```ts
     const planB = planJokerBonus(def.id, def.tags, plan);
     rawScore += planB.bonus;
     baseReasons.push(...planB.notes);
     ```
     (If the file still uses the pre-rawScore variable names, apply the same addition to `score`/`reasons` before the economy step.)
   - consumable branch: after the existing `planetBonus` addition, add the same pattern with `planPlanetBonus(def.id, plan)`.
3. `recommendPackPick()`: compute `const plan = activePlan(run);` once; in the joker branch add `planJokerBonus`, in the consumable branch add `planPlanetBonus` — bonus to score, notes to reasons.

Do NOT touch reroll/skip/voucher/pack evaluation or the sell-and-buy structure.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/engine/recommend.test.ts`
Expected: PASS (16 tests: 13 existing + 3 new). If an EXISTING test now fails, check which run gains an unexpected plan: the fixture runs use the neutral Red deck and few jokers, so only the flush-heavy fixtures reach `lean`/`commit` — their assertions were checked against this and still hold (`Fits your recommended … plan` does not match `/Fits your build/`). Report DONE_WITH_CONCERNS with details rather than weakening assertions.

Full `npm test` (expect 81) and `npm run build` — green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/recommend.ts src/engine/recommend.test.ts
git commit -m "feat: strategy-aware bonuses in shop and pack recommendations"
```

---

### Task 4: StrategyPanel UI

**Files:**
- Create: `src/ui/components/StrategyPanel.tsx`
- Test: `src/ui/components/StrategyPanel.test.tsx`
- Modify: `src/ui/screens/RunOverview.tsx` (mount panel), `src/styles.css` (append styles)

- [ ] **Step 1: Write the failing test**

`src/ui/components/StrategyPanel.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import App from '../../App';
import { STORAGE_KEY, newRunState } from '../../run/runStore';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: newRunState('Red', 'White'), past: [], finished: [] }));
});
afterEach(cleanup);

it('shows open advice on a fresh run and commits after two flush jokers', async () => {
  render(<App />);
  expect(screen.getByText(/stay flexible/i)).toBeInTheDocument();
  await userEvent.type(screen.getByPlaceholderText('Add joker…'), 'droll');
  await userEvent.click(await screen.findByRole('button', { name: /Droll Joker/ }));
  await userEvent.type(screen.getByPlaceholderText('Add joker…'), 'crafty');
  await userEvent.click(await screen.findByRole('button', { name: /Crafty Joker/ }));
  expect(screen.getByText('Commit: Flush')).toBeInTheDocument();
  expect(screen.getByText(/Look for:/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ui/components/StrategyPanel.test.tsx`
Expected: FAIL — no "stay flexible" text anywhere.

- [ ] **Step 3: Write the component**

`src/ui/components/StrategyPanel.tsx`:

```tsx
import { adviseStrategy } from '../../engine/strategy';
import { useRun } from '../../run/RunContext';

const COMMITMENT_LABEL = { lean: 'Leaning', commit: 'Commit' } as const;

export default function StrategyPanel() {
  const { store } = useRun();
  const run = store.current!;
  const advice = adviseStrategy(run);
  const top = advice.candidates[0];

  return (
    <section className={`strategy strategy-${advice.commitment}`}>
      <div className="row spread">
        <strong>Strategy</strong>
        <span className={`commitment commitment-${advice.commitment}`}>
          {advice.commitment === 'open' ? 'Open — stay flexible' : `${COMMITMENT_LABEL[advice.commitment]}: ${top.name}`}
        </span>
      </div>
      {advice.commitment !== 'open' && top && (
        <>
          <ul className="strategy-reasons">
            {top.reasons.slice(0, 3).map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
          {top.watchlist.length > 0 && <p className="muted">Look for: {top.watchlist.slice(0, 4).join(', ')}</p>}
          {advice.candidates.length > 1 && (
            <details>
              <summary>Other options</summary>
              <ul className="strategy-reasons">
                {advice.candidates.slice(1).map(c => (
                  <li key={c.archetypeId}>
                    {c.name} ({c.score.toFixed(1)})
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Mount it in `src/ui/screens/RunOverview.tsx`**

Add the import and render it directly after the `<header>` row:

```tsx
import StrategyPanel from '../components/StrategyPanel';
```

```tsx
      </header>

      <StrategyPanel />
```

- [ ] **Step 5: Append styles to `src/styles.css`**

```css
.strategy {
  background: var(--panel);
  border-radius: var(--radius);
  border-left: 4px solid var(--muted);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.strategy-lean { border-left-color: var(--accent-2); }
.strategy-commit { border-left-color: var(--good); }
.commitment {
  font-size: 0.85rem;
  color: var(--muted);
  white-space: nowrap;
}
.commitment-lean { color: var(--accent-2); font-weight: 600; }
.commitment-commit { color: var(--good); font-weight: 600; }
.strategy-reasons {
  margin: 0;
  padding-left: 18px;
  color: var(--muted);
  font-size: 0.9rem;
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- src/ui/components/StrategyPanel.test.tsx`
Expected: PASS (1 test). Full `npm test` (expect 82) and `npm run build` — green. The RunOverview sell test and App smoke test must still pass (the panel adds no conflicting accessible names: "Strategy", "Open — stay flexible", "Other options").

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/StrategyPanel.tsx src/ui/components/StrategyPanel.test.tsx src/ui/screens/RunOverview.tsx src/styles.css
git commit -m "feat: strategy panel on the run screen"
```

---

### Task 5: README, verification, merge prep

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a feature bullet to README.md**

In the first paragraph section, after the sentence ending "…buy/sell/reroll/skip, vouchers, packs, and pack picks.", append this sentence to the same paragraph:

```
A strategy advisor on the run screen reads your jokers and deck, names the
build worth committing to (or honestly says "stay flexible"), and feeds the
recommended plan back into shop advice.
```

- [ ] **Step 2: Full verification**

Run: `npm test` — Expected: 82 passing.
Run: `npm run build` — Expected: clean.
Manual dev-server check (controller does the browser pass): start a Checkered run → panel shows "Leaning: Flush" immediately; add a flush joker → "Commit: Flush"; shop advice for a watchlist joker shows the plan reason.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: mention strategy advisor in README"
```

---

## Plan complete

5 tasks. After Task 5: merge to main per superpowers:finishing-a-development-branch (push to main auto-deploys via GitHub Actions).
