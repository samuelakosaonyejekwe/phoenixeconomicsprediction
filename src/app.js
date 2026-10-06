// Application state: data, region, parameters, memoised simulations and the live
// contract nowcast that writes real-data trigger changes to the audit ledger.
import { createDataStore, kvGet, kvSet } from './data/store.js';
import { buildCells, referenceCell, surplusOf, scritOf } from './model/inputs.js';
import { simulate, prepare } from './model/engine.js';
import { DEFAULTS, SCENARIOS, PARAM_INDEX } from './model/params.js';
import { forecastCell } from './model/forecast.js';
import { append as appendRaw, verify, anchor } from './model/ledger.js';
import { programmes, programmeStates, sanitizeProg, PROG_DEFAULTS, PROG_INDEX, QUIET } from './model/programmes.js';
import { GLOBAL } from './data/geo.js';

// Ledger key store (IndexedDB) and the public anchor log on the data worker (§9.4).
const keyStore = { get: k => kvGet(k), set: (k, v) => kvSet(k, v) };
// Every write to the ledger goes through one queue, so concurrent writers can never fork the chain.
let ledgerQueue = Promise.resolve();
const serial = fn => (ledgerQueue = ledgerQueue.then(fn, fn));
const append = (chain, entry) => serial(() => appendRaw(chain, entry, keyStore));
const anchorLog = () => { const ep = (globalThis.PHX_DATA_ENDPOINTS || [])[0]; return ep ? new URL('/anchor', ep).href : null; };

// Last recorded states, kept in memory as well as on the device: where the browser gives no storage
// (some private modes) a state is still recorded once per session, not at every data refresh.
const lastStates = new Map();
const recall = async k => (lastStates.has(k) ? lastStates.get(k) : kvGet(k));
const remember = async (k, v) => { lastStates.set(k, v); await kvSet(k, v); };

const LS = 'phx:prefs';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
const savePrefs = p => { try { localStorage.setItem(LS, JSON.stringify(p)); } catch {} };

// Currency names for the exchange-rate monitor.
const CCY_NAMES = { ...Object.fromEntries(GLOBAL.filter(c => c.ccy !== 'EUR').map(c => [c.ccy, c.name])), SEK: 'Sweden', DKK: 'Denmark', CZK: 'Czechia', HUF: 'Hungary', RON: 'Romania', PLN: 'Poland' };

export const REGIONS = { ea: 'Euro area (21)', eu: 'European Union (27)', global: 'Global (29 economies)' };

export function createApp() {
  const prefs = loadPrefs();
  const listeners = new Set();
  const app = {
    region: REGIONS[prefs.region] ? prefs.region : 'ea',
    scenario: SCENARIOS[prefs.scenario] ? prefs.scenario : 'live',
    params: sanitize({ ...DEFAULTS, ...(prefs.params || {}) }),
    prog: sanitizeProg(prefs.prog),
    data: {}, status: {}, snapshotInfo: null, refreshing: false,
    cells: [], ledger: [], ledgerOk: null, live: {},
    version: 0,
  };
  const emit = (kind = 'data') => { if (kind !== 'status') app.version++; for (const f of listeners) f(app, kind); };
  app.on = f => { listeners.add(f); return () => listeners.delete(f); };

  function sanitize(p) {
    for (const [k, v] of Object.entries(p)) {
      const meta = PARAM_INDEX[k];
      if (!meta) { delete p[k]; continue; }
      if (meta.options) { if (!meta.options.some(o => o[0] === v)) p[k] = meta.def; }
      else if (meta.bool) p[k] = !!v;
      else if (typeof v !== 'number' || !Number.isFinite(v)) p[k] = meta.def;
      else p[k] = Math.min(meta.max, Math.max(meta.min, v));
    }
    return p;
  }
  const persist = () => savePrefs({ region: app.region, scenario: app.scenario, params: app.params, prog: app.prog });

  // Pages are redrawn only when data actually change; progress updates refresh only the status chrome,
  // so open sections, focus and partly typed inputs are not lost while sources load.
  let lastPrint = null;
  const store = createDataStore(async ({ status, snapshotInfo, refreshing }) => {
    app.status = status; app.snapshotInfo = snapshotInfo; app.refreshing = refreshing;
    const print = store.fingerprint();
    if (print !== lastPrint) {
      lastPrint = print;
      app.data = store.dataView();
      if (app.weoVintages) app.data.weoVintages = app.weoVintages;
      rebuild();
      emit();
    } else emit('status');
    if (!refreshing) { await nowcast(); await signalPass(); }
  });

  function rebuild() {
    app.cells = buildCells(app.data, app.region, { nowcast: app.params.nowcast, P: app.params });
    app.dataStamp = (app.dataStamp || 0) + 1;
    memo.clear(); refMemo.clear(); stateMemo.clear(); progMemo.clear();
  }

  // Memoised simulation per (region, scenario, params, data version).
  const memo = new Map();
  // Reference scenarios are the EU-27 aggregated into one economy, today or on the data published by a
  // past date (§7.1–7.2); the euro-area market path is the forward curve of the same date (§4.10).
  const refMemo = new Map();
  app.simCells = () => {
    const sc = SCENARIOS[app.scenario];
    if (!sc.referenceCase) return app.cells;
    const key = JSON.stringify([sc.asOf || null, app.params.scritMode, app.params.scritPct, app.params.accStart, app.data.hicp ? 1 : 0, app.data.weoVintages ? 1 : 0]);
    if (!refMemo.has(key)) { const c = referenceCell(app.data, app.params, sc.asOf || null); refMemo.set(key, c ? [c] : []); }
    return refMemo.get(key);
  };
  app.marketPath = () => (SCENARIOS[app.scenario].asOf ? app.data.expect?.forwardsEpisode : app.data.expect?.forwards) || null;
  app.effParams = () => ({ ...app.params, ...(SCENARIOS[app.scenario].patch || {}) });
  app.sim = (phx = true, override) => {
    const P = { ...app.effParams(), ...(override || {}) };
    const key = JSON.stringify([app.region, app.scenario, phx, P, app.dataStamp, app.data.weoVintages ? 1 : 0]);
    if (!memo.has(key)) {
      const cells = app.simCells();
      if (!cells.length) return null;
      const sc = SCENARIOS[app.scenario];
      memo.set(key, simulate(cells, P, sc, { phx, prep: prepare(cells, P, sc), market: app.marketPath() }));
      if (memo.size > 24) memo.delete(memo.keys().next().value);
    }
    return memo.get(key);
  };

  app.setRegion = r => { if (!REGIONS[r]) return; app.region = r; persist(); rebuild(); emit(); nowcast().then(signalPass); };
  app.setScenario = sc => { if (!SCENARIOS[sc]) return; app.scenario = sc; persist(); memo.clear(); emit(); if (SCENARIOS[sc].asOf) app.ensureVintages(); };
  // IMF forecast vintages (2009–2025) for scenarios built on the data of a past date (§7.2), loaded on demand.
  app.ensureVintages = async () => {
    if (app.weoVintages || app.loadingVintages) return;
    app.loadingVintages = true;
    try {
      const embedded = globalThis.PHX_EMBED_PAPER?.weo;
      const r = embedded ? null : await fetch(new URL('data/paper/weo-vintages.json', location.href));
      if (embedded || r.ok) { app.weoVintages = (embedded || (await r.json())).vintages; app.data.weoVintages = app.weoVintages; refMemo.clear(); memo.clear(); emit(); }
    } catch {} finally { app.loadingVintages = false; }
  };
  app.setParam = (k, v) => { app.params = sanitize({ ...app.params, [k]: v }); persist(); if (['nowcast', 'accStart'].includes(k)) rebuild(); memo.clear(); stateMemo.clear(); emit(); };
  app.resetParams = () => { app.params = { ...DEFAULTS }; persist(); rebuild(); emit(); nowcast(); };
  app.refresh = () => store.refresh();

  // Live contract state from current data (no simulation), as in Table 10 of the paper:
  // ACTIVE (inflation above the trigger and the stock above S_crit), ARMED (one of the two), WATCH
  // (neither, but a breach probability of at least 25% or a stock projected above S_crit), DORMANT.
  // Θ* is the steady state of the activation equation of §4.3 with the switch the engine uses.
  const stateMemo = new Map();
  app.contractState = cell => {
    const P = app.params, key = `${cell.id}|${cell.pi}|${app.dataStamp}`;
    if (stateMemo.has(key)) return stateMemo.get(key);
    const Scrit = scritOf(cell, P), S = surplusOf(cell, P), rho = S / Scrit;
    const fc = forecastCell(cell, P);
    let state = 'DORMANT';
    if (cell.pi >= P.piTh && rho >= 1) state = 'ACTIVE';
    else if (cell.pi >= P.piTh || rho >= 1) state = 'ARMED';
    else if (fc.status !== 'clear') state = 'WATCH';
    const sw = P.trigMode === 'heaviside' ? (cell.pi >= P.piTh ? 1 : 0) : 1 / (1 + Math.exp(-(cell.pi - P.piTh) / P.epsPi));
    const ex = Math.max(0, rho - 1), drive = P.alphaT * sw * (ex / (0.25 + ex));
    const thetaStar = P.nu > 0 ? drive / (drive + P.nu) : drive > 0 ? 1 : 0;
    const out = { state, S, Scrit, rho, thetaStar, fc };
    stateMemo.set(key, out);
    return out;
  };

  // Stabilisation programmes on live data (src/model/programmes.js), with their own settings. The PHX in
  // circulation and the excess above wallet capacity come from the current simulation.
  const progMemo = new Map();
  app.programmes = () => {
    const key = JSON.stringify([app.region, app.scenario, app.dataStamp, app.prog, app.params]);
    if (!progMemo.has(key)) {
      let phx = 0, excess = 0;
      try { const sim = app.sim(true); if (sim) { phx = sim.totals.creditsHeld + sim.totals.walletsHeld; excess = sim.totals.recallDE + sim.totals.recallDeposits + sim.totals.recallDragon; } } catch {}
      progMemo.clear();
      progMemo.set(key, programmes(app.data, app.cells, app.params, app.prog, { phx, excess, names: CCY_NAMES }));
    }
    return progMemo.get(key);
  };
  // Shim so the parameter control of the core model also edits programme settings.
  app.progCtl = { get params() { return app.prog; }, setParam: (k, v) => app.setProg(k, v) };
  app.setProg = (k, v) => { if (!PROG_INDEX[k]) return; app.prog = sanitizeProg({ ...app.prog, [k]: v }); persist(); emit(); signalPass(); };
  app.resetProg = () => { app.prog = { ...PROG_DEFAULTS }; persist(); emit(); signalPass(); };

  // Every change of a programme state on real data is written to the audit ledger, like contract states.
  let signalling = Promise.resolve();
  const signalPass = () => (signalling = signalling.then(signalOnce, signalOnce));
  async function signalOnce() {
    if (!app.cells.length) return;
    let pr; try { pr = app.programmes(); } catch { return; }
    // Commodity prices, exchange rates and market volatility are the same in every region: their states
    // are remembered once, so switching region does not record them again.
    const all = programmeStates(pr), isShared = k => /^(commodity|currency|volatility)(:|$)/.test(k);
    const stores = [['prog:shared', Object.fromEntries(Object.entries(all).filter(([k]) => isShared(k)))], ['prog:' + app.region, Object.fromEntries(Object.entries(all).filter(([k]) => !isShared(k)))]];
    for (const [storeKey, next] of stores) {
    const prev = (await recall(storeKey)) || {};
    const why = key => {
      const [kind, id] = key.split(':');
      if (kind === 'trigger') return { cell: 'ALL', cause: pr.board.rows.filter(r => r.value != null).map(r => `${r.label} ${r.value.toFixed(2)}% (trigger ${r.threshold}%)`).join('; '), indicators: Object.fromEntries(pr.board.rows.filter(r => r.value != null).map(r => [r.k, +r.value.toFixed(3)])) };
      if (kind === 'volatility') return { cell: 'ALL', cause: `Volatility index ${pr.vol.index.toFixed(2)}× normal (alert ${app.prog.volTh}×)`, indicators: { index: +pr.vol.index.toFixed(3) } };
      if (kind === 'health') return { cell: 'ALL', cause: `Health index ${pr.health.index.toFixed(1)} (alert below ${app.prog.healthTh})`, indicators: { index: +pr.health.index.toFixed(2) } };
      if (kind === 'recall') return { cell: 'ALL', cause: `Inflation ${pr.board.pi?.toFixed(2)}% against the recall trigger ${app.prog.recallTh}%: ${pr.recall.share.toFixed(2)}% of PHX recalled`, indicators: { pi: +(pr.board.pi ?? 0).toFixed(3), share: +pr.recall.share.toFixed(3) } };
      if (kind === 'commodity') { const it = pr.basket.items.find(x => x.k === id); return { cell: it.label, cause: `${it.label} €${it.price.toFixed(2)} per ${it.each} (${it.period}) against the band €${it.lower.toFixed(2)}–${it.upper.toFixed(2)} around its five-year average`, indicators: { price: +it.price.toFixed(2), lower: +it.lower.toFixed(2), upper: +it.upper.toFixed(2) } }; }
      if (kind === 'housing') { const r = pr.bubble.rows.find(x => x.c.id === id); return { cell: id, cause: `${r.c.name} house prices (${r.quarter}): real growth ${r.real.toFixed(1)}%, gap from trend ${r.gap == null ? 'n/a' : r.gap.toFixed(1) + '%'}, loans to households ${pr.bubble.credit == null ? 'n/a' : pr.bubble.credit.toFixed(1) + '%'}; ${r.n} of 3 signals`, indicators: { real: +r.real.toFixed(2), gap: r.gap == null ? null : +r.gap.toFixed(2), signals: r.n } }; }
      if (kind === 'currency') { const r = pr.fx.rows.find(x => x.ccy === id); return { cell: id, cause: `${id} ${r.dep >= 0 ? 'down' : 'up'} ${Math.abs(r.dep).toFixed(1)}% against the ${r.against} in the twelve months to ${r.to} (trigger ${app.prog.devalTh}%)`, indicators: { depreciation: +r.dep.toFixed(2) } }; }
      return { cell: 'ALL', cause: key, indicators: {} };
    };
    let changed = false;
    for (const [key, st] of Object.entries(next)) {
      const before = prev[key] ?? (QUIET.has(st) ? st : null);
      if (before === st) continue;
      changed = true;
      const from = before ?? 'START';
      try { const w = why(key); await append(app.ledger, { kind: 'LIVE', cell: w.cell, type: `${key.split(':')[0].toUpperCase()}_${from}→${st}`, cause: w.cause, indicators: w.indicators }); } catch {}
    }
    if (changed || Object.keys(prev).length !== Object.keys(next).length) { await remember(storeKey, next); if (changed) { await kvSet('ledger', app.ledger); emit(); } }
    }
  }

  // One nowcast pass at a time; a request that arrives during a pass runs once it has finished.
  let nowcasting = null, nowcastAgain = false;
  async function nowcast() {
    if (nowcasting) { nowcastAgain = true; return nowcasting; }
    nowcasting = nowcastPass().finally(() => { nowcasting = null; if (nowcastAgain) { nowcastAgain = false; nowcast(); } });
    return nowcasting;
  }
  async function nowcastPass() {
    if (!app.cells.length) return;
    const prev = (await recall('live:' + app.region)) || {};
    const next = {};
    let changed = false;
    for (const c of app.cells) {
      const st = app.contractState(c);
      next[c.id] = st.state;
      if ((prev[c.id] || 'DORMANT') !== st.state) {
        changed = true;
        await append(app.ledger, {
          kind: 'LIVE', cell: c.id, type: `${prev[c.id] || 'DORMANT'}→${st.state}`,
          cause: `${c.name}: π ${c.pi}% (${c.nowcast && app.params.nowcast ? `nowcast ${c.nowcast.asOf}, official ${c.piOfficial}% ${c.piPeriod}` : c.piPeriod}) vs π_th ${app.params.piTh}%; S ${st.S.toFixed(1)} vs S_crit ${st.Scrit.toFixed(1)} €bn; breach probability ${(st.fc.pBreach * 100).toFixed(0)}%`,
          indicators: { pi: c.pi, S: +st.S.toFixed(2), Scrit: +st.Scrit.toFixed(2), Theta: +st.thetaStar.toFixed(3) },
        });
      }
    }
    app.live = next;
    if (changed) { await remember('live:' + app.region, next); await kvSet('ledger', app.ledger); emit(); }
  }

  app.logSimulation = async res => {
    for (const e of res.events.slice(0, 200)) {
      await append(app.ledger, { kind: 'SIM', cell: e.cell, type: e.type, cause: `t = ${e.t} mo · ${e.cause}`, indicators: e.indicators, converted: e.converted, into: e.into });
    }
    await kvSet('ledger', app.ledger); emit();
  };
  app.logEntry = async entry => { const e = await append(app.ledger, entry); await kvSet('ledger', app.ledger); emit(); return e; };
  app.verifyLedger = async () => {
    const log = anchorLog();
    const checkAnchors = log ? async h => { const r = await fetch(`${log}/${h}`, { cache: 'no-store' }); return r.ok ? r.json() : null; } : null;
    app.ledgerOk = await verify(app.ledger, { checkAnchors }); emit(); return app.ledgerOk;
  };
  app.anchorLedger = async () => {
    const log = anchorLog();
    if (!log) throw new Error('No anchor log configured.');
    const e = await serial(() => anchor(app.ledger, log, keyStore)); await kvSet('ledger', app.ledger); emit(); return e;
  };
  // Registers this device's signing key as the ledger's first entry and anchors it publicly (§9.4).
  const registerKey = async () => {
    await append(app.ledger, { kind: 'AUDIT', cell: 'ALL', type: 'KEY_REGISTERED', cause: 'Device signing key registered', indicators: {} });
    await kvSet('ledger', app.ledger);
    if (navigator.onLine) app.anchorLedger().catch(() => {});
  };
  app.clearLedger = async () => { app.ledger = []; app.ledgerOk = null; await kvSet('ledger', []); await remember('live:' + app.region, {}); await remember('prog:' + app.region, {}); await remember('prog:shared', {}); try { await registerKey(); } catch {} emit(); nowcast().then(signalPass); };

  app.start = async () => {
    app.ledger = (await kvGet('ledger')) || [];
    // A ledger must open with the registration of its signing key. A ledger kept from an earlier release
    // without one is preserved unchanged under 'ledger:previous' and a new ledger is started.
    if (app.ledger.length && app.ledger[0].type !== 'KEY_REGISTERED') { await kvSet('ledger:previous', app.ledger); app.ledger = []; await kvSet('ledger', []); }
    if (!app.ledger.length) { try { await registerKey(); } catch {} }
    await store.boot();
    if (SCENARIOS[app.scenario].asOf) app.ensureVintages();
  };
  return app;
}
