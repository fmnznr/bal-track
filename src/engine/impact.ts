/**
 * One axis for every card: how much it multiplies your hand score.
 *
 * The old model added bonuses onto a curated 0-10 rating. That number had no
 * unit, so a "+1.5 for a flush-heavy deck" could not be compared against a
 * "+2 for levelling your hand", and every signal needed a ceiling to stop it
 * dominating. This replaces it with a quantity that means something: 1.4 says
 * the card is worth about 40% more hand score, and two signals compose by
 * multiplying instead of by racing each other upward.
 *
 * Where the effect is modelled, the multiplier is computed from the score model
 * and is as good as that model. Where it is not — 131 of 150 jokers, every tarot
 * and spectral — the curated rating supplies a prior, and the result is labelled
 * so the UI can say which kind of number the player is looking at.
 */
import { getBoss, getConsumable, getJoker } from '../catalog/catalog';
import type {
  ConsumableDef, Edition, HandType, JokerDef, JokerStickers, Phase, RunState,
} from '../types';
import { detectArchetype, TAG_HAND_AFFINITY } from './archetype';
import type { ArchetypeProfile } from './archetype';
import { deckMultiplierForJoker } from './deckSignals';
import { playMultiplierForJoker } from './playSignals';
import {
  asCandidate, boardOf, bossOutlook, candidateContribution, handLevelMultiplier, marginalMultiplier, ownedContribution,
  referenceHand, scoreTarget,
} from './score';
import { TUNING } from './tuning';

export type Evidence = 'modeled' | 'partial' | 'heuristic';

export interface Impact {
  /** Estimated multiplier on the reference hand's score. 1 = changes nothing. */
  multiplier: number;
  evidence: Evidence;
  reasons: string[];
}

/**
 * What a curated 0-10 rating is worth, in score.
 *
 * This is the single assumption the heuristic half of the model rests on: a
 * 10/10 joker contributes about `topShareOfTarget` of the blind the run is
 * building toward, and lower ratings fall away along `ratingCurve`.
 *
 * Crucially it returns a *contribution*, the same quantity the score model
 * produces, so the two can be blended and compared instead of living on
 * different scales. Making this marginal rather than absolute is what let
 * `modelWeight` rise from 0.3 to 0.7.
 */
export function priorContribution(run: RunState, rating: number): number {
  const clamped = Math.min(10, Math.max(0, rating)) / 10;
  return scoreTarget(run) * TUNING.prior.topShareOfTarget * clamped ** TUNING.prior.ratingCurve;
}

/** What a rating is worth as a multiplier on what the run is building toward. */
export function priorFromRating(run: RunState, hand: HandType, rating: number): number {
  return marginalMultiplier(run, hand, priorContribution(run, rating));
}

/** Multiplier for however many of the run's dominant tags a card shares. */
function synergyMultiplier(matches: number): number {
  return Math.min(TUNING.synergy.cap, TUNING.synergy.perMatchingTag ** matches);
}

/**
 * Stickers that cost flexibility. Rental is deliberately absent: its $3 a round
 * is money, and money is charged on the cost side where the number of rounds
 * left decides how much it actually hurts.
 */
function stickerMultiplier(stickers: JokerStickers | undefined): { multiplier: number; reasons: string[] } {
  let multiplier = 1;
  const reasons: string[] = [];
  if (stickers?.eternal) {
    multiplier *= TUNING.stickers.eternal;
    reasons.push('Eternal — cannot be sold or destroyed later');
  }
  if (stickers?.perishable) {
    multiplier *= TUNING.stickers.perishable;
    reasons.push('Perishable — debuffed after 5 rounds');
  }
  return { multiplier, reasons };
}

export interface JokerContext {
  phase: Phase;
  profile: ArchetypeProfile;
  /** The plan the advisor currently recommends, if it has committed to one. */
  plan?: {
    archetypeId: string;
    name: string;
    keyJokers: readonly string[];
    coreTags: readonly string[];
    hands: readonly HandType[];
  } | null;
}

/**
 * What owning this joker would do to your reference hand.
 *
 * The ability is modelled when the catalog knows its numbers and taken from the
 * rating prior otherwise; the edition is always modelled, because it is a flat
 * effect on the card. Everything after that — synergy, deck composition, how you
 * play, plan fit, stickers — multiplies onto it.
 *
 * `ownedIndex` judges a joker already on the board by what removing it would
 * cost, rather than by stacking a second copy on top of it.
 */
export function jokerImpact(
  run: RunState,
  def: JokerDef,
  edition: Edition,
  stickers: JokerStickers | undefined,
  ctx: JokerContext,
  ownedIndex?: number,
): Impact {
  const hand = referenceHand(run);
  const reasons: string[] = [];
  let multiplier: number;
  let evidence: Evidence;

  const contribution = (withAbility: boolean) => (ownedIndex !== undefined
    ? ownedContribution(run, hand, ownedIndex, withAbility)
    : candidateContribution(run, hand, asCandidate(def, edition, withAbility)));
  // The edition is a flat effect on the card, so it is always computed outright.
  const editionScore = contribution(false).score;
  const rating = def.rating[ctx.phase];
  const rated = priorContribution(run, rating);
  // A copy joker is worth what it will copy over the run, which today's board
  // does not show, so its rating decides. What it copies now is still stated.
  const copies = def.score?.copies !== undefined;
  const modelled = def.score ? contribution(true) : null;

  if (modelled?.modelled && !copies) {
    // Geometric, so a modelled contribution of zero carries through: a joker the
    // model knows cannot fire is not rescued by a good rating.
    const w = TUNING.prior.modelWeight;
    const blended = modelled.score ** w * rated ** (1 - w);
    multiplier = marginalMultiplier(run, hand, blended);
    evidence = 'partial';
    if (modelled.score > editionScore) {
      reasons.push(
        `Modelled at about ${Math.round(modelled.score).toLocaleString('en-US')} score on your ${hand},`
        + ` weighed against its ${rating}/10 rating over a full run`,
      );
    } else {
      reasons.push(`Adds nothing to your ${hand} as your deck and board stand`);
    }
  } else {
    multiplier = marginalMultiplier(run, hand, rated + editionScore);
    evidence = 'heuristic';
    if (copies) {
      reasons.push(`${def.rarity} joker rated ${rating}/10 at this stage — worth what it copies over the run`);
      if (modelled?.modelled && modelled.score > editionScore) {
        reasons.push(`Copying your board today adds about ${Math.round(modelled.score).toLocaleString('en-US')} score`);
      }
    } else {
      reasons.push(`${def.rarity} joker rated ${rating}/10 at this stage — effect not modelled`);
    }
  }
  if (edition !== 'base') reasons.push(`${edition} edition is a bonus`);

  const synMatches = def.tags.filter(t => ctx.profile.dominant.includes(t));
  if (synMatches.length > 0) {
    multiplier *= synergyMultiplier(synMatches.length);
    reasons.push(`Fits your build: ${synMatches.join(', ')}`);
  }

  const deck = deckMultiplierForJoker(def, run.deckProfile);
  multiplier *= deck.multiplier;
  reasons.push(...deck.reasons);

  const play = playMultiplierForJoker(def, run);
  multiplier *= play.multiplier;
  reasons.push(...play.reasons);

  if (ctx.plan) {
    if (ctx.plan.keyJokers.includes(def.id)) {
      multiplier *= TUNING.plan.keyJoker;
      reasons.push(`On the watchlist for your recommended ${ctx.plan.name} plan`);
    } else if (def.tags.some(t => ctx.plan!.coreTags.includes(t))) {
      multiplier *= TUNING.plan.coreTag;
      reasons.push(`Fits your recommended ${ctx.plan.name} plan`);
    }
  }

  reasons.push(...bossReasons(run, def));

  const sticker = stickerMultiplier(stickers);
  multiplier *= sticker.multiplier;
  reasons.push(...sticker.reasons);

  return { multiplier, evidence, reasons };
}

/** Jokers that switch the current boss off, for good or for one sale. */
const BOSS_DISABLERS: Record<string, string> = {
  chicot: 'Disables',
  luchador: 'Selling it disables',
};

/**
 * What a boss disabler is worth against the boss actually waiting this ante.
 * Context rather than a score change: the ranking judges the run a full ante
 * ahead, and this boss is gone after one round.
 */
function bossReasons(run: RunState, def: JokerDef): string[] {
  const verb = BOSS_DISABLERS[def.id];
  const boss = run.boss ? getBoss(run.boss) : undefined;
  if (!verb || !boss) return [];
  const board = boardOf(run);
  if (board.some(j => j.id === 'chicot')) return [];
  const now = bossOutlook(run, boss, board);
  const without = bossOutlook(run, boss, [...board, asCandidate(getJoker('chicot')!, 'base')]);
  const fmt = (n: number) => n.toLocaleString('en-US');
  return [
    `${verb} ${boss.name} (${boss.effect}): your hand scores ~${fmt(without.score)} against`
    + ` ${fmt(without.target)} instead of ~${fmt(now.score)} against ${fmt(now.target)}`,
  ];
}

/**
 * What using this consumable would do to your reference hand.
 *
 * A planet that levels the hand you actually play is computed exactly — that is
 * the one consumable effect the score model fully covers. Everything else falls
 * back to the rating prior.
 */
export function consumableImpact(
  run: RunState,
  def: ConsumableDef,
  ctx: Pick<JokerContext, 'profile' | 'plan'>,
): Impact {
  const hand = referenceHand(run);
  const reasons: string[] = [def.effect];

  if (def.kind === 'planet' && def.hand) {
    if (def.hand === hand) {
      const multiplier = handLevelMultiplier(run, hand, 1);
      reasons.push(`Levels ${def.hand}, the hand your estimate is built on`);
      return { multiplier, evidence: 'modeled', reasons };
    }
    // Levels a hand the current estimate is not about, so the gain lands only if
    // the player switches to it. Worth something when the build points that way.
    let multiplier = TUNING.planet.offReferenceHand;
    const wanted = ctx.profile.dominant.some(t => (TAG_HAND_AFFINITY[t] ?? []).includes(def.hand!));
    const planned = ctx.plan?.hands.includes(def.hand) ?? false;
    if (planned) {
      multiplier *= TUNING.planet.matchesPlan;
      reasons.push(`Levels ${def.hand} for your recommended ${ctx.plan!.name} plan`);
    }
    if (wanted) {
      multiplier *= TUNING.planet.matchesBuild;
      reasons.push(`Levels ${def.hand} — matches your build, though you play ${hand}`);
    }
    if (!planned && !wanted) {
      reasons.push(`Levels ${def.hand}, which is not the ${hand} your estimate is built on`);
    }
    const level = run.handLevels[def.hand] ?? 1;
    if (level > 1) {
      multiplier *= TUNING.planet.perExistingLevel ** (level - 1);
      reasons.push(`${def.hand} is already level ${level} — keep stacking it`);
    }
    return { multiplier, evidence: 'heuristic', reasons };
  }

  return { multiplier: priorFromRating(run, hand, def.rating), evidence: 'heuristic', reasons };
}

/** Impact of a card in a shop slot, resolved from the catalog. */
export function cardImpact(
  run: RunState,
  id: string,
  edition: Edition,
  stickers: JokerStickers | undefined,
  ctx: JokerContext,
): Impact | null {
  const joker = getJoker(id);
  if (joker) return jokerImpact(run, joker, edition, stickers, ctx);
  const consumable = getConsumable(id);
  if (consumable) return consumableImpact(run, consumable, ctx);
  return null;
}

/** "1.4x" / "+40%" style label for a multiplier, for use in reason strings. */
export function formatMultiplier(multiplier: number): string {
  if (multiplier >= 1) return `+${Math.round((multiplier - 1) * 100)}%`;
  return `−${Math.round((1 - multiplier) * 100)}%`;
}

/** Context every card in one shop shares, built once per call. */
export function contextFor(run: RunState, phase: Phase, plan: JokerContext['plan']): JokerContext {
  return { phase, profile: detectArchetype(run), plan };
}
