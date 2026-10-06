// Parameter catalogue (Phoenix Economics Solutions, Table 6). Provenance: D = estimated from data,
// L = empirical literature, P = policy design choice, M = to be measured by the randomised trial
// (§10), N = numerical setting. `ext` marks optional levers that are neutral by default.

export const PARAM_GROUPS = [
  {
    id: 'detect', title: 'Measurement (§3.2–3.4, §4.2)', pde: ['SURPLUS'],
    params: [
      { k: 'scritMode', label: 'Critical stock S_crit', def: 'hist90', cal: 'D', options: [['hist90', '90th percentile of pre-2020 history'], ['hist75', '75th percentile of pre-2020 history'], ['fixed', 'Fixed share of GDP (below)']], help: 'Excess deposits larger than this share of pre-2020 episodes of the same length are exceptional (§3.3).' },
      { k: 'scritPct', label: 'Fixed S_crit, % of GDP (when chosen above)', def: 10, min: 0.5, max: 30, step: 0.5, cal: 'P', help: 'Used only when the critical stock is set to a fixed share of GDP: excess deposits above this share count as exceptional (§3.3, §7.5).' },
      { k: 'floorPct', label: 'Absorption floor, × S_crit', def: 0.6, min: 0, max: 1.2, step: 0.05, cal: 'P', help: 'Absorption stops once the excess stock falls to this multiple of S_crit, so Phoenix never drains deposits below that level (§4.4).' },
      { k: 'accStart', label: 'Accumulation starts', def: '2020-Q1', cal: 'P', options: [['2020-Q1', '2020 Q1'], ['2021-Q1', '2021 Q1'], ['2022-Q1', '2022 Q1']], help: 'Quarter from which deposits above the 2016–2019 pace are accumulated into the excess stock. Later starts exclude the pandemic build-up (§3.2, §7.5).' },
      { k: 'lamGov', label: 'λ government', def: 1, min: 0, max: 2, step: 0.05, cal: 'P', help: 'Weight of government excess deposits in the stock that triggers and is absorbed; 1 counts them fully, 0 ignores them (§4.2).' },
      { k: 'lamCorp', label: 'λ corporate', def: 1, min: 0, max: 2, step: 0.05, cal: 'P', help: 'Weight of corporate excess deposits in the stock that triggers and is absorbed; 1 counts them fully, 0 ignores them (§4.2).' },
      { k: 'lamHh', label: 'λ household', def: 1, min: 0, max: 2, step: 0.05, cal: 'P', help: 'Weight of household excess deposits in the stock that triggers and is absorbed; 1 counts them fully, 0 ignores them (§4.2).' },
      { k: 'sdHh', label: 's_hh spending out of household excess, per year', def: 0.1, min: 0.02, max: 0.4, step: 0.01, cal: 'L', help: 'Upper end of wealth effects on consumption (about 0.02 at once, 0.09 in the long run for housing wealth; Carroll, Otsuka & Slacalek 2011); drawn 0.04–0.2 in the stress tests (§5.4, §7.7).' },
      { k: 'sdCorp', label: 's_corp spending out of corporate excess, per year', def: 0.15, min: 0, max: 0.4, step: 0.01, cal: 'M', help: 'Uncertain, and an assumption: investment–cash-flow sensitivities of about 0.2–0.5 (Fazzari, Hubbard & Petersen 1988) are disputed as a measure of financing constraints (Kaplan & Zingales 1997); drawn 0.05–0.3 in the stress tests and measured by the firm arm of the trial (§5.4, §10).' },
      { k: 'sdGov', label: 's_gov spending out of government excess, per year', def: 0, min: 0, max: 0.3, step: 0.01, cal: 'P', help: 'Zero by default: under the fiscal rules an unabsorbed surplus reduces debt; 0.1 and 0.2 are reported as sensitivities (§5.4, §7.4).' },
      { k: 'phiSel', label: 'φ_sel spending share of absorbed funds', def: 1, min: 0, max: 1, step: 0.05, cal: 'M', help: 'How much of the spending propensity applies to the funds that holders actually move into PHX. 1 is the upper bound; the randomised trial measures it (§4.8, §10).' },
      { k: 'd0', label: 'd₀ cross-border diffusion, per month', def: 0, min: 0, max: 0.1, step: 0.005, cal: 'P', ext: true, help: 'Monthly rate at which excess stocks diffuse between neighbouring economies on the network. Zero by default: deposits stay where they are held (§4.1–4.2).' },
    ],
  },
  {
    id: 'trigger', title: 'Contract activation (§4.3)', pde: ['PTAP'],
    params: [
      { k: 'piTh', label: 'π_th trigger inflation, %', def: 3.0, min: 0.5, max: 8, step: 0.1, cal: 'P', help: 'Contracts activate when inflation rises above this rate and the excess stock is above S_crit (§4.3).' },
      { k: 'trigMode', label: 'Trigger switch', def: 'sigmoid', cal: 'P', options: [['sigmoid', 'Smooth (logistic)'], ['heaviside', 'Step with hysteresis']], help: 'Smooth: activation rises gradually around the trigger. Step with hysteresis: switches on at the trigger and off only once inflation falls below the trigger minus the band (§4.3).' },
      { k: 'epsPi', label: 'ε switch softness, pp', def: 0.25, min: 0.05, max: 2, step: 0.05, cal: 'P', help: 'Width of the smooth switch: how many points around the trigger activation takes to go from weak to strong (§4.3).' },
      { k: 'hyst', label: 'Hysteresis band, pp', def: 0.3, min: 0, max: 1.5, step: 0.05, cal: 'P', help: 'With the step switch, inflation must fall this far below the trigger before contracts stand down, which prevents flickering on and off (§4.3).' },
      { k: 'alphaT', label: 'α activation speed, per month', def: 1, min: 0, max: 5, step: 0.1, cal: 'P', help: 'How fast activation builds once both conditions hold, per month (§4.3).' },
      { k: 'nu', label: 'ν activation decay, per month', def: 0.05, min: 0, max: 1, step: 0.01, cal: 'P', help: 'How fast activation fades when conditions ease, per month (§4.3).' },
    ],
  },
  {
    id: 'absorb', title: 'Absorption, credits and premium (§4.4–4.5)', pde: ['ABSORB', 'CREDIT'],
    params: [
      { k: 'kA', label: 'k_A absorption speed, per month', def: 0.15, min: 0, max: 1, step: 0.01, cal: 'P', help: 'Share of the absorbable stock above the floor converted to PHX each month at full activation (§4.4).' },
      { k: 'capPct', label: 'Absorption cap, % of GDP per year', def: 1, min: 0.1, max: 5, step: 0.1, cal: 'P', help: 'Legal ceiling on absorption: at most this share of GDP a year, whatever the stock (§2.3, §4.4).' },
      { k: 'rP', label: 'r_p premium paid on PHX balances, % a year', def: 1, min: 0, max: 5, step: 0.25, cal: 'P', help: 'Paid by the mandate-holder into holders’ wallets; it is income and therefore expansionary (§4.5).' },
      { k: 'r0', label: 'r₀ take-up scale of voluntary instruments, pp', def: 2, min: 0.25, max: 10, step: 0.25, cal: 'M', help: 'Share of the private stock that holders are willing to place: u = 1 − e^(−r_p/r₀). Measured by the premium arms of the trial (§2.4, §10).' },
      { k: 'theta2', label: 'θ₂ credit release, per month', def: 0.05, min: 0, max: 0.3, step: 0.005, cal: 'P', help: 'Monthly rate at which PHX credits are released into spendable wallets once inflation is back at the release level (§4.5).' },
      { k: 'piRel', label: 'π_rel release level, %', def: 2, min: 0, max: 6, step: 0.1, cal: 'P', help: 'Credits are released into spendable wallets only once inflation is back at this level (the target); releasing at the trigger returns money while inflation is still above target (§4.5, §7.4).' },
      { k: 'matMonths', label: 'Credit maturity, months', def: 36, min: 6, max: 120, step: 6, cal: 'P', help: 'Credits mature at rate 1/maturity whatever the inflation rate and return to holders’ bank accounts: the exit path (§4.5, §7.9).' },
      { k: 'guard', label: 'Overshoot guard (fade absorption near target)', def: true, bool: true, cal: 'P', help: 'Fades absorption as inflation approaches target, so Phoenix does not keep absorbing after the surge has passed (§4.4).' },
    ],
  },
  {
    id: 'wallet', title: 'Wallets, routing & recall (§4.6–4.7)', pde: ['WALLET', 'ROUTE'],
    params: [
      { k: 'sigma0', label: 'σ₀ routing reach, km', def: 700, min: 100, max: 4000, step: 50, cal: 'P', help: 'Typical distance over which wallet liquidity is routed between economies of the same currency area (§4.6).' },
      { k: 'alphaV', label: 'α_v reach widening, km per pp', def: 150, min: 0, max: 1000, step: 10, cal: 'P', help: 'Widens the routing reach where inflation differs more between neighbours, in km per point of difference (§4.6).' },
      { k: 'tau', label: 'τ routing speed, share of wallet per month', def: 0.1, min: 0, max: 0.6, step: 0.01, cal: 'P', help: 'Share of an overheating economy’s wallet balance exported each month to economies with room below the trigger (§4.6).' },
      { k: 'Dl', label: 'D_l wallet diffusion within a currency area', def: 0.01, min: 0, max: 0.2, step: 0.005, cal: 'P', help: 'Gentle spreading of wallet balances between neighbouring economies of one currency area, per month (§4.6).' },
      { k: 'etaC', label: 'η_c wallet spending, per month', def: 0.058, min: 0, max: 0.3, step: 0.002, cal: 'L', help: 'Half of a liquid windfall spent within a year: lottery prizes in Norway (Fagereng, Holm & Natvik 2021) and an average MPC of 0.48 in Italian survey data (Jappelli & Pistaferri 2014): 1 − e^(−12η) = 0.5 (§5.4).' },
      { k: 'lcapPct', label: 'Wallet capacity, % of GDP', def: 0.4, min: 0.05, max: 3, step: 0.05, cal: 'P', help: 'Wallet balances above which an economy counts as saturated, in % of its GDP (§4.7).' },
      { k: 'recallAt', label: 'Recall threshold (saturation)', def: 0.85, min: 0.3, max: 1, step: 0.01, cal: 'P', help: 'Saturation level H* above which wallet balances are recalled (§4.7).' },
      { k: 'recallRate', label: 'Recall speed', def: 0.5, min: 0, max: 2, step: 0.05, cal: 'P', help: 'Speed at which balances above the saturation level are recalled, per month (§4.7).' },
      { k: 'piCrisis', label: 'Crisis (Dragon reserve) mode above π, %', def: 6, min: 3, max: 20, step: 0.5, cal: 'P', help: 'Above this inflation, recalled balances go to the Dragon reserve instead of the Digital Euro or bank accounts (§4.7).' },
      { k: 'deLimit', label: 'Digital Euro holding limit, € per person', def: 3000, min: 0, max: 10000, step: 500, cal: 'P', help: 'Recall into the Digital Euro stops at the holding limit; the rest is swept to linked bank accounts (§2.2, §4.7).' },
      { k: 'deAdopt', label: 'Digital Euro adoption, share of population', def: 0.5, min: 0, max: 1, step: 0.05, cal: 'P', help: 'Share of the population holding a Digital Euro wallet; with the holding limit it sets how much can be recalled into it (§4.7).' },
    ],
  },
  {
    id: 'macro', title: 'Demand, inflation & policy rate (§4.8–4.10)', pde: ['GAP', 'PHILLIPS', 'RATE'],
    params: [
      { k: 'kappaPC', label: 'κ Phillips slope (core), pp per year per pp of output gap', def: 0.117, min: 0, max: 0.4, step: 0.001, cal: 'D', help: 'Instrumental-variables estimate on core inflation, EU panel 2001–2025, instruments: lagged gap and rest-of-world gap (§5.1).' },
      { k: 'gammaE', label: 'γ_E energy pass-through to core, pp per year per pp of energy inflation', def: 0.09, min: 0, max: 0.3, step: 0.001, cal: 'D', help: 'Second-round effect of energy inflation on core inflation, estimated jointly with κ (§5.1).' },
      { k: 'eMean', label: 'ē mean energy inflation, %', def: 4.37, min: 0, max: 10, step: 0.01, cal: 'D', help: 'Sample mean of December energy inflation 2001–2025 (§4.9).' },
      { k: 'aPanel', label: 'a annual reversion of core inflation to the anchor (panel)', def: 0.599, min: 0.05, max: 0.9, step: 0.001, cal: 'D', help: 'Estimated jointly with κ (§5.1); a test does not reject equal speeds across economies, so every economy uses it (§3.6).' },
      { k: 'mult', label: 'm demand multiplier', def: 0.6, min: 0, max: 1.5, step: 0.05, cal: 'L', help: 'Government-spending multipliers of about 0.6–1 in normal times (Ramey 2019); higher in deep downturns (Blanchard & Leigh 2013), covered by m = 1.5 in the sensitivity analysis (§5.4, §7.4).' },
      { k: 'lamX', label: 'λ_x output-gap adjustment, per month', def: 0.034, min: 0.005, max: 0.2, step: 0.001, cal: 'D', help: 'From the persistence of euro-area output gaps, ρ = 0.66 a year: λ_x = −ln ρ / 12 (§5.3).' },
      { k: 'sigR', label: 'σ_r real-rate effect, per month', def: 0.033, min: 0, max: 0.2, step: 0.001, cal: 'L', help: 'How strongly the real interest rate gap closes the output gap, per month (§4.8, §5.3).' },
      { k: 'rStar', label: 'r* neutral real rate, %', def: 0.5, min: -1, max: 3, step: 0.1, cal: 'L', help: 'Upper end of euro-area estimates, which were close to zero before the pandemic (Holston, Laubach & Williams 2017); r* = 0 is reported as a sensitivity (§5.4, §7.4).' },
      { k: 'rateMode', label: 'Policy-rate baseline', def: 'market', cal: 'P', options: [['market', 'Market forward path (euro area) + Taylor response'], ['taylor', 'Taylor rule everywhere']], help: 'Market: today’s rate followed by the forward curve, plus a Taylor response to Phoenix’s own effect. Taylor: the rule everywhere from today’s rate (§4.10).' },
      { k: 'tPi', label: 'Taylor weight on inflation', def: 1.5, min: 1, max: 3, step: 0.1, cal: 'L', help: 'Response of the policy rate to inflation above target in the Taylor rule; 1.5 is Taylor’s (1993) value (§4.10).' },
      { k: 'tX', label: 'Taylor weight on output gap', def: 0.5, min: 0, max: 1.5, step: 0.1, cal: 'L', help: 'Response of the policy rate to the output gap in the Taylor rule; 0.5 is Taylor’s (1993) value (§4.10).' },
      { k: 'lamI', label: 'λ_i rate smoothing, per month', def: 0.075, min: 0.01, max: 0.5, step: 0.005, cal: 'L', help: 'Quarterly smoothing ≈ 0.79 (Clarida, Galí & Gertler 2000): 1 − 0.79^(1/3) (§5.4).' },
      { k: 'kStance', label: 'k_z policy-stance effect on core inflation, pp per month per pp of lagged rate change', def: 0, min: 0, max: 0.5, step: 0.001, cal: 'D', ext: true, help: 'Optional. Off by default: the estimated reversion of core inflation already contains the systematic policy response; with the channel on at the value that reproduces the ECB staff estimate of the 2022–23 tightening (ECB Economic Bulletin 3/2023, Box 6), the model’s error over 2022–24 rises (§5.3).' },
      { k: 'tauStance', label: 'τ_z lag of the policy-stance channel, months', def: 12, min: 3, max: 36, step: 1, cal: 'L', help: 'Months over which a change in the policy rate builds up in the optional stance channel on core inflation (§4.9, §5.3).' },
      { k: 'iFloor', label: 'Policy-rate floor, %', def: -0.5, min: -1, max: 1, step: 0.1, cal: 'L', help: 'Lowest policy rate the Taylor rule may set, %; the ECB’s deposit rate reached −0.5% (§4.10).' },
      { k: 'target', label: 'Inflation target π*, %', def: 2, min: 0, max: 6, step: 0.1, cal: 'P', help: 'The central bank’s inflation target; activation, the release of credits and the loss are measured against it (§4.8–4.12).' },
    ],
  },
  {
    id: 'stab', title: 'Feedback & loss (§4.11–4.12, §7.6)', pde: ['FEEDBACK', 'LOSS'],
    params: [
      { k: 'fbGain', label: 'γ feedback gain on k_A and π_th', def: 0, min: 0, max: 2, step: 0.05, cal: 'P', ext: true, help: 'Optional: off by default; with γ = 0.5 it changes the effect very little (§4.11, §7.4).' },
      { k: 'rhoF', label: 'ρ_F weight on inflation acceleration', def: 2, min: 0, max: 10, step: 0.1, cal: 'P', ext: true, help: 'In the optional feedback law, the weight on rising inflation: accelerating inflation strengthens absorption (§4.11).' },
      { k: 'kI', label: 'k_I weight on the inflation gap', def: 0.05, min: 0, max: 0.5, step: 0.01, cal: 'P', ext: true, help: 'In the optional feedback law, the weight on inflation above target (§4.11).' },
      { k: 'nuF', label: 'ν_F feedback leak, per month', def: 0.1, min: 0, max: 1, step: 0.01, cal: 'P', ext: true, help: 'Rate at which the feedback field decays back to zero, per month (§4.11).' },
      { k: 'xi', label: 'ξ weight on wallet saturation', def: 0, min: 0, max: 2, step: 0.05, cal: 'P', ext: true, help: 'In the optional feedback law, the weight on wallet saturation above H* (§4.11).' },
      { k: 'lossX', label: 'ω_x loss weight on the output gap', def: 0.25, min: 0, max: 2, step: 0.05, cal: 'P', help: 'Standard central-bank loss weight (Svensson 1997; Woodford 2003) (§4.12).' },
      { k: 'lossS', label: 'ω_S loss weight on the excess-stock overhang', def: 0.1, min: 0, max: 2, step: 0.05, cal: 'P', help: 'How much the loss counts excess deposits above S_crit; a declared policy weight, varied from 0 to 1 in §7.6.' },
      { k: 'lossC', label: 'ω_C loss weight on fiscal cost, per % of GDP', def: 1, min: 0, max: 10, step: 0.1, cal: 'P', help: 'How much the loss counts the premium paid on PHX balances, per % of GDP (§4.12).' },
    ],
  },
  {
    id: 'run', title: 'Run', pde: [],
    params: [
      { k: 'months', label: 'Horizon, months', def: 24, min: 3, max: 120, step: 1, cal: 'N', help: 'Length of the simulation, in months.' },
      { k: 'dt', label: 'Time step, months', def: 0.025, min: 0.005, max: 0.25, step: 0.005, cal: 'N', help: 'First-order explicit scheme; halving the default step changes the reported effects by less than 1% (§8).' },
      { k: 'phx', label: 'Phoenix enabled', def: true, bool: true, help: 'Switch Phoenix off to see the no-Phoenix counterfactual on its own.' },
      { k: 'nowcast', label: 'Start from today’s daily inflation nowcast', def: true, bool: true, help: 'Daily oil prices in euro and the euro exchange rate, with coefficients estimated on EU data (§3.7).' },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(PARAM_GROUPS.flatMap(g => g.params.map(p => [p.k, p.def])));
export const PARAM_INDEX = Object.fromEntries(PARAM_GROUPS.flatMap(g => g.params.map(p => [p.k, { ...p, group: g.id }])));

export const SCENARIOS = {
  live: { label: 'Live data (current conditions)', desc: 'Initial state built from the latest official releases.', patch: {} },
  reference: { label: 'EU-27 aggregate today', desc: '§7.1: the EU-27 aggregated into one economy on today’s data.', patch: {}, referenceCase: 'today' },
  episode: { label: 'EU-27 as of 31 December 2021', desc: '§7.2: the EU-27 aggregate on the data published by 31 December 2021 (inflation to November 2021, accounts to 2021 Q2, IMF October 2021, forward curve of 31 December 2021).', patch: {}, referenceCase: 'past', asOf: '2021-11' },
  energy: { label: 'Energy price shock', desc: 'Inflation jumps 2.5 pp, with an added upward drift of 0.15 pp a month that fades with the trend half-life.', patch: {}, shock: { dPi: 2.5, drift: 0.15 } },
  surge: { label: 'Surplus surge', desc: 'Windfall revenues and retained profits lift the excess stock 60% and treble new inflows.', patch: {}, shock: { sMul: 1.6, iMul: 3 } },
  slump: { label: 'Demand slump', desc: 'Inflation falls 1.5 pp and the output gap opens 2 pp; contracts should stay dormant and release liquidity.', patch: {}, shock: { dPi: -1.5, drift: -0.08, dx: -2 } },
};
