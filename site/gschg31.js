/* Art. 31(1) GSchG, the minimum residual flow, as a function.
 *
 * The provision states a table: a base figure for each band of Q347 and a rate at
 * which the minimum rises inside the band. It is reproduced here once and used in
 * two places — on the map, where the minimum is computed for every one of the
 * 1,041 points at which BAFU publishes a Q347, and on the law page, where a reader
 * can put their own figure in. One text, one implementation.
 *
 * The rates are applied as written and not interpolated between the bases, because
 * the two do not always agree: the rate carried up from 280 l/s reaches 279.6 just
 * under the 500 l/s boundary where the statute states 280, and the rate carried up
 * from 900 reaches 2497.5 just under 10,000 where the statute states 2500. Each band
 * therefore starts from its own stated base. That is the statute's own arithmetic,
 * reproduced and not smoothed.
 *
 * At a stated figure the stated figure governs. Art. 31(1) names the minimum "for
 * 500 l/s" outright, so a Q347 of exactly 500 takes 280 and not the 279.6 the rate
 * arrives at from below; the band test is therefore q < ceiling, not q <= ceiling.
 * All six named values — 60, 160, 500, 2500, 10 000, 60 000 — return what the
 * statute names for them.
 */
//        [ceiling of band, base l/s, per this many l/s of Q347, add this many l/s]
const RESIDUAL = [
  [60, 50, 0, 0],
  [160, 50, 10, 8],
  [500, 130, 10, 4.4],
  [2500, 280, 100, 31],
  [10000, 900, 100, 21.3],
  [60000, 2500, 1000, 150],
];
function minResidual(q) {
  if (!isFinite(q) || q <= 0) return null;         // no permanent flow, Art. 4(i)
  if (q >= 60000) return 10000;                    // the table stops here
  let floor = 0;
  for (const [ceil, base, per, add] of RESIDUAL) {
    if (q < ceil) return per ? base + ((q - floor) / per) * add : base;
    floor = ceil;
  }
  return 10000;
}
