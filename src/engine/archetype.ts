import { getJoker } from '../catalog/catalog';
import type { HandType, RunState, SynergyTag } from '../types';
import { TUNING } from './tuning';

export interface ArchetypeProfile {
  counts: Map<SynergyTag, number>;
  /** Tags appearing on enough owned jokers to count, most frequent first. */
  dominant: SynergyTag[];
}

/** Which poker hands a build archetype cares about (for planet card advice). */
export const TAG_HAND_AFFINITY: Partial<Record<SynergyTag, HandType[]>> = {
  'flush-support': ['Flush', 'Flush House', 'Flush Five'],
  'straight-support': ['Straight', 'Straight Flush'],
  'pair-support': ['Pair', 'Two Pair', 'Three of a Kind', 'Full House', 'Four of a Kind'],
};

export function detectArchetype(run: RunState): ArchetypeProfile {
  const counts = new Map<SynergyTag, number>();
  for (const owned of run.jokers) {
    const def = getJoker(owned.jokerId);
    if (!def) continue;
    for (const tag of def.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const dominant = [...counts.entries()]
    .filter(([, n]) => n >= TUNING.synergy.dominantMinCount)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
  return { counts, dominant };
}
