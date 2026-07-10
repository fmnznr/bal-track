import { getJoker } from '../catalog/catalog';
import type { HandType, RunState, SynergyTag } from '../types';

export interface ArchetypeProfile {
  counts: Map<SynergyTag, number>;
  /** Tags appearing on 2+ owned jokers, most frequent first. */
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
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
  return { counts, dominant };
}
