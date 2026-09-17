/**
 * Every tunable weight the recommendation engine uses, in one place.
 *
 * These are project-owned heuristics, not game facts. Balatro's own rules —
 * interest tiers, sell values, blind targets, what an edition adds to a hand —
 * live in `gameRules.ts`, `economy.ts` and `score.ts` and are not tuning: they
 * are either right or wrong. The numbers here are judgement calls about how
 * desirable something is, and changing one shifts advice without making
 * anything factually incorrect.
 *
 * They share a single implicit unit: a 0–10 desirability scale anchored on the
 * curated `rating` in the catalog. That anchor is the weak point of the current
 * model — bonuses are added to a rating rather than derived from an expected
 * score, which is why several of them need an explicit ceiling to stop one
 * signal from dominating. Read every `cap` here as a symptom, not a design.
 *
 * Changing a value here changes advice, so scenario tests in `recommend.test.ts`
 * and `strategy.test.ts` are the place to prove the new behaviour is intended.
 */
export const TUNING = {
  /** Cutoffs that turn a raw score into the badge shown next to an action. */
  priority: {
    high: 7,
    medium: 4,
  },

  /**
   * How much an edition adds to a card's desirability. Not the same thing as
   * what it adds to a hand's score (see EDITION_CHIPS and friends in score.ts):
   * Negative scores nothing at all, but is rated highest because it does not
   * consume a joker slot.
   */
  edition: {
    base: 0,
    foil: 0.5,
    holographic: 0.8,
    polychrome: 1.5,
    negative: 2.5,
  },

  /** Owned jokers sharing a dominant tag with the card being judged. */
  synergy: {
    perMatchingTag: 1.2,
    cap: 3,
    /** Tags need this many owned jokers before they count as the run's direction. */
    dominantMinCount: 2,
  },

  /**
   * Penalties for buying a sticker. A shop copy is judged on what the sticker
   * costs you over the rest of the run; an owned copy is re-judged the same way
   * when looking for the weakest joker to sell.
   */
  stickers: {
    /** Cannot be sold later, so it occupies a slot permanently. */
    eternal: -0.4,
    /** Debuffed after 5 rounds. Remaining rounds are not tracked. */
    perishable: -1,
    /** Costs $3 every round. */
    rental: -1.5,
    owned: {
      /** Applied per dollar of upkeep, so a $3 rental costs 1.5. */
      rentalPerUpkeepDollar: 0.5,
      perishable: -1,
    },
  },

  /**
   * How hard a lost interest tier argues against a purchase, per dollar of
   * interest lost per round. Vouchers weigh least because they pay off for the
   * rest of the run; packs sit between vouchers and cards.
   */
  interestWeight: {
    card: 0.8,
    voucher: 0.5,
    pack: 0.6,
  },

  /** Planet cards, judged against the build rather than in isolation. */
  planet: {
    /** Levels a hand the run's dominant tags care about. */
    matchesBuild: 2,
    /** Per level already invested, rewarding a stacked hand. */
    perExistingLevel: 0.5,
    perExistingLevelCap: 2,
    /** Levels the hand the player declared they build around. */
    matchesPrimaryHand: 1.5,
    /** Levels a hand the recommended strategy plan wants. */
    matchesPlan: 1.5,
  },

  /** Bonuses for matching the strategy plan the advisor currently recommends. */
  plan: {
    /** The card is on the plan's watchlist of key jokers. */
    keyJoker: 1.2,
    /** The card merely shares a tag with the plan. */
    coreTag: 0.8,
    /** Banking money while the recommended plan is the economy build. */
    economySkip: 1,
  },

  /** Consequences of having no free slot for what is on offer. */
  slotsFull: {
    /** Buying a consumable with no consumable slot left. */
    consumable: -1,
    /**
     * A replacement must beat the joker it displaces by this much before
     * selling is advised, so a marginal upgrade does not churn the board.
     */
    sellAndBuyMargin: 1,
    /** The displaced joker's value still drags the suggestion down by this share. */
    sellAndBuyValueDrag: 0.4,
    /** Ceiling on a buy that fits nowhere and beats nothing worth selling. */
    blockedBuyCap: 2,
  },

  /**
   * How much the modelled score estimate may move a recommendation. It breaks
   * ties between cards the heuristics rate alike; it does not carry a card,
   * because only unconditional flat effects are modelled at all.
   */
  scoreEstimate: {
    /** Bonus is (delta / current score) x this factor, then capped. */
    relativeGainFactor: 2,
    cap: 2,
    /** Used instead when the current estimate is zero and a ratio is undefined. */
    fallbackWhenNoBaseline: 1,
  },

  voucher: {
    /** Late in the run there are fewer rounds left to profit from it. */
    latePenalty: -1.5,
  },

  reroll: {
    base: 1.5,
    /** Nothing on offer clears this, so fishing for a better shop is reasonable. */
    weakShopThreshold: 4,
    weakShopBonus: 2.5,
    /** The reroll does not cost an interest tier. */
    freeOfInterestBonus: 1,
  },

  skip: {
    base: 3,
    /** Per dollar of interest currently earned. */
    perInterestDollar: 0.15,
    perInterestDollarCap: 1,
    /** Room left below the interest cap, so saving still compounds. */
    growthRoom: { early: 1, mid: 0.5 },
    /** Within this many dollars of the next $5 interest tier. */
    nearNextTierWithin: 2,
    nearNextTierBonus: 0.5,
    /** A buy this strong argues against banking instead. */
    strongBuyThreshold: 5,
    strongBuyPenalty: -1.5,
    /** Below this, the shop is called out as offering no clear upgrade. */
    weakShopThreshold: 4,
  },

  /** Adjustments from what the deck is actually made of. */
  deck: {
    suit: {
      /** Share of the deck below which a suit-dependent joker is a bad bet. */
      scarceBelow: 0.15,
      scarcePenalty: -2,
      /** Share above which it is actively good. A joker naming two suits needs more. */
      abundantAboveSingle: 0.4,
      abundantAboveMulti: 0.7,
      abundantBonus: 1.5,
      /** Hard ceiling when the deck holds none of the suit at all. */
      noneCap: 1,
    },
    face: {
      scarceBelow: 0.15,
      scarcePenalty: -1.5,
      abundantAbove: 0.3,
      abundantBonus: 1,
      noneCap: 1,
    },
    enhanced: {
      /** Steel Joker and Glass Joker scale with their matching enhanced cards. */
      perMatchingCard: 0.5,
      perMatchingCardCap: 3,
      noneYetPenalty: -1,
      /** Driver's License needs 16 enhanced cards before it does anything. */
      driversLicenseRequirement: 16,
      driversLicenseLive: 3,
      driversLicenseDead: -2,
    },
  },

  /**
   * Signals from how the player says they play. Coarse by design: a declared
   * hand states intent, it does not say how often that hand was played. See
   * docs/superpowers/specs/2026-09-17-primary-hand-design.md.
   */
  play: {
    /** Supernova scales with repeat plays of one hand. */
    consistentHandBonus: 1,
    /** Obelisk wants the opposite and is hurt by a committed build. */
    varietyJokerPenalty: -1.5,
    /** Baseline discards per round that Banner and friends are judged against. */
    baselineDiscardsPerRound: 3,
    perExtraDiscard: 0.5,
  },

  /** Weights deciding which build the advisor recommends. */
  strategy: {
    /** Top candidate score needed to commit to a plan, or merely lean toward one. */
    commitThreshold: 6,
    leanThreshold: 3,
    /** Per owned joker carrying one of the archetype's core tags. */
    perTagHit: 2,
    /** Per owned joker on the archetype's key list. */
    perKeyJokerOwned: 1.5,
    /** The declared hand is one the archetype builds toward. */
    declaredHandMatch: 3,
    /** Per level already invested in the archetype's hands. */
    perLevelInvested: 0.75,
    perLevelInvestedCap: 3,
    /** A flush plan is worth more when one suit already dominates the deck. */
    flushSuitShareAbove: 0.4,
    flushSuitShareBonus: 1.5,
  },
} as const;
