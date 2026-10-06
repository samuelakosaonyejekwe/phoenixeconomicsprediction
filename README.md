# Phoenix Economics

A live, installable web application implementing **Phoenix Economics Solutions: A Network Differential-Equation Framework for Real-Time Surplus Absorption, Liquidity Routing and Inflation Early Warning** (6 October 2026, on data archived on 4 October 2026). Section, table and figure references in the app (Solutions §…) are to that paper.

The coupled model runs in the visitor's browser on today's official data for the euro area, the EU-27 or a 29-economy global panel: excess deposits by sector against a threshold set from history, contract activation, absorption, PHX credits, wallets, routing, recall, the output gap, energy and core inflation with a Phillips curve estimated by instrumental variables, the policy rate, and the loss. Every result is shown against a no-Phoenix counterfactual.

## What it does

| Objective | Where |
|---|---|
| 1. Detect surplus in real time | Surplus radar: excess deposits of households, firms and governments from the quarterly financial accounts, against the 90th percentile of pre-2020 history |
| 2. Absorb excessive surplus | Simulation lab: activation only when inflation and the stock are both exceptional; absorption above a floor under a legal cap |
| 3. Measure the inflation effect | Lab and Evidence: energy–core Phillips curve, output gap, policy rate; the effect is reported against a counterfactual and is immaterial |
| 4. Convert to PHX credits | Credits released only once inflation is at target, maturing back to holders; exact conservation identity |
| 5. Redistribute intelligently | Redistribution: routing within a currency area towards economies with measured slack |
| 6. Prevent overheating | Wallet saturation and recall into the Digital Euro, bank accounts or the Dragon reserve |
| 7. Trigger contracts at thresholds | Contracts: smooth or step activation with hysteresis, live contract board |
| 8. Closed feedback loop | The policy rate responds to Phoenix's own effect; an optional feedback law |
| 9. Reduce entropy | Stability: disorder index and overhang, with a Lyapunov certificate in the paper |
| 10. Pre-empt problems | Early warning: energy–core projection and simulated breach probabilities, tested on 2001–2017 and 2018–2026 |
| 11. Auditable intervention | Signed, hash-chained ledger; chain heads entered in the public Sigstore Rekor log and verified in the browser against Rekor itself |
| 12. One integrated framework | Overview: the detect → activate → absorb → convert → route → stabilise → feedback loop, live |

### Stabilisation programmes on live data

Three pages run beside the core model on data each browser fetches itself, and write every change of state to the audit ledger. They do not change the core simulation or the paper's results.

| Page | Mechanisms | Live sources |
|---|---|---|
| Signals & triggers | Trigger board (inflation must be confirmed by a money or credit aggregate), deflation floor, economic health index, volatility index, hard cash against trend with a tiered conversion premium | Eurostat, ECB |
| Commodities & assets | Commodity basket in euro with price bands, floors and caps; currency credits tied to live series; housing signals with a diversion offer; currency depreciation, swap lines and reserve shares | INSEE, Eurostat, ECB |
| Funds & programmes | Debt exchange into PHX bonds with growth-linked repayments; stability fund in tranches; seven thematic funds (employment, exports, bank liquidity, ageing, research, green infrastructure, trade with the United Kingdom); proportional recall ladder with a capped Dragon reserve; instruments for excess PHX; the programme register | Eurostat, ECB, IMF |

The models are in `src/model/programmes.js`, their settings are stored per device, and `test/programmes.test.mjs` checks each rule.

The **Evidence** page shows the paper's results and reproduces them in the browser: it runs the same function as the paper's computation script (`src/model/reproduce.js`) on the archived data of 4 October 2026 and compares every value of the paper's core results — measurement, estimation, scenarios, sensitivity and instruments — with the published ones, to a relative tolerance of 10⁻⁹. The forecast backtest, the optimisation frontier, the stress tests, the trial simulations and the stability analysis take longer and are checked by `npm run test:full`. It also shows the paper's methodological risk register (Table 20): each risk, how it is removed or bounded, and the step that resolves it.

## Reproducing the paper

```sh
npm ci
npm test                         # mechanisms, programme rules, ledger and the paper's core results
npm run test:full                # recompute every published result and require equality to 1e-9 (about 10 minutes)
npm run paper                    # rewrite results, stability, tables (CSV) and figures (numpy, matplotlib)
```

`paper/` holds the archived data (`vintage-2026-10-04.json`), the IMF forecast vintages used for the real-time tests (`weo-vintages.json`: the EU economies, and growth and GDP of the other economies of the global panel for the rest-of-world instrument) and for the global monitor's forecast errors (`weo-inflation-global.json`), the published results and the scripts. Release **Phoenix Economics 1.0** (tag `v1.0`) marks the exact code and data of the paper.

## Data and freshness

The model runs entirely in the visitor's browser. Each browser fetches Eurostat, ECB, World Bank, DBnomics and INSEE data directly from the publishers (and the ECB's daily reference exchange rates through Frankfurter, an open relay of them) when the app opens and every 15 minutes while it is open, checks that the new data are plausible (non-empty, and the latest observation of every series the app relies on recent for its cadence), and stores them on the device. Three publishers are fetched by the refresh services instead — the IMF DataMapper (current vintage) and FRED (Brent prices), which do not accept requests from browsers, and the BIS (policy rates) — and reach the app in two baseline snapshots, which it re-reads at start-up and then hourly:

- **GitHub:** the workflow `.github/workflows/deploy.yml` rebuilds `data/snapshot.json` and redeploys GitHub Pages and Cloudflare Pages every hour: on GitHub's own schedule, and, because that schedule is often late or skipped, whenever the Cloudflare worker's hourly check finds the last run more than 50 minutes old. A source that fails keeps its last deployed copy and the run reports a warning.
- **Cloudflare:** the worker `phoenix-refresh` (`cloudflare/`) checks one of six source groups every 10 minutes, so every source hourly, stores a source when its data changed, and serves its snapshot at https://phoenix-refresh.flame-in-freefall.workers.dev/snapshot.json. On the Cloudflare host, `data/snapshot.json` is served from it by a Pages function (`functions/`). The same worker hosts the anchor log of the audit ledger and, once an hour, starts the GitHub workflow if it is overdue (`/health` reports its state).

The app applies the same plausibility check to every copy and takes the newest plausible one of each source from both, so either service can be down without stopping it.

## Offline and installation

The app is a Progressive Web App: installable on Windows, macOS, Linux, ChromeOS, Android and iOS/iPadOS, and fully usable offline or in airplane mode after the first visit, including the paper's archived data. `phoenix-offline.html` (built into `dist/` and attached to each release) is a single self-contained file that runs from disk with no host at all, including the reproduction of the paper.

## Hosts

| Host | Address |
|---|---|
| GitHub Pages | https://samuelakosaonyejekwe.github.io/phoenixeconomicsprediction/ |
| Cloudflare Pages | https://phoenixeconomics.pages.dev/ (deployed by the workflow when the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set) |

## Tests

| Command | What it checks | In CI |
|---|---|---|
| `npm test` | Model mechanisms, the rules of the stabilisation programmes, the data checks, the ledger and Rekor verification, and the reproduction of the paper's core results | Every run |
| `npm run test:e2e` | The built application in a headless browser under its own Content Security Policy: every page and its hover explanations, the December 2021 scenario, the in-browser reproduction, opening offline after a first visit and the single-file edition | Every run |
| `npm run test:full` | Recomputes every published result of the paper (about ten minutes locally, five in CI) and requires equality with `paper/results-2026-10-04.json` to a relative tolerance of 10⁻⁹ | Every push |

## Develop

Node 20 or later (CI uses 22; the two deploy scripts run the deployment tool under Node 22 themselves); `npm run paper` also needs Python 3 with numpy and matplotlib.

```sh
npm ci
npm run snapshot   # fetch a fresh data baseline
npm run build      # write dist/
npm run dev        # build and serve on http://localhost:8080
npm test           # regression tests
```

## Security

Strict Content-Security-Policy (scripts from the app's own origin only; network access limited to the data publishers named above with the Frankfurter relay, the Rekor transparency log and the app's own hosts), no cookies, no tracking, no third-party code at runtime, all external text inserted as text nodes, refusal to run inside another site's frame, and security headers via `_headers` on Cloudflare Pages. The deployment workflow runs with read-only repository permissions except for the Pages deployment, and its actions and the deployment tool are pinned to exact versions. Every run checks the dependencies against the registry's advisory database (`npm audit`) and reports a warning; the browser test replaces the anchor service with a local stand-in, so test runs enter nothing in the public transparency log.
