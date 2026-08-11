import { blindTargets, estimateHandScore, referenceHand } from '../../engine/score';
import { useRun } from '../../run/RunContext';

export default function ScorePanel() {
  const { store } = useRun();
  const run = store.current!;
  const hand = referenceHand(run);
  const estimate = estimateHandScore(run, hand);
  const targets = blindTargets(run.ante, run.deck);
  const fmt = (n: number) => n.toLocaleString('en-US');

  return (
    <p className="muted score-panel">
      Typical {hand} ~{fmt(estimate.score)} · Ante {run.ante} targets {fmt(targets.small)} / {fmt(targets.big)} /{' '}
      {fmt(targets.boss)}
      {estimate.unmodeled.length > 0 && <> · Not counted: {estimate.unmodeled.join(', ')}</>}
      {estimate.inactive.length > 0 && <> · Does not fire on {hand}: {estimate.inactive.join(', ')}</>}
    </p>
  );
}
