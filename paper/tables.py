# Writes the data tables of Phoenix Economics Solutions as CSV files (paper/tables/) from
# paper/results-2026-10-04.json. Effects on inflation and the policy rate are in percentage points.
import json, os, csv
HERE = os.path.dirname(os.path.abspath(__file__)); o = json.load(open(os.path.join(HERE, 'results-2026-10-04.json')))
D = os.path.join(HERE, 'tables'); os.makedirs(D, exist_ok=True)
for fn in os.listdir(D):
    if fn.endswith('.csv'): os.remove(os.path.join(D, fn))
def write(name, head, rows):
    with open(os.path.join(D, name), 'w', newline='') as fh: wr = csv.writer(fh); wr.writerow(head); wr.writerows(rows)
p = o['phillips']
write('table04_phillips.csv', ['estimator', 'sample', 'n', 'a', 'a_se', 'kappa', 'kappa_se', 'gamma_E', 'gamma_E_se', 'first_stage_F'],
      [[e, f"{p[s].get('y0', 2001)}-{2025 if s == 'full' else 2019}", p[s][e].get('n', ''), p[s][e]['aAnnual'], p[s][e].get('aSe', ''), p[s][e]['kappa'], p[s][e].get('kappaSe', ''), p[s][e]['gammaE'], p[s][e].get('gammaESe', ''), p[s][e].get('firstStageF') or '']
       for s in ['full', 'pre2020'] for e in ['ols', 'fe2', 'iv', 'jk']])
write('table05_realtime.csv', ['estimator', 'n', 'model_given_energy', 'benchmark_given_energy', 'model_no_energy', 'no_change'],
      [[k, v['n'], v['cond'], v['condBench'], v['uncond'], v['naive']] for k, v in o['phillipsRealTime'].items()])
write('table07_backtest.csv', ['period', 'n', 'rmse6', 'naive6', 'dm6', 'p6', 'rmse12', 'naive12', 'dm12', 'p12', 'brier', 'brier_realtime_freq', 'hit_rate', 'false_alarm'],
      [[k, e['n'], e['rmse6'], e['naive6'], e['dm6']['stat'], e['dm6']['p'], e['rmse12'], e['naive12'], e['dm12']['stat'], e['dm12']['p'], e['brier'], e['brierClimRT'], e['hitRate'], e['falseAlarm']] for k, e in o['ew'].items()])
write('table08_variants.csv', ['specification', 'holdout', 'holdout_freq', 'recent', 'recent_freq'], [[k, v['holdout'], v['holdoutClim'], v['recent'], v['recentClim']] for k, v in o['ewVariants'].items()])
write('figure02_reliability.csv', ['period', 'bin', 'n', 'mean_p', 'frequency'], [[k, r['bin'], r['n'], r['meanP'], r['freq']] for k in ['holdout', 'recent'] for r in o['ew'][k]['reliability']])
write('figure03_brier_by_year.csv', ['year', 'n', 'brier', 'brier_realtime_freq'], [[y, v['n'], v['brier'], v['brierClimRT']] for y, v in sorted(o['ew']['all']['byYear'].items())])
L = o['live']
write('table09_regions.csv', ['region', 'N', 'pi0', 'x0', 'i0', 'S0', 'Scrit0', 'above', 'pi24', 'dpi12', 'dpi24', 'di24', 'S24_with', 'S24_without', 'absorbed', 'premium'],
      [[k, r['N'], r['rows'][0]['on']['pi'], r['rows'][0]['on']['x'], r['rows'][0]['on']['i'], r['rows'][0]['on']['S'], r['rows'][0]['on']['Scrit'], len(r['above']), r['rows'][-1]['on']['pi'], r['dpi12'],
        r['rows'][-1]['on']['pi'] - r['rows'][-1]['off']['pi'], r['rows'][-1]['on']['i'] - r['rows'][-1]['off']['i'], r['rows'][-1]['on']['S'], r['rows'][-1]['off']['S'], r['totals']['absorbed'], r['totals']['premium']] for k, r in L.items()])
write('table10_euro_area.csv', ['economy', 'gdp', 'pi', 'x0', 'excess_deposits', 'idle', 'S_crit', 'rho', 'p_breach', 'state', 'accounts_to'],
      [[c['name'], c['gdp'], c['pi'], c['x0'], c['S'], c['idle'], c['Scrit'], c['rho'], c['pBreach'], c['state'], c['depQuarter']] for c in o['eaCells']])
write('table11_eu_dec2021.csv', ['month', 'pi_with', 'pi_without', 'S_with', 'S_without', 'S_crit', 'credits', 'wallets', 'overhang_with', 'overhang_without'],
      [[r['m'], r['on']['pi'], r['off']['pi'], r['on']['S'], r['off']['S'], r['on']['Scrit'], r['on']['C'], r['on']['L'], r['on']['O'], r['off']['O']] for r in o['ref2021']['rows']])
write('figure05_validation.csv', ['assumption', 'month', 'model', 'actual'], [[k, m, a, b] for k, v in o['validation'].items() if 'path' in v for m, a, b in v['path']])
write('table12_sensitivity.csv', ['kappa', 'm', 'phi_sel', 'dpi_m12', 'dpi_m24', 'di_m24'], [[g['kappaPC'], g['mult'], g['phiSel'], g['dpi12'], g['dpi24'], g['di24']] for g in o['grid']])
write('table13_regimes.csv', ['regime', 'dpi_m12', 'dpi_m24', 'S_m24_with', 'S_m24_without', 'absorbed', 'premium', 'loss_with', 'loss_without'], [[x['name'], x['dpi12'], x['dpi24'], x['S24'], x['S24off'], x['absorbed'], x['cost'], x['loss'], x['lossOff']] for x in o['regimes']])
write('table14_measurement.csv', ['choice', 'excess_now', 'S_crit_sum', 'economies_above', 'absorbed', 'dpi_m12', 'dpi_m24'], [[x['name'], x['S0'], x['Scrit'], x['above'], x['absorbed'], x['dpi12'], x['dpi24']] for x in o['eaSens']])
write('table15_frontier.csv', ['scenario', 'months', 'lambda_S', 'kA', 'cap', 'floor', 'trigger', 'premium', 'loss_opt', 'loss_default', 'loss_none', 'at_bound'],
      [[r['scenario'], r['months'], r['lossS'], *[r['best'][k] for k in ['kA', 'capPct', 'floorPct', 'piTh', 'rP']], r['loss'], r['lossDefault'], r['lossNoPhoenix'], ' '.join(r['atBound'])] for r in o['frontier']])
c = o['instruments']['costs']
write('table16_costs.csv', ['item', 'eur_bn_low', 'eur_bn_high'], [['premium', c['premium3y'], c['premium3y']], ['bank_fees', c['bankFees3y'], c['bankFees3y']], ['administration', c['admin3y'], c['admin3y']], ['it_build', c['itBuildLow'], c['itBuildHigh']], ['it_operation', 3 * c['itRunPerYear'][0], 3 * c['itRunPerYear'][1]]])
write('stress_tests.csv', ['scenario', 'measure', 'p10', 'p50', 'p90'], [[k, m, *o[k][m]] for k in ['mc_ea', 'mc_eu2021'] for m in ['dPi', 'dPi12', 'dI', 'dX', 'absorbed']])
t = o['trial']
write('table18_trials.csv', ['arm', 'n_per_arm', 'mde', 'power_sim', 'coverage', 'mean_est', 'p10', 'p90', 'cost_eur'],
      [['household', t['nH'], t['mdeH'], t['simH']['power'], t['simH']['coverage'], t['simH']['mean'], t['simH']['p10'], t['simH']['p90'], t['budgetH']['total']], ['firm', t['nF'], t['mdeF'], t['simF']['power'], t['simF']['coverage'], t['simF']['mean'], t['simF']['p10'], t['simF']['p90'], t['budgetF']['total']]])
write('table19_trial_sensitivity.csv', ['assumption', 'households_per_arm'], [['default', t['nH']], *t['sensitivity']])
write('stability.csv', ['case', 'max_real', 'half_life', 'lyapunov_min_eig', 'lyapunov_max_eig', 'iss_gain'], [[k, v['maxReal'], v.get('halfLife'), v.get('lyapunovMinEig'), v.get('lyapunovMaxEig'), v.get('issGain')] for k, v in o['stability'].items()])
print('tables written to', D)
