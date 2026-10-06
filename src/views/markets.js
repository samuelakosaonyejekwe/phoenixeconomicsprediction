import { h, num, eur, pct } from '../ui/dom.js';
import { card, lineChart, SERIES } from '../ui/charts.js';
import { BAND_STATES, BUBBLE_STATES, FX_STATES } from '../model/programmes.js';
import { pageHead, explain, empty, sourceLine, openCountry } from './common.js';
import { sbadge, tkpi, tbl, waiting, settingsCard, signed } from './progui.js';

const yesNo = (on, tip) => h('span', { class: ['badge', on ? 't-serious' : 't-good'], 'data-tip': tip }, on ? 'On' : 'Off');

export function markets(root, app) {
  const cells = app.cells;
  if (!cells.length) return root.append(pageHead('Commodities & assets'), empty());
  const S = app.prog, pr = app.programmes();
  const { basket, bubble, fx, credits } = pr;
  const out = basket ? basket.items.filter(i => i.state === 'ABOVE' || i.state === 'BELOW') : [];
  const hot = bubble ? bubble.rows.filter(r => r.n >= 2) : [];
  const swaps = fx ? fx.rows.filter(r => r.state === 'SWAP') : [];

  const kpis = h('div', { class: 'kpis' },
    tkpi({ label: 'Commodity basket', value: basket ? num(basket.level, 1) : '–', sub: basket ? `${signed(basket.yoy)} in 12 months · ${basket.period}` : 'Waiting for prices' }, 'Weighted index of Brent, gold, wheat, maize and copper in euro; 100 means every commodity is at its own five-year average.'),
    tkpi({ label: 'Basket volatility', value: basket ? pct(basket.vol, 1) : '–', sub: basket ? `single commodities average ${pct(basket.avgVol, 1)}` : '' }, 'Annualised volatility of the basket over three years, against the weighted average volatility of its components: the difference is what diversification removes.'),
    tkpi({ label: 'Outside their band', value: basket ? `${out.length} of ${basket.items.length}` : '–', sub: out.length ? out.map(i => i.label).join(', ') : 'No intervention' }, 'Commodities whose euro price is outside the band around its five-year average, where the stabilisation reserve would act.'),
    tkpi({ label: 'Housing signals', value: bubble ? String(hot.length) : '–', sub: hot.length ? hot.slice(0, 4).map(r => r.c.name).join(', ') : 'No economy with two or more signals' }, 'Economies where at least two of the three asset-price signals are on.'),
    tkpi({ label: 'Swap lines open', value: fx ? String(swaps.length) : '–', sub: swaps.length ? swaps.map(r => r.ccy).join(', ') : `No currency down ${S.devalTh}% or more` }, 'Currencies that have lost more than the trigger against the US dollar in twelve months.'));

  let basketCard, bandCard;
  if (basket) {
    const idx = basket.index.slice(-120), labels = idx.map(r => r[0]);
    basketCard = card({ title: 'Commodity basket index', sub: `Geometric index in euro, 100 = each commodity at its five-year average. Weights: ${basket.items.map(i => `${i.label.toLowerCase()} ${num(basket.weights[i.k] * 100, 0)}%`).join(', ')}.`,
      body: lineChart({ series: [{ name: 'Basket', color: SERIES[0], values: idx.map((r, i) => [i, r[1]]) }], refs: [{ y: 100, label: 'Five-year average' }], yFmt: v => num(v, 0), xFmt: i => labels[Math.round(i)] || '', height: 210 }),
      table: () => ({ cols: ['Month', 'Index'], rows: idx.map(r => [r[0], num(r[1], 1)]) }) });
    bandCard = card({ title: 'Commodity price bands', sub: `Band of ±${S.bandPct}% around the five-year average euro price. Below it the reserve buys and price floors pay out; above it the reserve releases stock and price caps pay out.`,
      body: tbl([['Commodity', 'Monthly international price, converted into euro.'], ['Price', 'Latest monthly average in euro, with the publisher’s unit in US currency.'], ['Five-year average', 'Mean euro price over the last 60 months: the centre of the band.'], ['Band', 'Lower and upper edge of the band.'], ['Against average', 'Latest price relative to the five-year average.'], ['12 months', 'Change in the euro price over twelve months.'], ['State', 'Position of the price relative to its band.'], ['Insurance payment', 'What a holder of a floor at the lower edge (producers) or a cap at the upper edge (buyers) is paid per unit, in euro.']],
        basket.items.map(i => [h('span', null, i.label, h('small', { class: 'muted' }, ` ${i.group}`)), h('span', null, `€${num(i.price, 1)} `, h('small', { class: 'muted' }, `${num(i.priceUsd, 1)} ${i.unit}, ${i.period}`)), `€${num(i.avg, 1)}`, `€${num(i.lower, 1)} – €${num(i.upper, 1)}`, signed(i.dev), signed(i.yoy), sbadge(BAND_STATES, i.state), i.capPay ? `cap pays €${num(i.capPay, 1)}` : i.floorPay ? `floor pays €${num(i.floorPay, 1)}` : 'none'])) });
  } else { basketCard = card({ title: 'Commodity basket index', body: waiting('commodity prices') }); bandCard = card({ title: 'Commodity price bands', body: waiting('commodity prices') }); }

  const creditCard = card({ title: 'Currency credits', sub: 'What 100 of each type of credit placed twelve months ago is worth today, from the live series each is tied to.',
    body: tbl([['Credit', 'Type of credit earned by converting or holding funds in PHX.'], ['Worth today', 'Value today of 100 placed twelve months ago.'], ['Tied to', 'The published series that sets its value.'], ['Purpose', 'What the credit is for.']],
      credits.map(c => [c.label, c.value == null ? '–' : num(c.value, 2), c.basis, c.use])) });

  const bubbleCard = card({ title: 'Asset-price monitor: housing', sub: bubble ? `Three signals: real price growth above ${S.bubbleReal}%, price above its ten-year trend by more than ${S.bubbleGap}%, and loans to households growing faster than ${S.creditTh}% (now ${bubble.credit == null ? 'n/a' : pct(bubble.credit, 1)}, euro area${bubble.creditPeriod ? `, ${bubble.creditPeriod}` : ''}). Each signal adds a third of the diversion offer.` : null,
    body: bubble && bubble.rows.length ? tbl([['Economy', 'Select an economy for its details.'], ['Quarter', 'Latest quarter of the house price index.'], ['Nominal', 'House prices against the same quarter a year earlier.'], ['Real', 'Nominal growth minus consumer-price inflation.'], ['Gap from trend', 'Price level relative to its own ten-year log-linear trend.'], ['Growth', 'Signal: real growth above its threshold.'], ['Trend', 'Signal: gap from trend above its threshold.'], ['Credit', 'Signal: loans to households growing faster than the credit trigger (euro-area aggregate).'], ['State', 'Number of signals on, as a state.'], ['Diversion offer', 'Share of new investment in housing that would be offered conversion into stabilisation bonds; taking it up is voluntary.']],
      bubble.rows.map(r => [h('button', { class: 'chip', 'data-tip': `${r.c.name}: select for its details.`, onclick: () => openCountry(app, r.c) }, r.c.name), r.quarter, signed(r.nominal), signed(r.real), r.gap == null ? '–' : signed(r.gap), yesNo(r.signals.real, 'Real growth signal.'), yesNo(r.signals.gap, 'Trend-gap signal.'), yesNo(r.signals.credit, 'Credit-growth signal.'), sbadge(BUBBLE_STATES, r.state), pct(r.divert, 1)]))
      : waiting('house price indices (published for European economies only)') });

  const fxCard = card({ title: 'Exchange-rate monitor', sub: fx ? `Change against the US dollar over the last 13 months of daily ECB reference rates (to ${fx.asOf}); the dollar itself is measured against the euro. A fall of ${S.devalTh}% or more opens the swap line and raises the reserve share held in PHX towards ${S.reserveMax}%.` : null,
    body: fx ? tbl([['Currency', 'Economy and currency code.'], ['Against the dollar', 'Change in value against the US dollar (the euro for the dollar itself): negative is a depreciation.'], ['Against the euro', 'Change in value against the euro over the same period.'], ['Volatility', 'Annualised volatility of the last 30 trading days.'], ['State', 'Whether the depreciation trigger is met.'], ['Reserve share in PHX', 'Share of official reserves the diversification programme would hold in PHX.']],
      fx.rows.map(r => [`${r.name} (${r.ccy})`, signed(-r.dep), signed(-r.depEur), r.vol == null ? '–' : pct(r.vol, 1), sbadge(FX_STATES, r.state), pct(r.share, 1)]))
      : waiting('daily exchange rates') });

  root.append(
    pageHead('Commodities & assets', 'Prices that feed inflation and instability from outside the money stock: a commodity basket with intervention bands, credits tied to live series, house prices and exchange rates.'),
    kpis,
    h('div', { class: 'grid-2' }, basketCard, h('div', { class: 'stack' }, creditCard, settingsCard(app, 'markets'))),
    bandCard, bubbleCard, fxCard,
    explain('How these mechanisms work',
      h('p', null, 'The basket spreads exposure over energy, precious metals, food and industrial metals, so its value moves less than any single commodity. Each commodity has a band around its own five-year average in euro. Inside the band nothing happens. Below it, a stabilisation reserve funded in PHX buys and producers holding a price floor are compensated; above it, the reserve releases stock and buyers holding a price cap are compensated. Because the band follows the five-year average, it adjusts to lasting changes and resists only swings.'),
      h('p', null, 'The asset-price monitor does not forecast crashes. It counts three published signals that have preceded past housing booms and scales an offer: investors may convert a share of new investment into stabilisation bonds paying the 10-year AAA yield. Nothing is converted without the holder’s consent.'),
      h('p', null, 'The exchange-rate monitor applies the same logic to currencies: a fall beyond the trigger opens a swap line, through which the central bank can obtain PHX against its own currency, and raises the share of reserves it would hold in PHX. Seven currencies of the global panel are not in the ECB’s daily reference rates and are not monitored here.')),
    sourceLine(app));
}
