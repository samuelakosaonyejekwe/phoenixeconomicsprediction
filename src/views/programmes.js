import { h, num, eur, pct } from '../ui/dom.js';
import { card, stackedBars, SERIES } from '../ui/charts.js';
import { REGISTER, REGISTER_STATUS } from '../content/register.js';
import { pageHead, explain, empty, sourceLine, openCountry } from './common.js';
import { sbadge, tkpi, tbl, waiting, settingsCard } from './progui.js';

let theme = 'jobs';
const PAGE_NAMES = { signals: 'Signals & triggers', markets: 'Commodities & assets', programmes: 'Funds & programmes', detect: 'Surplus radar', redistribute: 'Redistribution', contracts: 'Contracts & audit' };

export function programmes(root, app) {
  const cells = app.cells;
  if (!cells.length) return root.append(pageHead('Funds & programmes'), empty());
  const P = app.params, S = app.prog, pr = app.programmes();
  const { swap, fund, recall, themes, sinks } = pr;
  const econ = c => h('button', { class: 'chip', 'data-tip': `${c.name}: select for its details.`, onclick: () => openCountry(app, c) }, c.name);

  const kpis = h('div', { class: 'kpis' },
    tkpi({ label: 'Debt offered for exchange', value: swap ? eur(swap.converted, 2) : '–', sub: swap ? `${S.swapShare}% of ${swap.rows.length} governments’ debt` : 'Waiting for debt and yields' }, 'Government debt that would be exchanged into PHX bonds as it falls due.'),
    tkpi({ label: 'Interest saved a year', value: swap ? eur(swap.total, 1) : '–', sub: swap ? `${eur(swap.totalY1, 2)} in the first year` : '' }, 'Yearly interest saving once the whole eligible share has been exchanged; in the first year only the maturing part is exchanged.'),
    tkpi({ label: 'Stability fund', value: fund ? `${fund.eligible} eligible` : '–', sub: fund ? `${eur(fund.first, 1)} first tranche; ${eur(fund.drawn, 1)} of ${eur(S.fundSize, 0)} drawn` : 'Needs two or more economies' }, 'Economies that meet the disparity trigger and the amount paid at once.'),
    tkpi({ label: 'Recall now', value: pct(recall.share, 2), sub: recall.breach ? `${eur(recall.amount, 2)} of PHX in circulation` : `Inflation below ${S.recallTh}%` }, 'Share of PHX in circulation recalled at today’s inflation; it grows with the size of the breach.'),
    tkpi({ label: 'PHX in circulation', value: recall.wPhx == null ? '–' : `${num(recall.wPhx, 2)} : ${num(recall.wEur, 2)}`, sub: 'PHX : euro, weights summing to 100' }, 'PHX credits and wallets at the end of the simulation of the scenario selected in the lab, against the euro-area money stock M3, as weights that sum to 100.'));

  const swapCard = card({ title: 'Debt exchange into PHX bonds', sub: swap ? `PHX bonds pay the euro-area reference yield (${pct(swap.ref, 2)}: ${swap.refSource}) plus a margin of ${S.swapFee} pp, so ${pct(swap.rate, 2)}. Governments paying more save the difference on the exchanged share; those paying less gain nothing and would not take part.` : null,
    body: swap ? tbl([['Economy', 'Select an economy for its details.'], ['Debt', 'General government debt, % of GDP and € billion.'], ['10-year yield', 'Latest monthly yield on the government’s ten-year bonds.'], ['Spread', 'Yield minus the euro-area reference yield.'], ['Exchanged', 'Eligible share of the debt, € billion.'], ['Saving a year', 'Interest saved each year once the whole share is exchanged, € billion and % of GDP.'], ['First year', 'Saving in the first year, when only maturing debt is exchanged.'], ['Repayment this year', 'Scheduled repayment scaled by growth against potential: below 100% in a weak year, above in a strong one.']],
      swap.rows.map(r => [econ(r.c), `${pct(r.debtPct, 1)} · ${eur(r.debt, 0)}`, h('span', null, pct(r.yield, 2), h('small', { class: 'muted' }, ` ${r.yieldPeriod}`)), `${num(r.spread, 2)} pp`, eur(r.converted, 1), r.saving ? `${eur(r.saving, 2)} · ${pct(r.savingPct, 2)}` : 'none', r.saving ? eur(r.savingY1, 2) : 'none', `${num(r.payFactor * 100, 0)}%${r.growth == null ? '' : ` (growth ${num(r.growth, 1)}%)`}`]))
      : waiting('government debt and bond yields (published for European economies only)') });

  const fundCard = card({ title: 'Stability fund allocation', sub: fund ? `Eligible: unemployment more than ${S.fundUGap} pp above the area average (${pct(fund.uAvg, 1)}), or an output gap more than ${S.fundXGap} points below it. Shares follow measured need × size, capped at ${S.themeCap}% of the economy’s GDP; ${S.fundFirst}% is paid at once and the rest against milestones. ${eur(fund.drawn, 1)} of ${eur(S.fundSize, 0)} is drawn.` : null,
    body: fund ? (fund.eligible ? h('div', null,
      stackedBars({ rows: fund.rows.filter(r => r.alloc > 0).map(r => ({ label: r.c.name, sub: `${r.why} · need ${num(r.need, 2)} · ${pct(r.pctGdp, 2)} of GDP`, onClick: () => openCountry(app, r.c), segments: [{ name: 'Paid at once', value: r.first, color: SERIES[0] }, { name: 'Against milestones', value: r.alloc - r.first, color: SERIES[2] }] })), fmt: v => eur(v, 2) }))
      : h('p', { class: 'sub' }, 'No economy meets the disparity trigger: the fund stays undrawn.')) : waiting('a region with two or more economies'),
    legend: fund && fund.eligible ? [{ label: 'Paid at once', color: SERIES[0], tip: 'First tranche, paid when the allocation is made.' }, { label: 'Against milestones', color: SERIES[2], tip: 'Paid as agreed milestones, such as lower unemployment, are met.' }] : null,
    table: fund ? () => ({ cols: ['Economy', 'Need index', 'Unemployment vs average pp', 'Output gap vs average', 'Allocation €bn', 'First tranche €bn', '% of GDP'], rows: fund.rows.map(r => [r.c.name, num(r.need, 2), r.uGap == null ? '–' : num(r.uGap, 1), num(r.xGap, 1), num(r.alloc, 2), num(r.first, 2), num(r.pctGdp, 2)]) }) : null });

  const tf = themes.find(f => f.k === theme) || themes[0];
  const seg = h('div', { class: 'seg' }, themes.map(f => h('button', { class: f.k === tf.k ? 'on' : '', 'data-tip': `${f.title}: ${f.uses}`, onclick: () => { theme = f.k; app.rerender(); } }, f.title.replace(/ (fund|facility)$/, ''))));
  const themeCard = card({ title: 'Thematic funds', sub: `Seven funds of ${eur(S.themeSize, 0)} each, every one driven by one published indicator. Shares follow each economy’s gap from the benchmark × its size, capped at ${S.themeCap}% of its GDP; what the cap leaves stays in the fund.`, actions: seg,
    body: h('div', null,
      h('p', null, h('b', null, tf.title), `. ${tf.uses} Indicator: ${tf.indicator.toLowerCase()} (${tf.source}); benchmark ${tf.bench == null ? 'n/a' : `${num(tf.bench, 1)} ${tf.unit}`}; ${tf.eligible} of ${tf.covered} economies eligible; ${eur(tf.drawn, 2)} of ${eur(S.themeSize, 0)} drawn.`),
      tf.covered ? tbl([['Economy', 'Select an economy for its details.'], [tf.indicator, `Latest published value, ${tf.unit}.`], ['Gap', 'Distance on the wrong side of the benchmark; zero means not eligible.'], ['Allocation', 'Share of the fund, € billion.'], ['% of GDP', 'Allocation relative to the economy’s GDP.']],
        tf.rows.filter(r => r.gap > 0).map(r => [econ(r.c), `${num(r.value, 1)} ${tf.unit}`, r.gap ? num(r.gap, 1) : '–', r.alloc ? eur(r.alloc, 2) : 'not eligible', r.alloc ? pct(r.pctGdp, 2) : '–']))
        : waiting(`${tf.indicator.toLowerCase()} (published for European economies only)`)) });

  const ladderCard = card({ title: 'Recall ladder', sub: `Recall starts at ${S.recallTh}% inflation with ${S.recallBase}% of PHX and adds ${S.recallSlope}% per point above, up to ${S.recallMax}%. Area inflation is ${pct(pr.board.pi, 2)}.`,
    body: h('div', null,
      h('p', null, h('b', null, recall.rule)),
      tbl([['Channel', 'What recalled PHX is converted into.'], ['Amount', 'At today’s inflation, from the PHX in circulation at the end of the current simulation.'], ['Rule', 'When this channel is used.']], [
        ['Digital Euro and deposits', eur(recall.digitalEuro, 2), 'The default: recalled PHX returns to euro, as Digital Euro within its holding limit and bank deposits beyond it.'],
        ['Cash', eur(recall.cash, 2), 'A fifth of the recall when the volatility index is above its alert level, to meet liquidity needs.'],
        ['Dragon reserve', eur(recall.dragon, 2), `Only in a crisis (inflation at or above ${P.piCrisis}%, or the health index in alert), and at most ${S.dragonCap}% of PHX a year.`],
      ]),
      h('p', { class: 'sub' }, recall.wPhx == null ? '' : `Circulation weights PHX : euro are ${num(recall.wPhx, 3)} : ${num(recall.wEur, 3)} now${recall.breach ? ` and ${num(recall.wAfter, 3)} : ${num(100 - recall.wAfter, 3)} after this recall` : ''}.`)) });

  const sinkCard = card({ title: 'Where excess PHX could go instead', sub: `In the simulation, PHX recalled from saturated wallets over the horizon (${eur(sinks.excess, 2)}) returns to Digital Euro and bank accounts, as the Redistribution page shows. This is the alternative: locking the same amount into instruments, so that recall adds nothing to spendable money.`,
    body: tbl([['Instrument', 'Where recalled PHX is placed.'], ['Share', 'Share of the excess; the shares sum to 100%.'], ['Amount', 'The simulation’s recalled amount, split by these shares.'], ['Terms', 'What the instrument is.']],
      sinks.rows.map(r => [r.label, pct(r.share * 100, 0), eur(r.amount, 2), r.note])) });

  const regCard = card({ title: 'Programme register', sub: 'Every problem addressed, the mechanism that answers it, the indicator that drives it and where it runs.',
    body: tbl([['Problem', 'The economic problem addressed.'], ['Scope', 'Global, European Union, or the circulation of PHX itself.'], ['Mechanism', 'The rule that answers it.'], ['Driven by', 'Published indicator the rule reads.'], ['Runs on', 'Page where it is computed.'], ['Basis', 'Whether it runs on live data, in the simulation, or by rule only.']],
      REGISTER.map(r => [r.problem, r.area, r.mechanism, r.indicator, h('a', { href: `#/${r.page}` }, PAGE_NAMES[r.page] || r.page), sbadge(REGISTER_STATUS, r.status)])) });

  root.append(
    pageHead('Funds & programmes', 'What absorbed and recalled PHX is used for: cheaper refinancing of public debt, a stability fund and seven thematic funds allocated by published indicators, and the rules that keep PHX and the euro in balance.'),
    kpis, swapCard,
    h('div', { class: 'grid-2' }, fundCard, h('div', { class: 'stack' }, ladderCard, sinkCard)),
    themeCard,
    settingsCard(app, 'funds'),
    regCard,
    explain('How the programmes work',
      h('p', null, 'Debt exchange. A government paying more than the euro-area reference yield exchanges maturing bonds for PHX bonds at the reference yield plus a margin. The saving is real only to the extent the issuer of PHX bonds can itself fund at the reference yield, which requires a joint guarantee; the margin pays for that. Repayments move with growth, so a weak year lowers the instalment instead of forcing new borrowing.'),
      h('p', null, 'Stability and thematic funds. Allocation is a formula on published indicators, not a negotiation: an economy is eligible when its indicator is on the wrong side of a benchmark, and its share rises with the gap and with its size. Only part is paid at once; the rest follows milestones, which keeps the incentive to reform.'),
      h('p', null, 'Recall and balance. A small breach of the recall trigger gives a small recall and a large one a large recall, so the supply of PHX contracts in proportion. What is recalled becomes Digital Euro by default, partly cash when markets are short of liquidity, and Dragon reserve only in a crisis and within an annual cap that keeps the reserve scarce. Excess from saturated wallets is locked into time deposits, bonds and the investment fund.'),
      h('p', null, 'These programmes are computed beside the core model and do not change its simulation; amounts are indicative allocations from today’s data, not forecasts of their effects.')),
    sourceLine(app));
}
