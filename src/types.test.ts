import { describe, expect, it } from 'vitest';
import { HAND_TYPES, SYNERGY_TAGS, phaseForAnte } from './types';

describe('phaseForAnte', () => {
  it('maps antes to game phases', () => {
    expect(phaseForAnte(1)).toBe('early');
    expect(phaseForAnte(2)).toBe('early');
    expect(phaseForAnte(3)).toBe('mid');
    expect(phaseForAnte(5)).toBe('mid');
    expect(phaseForAnte(6)).toBe('late');
    expect(phaseForAnte(8)).toBe('late');
  });
});

describe('constants', () => {
  it('lists all 12 poker hands', () => {
    expect(HAND_TYPES).toHaveLength(12);
  });
  it('defines the synergy tag vocabulary', () => {
    expect(SYNERGY_TAGS).toContain('xmult');
    expect(SYNERGY_TAGS).toContain('flush-support');
  });
});
