// Integrated Phoenix engine (Phoenix Economics Solutions §4). Economies are the nodes of a graph;
// spatial operators become graph operators weighted by a Gaussian of the distance between capitals
// (§4.1). Time is in months and every stock is nominal, in € billion.
//
//   excess stocks      dS_k/dt = I_k e^{−t/τ_k} − (s_k/12) S_k − Φ_k + B_k (returns, by placements)   (§4.2)
//   absorbed memory    dU_k/dt = Φ_k − B_k − (s_k/12) U_k                                          (§4.8)
//   nominal GDP        dY/dt = Y (g* + π)/1200,   S_crit = c_S(L + t/3) Y w_cov / 100            (§4.2)
//   activation         dΘ/dt = α H(π − π_th) (ρ−1)⁺/(0.25+(ρ−1)⁺) (1 − Θ) − νΘ                    (§4.3)
//   absorption         Φ = min(g Θ k_A min(Σ u_k S_k, (S − f S_crit)⁺), c Y/1200)                  (§4.4)
//   credits            dC/dt = Φ − θ₂ψC − C/M,  ψ = σ((π_rel − π)/ε)   (matured credits return to deposits)        (§4.5)
//   wallets            dL/dt = θ₂ψC + r_p(C+L)/1200 + routing + D_l∇²L − η_c L − R                 (§4.5–4.7)
//   output gap         dx/dt = λ_x(x^D − x) − σ_r(i − π^e − r*)                                    (§4.8)
//   inflation          π = w_E π^E(t) + (1 − w_E) π^C,  dπ^C/dt = a_R(π^a − π^C) + k_m x + k_E(π^E − ē)   (§4.9)
//   policy rate        di/dt = λ_i(i^T − i)                                                        (§4.10)
//
// Money is conserved: absorbed funds plus premiums equal credits + wallets + wallet spending +
// matured credits returned + recalls (Digital Euro, bank deposits, Dragon reserve) at every step (§4.13).
import { distanceKm } from '../data/geo.js';
import { SECTORS, surplusOf, coverageOf, scritPctOf, scritPathOf } from './inputs.js';
import { energyPath } from './estimation.js';

const sigm = x => 1 / (1 + Math.exp(-x));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = s => { const u = clamp(s, 0, 1); return u * u * (3 - 2 * u); };
const K = SECTORS.length;

export const FIELDS = ['S', 'pi', 'x', 'i', 'Phi', 'Theta', 'C', 'L', 'D', 'O', 'F', 'H'];

// Monthly Phillips slope from the annual estimate (§5.1): with a_m = −ln(1 − a)/12,
// k_m = κ a_m / a reproduces the annual response of the estimated equation exactly.
export function monthlySlope(P, coef = P.kappaPC) {
  const a = clamp(P.aPanel, 0.01, 0.95), am = -Math.log(1 - a) / 12;
  return coef * am / a;
}

export function prepare(cells, P, scenario = {}) {
  const N = cells.length;
  const shock = scenario.shock || {};
  const gdp = cells.map(c => c.gdp);
  const cov = cells.map(c => coverageOf(c, P));
  const S0 = cells.map(c => SECTORS.map(s => (c.sectors[s.k] || 0) * (shock.sMul || 1)));
  const I0 = cells.map(c => SECTORS.map(s => (c.flows?.[s.k] || 0) / 12 * (shock.iMul || 1)));
  const D = cells.map(a => cells.map(b => distanceKm(a, b)));
  const sg = 600;
  const Wraw = D.map(r => r.map(d => (d === 0 ? 0 : Math.exp(-(d * d) / (2 * sg * sg)))));
  const maxRow = Math.max(1e-9, ...Wraw.map(r => r.reduce((s, x) => s + x, 0)));
  const W = Wraw.map(r => r.map(x => x / maxRow));
  const areaIds = [...new Set(cells.map(c => c.area || c.id))];
  const area = cells.map(c => areaIds.indexOf(c.area || c.id));
  return { N, gdp, cov, S0, I0, D, W, shock, areaIds, area };
}

// Market-implied path of the policy rate: piecewise-linear in the forward curve, starting at i0.
function marketPath(curve, i0) {
  if (!curve?.length) return null;
  const pts = [[0, i0], ...curve.filter(([m]) => m > 0)];
  return t => {
    if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let k = 1; k < pts.length; k++) if (t <= pts[k][0]) {
      const [t0, v0] = pts[k - 1], [t1, v1] = pts[k];
      return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
    }
    return i0;
  };
}

function makeCtx(cells, P, scenario, opts) {
  const prep = opts.prep || prepare(cells, P, scenario);
  const { N, gdp, cov, S0, I0, D, W, shock, areaIds, area } = prep;
  const phxAll = opts.phx ?? P.phx;
  const mask = opts.mask || null;
  const f64 = n => new Float64Array(n);
  const act = new Uint8Array(N);
  for (let i = 0; i < N; i++) act[i] = phxAll && (!mask || mask[i]) ? 1 : 0;
  const A = areaIds.length;
  const sdK = [P.sdGov ?? 0, P.sdCorp ?? 0.15, P.sdHh ?? 0.1];
  const lam = SECTORS.map(s => P[s.lam] ?? 1);
  const u = 1 - Math.exp(-(P.rP ?? 1) / Math.max(0.01, P.r0 ?? 2));
  const take = [1, u, u]; // statutory for governments, voluntary for firms and households
  const X = {
    N, A, cells, mask: mask ? 1 : 0, act, kScale: opts.kScale || 1, extra: opts.perturb || null, phx: phxAll ? 1 : 0,
    dt: P.dt, steps: Math.round(P.months / P.dt), perRecord: Math.max(1, Math.round(0.25 / P.dt)),
    kA: P.kA, capPct: P.capPct, fbGain: P.fbGain ?? 0, piTh: P.piTh, heav: P.trigMode === 'heaviside' ? 1 : 0, hyst: P.hyst, epsPi: P.epsPi,
    alphaT: P.alphaT, nu: P.nu, guard: P.guard ? 1 : 0, target: P.target, floorPct: P.floorPct, d0: P.d0 ?? 0, scritPct: P.scritPct,
    sigma0: P.sigma0, alphaV: P.alphaV, tau: P.tau, theta2: P.theta2, mat: 1 / Math.max(1, P.matMonths ?? 36), rP: (P.rP ?? 1) / 1200,
    etaC: P.etaC, piCrisis: P.piCrisis, recallAt: P.recallAt, recallRate: P.recallRate, Dl: P.Dl,
    rhoF: P.rhoF ?? 2, kI: P.kI ?? 0.05, nuF: P.nuF ?? 0.1, xi: P.xi ?? 0,
    km: monthlySlope(P), kE: monthlySlope(P, P.gammaE), eMean: P.eMean, mult: P.mult, lamX: P.lamX, sigR: P.sigR, rStar: P.rStar, tPi: P.tPi, tX: P.tX, lamI: P.lamI, iFloor: P.iFloor,
    phiSel: P.phiSel ?? 1, piRel: P.piRel ?? P.target, lossX: P.lossX ?? 0.25, lossS: P.lossS ?? 0.1, iShift: P.iShift ?? 0,
    sdK, lam, take,
    gdp0: Float64Array.from(gdp), Y: Float64Array.from(gdp), cov: Float64Array.from(cov), cS: Float64Array.from(cells, c => scritPctOf(c, P)), cSpath: cells.map(c => scritPathOf(c, P)), gPot: Float64Array.from(cells, c => c.gPot ?? 1.5),
    D: D.map(r => Float64Array.from(r)), W: W.map(r => Float64Array.from(r)), area: Int32Array.from(area),
    Lcap: Float64Array.from(gdp, g => Math.max(0.01, P.lcapPct / 100 * g)), lcapPct: P.lcapPct,
    deCap: Float64Array.from(cells, c => (c.ea || c.area === 'EU') && c.pop ? (P.deLimit ?? 3000) * (P.deAdopt ?? 0.5) * c.pop / 1e9 : 0),
    drift0: Float64Array.from(cells, c => c.drift + (shock.drift || 0)), anchor: Float64Array.from(cells, c => c.anchor ?? P.target),
    half: Float64Array.from(cells, c => c.driftHalf ?? 3),
    // Every economy reverts at the panel speed a_R = −ln(1 − a)/12 (§3.6, §4.9), the same a that sets k_m and k_E.
    aR: Float64Array.from(cells, () => -Math.log(1 - clamp(P.aPanel, 0.01, 0.95)) / 12),
    tauI: cells.map(c => { const d = c.inflowDecay; return typeof d === 'number' ? [d, d, d] : [d?.gov ?? 8, d?.corp ?? 8, d?.hh ?? 8]; }),
    x0: Float64Array.from(cells, c => (c.x0 ?? 0) + (shock.dx || 0)),
    // need-index components with fixed scales (§4.6): unemployment gap per pp, deficit per 3 pp
    needU: Float64Array.from(cells, c => clamp(((c.unemp ?? 0) - (c.uBar ?? c.unemp ?? 0)) / 1, 0, 2)),
    needG: Float64Array.from(cells, c => clamp(-(c.govPct ?? 0) / 3, 0, 2)),
    // state
    S: S0.map(r => Float64Array.from(r)), U: S0.map(() => f64(K)), I0: I0.map(r => Float64Array.from(r)),
    pi: Float64Array.from(cells, c => c.pi + (shock.dPi || 0)), piC: new Float64Array(N), wE: Float64Array.from(cells, c => c.wE ?? 0),
    ePath: cells.map(c => energyFn(c, opts)), x: Float64Array.from(cells, c => (c.x0 ?? 0) + (shock.dx || 0)),
    Th: f64(N), C: f64(N), L: opts.L0 ? Float64Array.from(opts.L0) : f64(N), F: f64(N), DE: f64(N), on: new Uint8Array(N), L0sum: opts.L0 ? opts.L0.reduce((a, b) => a + b, 0) : 0,
    iA: f64(A), dpi: Float64Array.from(cells, c => c.drift + (shock.drift || 0)),
    // scratch
    Stot: f64(N), Scrit: f64(N), rho: f64(N), dC: f64(N), dL: f64(N), dTh: f64(N), dF: f64(N), dP: f64(N), dX: f64(N),
    Dis: f64(N), Ov: f64(N), piThE: f64(N), kEff: f64(N), Phi: f64(N), PhiK: S0.map(() => f64(K)), H: f64(N), need: f64(N), wt: f64(N),
    dragon: new Uint8Array(N), ret: f64(N), piA: f64(A), xA: f64(A), yA: f64(A), iT: f64(A), mkt: new Array(A).fill(null),
    flows: Array.from({ length: N }, () => f64(N)), cumAbs: f64(N), placed: S0.map(() => f64(K)),
    tot: { absorbed: 0, premium: 0, released: 0, matured: 0, spent: 0, recallDE: 0, recallDeposits: 0, recallDragon: 0, transfers: 0, loss: 0, lossN: 0 },
    base: opts.base || null, ratePath: opts.ratePath || null, zA: f64(A), kZ: P.kStance ?? 0, tauZ: P.tauStance ?? 12,
  };
  // Core inflation at the start is set so that headline equals the published (or nowcast) rate.
  for (let i = 0; i < N; i++) {
    const w = X.wE[i], e0 = X.ePath[i](0);
    X.piC[i] = w < 1 ? (X.pi[i] - w * e0) / (1 - w) : X.pi[i];
  }
  // Policy-rate setup per monetary area (§4.10).
  areaMeans(X, 0);
  for (let a = 0; a < A; a++) {
    const members = [];
    for (let i = 0; i < N; i++) if (area[i] === a) members.push(i);
    const obs = members.map(i => cells[i].i0).find(v => Number.isFinite(v));
    const isEA = areaIds[a] === 'EA' || areaIds[a] === 'EU';
    const path = P.rateMode !== 'taylor' && isEA && Number.isFinite(obs) ? marketPath(opts.market?.curve, obs) : null;
    X.mkt[a] = path;
    X.iA[a] = Number.isFinite(obs) ? obs : taylor(X, a);
  }
  X.i0A = Float64Array.from(X.iA);
  return { X, prep };
}

// Energy-inflation path of an economy (§4.9): from its HICP energy index — held at today's level by
// default (a random walk; Alquist, Kilian and Vigfusson 2013), realised for past episodes, or grown at
// the historical drift as an alternative — or, without an index, from Brent in euro times its elasticity.
function energyFn(c, opts) {
  const mode = opts.energyMode || 'flat';
  if (c.energy?.type === 'index') {
    const p = energyPath(c.energy.rows, { asOf: c.energy.asOf, mode, drift: c.energy.drift, levelAdjPct: c.energy.levelAdjPct || 0 });
    if (p) return t => p.at(t);
  }
  // Oil route: an explicit oil path (validation), else the economy's own path of Brent in euro held at its
  // latest price, so the base effects of the past year are kept (§4.9).
  const el = c.energy?.elasticity ?? 0.19;
  if (opts.oil) return t => el * opts.oil.at(t);
  const yoy = c.energy?.yoy;
  if (yoy?.length) return t => { const k = Math.min(yoy.length - 1, Math.max(0, Math.floor(t))), k1 = Math.min(yoy.length - 1, k + 1); return el * (yoy[k] + (yoy[k1] - yoy[k]) * (t - Math.floor(t))); };
  return () => 0;
}

function taylor(X, a) {
  return Math.max(X.iFloor, X.rStar + X.target + X.tPi * (X.piA[a] - X.target) + X.tX * X.xA[a]);
}

function areaMeans(X, k) {
  const { A, N, area, Y, pi, x, piA, xA, yA, iT } = X;
  piA.fill(0); xA.fill(0); yA.fill(0);
  for (let i = 0; i < N; i++) { const a = area[i]; piA[a] += pi[i] * Y[i]; xA[a] += x[i] * Y[i]; yA[a] += Y[i]; }
  for (let a = 0; a < A; a++) {
    piA[a] /= yA[a]; xA[a] /= yA[a];
    if (X.mkt[a]) {
      // Market path plus the Taylor response to deviations from the no-Phoenix baseline.
      const b = X.base?.[a]?.[k];
      const dpi = b ? piA[a] - b[0] : 0, dx = b ? xA[a] - b[1] : 0;
      iT[a] = Math.max(X.iFloor, X.mkt[a](k * X.dt) + X.tPi * dpi + X.tX * dx) + X.iShift;
    } else iT[a] = taylor(X, a) + X.iShift;
  }
}

function stepStocks(X) {
  for (let i = 0; i < X.N; i++) {
    let s = 0;
    for (let k = 0; k < K; k++) s += X.lam[k] * X.S[i][k];
    X.Stot[i] = s;
    // The historical threshold is re-read for the episode's length as it ages (§3.3, §4.2).
    const path = X.cSpath[i];
    let cS = X.cS[i];
    if (path) { const q = (X.t || 0) / 3, k0 = Math.min(path.length - 1, Math.floor(q)), k1 = Math.min(path.length - 1, k0 + 1); cS = path[k0] + (path[k1] - path[k0]) * (q - Math.floor(q)); }
    X.Scrit[i] = X.cells[i].fixedScrit ?? Math.max(0.05, cS / 100 * X.Y[i] * X.cov[i]);
    X.rho[i] = s / X.Scrit[i];
  }
}

function stepControl(X) {
  for (let i = 0; i < X.N; i++) {
    const up = X.fbGain ? Math.max(0, Math.tanh(-X.F[i] / 0.5)) : 0;
    X.kEff[i] = X.kA * (1 + X.fbGain * up);
    X.piThE[i] = X.piTh - 0.5 * X.fbGain * up;
  }
}

function stepFlux(X) {
  const { pi, Th, Scrit, rho } = X;
  for (let i = 0; i < X.N; i++) {
    let sw;
    if (X.heav) {
      if (pi[i] >= X.piThE[i]) X.on[i] = 1;
      else if (pi[i] < X.piThE[i] - X.hyst) X.on[i] = 0;
      sw = X.on[i];
    } else sw = sigm((pi[i] - X.piThE[i]) / X.epsPi);
    // Activation needs an exceptional stock: it grows with the excess above S_crit (§4.3).
    const r = Math.max(0, rho[i] - 1);
    X.dTh[i] = (X.act[i] ? X.alphaT * sw * (r / (0.25 + r)) * (1 - Th[i]) : 0) - X.nu * Th[i];
    let f = 0, absorbable = 0;
    const Si = X.S[i];
    for (let k = 0; k < K; k++) absorbable += X.take[k] * Si[k];
    if (X.act[i] && absorbable > 0) {
      const g = X.guard ? smooth((pi[i] - X.target) / Math.max(0.1, X.piTh - X.target)) : 1;
      const room = Math.min(absorbable, Math.max(0, X.Stot[i] - X.floorPct * Scrit[i]));
      f = Math.min(g * Th[i] * X.kScale * X.kEff[i] * room, X.capPct / 1200 * X.Y[i]);
    }
    X.Phi[i] = f;
    for (let k = 0; k < K; k++) X.PhiK[i][k] = absorbable > 0 ? f * X.take[k] * Si[k] / absorbable : 0;
  }
}

function stepNeed(X) {
  for (let j = 0; j < X.N; j++) {
    const nP = clamp((X.target - X.pi[j]) / 1, 0, 2), nX = clamp(-X.x[j] / 2, 0, 2);
    X.need[j] = 0.05 + (nP + nX + X.needU[j] + X.needG[j]) / 4;
  }
}

function stepTransfers(X) {
  // Routing (§4.6): within a currency area only, from economies above target to economies with
  // slack and room below the trigger.
  const { N, pi, L, W, D, need, wt, dL, flows, dt, area } = X;
  if (N < 2) return;
  const span = Math.max(0.1, X.piTh - X.target);
  for (let i = 0; i < N; i++) {
    const chi = clamp((pi[i] - X.target) / span, 0, 1);
    if (chi <= 0 || L[i] <= 0) continue;
    let gpi = 0, ws = 0;
    const Wi = W[i];
    for (let j = 0; j < N; j++) { gpi += Wi[j] * Math.abs(pi[j] - pi[i]); ws += Wi[j]; }
    const sigma = X.sigma0 + X.alphaV * (ws ? gpi / ws : 0);
    const out = X.tau * chi * L[i];
    const Di = D[i], two = 2 * sigma * sigma;
    let wsum = 0;
    for (let j = 0; j < N; j++) {
      wt[j] = j === i || area[j] !== area[i] || (X.mask && !X.act[j]) ? 0 : Math.exp(-(Di[j] * Di[j]) / two) * need[j] * clamp((X.piTh - pi[j]) / span, 0, 1);
      wsum += wt[j];
    }
    if (wsum <= 1e-12) continue;
    for (let j = 0; j < N; j++) {
      if (!wt[j]) continue;
      const m = out * wt[j] / wsum;
      dL[i] -= m; dL[j] += m;
      flows[i][j] += m * dt; X.tot.transfers += m * dt;
    }
  }
}

function stepCells(X, t, k, log) {
  const { N, pi, x, C, L, F, Th, rho, Phi, W, dt, tot, Y, area } = X;
  for (let i = 0; i < N; i++) {
    let lapL = 0;
    const Wi = W[i], leak = !X.mask || X.act[i];
    for (let j = 0; j < N; j++) {
      const w = Wi[j];
      if (w && area[j] === area[i] && leak && (!X.mask || X.act[j])) lapL += w * (L[j] - L[i]);
    }
    // Credits: release into wallets once inflation is back at the release level (the target by
    // default), plus maturity redemption into holders' deposits (§4.5).
    const psi = sigm((X.piRel - pi[i]) / X.epsPi);
    const rel = X.theta2 * psi * C[i], mat = X.mat * C[i];
    const prem = X.rP * (C[i] + L[i]);
    const cons = X.etaC * L[i];
    // Wallet capacity is a share of current nominal GDP (§4.7).
    X.Lcap[i] = Math.max(0.01, X.lcapPct / 100 * X.Y[i]);
    const Hi = L[i] / X.Lcap[i];
    X.H[i] = Hi;
    X.dragon[i] = pi[i] >= X.piCrisis ? 1 : 0;
    const recall = Hi > X.recallAt && X.act[i] ? Math.min(0.5 * L[i], X.recallRate * (Hi - X.recallAt) / Math.max(0.01, 1 - X.recallAt) * L[i]) : 0;
    X.dC[i] += Phi[i] - rel - mat;
    X.dL[i] += X.Dl * lapL + rel + prem - cons - recall;
    // Recall destination (§4.7): Dragon reserve in a crisis; else the Digital Euro up to the
    // holding limit, the remainder swept to linked bank accounts. Both return to holders' stock.
    let toDE = 0, toDep = 0;
    if (recall > 0) {
      if (X.dragon[i]) tot.recallDragon += recall * dt;
      else {
        toDE = Math.min(recall, Math.max(0, (X.deCap[i] - X.DE[i]) / dt));
        toDep = recall - toDE;
        X.DE[i] += toDE * dt; tot.recallDE += toDE * dt; tot.recallDeposits += toDep * dt;
      }
    }
    X.ret[i] = toDE + toDep + mat; // returned to holders: recall into Digital Euro / deposits, and matured credits

    // Demand pressure (§4.8): spending forgone on absorbed funds (memory U, scaled by φ_sel),
    // plus spending out of wallets.
    let forgone = 0;
    for (let q = 0; q < K; q++) forgone += X.sdK[q] * X.U[i][q];
    const xD = X.x0[i] + X.mult * 100 * (12 * cons - X.phiSel * forgone) / Y[i];
    const a = area[i];
    const piE = X.anchor[i] + (pi[i] - X.anchor[i]) * Math.exp(-12 * X.aR[i]);
    X.dX[i] = X.lamX * (xD - x[i]) - X.sigR * (X.iA[a] - piE - X.rStar);

    // Core Phillips curve with the energy channel (§4.9); headline = w_E π^E + (1 − w_E) π^C.
    const eNow = X.ePath[i](t);
    const noise = X.extra ? X.extra.noise[i] : 0;
    const shockDrift = (X.drift0[i] - X.cells[i].drift + noise) * Math.pow(0.5, t / X.half[i]);
    // Policy-stance channel (§4.9): expectations and financial conditions, a lagged response to the
    // policy rate relative to its value at the start, calibrated to euro-area evidence (§5.3).
    X.dP[i] = X.aR[i] * (X.anchor[i] - X.piC[i]) + X.km * x[i] + X.kE * (eNow - X.eMean) + shockDrift - X.kZ * X.zA[X.area[i]];

    // Optional feedback field (§4.11); loss-based disorder index and overhang (§4.12).
    X.dF[i] = -X.rhoF * X.dpi[i] - X.kI * (pi[i] - X.target) - X.xi * Math.max(0, Hi - X.recallAt) - X.nuF * F[i];
    X.Dis[i] = (pi[i] - X.target) ** 2 + X.lossX * x[i] * x[i];
    X.Ov[i] = Math.max(0, rho[i] - 1) ** 2;

    tot.absorbed += Phi[i] * dt; X.cumAbs[i] += Phi[i] * dt;
    tot.premium += prem * dt; tot.released += rel * dt; tot.matured += mat * dt; tot.spent += cons * dt;
    log(i, recall);
  }
}

function stepUpdate(X) {
  const { N, dt } = X;
  let lossNum = 0, w = 0;
  for (let i = 0; i < N; i++) {
    const Si = X.S[i], Ui = X.U[i], Ii = X.I0[i];
    // Returned funds go back to the sectors in proportion to what each placed (§4.2), and leave U:
    // they are again ordinary holdings with their usual spending propensity (§4.5).
    const placed = X.placed[i];
    for (let k = 0; k < K; k++) placed[k] += dt * X.PhiK[i][k];
    let pSum = 0; for (let k = 0; k < K; k++) pSum += placed[k];
    for (let k = 0; k < K; k++) {
      const share = pSum > 1e-12 ? placed[k] / pSum : (k === 2 ? 1 : 0); // nothing placed yet (pre-loaded wallets): to households
      const back = X.ret[i] * share;
      const inflow = Ii[k] * Math.exp(-(X.t || 0) / X.tauI[i][k]) * (X.extra ? X.extra.inj[i] : 1) + back;
      Si[k] = Math.max(0, Si[k] + dt * (inflow - (X.sdK[k] / 12) * Si[k] - X.PhiK[i][k]));
      Ui[k] = Math.max(0, Ui[k] + dt * (X.PhiK[i][k] - back - (X.sdK[k] / 12) * Ui[k]));
    }
    if (X.d0) {
      // optional size-proportional diffusion of the household stock between neighbours
      let lap = 0;
      for (let j = 0; j < N; j++) if (X.W[i][j]) lap += X.W[i][j] * (X.S[j][2] / X.Y[j] - Si[2] / X.Y[i]) * Math.min(X.Y[i], X.Y[j]);
      Si[2] = Math.max(0, Si[2] + dt * X.d0 * lap);
    }
    X.C[i] = Math.max(0, X.C[i] + dt * X.dC[i]);
    X.L[i] = Math.max(0, X.L[i] + dt * X.dL[i]);
    X.Th[i] = clamp(X.Th[i] + dt * X.dTh[i], 0, 1);
    X.F[i] += dt * X.dF[i];
    X.x[i] += dt * X.dX[i];
    X.piC[i] += dt * X.dP[i];
    const wEi = X.wE[i], newPi = wEi * X.ePath[i](X.t + dt) + (1 - wEi) * X.piC[i];
    X.dpi[i] = (newPi - X.pi[i]) / dt;
    X.pi[i] = newPi;
    X.Y[i] *= Math.exp(dt * (X.gPot[i] + X.pi[i]) / 1200);
    lossNum += X.Y[i] * (X.Dis[i] + X.lossS * X.Ov[i]); w += X.Y[i];
  }
  X.tot.loss += lossNum / w; X.tot.lossN++;
  for (let a = 0; a < X.A; a++) {
    X.iA[a] = X.ratePath ? X.ratePath(X.t + dt) : X.iA[a] + dt * X.lamI * (X.iT[a] - X.iA[a]);
    X.zA[a] += dt * ((X.iA[a] - X.i0A[a]) - X.zA[a]) / X.tauZ;
  }
}

export function simulate(cells, P, scenario = {}, opts = {}) {
  // Market-path areas need the no-Phoenix baseline of area inflation and output gap.
  if ((opts.phx ?? P.phx) && !opts.base && P.rateMode !== 'taylor' && opts.market?.curve?.length) {
    const b = simulate(cells, P, scenario, { ...opts, phx: false, base: null, wantBase: true });
    opts = { ...opts, base: b.baseArrays };
  }
  const { X, prep } = makeCtx(cells, P, scenario, opts);
  const { N, pi, x, Th, C, L, F, dt } = X;
  const rec = { t: [], S: [], pi: [], x: [], i: [], Phi: [], Theta: [], C: [], L: [], D: [], O: [], F: [], H: [], mode: [] };
  const baseArrays = opts.wantBase ? Array.from({ length: X.A }, () => []) : null;
  const events = [];
  stepStocks(X);
  const st = { activeTh: new Uint8Array(N), recall: new Uint8Array(N), dragon: new Uint8Array(N), below: Uint8Array.from(X.rho, r => (r <= 1 ? 1 : 0)), onTarget: Uint8Array.from(pi, p => (p <= P.target + 0.2 ? 1 : 0)) };
  const arr = a => Array.from(a);
  let t = 0, k = 0;
  const ev = (i, type, cause, extraInfo) => events.push({
    t: +t.toFixed(2), cell: cells[i].id, name: cells[i].name, type, cause,
    indicators: { pi: +pi[i].toFixed(2), x: +x[i].toFixed(2), i: +X.iA[X.area[i]].toFixed(2), S: +X.Stot[i].toFixed(2), Scrit: +X.Scrit[i].toFixed(2), Theta: +Th[i].toFixed(3) },
    converted: +X.cumAbs[i].toFixed(3), ...(extraInfo || {}),
  });
  const log = (i, recall) => {
    if (!st.activeTh[i] && Th[i] >= 0.5) { st.activeTh[i] = 1; ev(i, 'ACTIVATED', `π ${pi[i].toFixed(2)}% vs trigger ${X.piThE[i].toFixed(2)}%, S/S_crit ${X.rho[i].toFixed(2)}`); }
    else if (st.activeTh[i] && Th[i] < 0.3) { st.activeTh[i] = 0; ev(i, 'STOOD_DOWN', 'Activation decayed below 0.3'); }
    if (!st.recall[i] && recall > 0) { st.recall[i] = 1; ev(i, 'RECALL', `Saturation ${X.H[i].toFixed(2)} ≥ ${P.recallAt}`, { into: X.dragon[i] ? 'Dragon reserve' : 'Digital Euro / bank deposits' }); }
    else if (st.recall[i] && recall === 0) st.recall[i] = 0;
    if (st.dragon[i] !== X.dragon[i]) { ev(i, X.dragon[i] ? 'CRISIS_MODE' : 'STABLE_MODE', X.dragon[i] ? `π ${pi[i].toFixed(2)}% ≥ ${P.piCrisis}%` : 'Inflation back below the crisis level'); st.dragon[i] = X.dragon[i]; }
    const below = X.rho[i] <= 1 ? 1 : 0;
    if (below !== st.below[i] && k) { ev(i, below ? 'SURPLUS_NORMALISED' : 'SURPLUS_BREACH', `S ${X.Stot[i].toFixed(1)} vs S_crit ${X.Scrit[i].toFixed(1)} €bn`); st.below[i] = below; }
    const onT = pi[i] <= P.target + 0.2 ? 1 : 0;
    if (onT !== st.onTarget[i] && k) { ev(i, onT ? 'ON_TARGET' : 'OFF_TARGET', `π ${pi[i].toFixed(2)}% vs target ${P.target}%`); st.onTarget[i] = onT; }
  };

  for (k = 0; k <= X.steps; k++) {
    t = k * dt; X.t = t;
    stepStocks(X);
    X.dC.fill(0); X.dL.fill(0);
    areaMeans(X, k);
    if (baseArrays) for (let a = 0; a < X.A; a++) baseArrays[a].push([X.piA[a], X.xA[a]]);
    stepControl(X);
    stepFlux(X);
    stepNeed(X);
    stepTransfers(X);
    stepCells(X, t, k, log);
    if (k % X.perRecord === 0) {
      rec.t.push(+t.toFixed(4));
      rec.S.push(arr(X.Stot)); rec.pi.push(arr(pi)); rec.x.push(arr(x)); rec.i.push(Array.from(X.area, a => X.iA[a]));
      rec.Phi.push(arr(X.Phi)); rec.Theta.push(arr(Th)); rec.C.push(arr(C)); rec.L.push(arr(L));
      rec.D.push(arr(X.Dis)); rec.O.push(arr(X.Ov)); rec.F.push(arr(F)); rec.H.push(arr(X.H)); rec.mode.push(Array.from(X.dragon, d => (d ? 'dragon' : 'euro')));
      rec.Scrit = rec.Scrit || []; rec.Scrit.push(arr(X.Scrit)); rec.Y = rec.Y || []; rec.Y.push(arr(X.Y));
    }
    stepUpdate(X);
  }

  const tot = X.tot;
  const sum = row => row.reduce((a, b) => a + b, 0);
  const agg = rec.t.map((_, r) => {
    const Yr = rec.Y[r], ws = sum(Yr), wavg = row => row.reduce((s, v, i) => s + v * Yr[i], 0) / ws;
    return {
      t: rec.t[r], pi: wavg(rec.pi[r]), x: wavg(rec.x[r]), i: wavg(rec.i[r]),
      S: sum(rec.S[r]), Scrit: sum(rec.Scrit[r]), Phi: sum(rec.Phi[r]), C: sum(rec.C[r]), L: sum(rec.L[r]),
      D: wavg(rec.D[r]), O: wavg(rec.O[r]), F: wavg(rec.F[r]), Theta: wavg(rec.Theta[r]),
      active: rec.Theta[r].filter(v => v >= 0.5).length,
    };
  });
  let C_end = 0, L_end = 0, Y_end = 0;
  for (let i = 0; i < N; i++) { C_end += C[i]; L_end += L[i]; Y_end += X.Y[i]; }
  tot.creditsHeld = C_end; tot.walletsHeld = L_end;
  tot.recallEuro = tot.recallDE + tot.recallDeposits;
  tot.residual = X.L0sum + tot.absorbed + tot.premium - (C_end + L_end + tot.spent + tot.matured + tot.recallDE + tot.recallDeposits + tot.recallDragon);
  tot.lossAvg = tot.loss / Math.max(1, tot.lossN);
  tot.costPctGDP = tot.premium / Y_end * 100; // cumulative premium, % of annual GDP
  return {
    cells, Scrit: rec.Scrit[0], scritTot: sum(rec.Scrit[0]), S0: prep.S0.map(r => sum(r)), Lcap: arr(X.Lcap), rec, agg, events,
    flows: X.flows.map(arr), totals: tot, N, months: P.months, areas: prep.areaIds, baseArrays,
  };
}

// Routing kernel for display (§4.6).
// Need index of §4.6 for display: below-target inflation, negative output gap, unemployment above
// its natural rate and a fiscal deficit, each on a fixed scale (the same formula as stepNeed).
export const needIndex = (c, pi, x, P) => 0.05 + (clamp(P.target - pi, 0, 2) + clamp(-x / 2, 0, 2) + clamp((c.unemp ?? 0) - (c.uBar ?? c.unemp ?? 0), 0, 2) + clamp(-(c.govPct ?? 0) / 3, 0, 2)) / 4;
// Routing kernel K_ij of §4.6, exactly as the engine routes: distance with the reach widened by local
// inflation dispersion, the source's export propensity, the target's room and need, within a currency area.
export function kernelMatrix(cells, pi, P, x = cells.map(c => c.x0 ?? 0)) {
  const N = cells.length, span = Math.max(0.1, P.piTh - P.target);
  const need = cells.map((c, j) => needIndex(c, pi[j], x[j], P));
  return cells.map((a, i) => {
    let gpi = 0, ws = 0;
    for (let j = 0; j < N; j++) { const d = distanceKm(a, cells[j]); const w = d ? Math.exp(-(d * d) / (2 * 600 * 600)) : 0; gpi += w * Math.abs(pi[j] - pi[i]); ws += w; }
    const sigma = P.sigma0 + P.alphaV * (ws ? gpi / ws : 0);
    const chi = clamp((pi[i] - P.target) / span, 0, 1);
    return cells.map((b, j) => {
      if (i === j || (a.area || a.id) !== (b.area || b.id)) return 0;
      const d = distanceKm(a, b);
      return Math.exp(-(d * d) / (2 * sigma * sigma)) * need[j] * chi * clamp((P.piTh - pi[j]) / span, 0, 1);
    });
  });
}

// Smallest k_A that brings the combined excess stock to S_crit by the end of the horizon (a feasibility
// check; the loss-minimising design is in §7.6).
export function optimiseKA(cells, P, scenario, opts = {}, { maxK = 1, iters = 14 } = {}) {
  // Per economy: contracts act on each economy's own stock against its own threshold (§4.3–4.4), so the
  // question is which economies end the horizon above S_crit without absorption, and the smallest k_A
  // that brings every one of them that can be reached down to its threshold.
  const prep = prepare(cells, P, scenario);
  const gaps = (k, Q = {}) => {
    const r = simulate(cells, { ...P, ...Q, kA: k }, scenario, { ...opts, prep, phx: true }), n = r.rec.t.length - 1;
    return cells.map((_, i) => r.rec.S[n][i] - r.rec.Scrit[n][i]);
  };
  const g0 = gaps(0), above = cells.map((_, i) => i).filter(i => g0[i] > 0);
  const names = ix => ix.map(i => cells[i].name);
  if (!above.length) return { kA: 0, above: [], reachable: [], unreachable: [] };
  const gMax = gaps(maxK);
  const reach = above.filter(i => gMax[i] <= 0), unreachable = above.filter(i => gMax[i] > 0);
  let kA = null;
  if (reach.length) {
    let lo = 0, hi = maxK;
    for (let n = 0; n < iters; n++) { const m = (lo + hi) / 2, g = gaps(m); if (reach.every(i => g[i] <= 0)) hi = m; else lo = m; }
    kA = hi;
  }
  // What stops the rest: relax one constraint at a time at k_A = 1 — the cap, then the trigger and the
  // guard (contracts keep absorbing while inflation is below the trigger or near target), then take-up.
  const why = {};
  if (unreachable.length) {
    const steps = [['cap', { capPct: 1e6 }], ['trigger', { capPct: 1e6, piTh: P.target, guard: false }], ['takeup', { capPct: 1e6, piTh: P.target, guard: false, r0: 1e-6 }]];
    let left = unreachable;
    for (const [reason, Q] of steps) {
      if (!left.length) break;
      const g = gaps(maxK, Q), ok = left.filter(i => g[i] <= 0);
      if (ok.length) why[reason] = names(ok);
      left = left.filter(i => g[i] > 0);
    }
    if (left.length) why.inflow = names(left);
  }
  return { kA, above: names(above), reachable: names(reach), unreachable: names(unreachable), why };
}

// Policy design by loss minimisation (§7.6): average of (π − π*)² + ω_x x² + ω_S overhang² over the
// horizon plus λ_C × cumulative premium in % of GDP. Multi-start Nelder–Mead over the policy
// parameters within their legal and design bounds; an optimum on a bound is a constrained optimum.
export const POLICY_BOUNDS = { kA: [0, 1], capPct: [0, 3], floorPct: [0, 1.5], piTh: [2, 5], rP: [0, 3] };
export function optimisePolicy(cells, P, scenario, opts = {}, { starts = 3, iters = 60, bounds = POLICY_BOUNDS } = {}) {
  const keys = Object.keys(bounds), lo = keys.map(k => bounds[k][0]), hi = keys.map(k => bounds[k][1]);
  const toQ = u => ({ ...P, ...Object.fromEntries(keys.map((k, j) => [k, lo[j] + (hi[j] - lo[j]) * Math.min(1, Math.max(0, u[j]))])) });
  const prep = prepare(cells, P, scenario);
  const cache = new Map();
  const f = u => {
    const key = u.map(x => Math.min(1, Math.max(0, x)).toFixed(4)).join(',');
    if (cache.has(key)) return cache.get(key);
    const Q = toQ(u), r = simulate(cells, Q, scenario, { ...opts, prep, phx: true });
    const v = r.totals.lossAvg + (Q.lossC ?? 1) * r.totals.costPctGDP;
    cache.set(key, v); return v;
  };
  const off = simulate(cells, P, scenario, { ...opts, prep, phx: false }).totals.lossAvg;
  const def = keys.map((k, j) => (P[k] - lo[j]) / (hi[j] - lo[j]));
  // Starts: the defaults, the quarter and three-quarter points, then a Halton sequence over the box.
  const halton = (i, b) => { let f = 1, r = 0; for (let k = i; k > 0; k = Math.floor(k / b)) { f /= b; r += f * (k % b); } return r; };
  const PR = [2, 3, 5, 7, 11, 13];
  const startsU = [def, keys.map(() => 0.25), keys.map(() => 0.75), ...Array.from({ length: Math.max(0, starts - 3) }, (_, i) => keys.map((_, j) => halton(i + 1, PR[j % PR.length])))].slice(0, starts);
  let best = null;
  const startBest = [];
  for (const x0 of startsU) {
    const n = keys.length;
    let simplex = [x0, ...keys.map((_, j) => x0.map((v, i) => (i === j ? Math.min(1, v + 0.2) : v)))].map(x => ({ x, v: f(x) }));
    for (let it = 0; it < iters; it++) {
      simplex.sort((a, b) => a.v - b.v);
      const c = keys.map((_, j) => simplex.slice(0, n).reduce((s, p) => s + p.x[j], 0) / n);
      const w = simplex[n], refl = c.map((cj, j) => cj + (cj - w.x[j])), vr = f(refl);
      if (vr < simplex[0].v) { const exp = c.map((cj, j) => cj + 2 * (cj - w.x[j])), ve = f(exp); simplex[n] = ve < vr ? { x: exp, v: ve } : { x: refl, v: vr }; }
      else if (vr < simplex[n - 1].v) simplex[n] = { x: refl, v: vr };
      else { const con = c.map((cj, j) => cj + 0.5 * (w.x[j] - cj)), vc = f(con); if (vc < w.v) simplex[n] = { x: con, v: vc }; else simplex = simplex.map((p, i) => (i === 0 ? p : { x: p.x.map((v, j) => simplex[0].x[j] + 0.5 * (v - simplex[0].x[j])), v: f(p.x.map((v, j) => simplex[0].x[j] + 0.5 * (v - simplex[0].x[j]))) })); }
    }
    simplex.sort((a, b) => a.v - b.v);
    startBest.push(simplex[0].v);
    if (!best || simplex[0].v < best.v) best = simplex[0];
  }
  const Qb = toQ(best.x);
  const atBound = keys.filter((k, j) => Math.abs(Qb[k] - lo[j]) < 1e-3 * (hi[j] - lo[j]) || Math.abs(Qb[k] - hi[j]) < 1e-3 * (hi[j] - lo[j]));
  return { best: Object.fromEntries(keys.map(k => [k, Qb[k]])), loss: best.v, lossNoPhoenix: off, lossDefault: f(def), atBound, evaluations: cache.size, starts: startBest.length, startSpread: Math.max(...startBest) - Math.min(...startBest) };
}
