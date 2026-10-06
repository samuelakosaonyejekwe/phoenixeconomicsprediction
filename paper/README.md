# Phoenix Economics Solutions — data, results and reproduction

This folder reproduces every number, table and figure of *Phoenix Economics Solutions: A Network
Differential-Equation Framework for Real-Time Surplus Absorption, Liquidity Routing and Inflation Early
Warning* (6 October 2026) from the data archived on 4 October 2026. Release **Phoenix Economics 1.0** (tag `v1.0`) marks
the exact code and data.

| File | Content |
|---|---|
| `vintage-2026-10-04.json` | All official data used, as fetched on 4 October 2026 (Eurostat, ECB, IMF, World Bank, BIS, FRED) |
| `weo-vintages.json` | IMF World Economic Outlook vintages 2009–2025, for the real-time tests and the December 2021 scenario: the EU economies, and growth and GDP of the other economies of the global panel for the rest-of-world instrument (`scripts/fetch-weo-vintages.mjs`) |
| `weo-inflation-global.json` | IMF inflation forecasts of the same vintages for the global panel's economies outside the EU, for the global monitor's forecast errors (`scripts/fetch-weo-inflation-global.mjs`) |
| `results-2026-10-04.json` | Every published result, with the parameter defaults used |
| `compute.mjs` | Computes the results: the core comes from `src/model/reproduce.js` (the same function the application's Evidence page runs), plus the forecast backtest, the optimisation frontier, the stress tests and the trial simulations |
| `stability.py` | Eigenvalues, Lyapunov certificate and input-to-state gain of the linearised euro-area network |
| `tables.py` | Writes the data of the computed tables and figures as CSV to `tables/` |
| `figures.py` | Draws Figures 1–8 to `figures/` |

```
node paper/compute.mjs          # → paper/results-2026-10-04.json   (Node 20+, about 10 minutes)
python3 paper/stability.py      # adds the stability results          (numpy)
python3 paper/tables.py         # → paper/tables/*.csv
python3 paper/figures.py        # → paper/figures/*.png               (matplotlib)
npm test                        # checks the mechanisms and the core published results
npm run test:full               # recomputes everything into a temporary folder and requires equality to 1e-9
```
