import archetypesJson from '../data/archetypes.json';
import deckStrategyJson from '../data/deckStrategy.json';
import { getJoker } from '../catalog/catalog';
import type { ArchetypeDef, DeckStrategyDef, RunState, StrategyAdvice, StrategyCandidate } from '../types';

export const archetypes = archetypesJson as unknown as ArchetypeDef[];
export const deckStrategies = deckStrategyJson as unknown as DeckStrategyDef[];

const archetypeById = new Map(archetypes.map(a => [a.id, a]));
const deckByName = new Map(deckStrategies.map(d => [d.deck, d]));

export function getArchetype(id: string): ArchetypeDef | undefined {
  return archetypeById.get(id);
}

/** Top score needed before the advisor commits to / leans toward a plan. */
export const COMMIT_THRESHOLD = 6;
export const LEAN_THRESHOLD = 3;

export function adviseStrategy(run: RunState): StrategyAdvice {
  const deck = deckByName.get(run.deck);
  const ownedIds = new Set(run.jokers.map(j => j.jokerId));
  const candidates: StrategyCandidate[] = [];

  for (const arch of archetypes) {
    if (deck?.excluded.includes(arch.id)) continue;

    let score = 0;
    const reasons: string[] = [];

    let tagHits = 0;
    for (const owned of run.jokers) {
      const def = getJoker(owned.jokerId);
      if (def?.tags.some(t => arch.coreTags.includes(t))) tagHits += 1;
    }
    const keyOwned = arch.keyJokers.filter(id => ownedIds.has(id)).length;
    score += tagHits * 2 + keyOwned * 1.5;
    if (tagHits > 0) reasons.push(`${tagHits} of your jokers support this direction`);
    if (keyOwned > 0) reasons.push(`You already own ${keyOwned} key joker${keyOwned > 1 ? 's' : ''}`);

    const boost = deck?.boosts[arch.id] ?? 0;
    if (boost !== 0) {
      score += boost;
      reasons.push(deck?.note ? `${run.deck} Deck: ${deck.note}` : `${run.deck} Deck favors this`);
    }

    const leveled = arch.hands.reduce((sum, hand) => sum + Math.max(0, run.handLevels[hand] - 1), 0);
    if (leveled > 0) {
      score += Math.min(3, leveled * 0.75);
      reasons.push('You already leveled the matching hands');
    }

    if (reasons.length === 0) reasons.push(arch.description);

    const watchlist = arch.keyJokers
      .filter(id => !ownedIds.has(id))
      .map(id => getJoker(id)?.name ?? id);

    candidates.push({ archetypeId: arch.id, name: arch.name, score, reasons, watchlist, hands: arch.hands });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0]?.score ?? 0;
  const commitment = top >= COMMIT_THRESHOLD ? 'commit' : top >= LEAN_THRESHOLD ? 'lean' : 'open';
  return { commitment, candidates: candidates.slice(0, 3) };
}
