import { blindTargets, estimateHandScore, referenceHand } from '../../engine/score';
import { useT } from '../../i18n/I18nContext';
import { useRun } from '../../run/RunContext';

export default function ScorePanel() {
  const { store } = useRun();
  const t = useT();
  const run = store.current!;
  const hand = referenceHand(run);
  const estimate = estimateHandScore(run, hand);
  const targets = blindTargets(run.ante, run.deck, run.stake);
  const fmt = (n: number) => n.toLocaleString('en-US');
  // Keep the line readable on a phone when a wide board fills every list.
  const names = (list: string[]) =>
    (list.length > 3
      ? t('andMore', { names: list.slice(0, 3).join(', '), count: list.length - 3 })
      : list.join(', '));

  return (
    <p className="muted score-panel">
      {t('typicalHand', { hand, score: fmt(estimate.score) })}
      {' · '}
      {t('anteTargets', {
        ante: run.ante,
        small: fmt(targets.small),
        big: fmt(targets.big),
        boss: fmt(targets.boss),
      })}
      {estimate.unmodeled.length > 0 && <> · {t('notCounted', { names: names(estimate.unmodeled) })}</>}
      {estimate.inactive.length > 0 && (
        <> · {t('doesNotFire', { hand, names: names(estimate.inactive) })}</>
      )}
    </p>
  );
}
