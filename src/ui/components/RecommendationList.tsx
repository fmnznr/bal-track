import type { Recommendation } from '../../types';

export default function RecommendationList({ recs }: { recs: Recommendation[] }) {
  if (recs.length === 0) {
    return <p className="muted">Add shop items above to get advice.</p>;
  }
  return (
    <ol className="recs">
      {recs.map((r, i) => (
        <li key={i} className={`rec rec-${r.confidence}${i === 0 ? ' rec-top' : ''}`}>
          <div className="rec-head">
            <strong>{r.action}</strong>
            <span className="rec-meta">
              {r.score.toFixed(1)} · {r.confidence}
            </span>
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
