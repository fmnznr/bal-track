import { adviseStrategy } from '../../engine/strategy';
import { useT } from '../../i18n/I18nContext';
import { useRun } from '../../run/RunContext';

const COMMITMENT_KEY = { lean: 'leaning', commit: 'commit' } as const;

export default function StrategyPanel() {
  const { store } = useRun();
  const t = useT();
  const run = store.current!;
  const advice = adviseStrategy(run);
  const top = advice.candidates[0];

  return (
    <section className={`strategy strategy-${advice.commitment}`}>
      <div className="row spread">
        <strong>{t('strategy')}</strong>
        <span className={`commitment commitment-${advice.commitment}`}>
          {advice.commitment === 'open' ? t('open') : `${t(COMMITMENT_KEY[advice.commitment])}: ${top.name}`}
        </span>
      </div>
      {advice.commitment !== 'open' && top && (
        <>
          <ul className="strategy-reasons">
            {top.reasons.slice(0, 3).map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
          {top.watchlist.length > 0 && (
            <p className="muted">{t('lookFor')} {top.watchlist.slice(0, 4).join(', ')}</p>
          )}
          {advice.candidates.length > 1 && (
            <details>
              <summary>{t('otherOptions')}</summary>
              <ul className="strategy-reasons">
                {advice.candidates.slice(1).map(c => (
                  <li key={c.archetypeId}>
                    {c.name} ({c.score.toFixed(1)})
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
