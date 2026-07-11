import { useRun } from '../../run/RunContext';
import NumberField from '../components/NumberField';

export default function RunOverview() {
  const { store, dispatch } = useRun();
  const run = store.current!;
  return (
    <section className="screen">
      <NumberField label="Money $" value={run.money} onChange={money => dispatch({ type: 'SET_MONEY', money })} />
      <NumberField label="Ante" value={run.ante} min={1} onChange={ante => dispatch({ type: 'SET_ANTE', ante })} />
    </section>
  );
}
