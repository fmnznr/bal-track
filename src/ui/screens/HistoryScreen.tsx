import { useRun } from '../../run/RunContext';

export default function HistoryScreen() {
  const { store } = useRun();
  if (store.finished.length === 0) {
    return (
      <section className="screen">
        <p className="muted">No finished runs yet.</p>
      </section>
    );
  }
  const wins = store.finished.filter(run => run.result === 'won').length;
  const winRate = Math.round((wins / store.finished.length) * 100);
  return (
    <section className="screen">
      <h2>Past runs</h2>
      <p className="muted">
        {store.finished.length} runs · {wins} wins · {winRate}% win rate
      </p>
      <ul className="rows">
        {store.finished.map((r, i) => (
          <li key={i} className="row">
            <span className="grow">{r.deck} · {r.stake}</span>
            <span>Ante {r.ante}</span>
            <span className={r.result === 'won' ? 'won' : 'lost'}>{r.result}</span>
            <small>{new Date(r.endedAt).toLocaleDateString()}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
