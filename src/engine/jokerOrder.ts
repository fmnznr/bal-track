import { getJoker } from '../catalog/catalog';
import type { Edition, RunState } from '../types';

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

function isCopyJoker(jokerId: string): boolean {
  return jokerId === BLUEPRINT || jokerId === BRAINSTORM;
}

function nameAt(run: RunState, index: number): string {
  return getJoker(run.jokers[index]?.jokerId ?? '')?.name ?? 'Unknown joker';
}

/** Editions score like the jokers they sit on: Polychrome multiplies, Holographic adds. */
const EDITION_CATEGORY: Record<Edition, number> = {
  base: 0,
  foil: 0,
  holographic: 1,
  polychrome: 2,
  negative: 0,
};

/** 0 = position-neutral, 1 = additive Mult, 2 = multiplicative Mult. */
function category(run: RunState, index: number): number {
  const owned = run.jokers[index];
  const def = owned ? getJoker(owned.jokerId) : undefined;
  if (!owned || !def) return 0;
  const byTag = def.tags.includes('xmult') ? 2 : def.tags.includes('plus-mult') ? 1 : 0;
  return Math.max(byTag, EDITION_CATEGORY[owned.edition]);
}

const SCORING_TAGS = ['xmult', 'plus-mult', 'chips', 'retrigger', 'scaling'];

/**
 * Whether copying this joker is worth anything. Copy jokers count — chaining
 * Blueprint and Brainstorm is a real strategy, not a mistake.
 */
function isScoringTarget(run: RunState, index: number): boolean {
  const owned = run.jokers[index];
  if (!owned) return false;
  if (isCopyJoker(owned.jokerId)) return true;
  if (owned.edition === 'polychrome' || owned.edition === 'holographic') return true;
  const def = getJoker(owned.jokerId);
  return def ? def.tags.some(t => SCORING_TAGS.includes(t)) : false;
}

function coreIndices(run: RunState): number[] {
  return run.jokers.map((_, i) => i).filter(i => !isCopyJoker(run.jokers[i].jokerId));
}

export function checkJokerOrder(run: RunState): OrderIssue[] {
  const issues: OrderIssue[] = [];
  const count = run.jokers.length;
  if (count < 2) return issues;

  const core = coreIndices(run);
  const hasRealTarget = core.some(i => isScoringTarget(run, i));

  const offenders: number[] = [];
  let blocked = -1;
  for (const i of core) {
    if (category(run, i) !== 2) continue;
    const later = core.find(j => j > i && category(run, j) === 1);
    if (later !== undefined) {
      offenders.push(i);
      if (blocked === -1) blocked = later;
    }
  }
  if (offenders.length > 0) {
    issues.push({
      code: 'xmult-before-plus-mult',
      message: `${offenders.map(i => nameAt(run, i)).join(', ')} (xMult) ${
        offenders.length === 1 ? 'sits' : 'sit'
      } left of ${nameAt(run, blocked)} (+Mult) — move the +Mult jokers left so Mult is added before it is multiplied`,
    });
  }

  run.jokers.forEach((owned, i) => {
    if (owned.jokerId !== BLUEPRINT) return;
    if (i === count - 1) {
      issues.push({
        code: 'blueprint-rightmost',
        message: `Blueprint in slot ${i + 1} is rightmost and copies nothing — move it left of the joker you want doubled`,
      });
    } else if (hasRealTarget && !isScoringTarget(run, i + 1)) {
      issues.push({
        code: 'blueprint-weak-target',
        message: `Blueprint copies ${nameAt(run, i + 1)}, which does not score — put it left of a scoring joker instead`,
      });
    }
  });

  const brainstorms = run.jokers.map((owned, i) => (owned.jokerId === BRAINSTORM ? i : -1)).filter(i => i !== -1);
  if (brainstorms.includes(0)) {
    issues.push({
      code: 'brainstorm-leftmost',
      message: 'Brainstorm is leftmost and copies itself — move it right so it copies a real joker',
    });
  } else if (brainstorms.length > 0 && hasRealTarget && !isScoringTarget(run, 0)) {
    issues.push({
      code: 'brainstorm-weak-target',
      message: `Brainstorm copies your leftmost joker (${nameAt(run, 0)}), which does not score — put a scoring joker in slot 1`,
    });
  }

  return issues;
}

/**
 * A rule-conforming permutation of the current joker indices, or null when the
 * current order is fine or cannot be improved. Stable: jokers whose position is
 * mechanically irrelevant keep their relative order.
 */
export function suggestJokerOrder(run: RunState): number[] | null {
  if (run.jokers.length < 2) return null;
  const before = checkJokerOrder(run).length;
  if (before === 0) return null;

  const all = run.jokers.map((_, i) => i);
  const blueprints = all.filter(i => run.jokers[i].jokerId === BLUEPRINT);
  const brainstorms = all.filter(i => run.jokers[i].jokerId === BRAINSTORM);
  const hasBrainstorm = brainstorms.length > 0;

  // Brainstorm copies the leftmost joker, so position-neutral jokers move to the
  // back when one is owned — that keeps a scoring joker in slot 1 without
  // disturbing the additive-before-multiplicative order.
  const rank = (i: number): number => {
    const c = category(run, i);
    return hasBrainstorm && c === 0 ? 3 : c;
  };
  const result = coreIndices(run).sort((a, b) => rank(a) - rank(b) || a - b);

  let insertAt = 0;
  for (let position = result.length - 1; position >= 0; position--) {
    if (isScoringTarget(run, result[position])) {
      insertAt = position;
      break;
    }
  }
  result.splice(insertAt, 0, ...blueprints);
  result.push(...brainstorms);

  if (result.every((index, position) => index === position)) return null;
  const reordered: RunState = { ...run, jokers: result.map(i => run.jokers[i]) };
  return checkJokerOrder(reordered).length < before ? result : null;
}
