// Shared pieces of the programme pages: state badges, headline figures and tables whose every label
// carries its own explanation, and the settings card.
import { h } from '../ui/dom.js';
import { card } from '../ui/charts.js';
import { PROG_GROUPS } from '../model/programmes.js';
import { kpi } from './common.js';
import { slider } from './controls.js';

export const sbadge = (map, st) => { const m = map[st]; return m ? h('span', { class: ['badge', `t-${m.tone}`], 'data-tip': m.desc }, m.label) : h('span', { class: 'muted' }, '–'); };
export const tkpi = (o, tip) => { const el = kpi(o); el.querySelector('.kpi-l').dataset.tip = tip; return el; };
// cols: [[label, explanation], ...]; rows: arrays of cells (text or nodes), first cell is the row header.
export const tbl = (cols, rows) => h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
  h('thead', null, h('tr', null, cols.map(([l, tip]) => h('th', { scope: 'col', 'data-tip': tip }, l)))),
  h('tbody', null, rows.map(r => h('tr', null, r.map((v, i) => (i ? h('td', null, v) : h('th', { scope: 'row' }, v))))))));
export const waiting = what => h('p', { class: 'sub' }, `Waiting for ${what} from the publisher; this section fills in as soon as the data arrive.`);
export function settingsCard(app, groupId) {
  const g = PROG_GROUPS.find(x => x.id === groupId);
  return card({ title: 'Programme settings', sub: `${g.title}: every threshold is a programmable rule. Changes apply at once and are remembered on this device.`,
    actions: h('button', { class: 'btn btn-s btn-ghost', 'data-tip': 'Return every programme setting on all pages to its default.', onclick: () => app.resetProg() }, 'Restore defaults'),
    body: h('div', { class: 'ctrl-grid' }, g.params.map(m => slider(app.progCtl, m))) });
}
export const signed = (v, d = 1, unit = '%') => (v == null || Number.isNaN(v) ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}${unit}`);
