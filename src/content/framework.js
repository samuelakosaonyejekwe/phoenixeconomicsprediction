// Objectives, control loop and glossary (Phoenix Economics Solutions).

export const OBJECTIVES = [
  { n: 1, short: 'Detect', title: 'Detect surplus funds in real time', where: ['detect', 'overview', 'data'], how: 'Excess deposits of households, firms and governments are measured from the quarterly financial accounts against their 2016–2019 pace as a share of GDP, and judged against a threshold set from two decades of pre-2020 history (Solutions §3.2–3.3).' },
  { n: 2, short: 'Absorb', title: 'Absorb excessive surplus before it destabilises', where: ['simulate', 'contracts', 'governance'], how: 'Contracts engage only when inflation is above the trigger and the stock is above its historical threshold; they convert a share of the stock above the floor each month under a legal cap, through statutory transfers for public deposits and voluntary remunerated instruments for private ones (§4.3–4.4, §2).' },
  { n: 3, short: 'Measure the inflation effect', title: 'Measure the effect on inflation dynamically', where: ['simulate', 'stability', 'validate', 'pilot'], how: 'The effect of absorption on inflation is computed against a no-Phoenix counterfactual with an estimated energy–core Phillips curve, output gap and policy rate. It is immaterial (thousandths of a point); stabilising inflation remains the central bank’s task (§4.8–4.10, §7).' },
  { n: 4, short: 'Convert to PHX', title: 'Convert absorbed surplus into programmable PHX credits', where: ['simulate', 'redistribute'], how: 'Every absorbed euro becomes a PHX credit, released into wallets only once inflation is back at target and maturing back to holders; the conservation identity reconciles every euro (§4.5, §4.13).' },
  { n: 5, short: 'Redistribute', title: 'Redistribute liquidity intelligently', where: ['redistribute'], how: 'A distance kernel routes wallet liquidity within a currency area from economies above target to economies with measured slack and room below the trigger (§4.6).' },
  { n: 6, short: 'Prevent overheating', title: 'Prevent wallet oversaturation and overheating', where: ['redistribute', 'simulate'], how: 'Wallet saturation drives a recall into the Digital Euro within its holding capacity, bank accounts, or — in an inflation crisis — the Dragon reserve held at the central bank (§4.7).' },
  { n: 7, short: 'Activate contracts', title: 'Activate smart contracts when thresholds are breached', where: ['contracts'], how: 'Activation (smooth or step with hysteresis) arms and fires contracts from live inflation and the measured excess stock (§4.3).' },
  { n: 8, short: 'Feedback loop', title: 'Close the economic feedback loop', where: ['stability', 'overview'], how: 'The policy rate responds to Phoenix’s effect on area inflation and output; an optional feedback law can tighten absorption when inflation is above target or accelerating (§4.10–4.11).' },
  { n: 9, short: 'Reduce the overhang', title: 'Reduce the stock overhang and track economic disorder', where: ['stability'], how: 'A loss-based disorder index (inflation and output gaps) and the overhang of the excess stock above its threshold are reported with and without Phoenix (§4.12).' },
  { n: 10, short: 'Pre-empt', title: 'Detect problems pre-emptively', where: ['forecast', 'validate'], how: 'An energy–core projection with simulated breach probabilities (Student-t energy shocks), tested on 2001–2017 and 2018–2026 against real-time benchmarks; better on average, not significantly for point forecasts (§6).' },
  { n: 11, short: 'Audit', title: 'Provide auditable, programmable intervention', where: ['contracts', 'pilot'], how: 'Every trigger is written to a signed, hash-chained ledger; chain heads are entered in the public Sigstore Rekor log and verified in the browser against Rekor itself (§9.4).' },
  { n: 12, short: 'Integrate', title: 'Integrate everything into one real-time control framework', where: ['overview', 'simulate', 'framework'], how: 'One coupled model on live official data, with every parameter estimated, sourced or declared; the Evidence page reproduces the paper’s results from its archived data (§4, §9.6, Table 6).' },
];

export const LOOP = [
  { k: 'detect', label: 'Detect', pde: '§3.2 · §4.2' },
  { k: 'activate', label: 'Activate', pde: '§4.3' },
  { k: 'absorb', label: 'Absorb', pde: '§4.4' },
  { k: 'convert', label: 'Convert', pde: '§4.5' },
  { k: 'redistribute', label: 'Route', pde: '§4.6 · §4.7' },
  { k: 'stabilise', label: 'Stabilise', pde: '§4.8 – §4.12' },
  { k: 'feedback', label: 'Feedback / recall', pde: '§4.11 · §4.7' },
];

export const GLOSSARY = [
  ['S', 'Excess deposits (€bn): deposit transactions since 2020 above their 2016–2019 pace as a share of GDP'], ['I', 'New excess inflow (€bn / month), decaying by sector'],
  ['π', 'Inflation (%, HICP year-on-year) = energy share × energy inflation + core share × core inflation'], ['x', 'Output gap (% of potential)'], ['i', 'Policy rate (%)'], ['Φ', 'Absorption (€bn / month)'],
  ['C', 'PHX credits held (€bn)'], ['L', 'PHX liquidity in wallets (€bn)'], ['Θ', 'Contract activation (0–1)'], ['K', 'Routing kernel'],
  ['F', 'Feedback field (optional)'], ['𝒟', 'Disorder index (π − π*)² + ω_x x²'], ['S_crit', 'Threshold: 90th percentile of pre-2020 accumulations of the same length (% of GDP)'], ['π_th', 'Trigger inflation'],
  ['κ', 'Phillips-curve slope (IV estimate)'], ['s_k', 'Annual spending rate out of sector k’s excess'], ['m', 'Demand multiplier'], ['φ_sel', 'Spending share of the funds actually placed in PHX (measured by the trial)'],
];
