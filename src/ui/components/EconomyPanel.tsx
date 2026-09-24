import { horizonRounds, interestOn, projectMoney, roundIncome } from '../../engine/projection';
import { useT } from '../../i18n/I18nContext';
import { useRun } from '../../run/RunContext';

/**
 * Where the bankroll is heading if nothing is bought: the income the run
 * earns each round and the money it adds up to over the planning horizon the
 * advisor prices purchases against.
 */
export default function EconomyPanel() {
  const { store } = useRun();
  const t = useT();
  const run = store.current!;
  const sources = roundIncome(run);
  const interest = interestOn(run, run.money);
  const rounds = horizonRounds(run.ante);
  const path = projectMoney(run, rounds);
  const money = (n: number) => `$${Math.round(n)}`;
  const parts = sources.map(s => `${s.label} ${money(s.dollars)}`);
  if (interest > 0) parts.push(t('interestNow', { amount: interest }));

  return (
    <p className="muted economy-panel">
      <strong>{t('economy')}</strong>
      {' · '}
      {t('incomePerRound', { sources: parts.join(', ') })}
      {path.length > 0 && (
        <>
          {' · '}
          {t('bankedOutlook', {
            next: Math.round(path[0]),
            last: Math.round(path[path.length - 1]),
            rounds: path.length,
          })}
        </>
      )}
    </p>
  );
}
