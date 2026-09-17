/**
 * Runtime shapes for the catalog JSON.
 *
 * The engine reads these files through `as unknown as` casts, which assert a
 * shape rather than checking one: a typo in jokers.json compiled fine and only
 * showed up as a joker that silently scored nothing. These schemas close that
 * gap from both sides.
 *
 * - `npm run validate:catalog` parses every file and fails the build if the data
 *   drifts from the schema.
 * - The type assertions at the bottom fail `tsc` if a schema drifts from the
 *   hand-written type in `types.ts` that the engine actually consumes.
 *
 * Zod is a devDependency and only ever imported by this module and its test, so
 * none of it reaches the shipped bundle.
 */
import { z } from 'zod';
import { ENHANCEMENT_TYPES, HAND_TYPES, SUITS, SYNERGY_TAGS } from '../types';
import type {
  ArchetypeDef, ConsumableDef, DeckStrategyDef, HandValueDef, JokerDef, PackDef, VoucherDef,
} from '../types';

const id = z.string().min(1).regex(/^[a-z0-9-]+$/, 'ids are lowercase kebab-case');
const rating = z.number().min(0).max(10);
const phaseRating = z.object({ early: rating, mid: rating, late: rating }).strict();
const handType = z.enum(HAND_TYPES);
const suit = z.enum(SUITS);

const contribution = {
  chips: z.number().positive().optional(),
  mult: z.number().positive().optional(),
  xmult: z.number().positive().optional(),
};

const cardMatch = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('suit'), suit }).strict(),
  z.object({ kind: z.literal('face') }).strict(),
  z.object({ kind: z.literal('rank'), ranks: z.number().int().min(1).max(13) }).strict(),
]);

const runCount = z.enum([
  'emptyJokerSlots', 'jokers', 'discardsPerRound', 'deckSize',
  'cardsRemovedFromDeck', 'money', 'steelCards', 'stoneCards',
]);

const jokerScore = z.object({
  ...contribution,
  requiresHand: handType.optional(),
  perCard: z.object({ ...contribution, match: cardMatch }).strict().optional(),
  perCount: z.object({ ...contribution, of: runCount }).strict().optional(),
}).strict().refine(
  s => s.chips !== undefined || s.mult !== undefined || s.xmult !== undefined
    || s.perCard !== undefined || s.perCount !== undefined,
  'a score model that contributes nothing should be left off entirely',
);

export const jokerSchema = z.object({
  id,
  name: z.string().min(1),
  cost: z.number().int().positive(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'legendary']),
  effect: z.string().min(1),
  rating: phaseRating,
  tags: z.array(z.enum(SYNERGY_TAGS)).nonempty(),
  score: jokerScore.optional(),
}).strict();

export const voucherSchema = z.object({
  id,
  name: z.string().min(1),
  cost: z.number().int().positive(),
  effect: z.string().min(1),
  rating,
  requires: id.optional(),
}).strict();

export const consumableSchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(['tarot', 'planet', 'spectral']),
  cost: z.number().int().nonnegative(),
  effect: z.string().min(1),
  rating,
  hand: handType.optional(),
}).strict().refine(
  c => (c.kind === 'planet') === (c.hand !== undefined),
  'planets name the hand they level, and nothing else does',
);

export const packSchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(['standard', 'arcana', 'celestial', 'buffoon', 'spectral']),
  size: z.enum(['normal', 'jumbo', 'mega']),
  cost: z.number().int().positive(),
  options: z.number().int().positive(),
  picks: z.number().int().positive(),
  rating: phaseRating,
}).strict().refine(p => p.picks <= p.options, 'you cannot pick more cards than a pack shows');

export const handValueSchema = z.object({
  hand: handType,
  baseChips: z.number().positive(),
  baseMult: z.number().positive(),
  chipsPerLevel: z.number().nonnegative(),
  multPerLevel: z.number().nonnegative(),
  scoringCards: z.number().int().min(1).max(5),
}).strict();

export const archetypeSchema = z.object({
  id,
  name: z.string().min(1),
  description: z.string().min(1),
  coreTags: z.array(z.enum(SYNERGY_TAGS)).nonempty(),
  keyJokers: z.array(id),
  hands: z.array(handType),
}).strict();

export const deckStrategySchema = z.object({
  deck: z.string().min(1),
  boosts: z.record(id, z.number()),
  excluded: z.array(id),
  note: z.string().optional(),
}).strict();

export const blindsSchema = z.object({
  anteBase: z.array(z.number().positive()).length(9),
  greenStakeAnteBase: z.array(z.number().positive()).length(9),
  purpleStakeAnteBase: z.array(z.number().positive()).length(9),
  multipliers: z.object({
    small: z.number().positive(),
    big: z.number().positive(),
    boss: z.number().positive(),
  }).strict(),
}).strict();

export const metaSchema = z.object({
  balatroVersion: z.string().min(1),
  source: z.string().min(1),
  updated: z.string().min(1),
}).partial().passthrough();

export const enhancementTypes = z.enum(ENHANCEMENT_TYPES);

/**
 * Compile-time proof that each schema still describes what the engine consumes.
 *
 * The check lives in the generic constraint, not in the alias body: a type that
 * merely evaluates to `never` is still a valid type and compiles quietly, so an
 * alias like `Schema extends Target ? true : never` proves nothing. Violating a
 * constraint is what makes `tsc` fail.
 */
type AssertAssignable<Actual extends Expected, Expected> = Actual;

export type SchemaMatchesEngineTypes = [
  AssertAssignable<z.infer<typeof jokerSchema>, JokerDef>,
  AssertAssignable<z.infer<typeof voucherSchema>, VoucherDef>,
  AssertAssignable<z.infer<typeof consumableSchema>, ConsumableDef>,
  AssertAssignable<z.infer<typeof packSchema>, PackDef>,
  AssertAssignable<z.infer<typeof handValueSchema>, HandValueDef>,
  AssertAssignable<z.infer<typeof archetypeSchema>, ArchetypeDef>,
  AssertAssignable<z.infer<typeof deckStrategySchema>, DeckStrategyDef>,
];
