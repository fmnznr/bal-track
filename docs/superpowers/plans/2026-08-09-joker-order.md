# Joker Order Advisory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the joker list a real play order — reorder arrows, rule-based position warnings, and a one-tap suggested order.

**Architecture:** Unchanged layering — reducer actions in `runStore.ts`, a pure `engine/jokerOrder.ts`, a presentational `JokerOrderPanel`, wiring in `RunOverview`.

**Spec:** `docs/superpowers/specs/2026-08-09-joker-order-design.md` (approved).

## Execution notes

- Branch `feature/joker-order` off current `main`. Baseline **125 tests**.
- TDD per task; commit trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Balatro facts this rests on: jokers trigger left→right; Blueprint copies the joker to its RIGHT; Brainstorm copies the LEFTMOST joker. Additive Mult applied before multiplicative yields a higher score, so `plus-mult` belongs left of `xmult`.

---

### Task 1: Reorder actions in the store

**Files:** Modify `src/run/runStore.ts`, `src/run/runStore.test.ts`

- [ ] **Step 1: Append the failing tests** to `src/run/runStore.test.ts`:

```ts
describe('joker order', () => {
  function withJokers(...ids: string[]) {
    let s = started();
    for (const id of ids) s = reduce(s, { type: 'ADD_JOKER', jokerId: id, edition: 'base' });
    return s;
  }
  const ids = (s: ReturnType<typeof started>) => s.current!.jokers.map(j => j.jokerId);

  it('moves a joker left and right', () => {
    let s = withJokers('joker', 'blueprint', 'baron');
    s = reduce(s, { type: 'MOVE_JOKER', index: 2, direction: 'left' });
    expect(ids(s)).toEqual(['joker', 'baron', 'blueprint']);
    s = reduce(s, { type: 'MOVE_JOKER', index: 0, direction: 'right' });
    expect(ids(s)).toEqual(['baron', 'joker', 'blueprint']);
  });

  it('ignores moves past the edges without an undo step', () => {
    let s = withJokers('joker', 'baron');
    const pastLen = s.past.length;
    s = reduce(s, { type: 'MOVE_JOKER', index: 0, direction: 'left' });
    s = reduce(s, { type: 'MOVE_JOKER', index: 1, direction: 'right' });
    s = reduce(s, { type: 'MOVE_JOKER', index: 7, direction: 'left' });
    expect(ids(s)).toEqual(['joker', 'baron']);
    expect(s.past.length).toBe(pastLen);
  });

  it('applies a full permutation in one undo step', () => {
    let s = withJokers('joker', 'blueprint', 'baron');
    const pastLen = s.past.length;
    s = reduce(s, { type: 'SET_JOKER_ORDER', order: [2, 0, 1] });
    expect(ids(s)).toEqual(['baron', 'joker', 'blueprint']);
    expect(s.past.length).toBe(pastLen + 1);
    s = reduce(s, { type: 'UNDO' });
    expect(ids(s)).toEqual(['joker', 'blueprint', 'baron']);
  });

  it('rejects anything that is not a permutation', () => {
    const s = withJokers('joker', 'blueprint', 'baron');
    for (const order of [[0, 1], [0, 1, 1], [0, 1, 3], [0, 1, -1]]) {
      expect(ids(reduce(s, { type: 'SET_JOKER_ORDER', order }))).toEqual(['joker', 'blueprint', 'baron']);
    }
  });
});
```

Run `npm test -- src/run/runStore.test.ts` → new tests FAIL (type errors count), existing PASS.

- [ ] **Step 2: Extend `src/run/runStore.ts`.** Add to the `RunAction` union:

```ts
  | { type: 'MOVE_JOKER'; index: number; direction: 'left' | 'right' }
  | { type: 'SET_JOKER_ORDER'; order: number[] }
```

Add these cases inside the main switch:

```ts
    case 'MOVE_JOKER': {
      const target = action.direction === 'left' ? action.index - 1 : action.index + 1;
      if (action.index < 0 || action.index >= run.jokers.length) return state;
      if (target < 0 || target >= run.jokers.length) return state;
      const jokers = [...run.jokers];
      [jokers[action.index], jokers[target]] = [jokers[target], jokers[action.index]];
      return push({ ...run, jokers });
    }
    case 'SET_JOKER_ORDER': {
      const { order } = action;
      const valid =
        order.length === run.jokers.length &&
        new Set(order).size === order.length &&
        order.every(i => Number.isInteger(i) && i >= 0 && i < run.jokers.length);
      if (!valid) return state;
      return push({ ...run, jokers: order.map(i => run.jokers[i]) });
    }
```

- [ ] **Step 3: Verify.** `npm test` → **129**; `npm run build` clean.

- [ ] **Step 4: Commit** `feat: joker reorder actions with permutation guard`

---

### Task 2: Order rules and suggestion engine

**Files:** Create `src/engine/jokerOrder.ts` + `src/engine/jokerOrder.test.ts`; Modify `src/engine/recommend.ts` (export one helper)

- [ ] **Step 1: Export the strength helper.** In `src/engine/recommend.ts` change `function ownedJokerValue(` to `export function ownedJokerValue(`. Nothing else in that file changes.

- [ ] **Step 2: Write the failing tests.** `src/engine/jokerOrder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { checkJokerOrder, suggestJokerOrder } from './jokerOrder';
import type { RunState } from '../types';

function runWith(...jokerIds: string[]): RunState {
  return {
    ...newRunState('Red', 'White'),
    ante: 4,
    jokers: jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const })),
  };
}
const codes = (run: RunState) => checkJokerOrder(run).map(i => i.code);

describe('checkJokerOrder', () => {
  it('is quiet for a well-ordered set', () => {
    expect(codes(runWith('joker', 'cavendish'))).toEqual([]);
    expect(codes(runWith('golden-joker'))).toEqual([]);
    expect(codes(runWith())).toEqual([]);
  });

  it('flags an xmult joker sitting left of a plus-mult joker', () => {
    const issues = checkJokerOrder(runWith('cavendish', 'joker'));
    expect(issues[0].code).toBe('xmult-before-plus-mult');
    expect(issues[0].message).toMatch(/Cavendish/);
    expect(issues[0].message).toMatch(/Joker/);
  });

  it('flags Blueprint in the rightmost slot', () => {
    expect(codes(runWith('baron', 'blueprint'))).toContain('blueprint-rightmost');
  });

  it('flags Blueprint copying a weaker joker than it could', () => {
    // joker (weak) is Blueprint's right neighbour, baron (strong) sits further right
    expect(codes(runWith('blueprint', 'joker', 'baron'))).toContain('blueprint-weak-target');
  });

  it('flags Brainstorm in the leftmost slot', () => {
    expect(codes(runWith('brainstorm', 'baron'))).toContain('brainstorm-leftmost');
  });

  it('flags Brainstorm copying a weaker joker than it could', () => {
    expect(codes(runWith('joker', 'baron', 'brainstorm'))).toContain('brainstorm-weak-target');
  });
});

describe('suggestJokerOrder', () => {
  it('returns null when the order is already fine', () => {
    expect(suggestJokerOrder(runWith('joker', 'cavendish'))).toBeNull();
    expect(suggestJokerOrder(runWith('golden-joker'))).toBeNull();
  });

  it('moves xmult jokers behind plus-mult jokers', () => {
    expect(suggestJokerOrder(runWith('cavendish', 'joker'))).toEqual([1, 0]);
  });

  it('keeps neutral jokers in their relative order', () => {
    // golden-joker and rocket are both neutral for ordering purposes
    const order = suggestJokerOrder(runWith('cavendish', 'golden-joker', 'rocket'));
    expect(order).toEqual([1, 2, 0]);
  });

  it('parks Blueprint left of the strongest joker', () => {
    const run = runWith('blueprint', 'joker', 'baron');
    const order = suggestJokerOrder(run)!;
    const names = order.map(i => run.jokers[i].jokerId);
    expect(names.indexOf('blueprint')).toBe(names.indexOf('baron') - 1);
  });

  it('puts the strongest joker leftmost and Brainstorm last', () => {
    const run = runWith('brainstorm', 'joker', 'baron');
    const order = suggestJokerOrder(run)!;
    const names = order.map(i => run.jokers[i].jokerId);
    expect(names[0]).toBe('baron');
    expect(names[names.length - 1]).toBe('brainstorm');
  });

  it('always returns a valid permutation', () => {
    const run = runWith('brainstorm', 'cavendish', 'joker', 'blueprint', 'baron');
    const order = suggestJokerOrder(run)!;
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
```

Run → FAIL (module missing).

- [ ] **Step 3: Create `src/engine/jokerOrder.ts`:**

```ts
import { getJoker } from '../catalog/catalog';
import { phaseForAnte } from '../types';
import type { RunState } from '../types';
import { detectArchetype } from './archetype';
import { ownedJokerValue } from './recommend';

export type OrderIssueCode =
  | 'xmult-before-plus-mult'
  | 'blueprint-rightmost'
  | 'blueprint-weak-target'
  | 'brainstorm-leftmost'
  | 'brainstorm-weak-target';

export interface OrderIssue {
  code: OrderIssueCode;
  message: string;
}

const BLUEPRINT = 'blueprint';
const BRAINSTORM = 'brainstorm';
const COPY_JOKERS = [BLUEPRINT, BRAINSTORM];

function nameAt(run: RunState, index: number): string {
  return getJoker(run.jokers[index]?.jokerId ?? '')?.name ?? 'Unknown joker';
}

/** Strength of every owned joker, index-aligned with run.jokers. */
function strengths(run: RunState): number[] {
  const phase = phaseForAnte(run.ante);
  const profile = detectArchetype(run);
  return run.jokers.map((_, i) => ownedJokerValue(run, i, phase, profile));
}

/** Index of the strongest joker among `candidates`, or -1. */
function strongestOf(candidates: number[], values: number[]): number {
  let best = -1;
  for (const i of candidates) {
    if (best === -1 || values[i] > values[best]) best = i;
  }
  return best;
}

function tagsAt(run: RunState, index: number): string[] {
  return getJoker(run.jokers[index]?.jokerId ?? '')?.tags ?? [];
}

/** Non-copy joker indices — the ones Blueprint/Brainstorm can meaningfully copy. */
function copyTargets(run: RunState): number[] {
  return run.jokers
    .map((owned, i) => ({ owned, i }))
    .filter(({ owned }) => !COPY_JOKERS.includes(owned.jokerId))
    .map(({ i }) => i);
}

export function checkJokerOrder(run: RunState): OrderIssue[] {
  const issues: OrderIssue[] = [];
  if (run.jokers.length < 2) return issues;
  const values = strengths(run);
  const targets = copyTargets(run);
  const strongest = strongestOf(targets, values);

  for (let i = 0; i < run.jokers.length; i++) {
    if (!tagsAt(run, i).includes('xmult')) continue;
    for (let j = i + 1; j < run.jokers.length; j++) {
      const later = tagsAt(run, j);
      if (later.includes('plus-mult') && !later.includes('xmult')) {
        issues.push({
          code: 'xmult-before-plus-mult',
          message: `${nameAt(run, i)} (xMult) sits left of ${nameAt(run, j)} (+Mult) — swap them so the Mult is added before it is multiplied`,
        });
        break;
      }
    }
  }

  const blueprint = run.jokers.findIndex(j => j.jokerId === BLUEPRINT);
  if (blueprint !== -1) {
    if (blueprint === run.jokers.length - 1) {
      issues.push({
        code: 'blueprint-rightmost',
        message: 'Blueprint is rightmost and copies nothing — move it left of the joker you want doubled',
      });
    } else if (strongest !== -1 && blueprint + 1 !== strongest && strongest !== blueprint) {
      issues.push({
        code: 'blueprint-weak-target',
        message: `Blueprint copies ${nameAt(run, blueprint + 1)} — ${nameAt(run, strongest)} would be the stronger target`,
      });
    }
  }

  const brainstorm = run.jokers.findIndex(j => j.jokerId === BRAINSTORM);
  if (brainstorm !== -1) {
    if (brainstorm === 0) {
      issues.push({
        code: 'brainstorm-leftmost',
        message: 'Brainstorm is leftmost and copies itself — move it right and put your strongest joker first',
      });
    } else if (strongest !== -1 && strongest !== 0) {
      issues.push({
        code: 'brainstorm-weak-target',
        message: `Brainstorm copies your leftmost joker (${nameAt(run, 0)}) — ${nameAt(run, strongest)} belongs in slot 1`,
      });
    }
  }

  return issues;
}

/** 0 = neutral, 1 = additive mult, 2 = multiplicative mult. */
function orderCategory(tags: string[]): number {
  if (tags.includes('xmult')) return 2;
  if (tags.includes('plus-mult')) return 1;
  return 0;
}

/**
 * A rule-conforming permutation of the current joker indices, or null when the
 * current order already satisfies every rule. Stable: jokers whose position is
 * mechanically irrelevant keep their relative order.
 */
export function suggestJokerOrder(run: RunState): number[] | null {
  if (run.jokers.length < 2) return null;
  const values = strengths(run);
  const rest = copyTargets(run)
    .map(i => ({ i, cat: orderCategory(tagsAt(run, i)) }))
    .sort((a, b) => a.cat - b.cat || a.i - b.i)
    .map(({ i }) => i);

  const hasBrainstorm = run.jokers.some(j => j.jokerId === BRAINSTORM);
  const hasBlueprint = run.jokers.some(j => j.jokerId === BLUEPRINT);

  if (hasBrainstorm && rest.length > 0) {
    const strongest = strongestOf(rest, values);
    rest.splice(rest.indexOf(strongest), 1);
    rest.unshift(strongest);
  }

  const result = [...rest];
  if (hasBlueprint) {
    const blueprintIndex = run.jokers.findIndex(j => j.jokerId === BLUEPRINT);
    // Slot 0 is reserved for Brainstorm's target, so aim at the best joker after it.
    const aimable = hasBrainstorm ? result.slice(1) : result;
    const target = strongestOf(aimable, values);
    const at = target === -1 ? result.length : result.indexOf(target);
    result.splice(at, 0, blueprintIndex);
  }
  if (hasBrainstorm) result.push(run.jokers.findIndex(j => j.jokerId === BRAINSTORM));

  const unchanged = result.every((idx, position) => idx === position);
  return unchanged ? null : result;
}
```

- [ ] **Step 4: Verify.** `npm test` → **142** (13 new); `npm run build` clean. If a suggestion test fails, check the hand-derivations: `cavendish` is xmult (cat 2), `joker` plus-mult (cat 1), `golden-joker`/`rocket` economy (cat 0), `baron` xmult and stronger than `joker` at ante 4. Never weaken a test — report BLOCKED with numbers instead.

- [ ] **Step 5: Commit** `feat: joker order rules and suggested ordering`

---

### Task 3: UI — reorder controls and order panel

**Files:** Create `src/ui/components/JokerOrderPanel.tsx`; Modify `src/ui/screens/RunOverview.tsx`, `src/ui/screens/RunOverview.test.tsx`, `src/styles.css`

- [ ] **Step 1: Append the failing UI tests** to `src/ui/screens/RunOverview.test.tsx`:

```tsx
it('reorders jokers with the arrow buttons', async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      current: {
        ...newRunState('Red', 'White'),
        ante: 4,
        jokers: [
          { jokerId: 'cavendish', edition: 'base' },
          { jokerId: 'joker', edition: 'base' },
        ],
      },
      past: [],
      finished: [],
    }),
  );
  render(<App />);
  expect(screen.getByText(/sits left of/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'move Cavendish right' }));
  expect(screen.queryByText(/sits left of/)).not.toBeInTheDocument();
  expect(screen.getByText(/Joker order looks good/)).toBeInTheDocument();
});

it('applies the suggested order in one tap', async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      current: {
        ...newRunState('Red', 'White'),
        ante: 4,
        jokers: [
          { jokerId: 'cavendish', edition: 'base' },
          { jokerId: 'joker', edition: 'base' },
        ],
      },
      past: [],
      finished: [],
    }),
  );
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Apply suggested order' }));
  expect(screen.getByText(/Joker order looks good/)).toBeInTheDocument();
});
```

Run → FAIL.

- [ ] **Step 2: Create `src/ui/components/JokerOrderPanel.tsx`:**

```tsx
import { checkJokerOrder, suggestJokerOrder } from '../../engine/jokerOrder';
import { useRun } from '../../run/RunContext';

export default function JokerOrderPanel() {
  const { store, dispatch } = useRun();
  const run = store.current!;
  if (run.jokers.length < 2) return null;
  const issues = checkJokerOrder(run);
  const suggestion = suggestJokerOrder(run);

  if (issues.length === 0) {
    return <p className="muted">Joker order looks good — jokers trigger left to right.</p>;
  }
  return (
    <div className="order-panel">
      <ul className="strategy-reasons">
        {issues.map((issue, i) => (
          <li key={i}>{issue.message}</li>
        ))}
      </ul>
      {suggestion && (
        <button onClick={() => dispatch({ type: 'SET_JOKER_ORDER', order: suggestion })}>
          Apply suggested order
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire `src/ui/screens/RunOverview.tsx`.** Import the panel (`import JokerOrderPanel from '../components/JokerOrderPanel';`). In the joker `<li>`, put the position number and the two arrows before the name span:

```tsx
              <span className="pos">{i + 1}</span>
              <button
                type="button"
                aria-label={`move ${def.name} left`}
                disabled={i === 0}
                onClick={() => dispatch({ type: 'MOVE_JOKER', index: i, direction: 'left' })}
              >
                ◀
              </button>
              <button
                type="button"
                aria-label={`move ${def.name} right`}
                disabled={i === run.jokers.length - 1}
                onClick={() => dispatch({ type: 'MOVE_JOKER', index: i, direction: 'right' })}
              >
                ▶
              </button>
              <span className="grow">{def.name}</span>
```

Render `<JokerOrderPanel />` directly after the closing `</ul>` of the joker list (before the "Add joker…" autocomplete).

- [ ] **Step 4: Append styles to `src/styles.css`:**

```css
.order-panel {
  background: var(--panel);
  border-radius: var(--radius);
  border-left: 4px solid var(--accent-2);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pos {
  color: var(--muted);
  font-size: 0.8rem;
  min-width: 1.2em;
}
```

- [ ] **Step 5: Verify.** `npm test` → **144**; `npm run build` clean. The joker rows now carry more buttons — if an existing joker-list test breaks on an ambiguous query, report DONE_WITH_CONCERNS with the failing assertion instead of patching it.

- [ ] **Step 6: Commit** `feat: joker reorder controls and order advisory panel`

---

### Task 4: README + verification

- [ ] **Step 1:** Append to the README feature paragraph:

```
It also checks your joker order — jokers trigger left to right — and can
apply a suggested ordering in one tap.
```

- [ ] **Step 2:** `npm test` → 144; `npm run build` → clean. Controller does the browser pass.

- [ ] **Step 3: Commit** `docs: mention joker order advisory in README`
