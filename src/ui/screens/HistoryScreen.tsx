import { exportPayload, summarize } from '../../run/decisionLog';
import { useT } from '../../i18n/I18nContext';
import { useRun } from '../../run/RunContext';

const percent = (value: number | null) => (value === null ? '–' : `${Math.round(value * 100)}%`);

/** Saves the log as a file. Browsers without object URLs simply get nothing. */
function download(name: string, text: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function AdviceLog() {
  const { store, dispatch } = useRun();
  const t = useT();
  const log = store.decisions;
  const outcomes = store.finished.map(r => ({ runId: r.runId, result: r.result, ante: r.ante }));

  if (log.length === 0) {
    return (
      <section>
        <h3>{t('adviceLog')}</h3>
        <p className="muted">{t('adviceLogEmpty')}</p>
      </section>
    );
  }
  const summary = summarize(log, outcomes);
  return (
    <section>
      <header className="row spread">
        <h3>{t('adviceLog')}</h3>
        <div className="row">
          <button
            className="ghost"
            onClick={() => download(
              `bal-track-log-${new Date().toISOString().slice(0, 10)}.json`,
              JSON.stringify(exportPayload(log, outcomes), null, 1),
            )}
          >
            {t('exportLog')}
          </button>
          <button
            className="ghost"
            onClick={() => confirm(t('confirmClearLog', { count: log.length })) && dispatch({ type: 'CLEAR_DECISIONS' })}
          >
            {t('clearLog')}
          </button>
        </div>
      </header>
      <p className="muted">
        {t('adviceLogSummary', { decisions: summary.decisions, followed: percent(summary.followRate) })}
      </p>
      {(summary.followRateWon !== null || summary.followRateLost !== null) && (
        <p className="muted">
          {t('adviceLogOutcome', { won: percent(summary.followRateWon), lost: percent(summary.followRateLost) })}
        </p>
      )}
      {summary.keptWhenDeviating !== null && (
        <p className="muted">{t('adviceLogKept', { kept: percent(summary.keptWhenDeviating) })}</p>
      )}
      <p className="muted">{t('adviceLogKinds')}</p>
      <ul className="rows log-kinds">
        {summary.byKind.map(k => (
          <li key={k.kind} className="row">
            <span className="grow">{k.kind}</span>
            <span>{k.followed}/{k.top}</span>
            <span>+{k.chosenInstead}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function HistoryScreen() {
  const { store, dispatch } = useRun();
  const t = useT();
  if (store.finished.length === 0) {
    return (
      <section className="screen">
        <p className="muted">{t('noFinishedRuns')}</p>
        <AdviceLog />
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
      <AdviceLog />
    </section>
  );
}
