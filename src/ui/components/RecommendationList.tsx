import { formatMultiplier } from '../../engine/impact';
import type { Recommendation } from '../../types';

const EVIDENCE_LABEL: Record<Recommendation['evidence'], string> = {
  modeled: 'computed',
  partial: 'part computed',
  heuristic: 'rated',
};

/**
 * The numbers are the point: an estimated score change you can sanity-check
 * against your own reading of the board, and what it costs to get it.
 */
function meta(r: Recommendation): string {
  if (r.score === 0) return 'not available';
  // Buying nothing is the scale's zero point, so a percentage says nothing.
  if (r.kind === 'skip') return 'the baseline everything else is measured against';
  const parts = [`${formatMultiplier(r.impact)} score`];
  if (r.costDollars > 0) parts.push(`costs $${Math.round(r.costDollars)}`);
  parts.push(EVIDENCE_LABEL[r.evidence]);
  return parts.join(' · ');
}

export default function RecommendationList({ recs }: { recs: Recommendation[] }) {
  if (recs.length === 0) {
    return <p className="muted">Add shop items above to get advice.</p>;
  }
  return (
    <ol className="recs">
      {recs.map((r, i) => (
        <li key={i} className={`rec rec-${r.priority}${i === 0 ? ' rec-top' : ''}`}>
          <div className="rec-head">
            <strong>{r.action}</strong>
            <span className="rec-meta">{meta(r)}</span>
          </div>
          <ul>
            {r.reasons.map((why, j) => (
              <li key={j}>{why}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
