import { checkJokerOrder, suggestJokerOrder } from '../../engine/jokerOrder';
import { useT } from '../../i18n/I18nContext';
import { useRun } from '../../run/RunContext';

export default function JokerOrderPanel() {
  const { store, dispatch } = useRun();
  const t = useT();
  const run = store.current!;
  if (run.jokers.length < 2) return null;
  const issues = checkJokerOrder(run);
  const suggestion = suggestJokerOrder(run);

  if (issues.length === 0) {
    return <p className="muted">{t('orderFine')}</p>;
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
          {t('applyOrder')}
        </button>
      )}
    </div>
  );
}
