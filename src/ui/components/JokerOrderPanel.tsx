import { checkJokerOrder, suggestJokerOrder } from '../../engine/jokerOrder';
import { useRun } from '../../run/RunContext';

export default function JokerOrderPanel() {
  const { store, dispatch } = useRun();
  const run = store.current!;
  if (run.jokers.length < 2) return null;
  const issues = checkJokerOrder(run);
  const suggestion = suggestJokerOrder(run);

  if (issues.length === 0) {
    return <p className="muted">Joker order looks good — jokers trigger left to right.</p>;
  }
  return (
    <div className="order-panel">
      <ul className="strategy-reasons">
        {issues.map((issue, i) => (
          <li key={i}>{issue.message}</li>
        ))}
      </ul>
      {suggestion && (
        <button onClick={() => dispatch({ type: 'SET_JOKER_ORDER', order: suggestion })}>
          Apply suggested order
        </button>
      )}
    </div>
  );
}
