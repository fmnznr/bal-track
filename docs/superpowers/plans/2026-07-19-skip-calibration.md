# Skip Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Single task.

**Goal:** Make "Buy nothing" a serious contender: interest-growth bonus (phase-scaled), next-tier hint, Economy-plan bonus — strong buys still win.

**Spec:** `docs/superpowers/specs/2026-07-19-skip-calibration-design.md`

## Execution notes

Branch `feature/skip-calibration` off main. Baseline 82 tests. TDD. Commit trailer as usual.

### Task 1: Recalibrate evalSkip

**Files:** Modify `src/engine/recommend.ts`, `src/engine/recommend.test.ts`

- [ ] **Step 1: Append the failing tests** to `src/engine/recommend.test.ts`:

```ts
describe('recommend — skip calibration', () => {
  it('prefers banking over a mediocre buy early in the run', () => {
    const recs = recommend(
      run({ money: 13 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'droll-joker', edition: 'base', price: 6 }] }),
    );
    expect(recs[0].kind).toBe('skip');
    expect(recs[0].reasons.join(' ')).toMatch(/interest/i);
  });

  it('still buys a strong joker instead of banking', () => {
    const recs = recommend(
      run({ money: 13 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    expect(recs[0].kind).toBe('buy-joker');
  });

  it('names the exact amount missing to the next interest tier', () => {
    const recs = recommend(
      run({ money: 23 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 2 }] }),
    );
    const skip = recs.find(r => r.kind === 'skip');
    expect(skip?.reasons.join(' ')).toMatch(/Save \$2 more/);
  });

  it('boosts banking under an Economy plan', () => {
    const recs = recommend(
      run({ money: 20, jokers: owned('golden-joker', 'bull') }),
      shop({ cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 2 }] }),
    );
    const skip = recs.find(r => r.kind === 'skip');
    expect(skip?.reasons.join(' ')).toMatch(/Economy Start plan/);
  });
});
```

Run: `npm test -- src/engine/recommend.test.ts` → the 4 new tests FAIL, the 16 existing PASS.

- [ ] **Step 2: Replace `evalSkip` in `src/engine/recommend.ts`** with:

```ts
function evalSkip(run: RunState, bestBuy: number, phase: Phase, plan: StrategyCandidate | null): Recommendation {
  const cap = interestCapFor(run.vouchers);
  const earned = interest(run.money, cap);
  let score = 3 + Math.min(1, earned * 0.15);
  const reasons: string[] = [`Banking $${run.money} earns $${earned} interest per round`];
  const growthRoom = earned < cap;
  if (growthRoom && phase !== 'late') {
    score += phase === 'early' ? 1 : 0.5;
    reasons.push('Growing your interest pays off every remaining round');
  }
  const toNextTier = run.money >= 0 ? (5 - (run.money % 5)) % 5 : 0;
  if (growthRoom && toNextTier > 0 && toNextTier <= 2) {
    score += 0.5;
    reasons.push(`Save $${toNextTier} more to reach the next interest tier`);
  }
  if (plan?.archetypeId === 'economy') {
    score += 1;
    reasons.push(`Banking fits your recommended ${plan.name} plan`);
  }
  if (bestBuy >= 7) {
    score -= 1.5;
    reasons.push('But there is a strong buy available');
  } else if (bestBuy < 4) {
    reasons.push('Nothing in this shop is a clear upgrade');
  }
  return rec('skip', 'Buy nothing', score, reasons);
}
```

Update the call site in `recommend()` to `evalSkip(run, bestBuy, phase, plan)` (`phase` and `plan` already exist there). Nothing else changes.

- [ ] **Step 3: Verify.** `npm test -- src/engine/recommend.test.ts` → 20 passing. Full `npm test` → 86. `npm run build` → clean. Expected arithmetic: money 13 early → skip 3+0.3+1+0.5 = 4.8 vs droll 4.2 / blueprint 5.4; money 23 → toNextTier 2.

- [ ] **Step 4: Commit** `feat: eco-aware skip calibration with interest-growth and plan bonuses`
