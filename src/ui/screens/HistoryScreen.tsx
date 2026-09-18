import { useT } from '../../i18n/I18nContext';
import { useRun } from '../../run/RunContext';

export default function HistoryScreen() {
  const { store, dispatch } = useRun();
  const t = useT();
  if (store.finished.length === 0) {
    return (
      <section className="screen">
        <p className="muted">{t('noFinishedRuns')}</p>
      </section>
    );
  }
  const wins = store.finished.filter(run => run.result === 'won').length;
  const winRate = Math.round((wins / store.finished.length) * 100);
  return (
    <section className="screen">
      <header className="row spread">
        <h2>{t('pastRuns')}</h2>
        <button
          className="ghost"
          onClick={() =>
            confirm(t('confirmClearHistory', { runs: store.finished.length }))
            && dispatch({ type: 'CLEAR_HISTORY' })}
        >
          {t('clearHistory')}
        </button>
      </header>
      <p className="muted">
        {t('historySummary', { runs: store.finished.length, wins, rate: winRate })}
      </p>
      <ul className="rows">
        {store.finished.map((r, i) => (
          <li key={i} className="row">
            <span className="grow">{r.deck} · {r.stake}</span>
            <span>{t('ante')} {r.ante}</span>
            <span className={r.result === 'won' ? 'won' : 'lost'}>{t(r.result)}</span>
            <small>{new Date(r.endedAt).toLocaleDateString()}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
