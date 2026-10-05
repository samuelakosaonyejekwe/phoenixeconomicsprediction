import json, os, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from math import erf, sqrt
# Draws Figures 1–8 of Phoenix Economics Solutions from paper/results-2026-10-04.json.
HERE = os.path.dirname(os.path.abspath(__file__))
o = json.load(open(os.path.join(HERE, 'results-2026-10-04.json'))); D = os.path.join(HERE, 'figures') + os.sep
os.makedirs(D, exist_ok=True)
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 9, 'axes.spines.top': False, 'axes.spines.right': False, 'axes.grid': True, 'grid.alpha': 0.25, 'figure.dpi': 200})
C1, C2, C3, C4 = '#2a6fdb', '#d9822b', '#4b9e6b', '#8a8a8a'
def save(n): plt.tight_layout(); plt.savefig(D + n, bbox_inches='tight'); plt.close()

# Figure 1. Excess deposits by euro-area economy, in % of GDP, against S_crit.
cells = sorted(o['eaCells'], key=lambda c: -c['S'] / c['gdp'])
fig, ax = plt.subplots(figsize=(6.6, 3.0)); x = np.arange(len(cells))
tot = np.array([100 * c['S'] / c['gdp'] for c in cells]); idle = np.array([100 * min(c['idle'], c['S']) / c['gdp'] for c in cells])
ax.bar(x, tot, color=C1, width=0.7, label='Excess deposits (F2)')
ax.bar(x, idle, color=C2, width=0.7, label='of which overnight and savings deposits (F21+F22)')
ax.scatter(x, [100 * c['Scrit'] / c['gdp'] for c in cells], marker='_', s=160, color='k', zorder=3, label='$S_{crit}$ (90th percentile of pre-2020 history)')
ax.set_xticks(x, [c['id'] for c in cells]); ax.set_ylabel('% of GDP')
ax.legend(frameon=False, fontsize=7, loc='upper right'); save('figure1.png')

# Figure 2. Reliability of the breach probability: hold-out 2001–2017 and recent 2018–2026.
fig, ax = plt.subplots(1, 2, figsize=(6.4, 3.0))
for a, (key, title) in zip(ax, [('holdout', 'Hold-out, origins 2001–2017'), ('recent', 'Recent, origins 2018–2026')]):
    r = o['ew'][key]['reliability']
    a.plot([0, 1], [0, 1], ':', color='k', lw=0.8); a.plot([z['meanP'] for z in r], [z['freq'] for z in r], 'o-', color=C1)
    for z in r: a.annotate(str(z['n']), (z['meanP'], z['freq']), textcoords='offset points', xytext=(4, -10), fontsize=7, color=C4)
    a.set_xlabel('Forecast breach probability'); a.set_ylabel('Observed frequency'); a.set_xlim(0, 1); a.set_ylim(0, 1); a.set_title(title, loc='left', fontsize=9)
save('figure2.png')

# Figure 4. EU-27 on the data of 31 December 2021, six years: inflation, effect of Phoenix, excess deposits.
p = o['ref2021Long']['path']; t = [r['t'] for r in p]
fig, ax = plt.subplots(1, 3, figsize=(7.2, 2.5))
ax[0].plot(t, [r['pi'] for r in p], color=C1, label='With Phoenix'); ax[0].plot(t, [r['piOff'] for r in p], '--', color=C2, label='Without'); ax[0].set_title('Inflation, %', loc='left', fontsize=9); ax[0].legend(frameon=False, fontsize=7)
ax[1].plot(t, [(r['pi'] - r['piOff']) * 1000 for r in p], color=C1); ax[1].axhline(0, color='k', lw=0.6); ax[1].set_title('Effect on inflation, pp × 10⁻³', loc='left', fontsize=9)
ax[2].plot(t, [r['S'] for r in p], color=C1); ax[2].plot(t, [r['SOff'] for r in p], '--', color=C2); ax[2].plot(t, [r['Scrit'] for r in p], ':', color='k', label='$S_{crit}$'); ax[2].set_title('Excess deposits, € bn', loc='left', fontsize=9); ax[2].legend(frameon=False, fontsize=7)
for a in ax: a.set_xlabel('Months from November 2021')
save('figure4.png')

# Figure 5. Validation from November 2021: no-Phoenix paths against actual EU-27 inflation.
v = o['validation']; fig, ax = plt.subplots(figsize=(4.8, 2.8))
for key, sty, col, lab in [('actual rates, realised energy', '-', C1, 'Actual policy rate, realised energy prices'), ('actual rates, flat energy', '--', C3, 'Actual policy rate, energy prices flat'), ('ex ante: market rates, flat energy', ':', C2, 'Ex ante: forward rates, energy prices flat')]:
    ax.plot([r[0] for r in v[key]['path']], [r[1] for r in v[key]['path']], sty, color=col, label=f"{lab} (RMSE {v[key]['rmse']:.2f})")
a0 = v['actual rates, realised energy']['path']; ax.plot([r[0] for r in a0 if r[2] is not None], [r[2] for r in a0 if r[2] is not None], color='k', lw=1.2, label='Actual EU-27 HICP inflation')
ax.set_xlabel('Months from November 2021'); ax.set_ylabel('%'); ax.legend(frameon=False, fontsize=6.3); save('figure5.png')

# Figure 6. Sensitivity of the effect at month 24 (EU-27 on the data of 31 December 2021).
g = o['grid']; ks = sorted(set(z['kappaPC'] for z in g)); ms = [0.3, 0.6, 1.0]
fig, ax = plt.subplots(1, 2, figsize=(6.4, 2.5))
for a, ph in zip(ax, [0.5, 1]):
    M = np.array([[next(z['dpi24'] for z in g if z['kappaPC'] == k and z['mult'] == m and z['phiSel'] == ph) * 1000 for m in ms] for k in ks])
    a.imshow(M, cmap='Blues_r', aspect='auto'); a.set_xticks(range(3), ms); a.set_yticks(range(len(ks)), [f'{k:.3f}' for k in ks]); a.set_xlabel('multiplier m'); a.set_ylabel('κ'); a.grid(False)
    a.set_title(f'Effect at month 24, pp × 10⁻³ (φ_sel = {ph})', loc='left', fontsize=8)
    for i in range(len(ks)):
        for j in range(3): a.text(j, i, f'{M[i, j]:.2f}', ha='center', va='center', fontsize=7, color='w' if M[i, j] < M.min() / 2 else 'k')
save('figure6.png')

# Figure 7. Optimisation frontier over the overhang weight ω_S.
fr = o['frontier']; fig, ax = plt.subplots(1, 3, figsize=(7.2, 2.5))
for a, (scen, mo) in zip(ax, [('EU, December 2021', 24), ('EU, December 2021', 48), ('Euro area, live', 24)]):
    z = [r for r in fr if r['scenario'] == scen and r['months'] == mo]; ls = [r['lossS'] for r in z]
    a.plot(ls, [r['lossNoPhoenix'] for r in z], 's--', color=C2, ms=3, label='No Phoenix'); a.plot(ls, [r['lossDefault'] for r in z], '^:', color=C4, ms=3, label='Defaults'); a.plot(ls, [r['loss'] for r in z], 'o-', color=C1, ms=3, label='Optimised')
    a.set_xscale('symlog', linthresh=0.03); a.set_xlabel('Overhang weight $\\omega_S$'); a.set_title(f'{scen}, {mo} months', loc='left', fontsize=8)
ax[0].set_ylabel('Average loss'); ax[0].legend(frameon=False, fontsize=7); save('figure7.png')

# Figure 8. Power of the household trial by sample size.
Phi = lambda z: 0.5 * (1 + erf(z / sqrt(2))); h = o['trial']['hh']; n0 = o['trial']['nH']; ns = np.linspace(0.1, 2.5, 60) * n0
pw = [Phi(((h['takeup'] - h['takeupC']) * h['deposit'] * h['delta']) * np.sqrt(n * (1 - h['attrition']) / 2) / (h['sigma'] * np.sqrt(1 - h['r2'])) - 1.96) for n in ns]
fig, ax = plt.subplots(figsize=(3.4, 2.6)); ax.plot(ns / 1000, pw, color=C1); ax.axhline(0.8, ls=':', color='k', lw=0.8); ax.axvline(n0 / 1000, ls='--', color=C2, lw=0.8)
ax.set_xlabel('Households per arm, thousands'); ax.set_ylabel('Power'); save('figure8.png')

# Figure 3. Brier score by year of forecast origin against the real-time climatology.
by = o['ew']['all']['byYear']; ys = sorted(by)
fig, ax = plt.subplots(figsize=(6.4, 2.4)); xx = np.arange(len(ys))
ax.bar(xx - 0.2, [by[y]['brier'] for y in ys], 0.4, color=C1, label='Breach probability'); ax.bar(xx + 0.2, [by[y]['brierClimRT'] for y in ys], 0.4, color=C2, label='Real-time historical frequency')
ax.set_xticks(xx, ys, rotation=90, fontsize=7); ax.set_ylabel('Brier score (lower is better)'); ax.legend(frameon=False, fontsize=7); save('figure3.png')
print('figures written to', D)
