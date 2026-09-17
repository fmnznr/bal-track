import { formatMultiplier } from '../../engine/impact';
import { useT } from '../../i18n/I18nContext';
import type { Translate } from '../../i18n/I18nContext';
import type { PhraseKey } from '../../i18n/dictionary';
import type { Recommendation } from '../../types';

const EVIDENCE_KEY = {
  modeled: 'evidenceModeled',
  partial: 'evidencePartial',
  heuristic: 'evidenceHeuristic',
} as const satisfies Record<Recommendation['evidence'], PhraseKey>;

/**
 * The numbers are the point: an estimated score change you can sanity-check
 * against your own reading of the board, and what it costs to get it.
 */
function meta(r: Recommendation, t: Translate): string {
  if (r.score === 0) return t('notAvailable');
  // Buying nothing is the scale's zero point, so a percentage says nothing.
  if (r.kind === 'skip') return t('baselineNote');
  const parts = [`${formatMultiplier(r.impact)} ${t('scoreSuffix')}`];
  if (r.costDollars > 0) parts.push(`${t('costs')} $${Math.round(r.costDollars)}`);
  parts.push(t(EVIDENCE_KEY[r.evidence]));
  return parts.join(' · ');
}

export default function RecommendationList({ recs }: { recs: Recommendation[] }) {
  const t = useT();
  if (recs.length === 0) {
    return <p className="muted">{t('adviceEmpty')}</p>;
  }
  return (
    <ol className="recs">
      {recs.map((r, i) => (
        <li key={i} className={`rec rec-${r.priority}${i === 0 ? ' rec-top' : ''}`}>
          <div className="rec-head">
            <strong>{r.action}</strong>
            <span className="rec-meta">{meta(r, t)}</span>
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
