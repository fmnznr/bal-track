import { describe, expect, it } from 'vitest';
import { newRunState } from './runStore';
import { MAX_DECISIONS, MODEL_FINGERPRINT, appendDecision, exportPayload, makeDecision, summarize } from './decisionLog';
import type { Decision } from './decisionLog';
import type { RecKind, Recommendation } from '../types';

function rec(kind: RecKind, score: number, refId?: string): Recommendation {
  return { kind, action: kind, score, impact: score, costDollars: 0, priority: 'low', evidence: 'heuristic', reasons: [], refId };
}

const run = { ...newRunState('Red', 'White'), id: 'run-1', money: 12, ante: 2 };
const recs = Array.from({ length: 12 }, (_, i) => rec('buy-joker', 3 - i * 0.2, `j${i}`));

describe('makeDecision', () => {
  it('records the ranking, the run and the model', () => {
    const d = makeDecision(run, 'shop', recs.slice(0, 3), 1, new Date('2026-09-01T00:00:00Z'));
    expect(d).toMatchObject({ runId: 'run-1', context: 'shop', ante: 2, money: 12, deck: 'Red', chosen: 1, model: MODEL_FINGERPRINT });
    expect(d.options[1]).toEqual({ kind: 'buy-joker', refId: 'j1', score: 2.8 });
  });

  it('keeps the chosen option even when it ranked far down', () => {
    const d = makeDecision(run, 'shop', recs, 11);
    expect(d.options).toHaveLength(9);
    expect(d.options[d.chosen].refId).toBe('j11');
  });

  it('caps the log, dropping the oldest', () => {
    let log: Decision[] = Array.from({ length: MAX_DECISIONS }, () => makeDecision(run, 'shop', recs, 0));
    log = appendDecision(log, makeDecision(run, 'pack', recs, 0));
    expect(log).toHaveLength(MAX_DECISIONS);
    expect(log[log.length - 1].context).toBe('pack');
  });
});

describe('summarize', () => {
  const ranking = [rec('buy-pack', 2), rec('skip', 1), rec('reroll', 0.5)];
  const won = { ...run, id: 'won' };
  const lost = { ...run, id: 'lost' };
  const log = [
    makeDecision(won, 'shop', ranking, 0),
    makeDecision(won, 'shop', ranking, 0),
    makeDecision(lost, 'shop', ranking, 1),
    makeDecision(lost, 'shop', ranking, 0),
  ];
  const summary = summarize(log, [{ runId: 'won', result: 'won', ante: 8 }, { runId: 'lost', result: 'lost', ante: 3 }]);

  it('says how often the top pick was taken, and in which runs', () => {
    expect(summary.followRate).toBe(0.75);
    expect(summary.followRateWon).toBe(1);
    expect(summary.followRateLost).toBe(0.5);
  });

  it('prices what going another way gave up, by the model', () => {
    expect(summary.keptWhenDeviating).toBe(0.5);
  });

  it('names the kinds the player overrules', () => {
    expect(summary.byKind).toEqual([
      { kind: 'buy-pack', top: 4, followed: 3, chosenInstead: 0 },
      { kind: 'skip', top: 0, followed: 0, chosenInstead: 1 },
    ]);
  });

  it('exports a self-describing file', () => {
    const payload = exportPayload(log, []);
    expect(payload).toMatchObject({ app: 'bal-track', format: 1, model: MODEL_FINGERPRINT });
    expect(payload.decisions).toHaveLength(4);
    expect(payload.tuning.economy.dollarsPerDoubling).toBeGreaterThan(0);
  });
});
