import { h, icon, num, pct, eur, download, toast } from '../ui/dom.js';
import { card, lineChart, SERIES, dataTable } from '../ui/charts.js';
import { simulate } from '../model/engine.js';
import { referenceCell } from '../model/inputs.js';
import { SCENARIOS } from '../model/params.js';
import * as PL from '../model/pilot.js';
import { pageHead, kpi, explain, empty, objectiveChips } from './common.js';

// Defaults are the household design of Solutions §10.2 (Table 18).
const st = { takeup: 0.2, takeupC: 0.01, deposit: 5000, delta: 0.1, sigma: 6000, r2: 0.5, attrition: 0.1, months: 12, premium: 1, perHousehold: 4, nudge: 5, seed: 20261004, imported: null, importName: '' };

const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');

// What a forgone-spending rate δ implies for inflation in the scenario where Phoenix engages — the EU-27
// on the data published by 31 December 2021 (§7.2): φ_sel = δ / s_hh (§10.3).
function implied(app, P, delta) {
  if (!app.data.weoVintages) { app.ensureVintages(); return null; }
  const cell = referenceCell(app.data, P, SCENARIOS.episode.asOf);
  if (!cell) return null;
  const Q = { ...P, phiSel: Math.min(1, Math.max(0, delta / (P.sdHh || 0.1))), months: 24 }, market = app.data.expect?.forwardsEpisode;
  const a = simulate([cell], Q, SCENARIOS.episode, { phx: true, market }).agg.at(-1);
  const b = simulate([cell], Q, SCENARIOS.episode, { phx: false, market }).agg.at(-1);
  return { dpi: a.pi - b.pi, di: a.i - b.i, phiSel: Q.phiSel };
}
const fx4 = r => (r ? `${num(r.dpi, 4)} pp` : 'loading…');

export function pilot(root, app) {
  if (!app.cells.length) return root.append(pageHead('Pilot planner'), empty());
  const P = app.params;
  const spec = { takeup: st.takeup, takeupC: st.takeupC, deposit: st.deposit, delta: st.delta, sigma: st.sigma, r2: st.r2, attrition: st.attrition };
  const nPerArm = PL.sampleSize(spec);
  const states = Object.fromEntries(app.cells.map(c => [c.id, app.contractState(c)]));
  const plan = PL.design(app.cells, states, P, { nPerArm: Number.isFinite(nPerArm) ? nPerArm : 0, seed: st.seed });
  const bud = PL.budget({ nPerArm, takeup: st.takeup, deposit: st.deposit, premium: st.premium, months: st.months, perHousehold: st.perHousehold, nudge: st.nudge });
  const curve = [0.25, 0.5, 0.75, 1, 1.5, 2, 3].map(f => [Math.round(nPerArm * f), PL.powerAt(nPerArm * f, spec)]);
  const demo = PL.simulateTrial({ n: Math.min(nPerArm, 20000), ...spec, seed: st.seed % 100003 });
  const demoEst = PL.estimate(demo);
  const imp = implied(app, P, st.delta);

  const field = (label, k, min, max, step, help) => h('label', { class: 'ctrl', 'data-tip': help },
    h('span', { class: 'ctrl-l' }, label, h('span', { class: 'help', tabindex: 0, role: 'note', 'aria-label': help, 'data-tip': help }, icon('info', 14))),
    h('div', { class: 'ctrl-in' },
      h('input', { type: 'range', min, max, step, value: st[k], oninput: e => { e.target.nextSibling.value = e.target.value; }, onchange: e => { st[k] = +e.target.value; app.rerender(); } }),
      h('input', { type: 'number', class: 'num', min, max, step, value: st[k], 'aria-label': label, onchange: e => { st[k] = +e.target.value; app.rerender(); } })));

  const controls = h('div', { class: 'ctrl-grid' },
    field('Effect to detect δ (spending forgone per € placed, per year)', 'delta', 0.02, 0.5, 0.01, 'δ = φ_sel × s_hh; the paper’s design detects δ = 0.10, the household spending rate s_hh (§10.2).'),
    field('Take-up among households offered a wallet', 'takeup', 0.02, 1, 0.01, 'Share of the treatment group that opens a PHX wallet. Lower take-up needs a larger sample.'),
    field('Average amount placed by those who take up, €', 'deposit', 500, 50000, 500, 'Average PHX balance of households that take up; €5,000 in the paper’s design, an assumption (§10.2).'),
    field('SD of the twelve-month change in household spending, €', 'sigma', 1000, 20000, 500, 'An assumption, to be measured by a pilot of about 2,000 households before the main trial is sized (§10.2, Table 19).'),
    field('Share of variance explained by pre-period spending, R²', 'r2', 0, 0.9, 0.05, 'ANCOVA adjustment for pre-period spending (§10.2).'),
    field('Attrition', 'attrition', 0, 0.5, 0.01, 'Share of households lost before the twelve-month outcome is measured; 10% in the paper’s design (§10.2).'),
    field('Take-up among controls (other channels)', 'takeupC', 0, 0.2, 0.005, 'Share of the control group that obtains a wallet anyway; it dilutes the difference between the arms (§10.2).'),
    field('Duration, months', 'months', 6, 24, 1, 'Length of the trial; sets how long the premium is paid (Table 18).'),
    field('Remuneration premium on wallets, % a year', 'premium', 0, 5, 0.25, 'Interest premium paid on trial wallets; 1% in the paper’s design (Table 18).'),
    field('Data and operations cost per household, €', 'perHousehold', 0, 50, 1, 'Cost of data collection and operations per household enrolled, an assumption (Table 18).'),
    field('Encouragement cost per household offered, €', 'nudge', 0, 50, 1, 'Cost of the offer and reminders per household offered a wallet, an assumption (Table 18).'),
    h('div', { class: 'ctrl' }, h('span', { class: 'ctrl-l', 'data-tip': 'Seed of the random assignment; recorded in the ledger at pre-registration so the allocation can be reproduced (§10.5).' }, 'Randomisation seed'),
      h('div', { class: 'ctrl-in' },
        h('input', { type: 'number', class: 'num', style: { width: '130px' }, value: st.seed, onchange: e => { st.seed = Math.abs(parseInt(e.target.value, 10)) || 1; app.rerender(); } }),
        h('button', { class: 'chip', onclick: () => { st.seed = Math.floor(Math.random() * 1e9); app.rerender(); } }, 'New draw'))));

  // Import observed trial data.
  const importOut = h('div');
  const showImport = () => {
    const r = st.imported;
    if (!r) { importOut.replaceChildren(h('p', { class: 'sub' }, 'No trial data loaded.')); return; }
    if (r.error) { importOut.replaceChildren(h('p', { class: 'note' }, r.error)); return; }
    const im = implied(app, P, Math.max(0, r.delta));
    importOut.replaceChildren(
      h('div', { class: 'kpis' },
        kpi({ label: `Estimated δ from ${st.importName}`, value: num(r.delta, 3), sub: `95% CI ${num(r.lo, 3)} to ${num(r.hi, 3)} · ${r.nT} treated, ${r.nC} control` }),
        kpi({ label: 'Take-up (treated / control)', value: `${pct(r.takeT * 100, 0)} / ${pct(r.takeC * 100, 0)}`, sub: `wallet difference €${num(r.dd, 0)} per household` }),
        kpi({ label: 'Implied inflation effect, EU-27 from December 2021', value: fx4(im), sub: im ? `at month 24 · φ_sel ${num(im.phiSel, 2)}` : '' }),
        kpi({ label: 'Model value now', value: num(P.phiSel, 2), sub: 'φ_sel, spending share of the funds placed in PHX' })),
      h('button', { class: 'btn', disabled: !(r.delta > 0 && r.delta < 1), onclick: async () => {
        const phi = Math.min(1, Math.max(0, r.delta / (P.sdHh || 0.1)));
        app.setParam('phiSel', Math.round(phi * 1000) / 1000);
        await app.logEntry({ kind: 'PILOT', cell: 'ALL', type: 'ESTIMATE_APPLIED', cause: `φ_sel set to ${num(phi, 3)} (δ ${num(r.delta, 3)} / s_hh ${P.sdHh}) from trial data ${st.importName} (CI for δ ${num(r.lo, 3)}–${num(r.hi, 3)}, ${r.nT}+${r.nC} households)`, indicators: {} });
        toast('Trial estimate applied to the model and recorded in the ledger.');
      } }, icon('check', 16), 'Apply estimate to the model'));
  };
  showImport();
  const fileIn = h('input', { type: 'file', accept: '.csv,text/csv', onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const r = PL.estimate(PL.parseTrialCSV(await f.text()));
      st.imported = r.ok ? r : { error: r.reason || 'Could not estimate: both arms need at least two households.' };
    } catch (err) { st.imported = { error: String(err.message || err) }; }
    st.importName = f.name; showImport();
  } });

  const protocol = () => ({
    title: 'Phoenix randomised wallet trial — protocol', region: app.region, createdAt: new Date().toISOString(), seed: st.seed,
    unit: 'household', assignment: 'Individual randomisation within economy strata, 1:1, by seeded draw',
    strata: plan.strata, nPerArm, durationMonths: st.months, takeupAssumed: st.takeup, depositAssumed: st.deposit, sigmaAssumed: st.sigma,
    hypothesis: { parameter: 'δ (fall in annual spending per € placed in a PHX wallet)', value: st.delta, alpha: 0.05, power: 0.8 },
    estimator: 'Wald / IV: δ̂ = −(ȳ_T − ȳ_C)/(d̄_T − d̄_C), y = change in annual spending, d = amount placed in the wallet; robust standard error',
    outcomes: { primary: 'Change in annual card and account spending (administrative data)', secondary: ['Total deposits', 'Wallet withdrawals'] },
    safeguards: ['Capital protection and withdrawal at any time', 'Data minimisation: only aggregates leave the bank partner', 'Mandate-holder may suspend; every suspension recorded in the ledger'],
  });

  const verdict = Number.isFinite(nPerArm) && nPerArm <= 100000 ? ['good', 'Feasible with bank partners'] : ['warn', 'Very large sample: raise take-up or deposits'];

  root.append(
    pageHead('Pilot planner', 'Design, size and pre-register a randomised trial that measures how much household spending falls per euro placed in a PHX wallet — the parameter that decides how much absorption lowers inflation (Solutions §10).'),
    h('div', { class: 'kpis' },
      kpi({ label: 'Households per arm', value: Number.isFinite(nPerArm) ? num(Math.round(nPerArm / 100) * 100, 0) : '–', sub: h('span', { class: ['badge', `t-${verdict[0]}`] }, verdict[1]) }),
      kpi({ label: 'Detectable δ with this sample', value: num(PL.mde(nPerArm, spec), 3), sub: '80% power, 5% significance' }),
      kpi({ label: 'Trial cost', value: `€${num(bud.total / 1e6, 2)}m`, sub: `€${num(bud.remuneration / 1e6, 2)}m premium · €${num(bud.ops / 1e6, 2)}m operations · €${num(bud.encouragement / 1e6, 2)}m encouragement` }),
      kpi({ label: 'Funds placed in wallets', value: `€${num(bud.held / 1e6, 0)}m`, sub: `${num(bud.takers, 0)} households take up` }),
      kpi({ label: 'If δ is as hypothesised', value: fx4(imp), sub: 'inflation effect at month 24, EU-27 from December 2021' })),
    h('div', { class: 'grid-2' },
      card({ title: 'Design settings', sub: 'Every change re-sizes the trial instantly', body: controls }),
      card({ title: 'Power by sample size', sub: `Probability of detecting δ = ${st.delta} (5% significance)`,
        body: lineChart({ series: [{ name: 'Power', color: SERIES[0], values: curve }], refs: [{ y: 0.8, label: '80% (conventional)' }], yMin: 0, yMax: 1, yFmt: v => `${num(v * 100, 0)}%`, xFmt: v => num(v, 0), xLabel: 'Households per arm', height: 200 }),
        table: () => ({ cols: ['Households per arm', 'Power'], rows: curve.map(([n, p]) => [num(n, 0), `${num(p * 100, 0)}%`]) }) })),
    card({ title: 'Strata and allocation', sub: `Economies with inflation within 0.5 pp of the trigger or above it, or excess deposits above S_crit — the largest six — allocated by GDP; households randomised 1:1 within each (seed ${st.seed}).`,
      body: plan.strata.length ? dataTable({ cols: ['Economy', 'Inflation', 'S / S_crit', 'Households per arm'], rows: plan.strata.map(s => [s.name, pct(s.pi), num(s.rho, 2), num(s.n, 0)]) }) : h('p', { class: 'sub' }, 'No economy currently meets the eligibility rule in this region.'),
      actions: h('div', { class: 'row wrap' },
        h('button', { class: 'btn btn-s', onclick: async () => {
          const text = JSON.stringify(protocol(), null, 1); const hash = await sha256(text);
          await app.logEntry({ kind: 'PILOT', cell: 'ALL', type: 'PRE_REGISTERED', cause: `Wallet trial for ${app.region}: ${num(nPerArm, 0)} households per arm in ${plan.strata.length} economies, ${st.months} months, seed ${st.seed}, protocol SHA-256 ${hash.slice(0, 16)}…`, indicators: {} });
          download(`phoenix-trial-protocol-${hash.slice(0, 8)}.json`, text); toast('Protocol pre-registered in the audit ledger and downloaded.');
        } }, icon('shield', 16), 'Pre-register')) }),
    h('div', { class: 'grid-3' },
      card({ title: 'Simulated trial', sub: `${num(demo.length / 2, 0)} households per arm, true δ = ${st.delta}`,
        body: demoEst.ok ? dataTable({ cols: ['Quantity', 'Value'], rows: [
          ['Estimated δ', `${num(demoEst.delta, 3)} (95% CI ${num(demoEst.lo, 3)} to ${num(demoEst.hi, 3)})`],
          ['Difference in mean spending change, € (T − C)', num(demoEst.itt, 1)],
          ['Difference in mean wallet amount, € (T − C)', num(demoEst.dd, 0)],
          ['Take-up in treated arm', pct(demoEst.takeT * 100, 1)]] }) : h('p', { class: 'sub' }, 'Not enough simulated households.'),
        actions: h('button', { class: 'btn btn-s btn-ghost', onclick: () => download('phoenix-trial-data-template.csv', PL.templateCSV(demo.slice(0, 400).concat(demo.slice(-400))), 'text/csv') }, icon('download', 16), 'Template') }),
      card({ title: 'Safeguards', body: h('ul', { class: 'steps' },
        h('li', null, 'Participation is voluntary; wallets are capital-protected and can be withdrawn at any time.'),
        h('li', null, 'Only aggregate statistics leave the partner banks; no individual data are held by Phoenix.'),
        h('li', null, 'The mandate-holder can suspend the trial; every suspension is recorded in the ledger.'),
        h('li', null, 'Control households are not contacted beyond normal account terms.')) }),
      card({ title: 'Load real trial results', sub: 'CSV with columns arm (T/C), deposit_eur, spend_pre, spend_post, and optionally id and took_up',
      body: h('div', null, fileIn, importOut) })),
    explain('Why a household trial',
      h('p', null, 'History cannot tell how much spending falls when idle savings move into a PHX wallet, because people who save more also differ in other ways. Randomly offering wallets solves this: the two groups differ only in the offer, so any difference in spending is caused by it. Because only some of those offered take it up, the effect per euro is the difference in spending divided by the difference in wallet balances (Solutions §10).'),
      h('p', null, 'The Wald ratio estimates the effect for households who take up because they were offered — the same households Phoenix would absorb from. The answer feeds the model as φ_sel = δ / s_hh. A firm arm of about 16,600 small and medium-sized firms per arm measures the corporate spending rate the same way, and premium arms of 0.5, 1 and 2 points measure take-up (Solutions §10.2–10.4).'),
      h('p', null, 'With the estimated Phillips curve, even a large δ moves inflation by thousandths of a point; the trial therefore also tells policymakers how much Phoenix can do for inflation, and how much it is instead a tool for managing idle money (Solutions §7, §10).')),
    objectiveChips([3, 10, 11]));
}
