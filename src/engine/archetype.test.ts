import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { detectArchetype } from './archetype';
import type { RunState } from '../types';

function runWith(jokerIds: string[]): RunState {
  return { ...newRunState('Red', 'White'), jokers: jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const })) };
}

describe('detectArchetype', () => {
  it('finds no dominant tags on an empty run', () => {
    expect(detectArchetype(runWith([])).dominant).toEqual([]);
  });

  it('needs at least two jokers sharing a tag', () => {
    expect(detectArchetype(runWith(['droll-joker'])).dominant).toEqual([]);
  });

  it('detects a flush build from two flush-support jokers', () => {
    const profile = detectArchetype(runWith(['droll-joker', 'crafty-joker']));
    expect(profile.dominant).toContain('flush-support');
    expect(profile.counts.get('flush-support')).toBe(2);
  });
});
