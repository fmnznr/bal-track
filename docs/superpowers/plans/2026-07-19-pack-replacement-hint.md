# Pack Replacement Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Single task.

**Goal:** Pack picks with full joker slots name the weakest owned joker as the sell candidate, like the shop path already does.

**Spec:** `docs/superpowers/specs/2026-07-19-pack-replacement-hint-design.md`

## Execution notes

Branch `feature/pack-replacement-hint` off main. Baseline 88 tests. TDD. Usual commit trailer.

### Task 1: Shared weakest-owned helper + pack-pick hint

**Files:** Modify `src/engine/recommend.ts`, `src/engine/recommend.test.ts`

- [ ] **Step 1: Append the failing tests** to `src/engine/recommend.test.ts` (inside or after the `recommendPackPick` describe block, reusing the `run`/`owned` helpers):

```ts
describe('recommendPackPick — replacement hints', () => {
  it('names the weakest owned joker when a pack pick needs a slot', () => {
    const fullRun = run({
      ante: 4,
      jokers: owned('joker', 'droll-joker', 'crafty-joker', 'golden-joker', 'cavendish'),
    });
    const picks = recommendPackPick(fullRun, ['blueprint']);
    expect(picks[0].reasons.join(' ')).toMatch(/sell Joker .*to make room/);
  });

  it('warns without a sell target when no pack pick is worth a slot', () => {
    const fullRun = run({
      ante: 4,
      jokers: owned('droll-joker', 'crafty-joker', 'photograph', 'golden-joker', 'cavendish'),
    });
    const picks = recommendPackPick(fullRun, ['joker']);
    expect(picks[0].reasons.join(' ')).toMatch(/nothing is clearly worth selling/);
  });
});
```

Run: `npm test -- src/engine/recommend.test.ts` → the 2 new tests FAIL, all 22 existing PASS. (Verify with `/usr/bin/grep -rn "Careful:" src/` that no existing test asserts the old text.)

- [ ] **Step 2: Extract the helper in `src/engine/recommend.ts`.** Add above `evalShopCard`:

```ts
interface WeakestOwned {
  index: number;
  value: number;
  def: JokerDef;
  edition: Edition;
}

/** Weakest non-negative owned joker by current heuristic value, or null if none. */
function findWeakestOwned(run: RunState, phase: Phase, profile: ArchetypeProfile): WeakestOwned | null {
  let index = -1;
  let value = Infinity;
  run.jokers.forEach((owned, i) => {
    if (owned.edition === 'negative') return;
    const v = ownedJokerValue(run, i, phase, profile);
    if (v < value) {
      value = v;
      index = i;
    }
  });
  const owned = run.jokers[index];
  const def = owned ? getJoker(owned.jokerId) : undefined;
  if (!owned || !def) return null;
  return { index, value, def, edition: owned.edition };
}
```

(`JokerDef` needs adding to the type imports from `../types` if not present.)

- [ ] **Step 3: Use it in the slots-full branch of `evalShopCard`** — replace the inline `weakestIndex`/`weakestValue`/`weakest`/`weakestDef` computation with:

```ts
  const weakest = findWeakestOwned(run, phase, profile);
  if (weakest) {
    const refund = sellValue(weakest.def.cost, weakest.edition);
    const netEcon = economyNotes(run, slot.price - refund, 0.8);
    const netScore = rawScore - netEcon.penalty;
    if (netScore > weakest.value + 1) {
      return rec(
        'sell-and-buy',
        `Sell ${weakest.def.name}, buy ${def.name} ($${slot.price})`,
        netScore - weakest.value * 0.4,
        [
          ...baseReasons,
          ...netEcon.notes,
          `Slots full — ${weakest.def.name} is your weakest (${weakest.value.toFixed(1)} vs ${netScore.toFixed(1)})`,
          `Selling refunds $${refund}`,
        ],
        def.id,
      );
    }
  }
```

The fallback `return rec('buy-joker', …, Math.min(rawScore - econ.penalty, 2), …)` stays exactly as is. Reason strings and scores must not change — the existing sell-and-buy tests pin them.

- [ ] **Step 4: Use it in the joker branch of `recommendPackPick`** — replace the line
`if (usedJokerSlots(run) >= run.jokerSlots) reasons.push('Careful: your joker slots are full');` with:

```ts
      if (usedJokerSlots(run) >= run.jokerSlots) {
        const weakest = findWeakestOwned(run, phase, profile);
        if (weakest && score > weakest.value + 1) {
          reasons.push(`Slots full — sell ${weakest.def.name} (worth ${weakest.value.toFixed(1)}) to make room`);
        } else {
          reasons.push('Careful: your joker slots are full and nothing is clearly worth selling');
        }
      }
```

- [ ] **Step 5: Verify.** `npm test -- src/engine/recommend.test.ts` → 24 PASS. Full `npm test` → 90. `npm run build` → clean. Expected arithmetic (mid phase): first test — weakest is base `joker` at 3.2 (2 + 1.2 plus-mult), blueprint pick scores 9 > 4.2 → hint fires; second test — weakest is `golden-joker` at 5.0, base `joker` pick scores 2 < 6 → warning path.

- [ ] **Step 6: Commit** `feat: pack picks name the weakest joker to sell when slots are full`
