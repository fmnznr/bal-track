import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCENARIO_COUNT, buildBaseline, scenario } from './baseline';

// Resolved from the project root: under jsdom, import.meta.url is not a file URL.
const GOLDEN = resolve(process.cwd(), 'src/engine/__baseline__/engine-output.json');

describe('engine baseline', () => {
  it('produces the recorded output for every scenario', () => {
    const current = buildBaseline();

    if (process.env.UPDATE_BASELINE) {
      writeFileSync(GOLDEN, `${JSON.stringify(current, null, 1)}\n`);
      return;
    }

    const recorded = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    // Compared per scenario: a whole-file diff of 300 entries hides which ones moved.
    expect(current).toHaveLength(recorded.length);
    for (let i = 0; i < current.length; i += 1) {
      expect(current[i], `scenario ${i} — run 'npm run baseline:update' if intended`)
        .toEqual(recorded[i]);
    }
    // Three hundred full recommendation passes, each now simulating how often
    // its hand comes together: about five seconds alone, more beside the rest
    // of the suite, so the default five-second limit is not a measure of it.
  }, 30_000);

  it('generates the same scenarios on every machine', () => {
    // Guards the generator itself: if this drifts, every other diff is noise.
    const first = scenario(0);
    expect(first.run.deck).toBe(scenario(0).run.deck);
    expect(first.run.money).toBe(scenario(0).run.money);
    expect(scenario(7).shop.cards).toEqual(scenario(7).shop.cards);
  });

  it('covers a spread wide enough to be worth diffing', () => {
    const runs = Array.from({ length: SCENARIO_COUNT }, (_, i) => scenario(i));
    expect(new Set(runs.map(s => s.run.deck)).size).toBeGreaterThan(8);
    expect(new Set(runs.map(s => s.run.stake)).size).toBeGreaterThan(5);
    expect(runs.filter(s => s.run.jokers.length > 0).length).toBeGreaterThan(SCENARIO_COUNT / 2);
    expect(runs.filter(s => s.shop.cards.length > 0).length).toBeGreaterThan(SCENARIO_COUNT / 2);
    expect(runs.filter(s => s.run.primaryHand !== null).length).toBeGreaterThan(SCENARIO_COUNT / 4);
  });
});
