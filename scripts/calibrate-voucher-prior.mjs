/**
 * Fit the scale of the voucher rating curve to the vouchers that have a model.
 *
 *   node scripts/calibrate-voucher-prior.mjs
 *
 * Vouchers without a model are valued from their rating, on a curve that is
 * zero at the rating of a voucher that does nothing. That curve needs a scale,
 * and a guessed one is what put Director's Cut at +85%. So the scale is fitted:
 * over the baseline's 300 runs, every modelled voucher the run does not own is
 * valued twice — by its model and by its rating — and the scale is the one
 * where the two agree on average, in log terms, so a voucher the curve makes
 * twice too good counts as much as one it makes half as good.
 *
 * Vouchers whose model needs the player's reroll rate are left out: the
 * baseline has none, so they fall back to the curve being fitted.
 *
 * Prints the fitted value for `TUNING.voucherPrior.topShareOfTarget`, how far
 * each voucher sits from it, and the error either side, so a fit that only
 * works on average is visible as such.
 */
const { createServer } = await import('vite');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { scenario, SCENARIO_COUNT } = await server.ssrLoadModule('/src/engine/baseline.ts');
const { voucherCalibrationPair } = await server.ssrLoadModule('/src/engine/recommend.ts');

const MODELLED = [
  'directors-cut', 'retcon', 'seed-money', 'money-tree', 'blank', 'grabber', 'nacho-tong',
  'wasteful', 'recyclomancy', 'paint-brush', 'palette', 'clearance-sale', 'liquidation', 'antimatter',
];

/**
 * Modelled, but not fitted to. Their value is three future rounds of pay
 * turned into score at the exchange rate, the least certain step any voucher
 * model takes, and they disagree with their ratings by x0.55 to x0.66 where the
 * rest sit within x0.78 to x1.22: fitted to, they moved the scale by half and
 * doubled the error for every other voucher. Shown for comparison.
 */
const COMPARED = ['hieroglyph', 'petroglyph'];

// The model side does not depend on the scale, and it is the slow part: work
// it out once.
const pairs = [];
for (let i = 0; i < SCENARIO_COUNT; i += 1) {
  const run = scenario(i).run;
  for (const id of [...MODELLED, ...COMPARED]) {
    const pair = voucherCalibrationPair(run, id);
    if (pair) pairs.push({ id, fitted: MODELLED.includes(id), ...pair });
  }
}

const loss = topShare => {
  let total = 0;
  let n = 0;
  const perVoucher = {};
  for (const { id, fitted, model, rating } of pairs) {
    const gap = Math.log(rating(topShare)) - Math.log(model);
    (perVoucher[id] ??= []).push(gap);
    if (!fitted) continue;
    total += gap * gap;
    n += 1;
  }
  return { loss: total / n, n, perVoucher };
};

// Golden-section search on the scale; the loss is a smooth bowl in it.
let lo = 0;
let hi = 0.8;
const phi = (Math.sqrt(5) - 1) / 2;
for (let i = 0; i < 40; i += 1) {
  const a = hi - phi * (hi - lo);
  const b = lo + phi * (hi - lo);
  if (loss(a).loss < loss(b).loss) hi = b;
  else lo = a;
}
const best = (lo + hi) / 2;
const fit = loss(best);
const joker = loss(0.8);

console.log(`fitted topShareOfTarget: ${best.toFixed(3)}   (${fit.n} voucher valuations)`);
console.log(`mean squared log error:  ${fit.loss.toFixed(4)} fitted, ${joker.loss.toFixed(4)} at the joker scale 0.8`);
console.log('\nper voucher, mean log gap (rating over model) at the fitted scale:');
for (const [id, gaps] of Object.entries(fit.perVoucher)) {
  const mean = gaps.reduce((x, y) => x + y, 0) / gaps.length;
  const note = COMPARED.includes(id) ? '  not fitted' : '';
  console.log(`  ${id.padEnd(15)} ${mean >= 0 ? '+' : ''}${mean.toFixed(3)}  (x${Math.exp(mean).toFixed(2)}, ${gaps.length} runs)${note}`);
}
await server.close();
