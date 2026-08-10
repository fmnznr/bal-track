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
