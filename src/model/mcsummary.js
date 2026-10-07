// Summary of a set of stress-test runs (Phoenix Economics Solutions §7.7): percentile fans and paired
// differences between each run with Phoenix and the same run without it. Shared by the worker and by
// the page, which merges the runs of several workers.
const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); const i = (a.length - 1) * p, lo = Math.floor(i); return a[lo] + (a[Math.min(a.length - 1, lo + 1)] - a[lo]) * (i - lo); };
const band = v => [q(v, 0.1), q(v, 0.5), q(v, 0.9)];

export function summarise(on, off, t, P) {
  const fan = (list, key) => t.map((_, i) => band(list.map(x => x[key][i])));
  const hit = list => list.filter(x => x.pi[x.pi.length - 1] <= P.target + 0.25).length / list.length;
  const below = list => list.filter(x => x.S[x.S.length - 1] <= x.Scrit).length / list.length;
  const dPi = on.map((x, k) => x.pi[x.pi.length - 1] - off[k].pi[off[k].pi.length - 1]);
  return {
    done: true, dPi12: band(on.map((x, k) => x.pi12 - off[k].pi12)), dX: band(on.map((x, k) => x.x - off[k].x)), dPi: band(dPi), dPiRange: [Math.min(...dPi), Math.max(...dPi)],
    dI: band(on.map((x, k) => x.i - off[k].i)), belowOn: below(on), belowOff: below(off), t, piOn: fan(on, 'pi'), piOff: fan(off, 'pi'), SOn: fan(on, 'S'), SOff: fan(off, 'S'),
    hitOn: hit(on), hitOff: hit(off), absorbed: band(on.map(x => x.absorbed)), maxResidual: Math.max(...on.map(x => x.residual), ...off.map(x => x.residual)), runs: on.length,
  };
}
