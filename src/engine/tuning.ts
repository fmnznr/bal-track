/**
 * Every tunable weight the recommendation engine uses, in one place.
 *
 * These are project-owned heuristics, not game facts. Balatro's own rules —
 * interest tiers, sell values, blind targets, what an edition adds to a hand —
 * live in `gameRules.ts`, `economy.ts` and `score.ts` and are not tuning: they
 * are either right or wrong. The numbers here are judgement calls, and changing
 * one shifts advice without making anything factually incorrect.
 *
 * Everything on the card side is a **multiplier on your hand score**, composed
 * by multiplication. 1 changes nothing, 1.2 is "about a fifth more score", 0.8
 * is "about a fifth less". That is why almost no ceilings remain: signals that
 * compose multiplicatively cannot run away from each other the way additive
 * points on an unnamed 0-10 scale could.
 *
 * Costs are kept in dollars until the last step, then converted once through
 * `economy.dollarsPerDoubling`. That exchange rate is the one place money and
 * score meet, and it is a judgement call stated out loud rather than smeared
 * across a dozen penalty constants.
 *
 * Changing a value here changes advice, so the scenario tests and the engine
 * baseline (`npm run baseline:update`) are where a change is reviewed.
 */
export const TUNING = {
  /**
   * Cutoffs that turn a net multiplier into the badge shown next to an action.
   * Buying nothing is exactly 1.0, so anything below that is worse than sitting
   * on your money.
   */
  priority: {
    high: 1.5,
    medium: 1.1,
  },

  prior: {
    /**
     * Share of the blind target a 10/10 joker is assumed to contribute on its
     * own. This is what the catalog rating is worth, expressed in the same
     * units the score model works in, so the two can be compared at all.
     */
    topShareOfTarget: 0.8,
    /**
     * Curve applied to the 0-10 rating. Above 1, top-rated jokers pull further
     * ahead of merely good ones, which matches how Balatro actually plays:
     * the gap between a 9 and a 7 is wider than between a 5 and a 3.
     */
    ratingCurve: 1.5,
    /**
     * How many antes ahead the run is judged against. Zero would measure cards
     * against the blind in front of you, which is losing play — targets grow by
     * roughly 2.5x per ante, so a board that only just clears today is behind.
     */
    lookaheadAntes: 1,
    /**
     * Floor under the baseline a contribution is measured against, as a share of
     * the target.
     *
     * Without it, a bare board scoring 12 against a 600 blind makes every card a
     * miracle: +4 Mult divided by 12 reads as "+400%" for a card nowhere near
     * enough to win. Boards far below the target are all equally losing, so what
     * matters there is how much a card adds, not what it multiplies near-zero by.
     */
    minBaselineShare: 0.25,
    /**
     * How far to trust the score model over the catalog rating, as the exponent
     * in a geometric blend of the two *contributions*.
     *
     * Both halves now estimate the same quantity — absolute score added, against
     * the same baseline — so this is no longer reconciling incompatible scales.
     * It weighs an exact but narrow estimate (the model covers a joker's
     * unconditional part only) against a broad but vague one (the rating covers
     * the whole card, including what it is worth over a run).
     *
     * Because the blend is geometric, a modelled contribution of zero carries
     * through: a joker the model knows cannot fire is not rescued by its rating.
     */
    modelWeight: 0.7,
  },

  /** Owned jokers sharing a dominant tag with the card being judged. */
  synergy: {
    perMatchingTag: 1.12,
    cap: 1.45,
    /** Tags need this many owned jokers before they count as the run's direction. */
    dominantMinCount: 2,
  },

  /**
   * Stickers that cost flexibility rather than money. Rental is absent on
   * purpose: its $3 per round is a real cost and is charged in dollars, where
   * it correctly matters less the later the run gets.
   */
  stickers: {
    eternal: 0.96,
    perishable: 0.88,
  },

  /** Matching the strategy plan the advisor currently recommends. */
  plan: {
    keyJoker: 1.15,
    coreTag: 1.08,
  },

  planet: {
    /**
     * Levelling a hand the estimate is not built on. The gain is real but only
     * lands if the player switches to that hand.
     */
    offReferenceHand: 1.05,
    /** ...and the build already points that way. */
    matchesBuild: 1.25,
    /** ...or the strategy plan the advisor recommends wants that hand. */
    matchesPlan: 1.3,
    /** Per level already invested, rewarding a stacked hand. */
    perExistingLevel: 1.06,
  },

  /** Adjustments from what the deck is actually made of. */
  deck: {
    suit: {
      /** The deck holds none of the suit, so the joker is close to dead weight. */
      none: 0.3,
      /** Share of the deck below which it is a bad bet. */
      scarceBelow: 0.15,
      scarce: 0.6,
      /** Share above which it is actively good. A joker naming two suits needs more. */
      abundantAboveSingle: 0.4,
      abundantAboveMulti: 0.7,
      abundant: 1.25,
    },
    face: {
      none: 0.3,
      scarceBelow: 0.15,
      scarce: 0.7,
      abundantAbove: 0.3,
      abundant: 1.15,
    },
    enhanced: {
      /** Steel Joker and Glass Joker scale with their matching enhanced cards. */
      perMatchingCard: 1.08,
      cap: 1.6,
      noneYet: 0.7,
      /** Driver's License does nothing at all below its threshold. */
      driversLicenseRequirement: 16,
      driversLicenseLive: 1.5,
      driversLicenseDead: 0.55,
    },
  },

  /**
   * Signals from how the player says they play. Coarse by design: a declared
   * hand states intent, it does not say how often that hand was played. See
   * docs/superpowers/specs/2026-09-17-primary-hand-design.md.
   */
  play: {
    /** Supernova scales with repeat plays of one hand. */
    consistentHand: 1.12,
    /** Obelisk wants the opposite and is hurt by a committed build. */
    varietyJoker: 0.85,
    /** Baseline discards per round that Banner and friends are judged against. */
    baselineDiscardsPerRound: 3,
    perExtraDiscard: 1.06,
  },

  economy: {
    /**
     * The exchange rate between money and score: giving up this many dollars
     * costs about as much as halving your hand score.
     *
     * Lower it and the advisor hoards; raise it and it spends freely. Everything
     * that used to be a per-case "interest penalty" weight is now this one
     * number applied to honestly-counted dollars.
     */
    dollarsPerDoubling: 25,
    /**
     * How long a dented bankroll stays dented.
     *
     * Spending drops you an interest tier, but you earn through the next blinds
     * and climb back, so the loss is transient. Charging it for every remaining
     * round instead would price a $10 buy at ante 1 as if the money were gone
     * forever — it made a $10 joker cost $58 and nothing ever looked worth
     * buying. Recurring costs that genuinely never stop, like rental upkeep,
     * are charged against the real rounds remaining.
     */
    interestRecoveryRounds: 2,
    /** Blinds per ante, for turning "antes left" into "rounds left". */
    roundsPerAnte: 3,
    /** Antes in a standard run, used to judge how long a voucher has to pay off. */
    antesPerRun: 8,
  },

  reroll: {
    /**
     * What a reroll is expected to be worth, **after** paying for whatever it
     * turns up. That "after" matters: a reroll does not hand you a card, it
     * hands you the chance to buy one, so pricing it at a typical card's gross
     * multiplier would have it outrank most real purchases.
     *
     * Kept deliberately modest, so a shop already holding something good
     * outranks rerolling without needing a rule that says so.
     */
    expectedNetGain: 1.12,
  },

  slots: {
    /** A buy that fits nowhere and beats nothing worth selling is not available. */
    blockedPenalty: 0.5,
    /**
     * How much better a replacement must be than the joker it displaces before
     * selling is advised, so a marginal upgrade does not churn the board.
     */
    sellAndBuyMargin: 1.15,
  },

  /**
   * Which build the advisor recommends. This is a separate ranking among
   * archetypes, not a score multiplier, so it keeps its own additive scale.
   */
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
