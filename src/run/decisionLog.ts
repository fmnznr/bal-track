/**
 * A local record of what the advisor ranked and what the player did, so the
 * weights in `engine/tuning.ts` can one day be checked against real runs
 * instead of judgement alone.
 *
 * Each entry keeps the ranking as it stood, the option taken, and enough of the
 * run to read it back: ante, money, deck and stake. Entries carry the run's id,
 * so they join to the result once the run ends, and a fingerprint of the
 * tuning, so rankings made under different weights are not mixed up.
 *
 * Nothing leaves the device. The log is exported by hand, as JSON.
 */
import { TUNING } from '../engine/tuning';
import type { RecKind, Recommendation, RunState } from '../types';

export interface LoggedOption {
  kind: RecKind;
  refId?: string;
  /** Ranking value as shown, three decimals. */
  score: number;
}

export interface Decision {
  runId: string;
  at: string;
  context: 'shop' | 'pack';
  ante: number;
  money: number;
  deck: string;
  stake: string;
  /** The ranking, best first, trimmed to the options that mattered. */
  options: LoggedOption[];
  /** Index of the option taken in `options`, or -1 for none of them (a skipped pack). */
  chosen: number;
  /** Fingerprint of the tuning the ranking was made with. */
  model: string;
}

/** Options kept per decision. The chosen one is always kept, wherever it ranked. */
const KEPT_OPTIONS = 8;
/** Decisions kept in total; the oldest go first. About 100 runs of shopping. */
export const MAX_DECISIONS = 2000;

/** FNV-1a over the tuning, so a changed weight gives a new fingerprint. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const MODEL_FINGERPRINT = fingerprint(JSON.stringify(TUNING));

/**
 * One decision, from the ranking the player saw and the option they took.
 * `chosen` is an index into `recs`, or -1 when they took none of them.
 */
export function makeDecision(
  run: RunState,
  context: Decision['context'],
  recs: Recommendation[],
  chosen: number,
  at: Date = new Date(),
): Decision {
  const keep = recs.map((r, i) => ({ r, i })).filter(({ i }) => i < KEPT_OPTIONS || i === chosen);
  return {
    runId: run.id ?? 'unknown',
    at: at.toISOString(),
    context,
    ante: run.ante,
    money: run.money,
    deck: run.deck,
    stake: run.stake,
    options: keep.map(({ r }) => ({
      kind: r.kind,
      ...(r.refId ? { refId: r.refId } : {}),
      score: Math.round(r.score * 1000) / 1000,
    })),
    chosen: chosen < 0 ? -1 : keep.findIndex(({ i }) => i === chosen),
    model: MODEL_FINGERPRINT,
  };
}

export function appendDecision(log: Decision[], decision: Decision): Decision[] {
  return [...log, decision].slice(-MAX_DECISIONS);
}

/** Ending a run gives its decisions an outcome. */
export interface RunOutcome {
  runId?: string;
  result: 'won' | 'lost';
  ante: number;
}

export interface KindAgreement {
  kind: RecKind;
  /** Times the advisor ranked this kind first. */
  top: number;
  /** ...and the player took it. */
  followed: number;
  /** Times the player took this kind when something else was ranked first. */
  chosenInstead: number;
}

export interface LogSummary {
  decisions: number;
  /** Share of decisions where the top-ranked option was taken, 0-1. */
  followRate: number | null;
  /**
   * Average of the chosen option's score over the top option's, for decisions
   * that went against the advice: how much the model thinks was given up.
   */
  keptWhenDeviating: number | null;
  /** Follow rate in runs that ended won and lost, where known. */
  followRateWon: number | null;
  followRateLost: number | null;
  byKind: KindAgreement[];
}

function rate(values: boolean[]): number | null {
  return values.length === 0 ? null : values.filter(Boolean).length / values.length;
}

/**
 * The questions calibration starts from: how often the advice is followed,
 * whether following it goes with winning, and which kinds of action the
 * player keeps overruling — the likeliest weights to be wrong.
 */
export function summarize(log: Decision[], outcomes: RunOutcome[]): LogSummary {
  const ranked = log.filter(d => d.options.length > 0);
  const followed = ranked.map(d => d.chosen === 0);
  const resultOf = new Map(outcomes.filter(o => o.runId).map(o => [o.runId!, o.result]));

  const deviations = ranked.filter(d => d.chosen > 0 && d.options[0].score > 0);
  const kept = deviations.map(d => d.options[d.chosen].score / d.options[0].score);

  const kinds = new Map<RecKind, KindAgreement>();
  const entry = (kind: RecKind) => {
    let k = kinds.get(kind);
    if (!k) {
      k = { kind, top: 0, followed: 0, chosenInstead: 0 };
      kinds.set(kind, k);
    }
    return k;
  };
  for (const d of ranked) {
    const top = entry(d.options[0].kind);
    top.top += 1;
    if (d.chosen === 0) top.followed += 1;
    else if (d.chosen > 0) entry(d.options[d.chosen].kind).chosenInstead += 1;
  }

  return {
    decisions: log.length,
    followRate: rate(followed),
    keptWhenDeviating: kept.length === 0 ? null : kept.reduce((a, b) => a + b, 0) / kept.length,
    followRateWon: rate(ranked.filter(d => resultOf.get(d.runId) === 'won').map(d => d.chosen === 0)),
    followRateLost: rate(ranked.filter(d => resultOf.get(d.runId) === 'lost').map(d => d.chosen === 0)),
    byKind: [...kinds.values()].sort((a, b) => b.top + b.chosenInstead - (a.top + a.chosenInstead)),
  };
}

/** Everything an analysis needs, in one self-describing file. */
export function exportPayload(log: Decision[], outcomes: RunOutcome[], at: Date = new Date()) {
  return {
    app: 'bal-track',
    format: 1,
    exportedAt: at.toISOString(),
    model: MODEL_FINGERPRINT,
    tuning: TUNING,
    runs: outcomes,
    decisions: log,
  };
}
