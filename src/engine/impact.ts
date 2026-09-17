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
import { getConsumable, getJoker } from '../catalog/catalog';
import type {
  ConsumableDef, Edition, HandType, JokerDef, JokerStickers, Phase, RunState,
} from '../types';
import { detectArchetype, TAG_HAND_AFFINITY } from './archetype';
import type { ArchetypeProfile } from './archetype';
import { deckMultiplierForJoker } from './deckSignals';
import { playMultiplierForJoker } from './playSignals';
import { handLevelMultiplier, jokerScoreMultiplier, referenceHand } from './score';
import { TUNING } from './tuning';

export type Evidence = 'modeled' | 'partial' | 'heuristic';

export interface Impact {
  /** Estimated multiplier on the reference hand's score. 1 = changes nothing. */
  multiplier: number;
  evidence: Evidence;
  reasons: string[];
}

/**
 * Turns a curated 0-10 rating into an expected score multiplier.
 *
 * This is the single assumption the whole heuristic half of the model rests on:
 * a 10/10 joker is taken to be worth roughly `ratingTopMultiplier` times your
 * hand score, and ratings interpolate geometrically between that and 1. It is a
 * judgement call, but it is now *one* judgement call in a named place, rather
 * than fifty additive constants that only made sense relative to each other.
 */
export function priorFromRating(rating: number): number {
  const clamped = Math.min(10, Math.max(0, rating));
  return TUNING.prior.ratingTopMultiplier ** (clamped / 10);
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
 */
export function jokerImpact(
  run: RunState,
  def: JokerDef,
  edition: Edition,
  stickers: JokerStickers | undefined,
  ctx: JokerContext,
): Impact {
  const hand = referenceHand(run);
  const reasons: string[] = [];
  let multiplier: number;
  let evidence: Evidence;

  if (def.score) {
    // Blended rather than taken straight: see TUNING.prior.modelWeight for why a
    // marginal gain on the current board is not the whole story.
    const modelled = jokerScoreMultiplier(run, hand, def.score, edition);
    const prior = priorFromRating(def.rating[ctx.phase]) * jokerScoreMultiplier(run, hand, undefined, edition);
    const w = TUNING.prior.modelWeight;
    multiplier = modelled ** w * prior ** (1 - w);
    evidence = 'partial';
    reasons.push(
      `Modelled at ${formatMultiplier(modelled)} on your ${hand} right now,`
      + ` tempered by its ${def.rating[ctx.phase]}/10 rating over a full run`,
    );
  } else {
    const ability = priorFromRating(def.rating[ctx.phase]);
    const editionOnly = jokerScoreMultiplier(run, hand, undefined, edition);
    multiplier = ability * editionOnly;
    evidence = 'heuristic';
    reasons.push(`${def.rarity} joker rated ${def.rating[ctx.phase]}/10 at this stage — effect not modelled`);
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

  const sticker = stickerMultiplier(stickers);
  multiplier *= sticker.multiplier;
  reasons.push(...sticker.reasons);

  return { multiplier, evidence, reasons };
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

  return { multiplier: priorFromRating(def.rating), evidence: 'heuristic', reasons };
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
