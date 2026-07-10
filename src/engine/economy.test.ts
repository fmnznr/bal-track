import { describe, expect, it } from 'vitest';
import { interest, interestCapFor, interestLost, sellValue } from './economy';

describe('interest', () => {
  it('earns $1 per full $5, capped at $5 by default', () => {
    expect(interest(0)).toBe(0);
    expect(interest(4)).toBe(0);
    expect(interest(24)).toBe(4);
    expect(interest(25)).toBe(5);
    expect(interest(60)).toBe(5);
  });
  it('respects a raised cap', () => {
    expect(interest(60, 10)).toBe(10);
    expect(interest(60, 20)).toBe(12);
  });
});

describe('interestCapFor', () => {
  it('is raised by Seed Money and Money Tree', () => {
    expect(interestCapFor([])).toBe(5);
    expect(interestCapFor(['seed-money'])).toBe(10);
    expect(interestCapFor(['seed-money', 'money-tree'])).toBe(20);
  });
});

describe('interestLost', () => {
  it('is the interest difference caused by a purchase', () => {
    expect(interestLost(24, 6)).toBe(1);
    expect(interestLost(30, 5)).toBe(0);
    expect(interestLost(40, 10)).toBe(0);
    expect(interestLost(25, 20)).toBe(4);
  });
});

describe('sellValue', () => {
  it('is half the cost, floored, minimum $1', () => {
    expect(sellValue(6, 'base')).toBe(3);
    expect(sellValue(2, 'base')).toBe(1);
    expect(sellValue(1, 'base')).toBe(1);
  });
  it('editions raise the sell value', () => {
    expect(sellValue(10, 'polychrome')).toBe(7);
    expect(sellValue(10, 'foil')).toBe(6);
  });
});
