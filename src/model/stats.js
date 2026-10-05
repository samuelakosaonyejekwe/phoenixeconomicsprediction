// Small-sample inference for forecast comparisons (§3.7, §6.2): Student-t distribution and the
// Harvey–Leybourne–Newbold (1997) correction of the Diebold–Mariano statistic.

// Regularised incomplete beta function I_x(a, b) by continued fraction (Lentz's method).
function betacf(a, b, x) {
  const tiny = 1e-300;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d; let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}
function lgamma(z) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015; for (const c of g) s += c / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}
export function betaInc(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
// Two-sided p-value of a t statistic with df degrees of freedom.
export const tTwoSided = (t, df) => betaInc(df / (df + t * t), df / 2, 0.5);

// Harvey, Leybourne and Newbold (1997): DM statistic for T observations at horizon h, scaled and
// compared with Student-t(T − 1).
export function hln(stat, T, h) {
  const k = Math.sqrt(Math.max(0, (T + 1 - 2 * h + h * (h - 1) / T) / T));
  const s = stat * k;
  return { stat: s, p: tTwoSided(Math.abs(s), T - 1), statDM: stat };
}
