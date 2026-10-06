import { h, icon } from '../ui/dom.js';

// Parameters of the core model carry a provenance tag or an 'ext' flag; programme settings carry neither.
const PARAM_PAPER = meta => 'group' in meta;
const decimals = step => (String(step).split('.')[1] || '').length;

// Parameter control bound to app.params. Values commit on release so a re-render
// never interrupts a drag.
export function slider(app, meta) {
  const id = `p-${meta.k}`;
  const v = app.params[meta.k];
  const help = meta.help ? h('span', { class: 'help', tabindex: 0, role: 'note', 'data-tip': meta.help, 'aria-label': meta.help }, icon('info', 14)) : null;
  const TAG = { D: 'Estimated from data (Solutions §3, §5.1–5.3)', L: 'Taken from the empirical literature (Solutions §5.4)', P: 'Policy design choice (Solutions §7.6)', M: 'To be measured by the randomised trials (Solutions §10)', N: 'Numerical setting (Solutions §8)' };
  const tag = meta.cal ? h('span', { class: 'cal', 'data-tip': `${TAG[meta.cal] || ''}${meta.ext ? '; optional lever, neutral by default' : ''}` }, meta.cal) : meta.ext ? h('span', { class: 'ext', 'data-tip': 'Optional lever, neutral by default' }, 'ext') : null;
  if (meta.options) {
    return h('label', { class: 'ctrl', for: id, 'data-tip': meta.help }, h('span', { class: 'ctrl-l' }, meta.label, tag, help),
      h('select', { id, onchange: e => app.setParam(meta.k, e.target.value) }, meta.options.map(([val, lab]) => h('option', { value: val, selected: val === v }, lab))));
  }
  if (meta.bool) {
    return h('label', { class: 'ctrl ctrl-row', for: id, 'data-tip': meta.help }, h('input', { id, type: 'checkbox', checked: !!v, onchange: e => app.setParam(meta.k, e.target.checked) }), h('span', { class: 'ctrl-l' }, meta.label, tag, help));
  }
  const d = decimals(meta.step);
  const out = h('input', { type: 'number', class: 'num', min: meta.min, max: meta.max, step: meta.step, value: v, 'aria-label': meta.label, onchange: e => { const x = parseFloat(e.target.value); if (Number.isFinite(x)) app.setParam(meta.k, x); } });
  const range = h('input', { id, type: 'range', min: meta.min, max: meta.max, step: meta.step, value: v,
    oninput: e => { out.value = (+e.target.value).toFixed(d); },
    onchange: e => app.setParam(meta.k, +e.target.value) });
  const changed = meta.def !== v;
  return h('div', { class: ['ctrl', changed && 'changed'] },
    h('label', { class: 'ctrl-l', for: id, 'data-tip': meta.help }, meta.label, tag, help),
    h('div', { class: 'ctrl-in' }, range, out),
    changed ? h('button', { class: 'reset', type: 'button', 'data-tip': meta.cal || PARAM_PAPER(meta) ? `Return to the paper’s value, ${meta.def}` : `Return to the default, ${meta.def}`, onclick: () => app.setParam(meta.k, meta.def) }, `default ${meta.def}`) : null);
}
