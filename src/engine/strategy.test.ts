import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { adviseStrategy, COMMIT_THRESHOLD, LEAN_THRESHOLD } from './strategy';
import type { RunState } from '../types';

function runWith(deck: string, jokerIds: string[] = []): RunState {
  return { ...newRunState(deck, 'White'), jokers: jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const })) };
}

describe('adviseStrategy', () => {
  it('stays open on a fresh neutral run', () => {
    const advice = adviseStrategy(runWith('Red'));
    expect(advice.commitment).toBe('open');
    expect(advice.candidates).toHaveLength(3);
  });

  it('leans flush on an empty Checkered run because of the deck alone', () => {
    const advice = adviseStrategy(runWith('Checkered'));
    expect(advice.commitment).toBe('lean');
    expect(advice.candidates[0].archetypeId).toBe('flush');
    expect(advice.candidates[0].reasons.join(' ')).toMatch(/Checkered/);
  });

  it('commits to flush with one flush joker on Checkered', () => {
    const advice = adviseStrategy(runWith('Checkered', ['droll-joker']));
    expect(advice.commitment).toBe('commit');
    expect(advice.candidates[0].archetypeId).toBe('flush');
  });

  it('never offers face-cards on Abandoned, even when owning a face joker', () => {
    const advice = adviseStrategy(runWith('Abandoned', ['photograph']));
    expect(advice.candidates.some(c => c.archetypeId === 'face-cards')).toBe(false);
  });

  it('ranks flush above pairs with two flush jokers on a neutral deck', () => {
    const advice = adviseStrategy(runWith('Red', ['droll-joker', 'crafty-joker']));
    expect(advice.candidates[0].archetypeId).toBe('flush');
    expect(advice.commitment).toBe('commit');
  });

  it('lists only unowned key jokers on the watchlist', () => {
    const advice = adviseStrategy(runWith('Red', ['droll-joker', 'crafty-joker']));
    const watchlist = advice.candidates[0].watchlist;
    expect(watchlist).not.toContain('Droll Joker');
    expect(watchlist).not.toContain('Crafty Joker');
    expect(watchlist).toContain('Smeared Joker');
  });

  it('exposes sane thresholds', () => {
    expect(COMMIT_THRESHOLD).toBeGreaterThan(LEAN_THRESHOLD);
    expect(LEAN_THRESHOLD).toBeGreaterThan(0);
  });
});
