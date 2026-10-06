import { h } from '../ui/dom.js';
import { card, dataTable } from '../ui/charts.js';
import { ABSORPTION, FLOWS, GOVERNANCE } from '../content/equations.js';
import { pageHead, explain, kpi, objectiveChips } from './common.js';

export function governance(root, app) {
  const liq = app.data.ecb?.liq?.at(-1), dfr = app.data.ecb?.dfr?.at(-1);
  root.append(
    pageHead('Design & governance', 'How Phoenix absorbs lawfully, how its flows affect money, who governs it, and how privacy and security are protected (Solutions §2, §9).'),
    h('div', { class: 'kpis' },
      kpi({ label: 'Existing absorption: ECB deposit facility', value: liq ? `€${(liq[1] / 1e6).toFixed(2)}tn` : '–', sub: liq ? `week ${liq[0]}, remunerated at ${dfr ? dfr[1] : '–'}%` : 'live from the ECB' }),
      kpi({ label: 'What Phoenix adds', value: 'Targeted', sub: 'economy by economy, only when inflation and excess deposits are both exceptional' }),
      kpi({ label: 'Direct government financing', value: 'Never', sub: 'Art. 123 TFEU' })),
    card({ title: 'Lawful absorption by sector', sub: 'Public surpluses by statute; private funds only through voluntary, remunerated instruments',
      body: dataTable({ cols: ['Sector', 'Absorption mechanism', 'Legal basis'], rows: ABSORPTION }) }),
    h('div', { class: 'grid-2' },
      card({ title: 'Monetary accounting of each flow', sub: 'Tracked separately in every simulation', body: dataTable({ cols: ['Flow', 'Effect', 'Note'], rows: FLOWS }) }),
      card({ title: 'Conversion modes', body: h('dl', { class: 'io' },
        h('dt', null, 'Digital Euro'), h('dd', null, 'In normal conditions recalled balances are converted into the Digital Euro up to each holder’s holding limit (€3,000 assumed, 50% adoption); the route exists only once the Digital Euro regulation applies.'),
        h('dt', null, 'Bank accounts'), h('dd', null, 'Amounts above the holding limit are swept to the holder’s linked commercial-bank account.'),
        h('dt', null, 'Dragon reserve'), h('dd', null, 'In an inflation crisis (inflation at or above the crisis level) recalled balances move into a ring-fenced reserve of the mandate-holder held entirely as deposits at the central bank, so the funds are sterilised; audited with the rest of the Fund’s accounts, redeemable at par with the premium once the crisis ends (Solutions §2.2).')) })),
    h('div', { class: 'grid-2' },
      card({ title: 'Governance: the mandate-holder', sub: 'A Phoenix Stabilisation Fund created by an intergovernmental agreement, accountable to the European Parliament and national parliaments, audited by an independent board of auditors that includes a member nominated by the European Court of Auditors (Solutions §9.2)',
        body: h('ol', { class: 'steps' }, GOVERNANCE.map(g => h('li', null, g))) }),
      card({ title: 'Privacy and security', body: h('ul', { class: 'steps' },
        h('li', null, 'Detection uses aggregate official statistics only; no individual account is monitored.'),
        h('li', null, 'Wallet operations follow data-minimisation principles (GDPR).'),
        h('li', null, 'Trial data are used only with explicit consent (Art. 6(1)(a) GDPR) under the research safeguards of Art. 89; only arm-level aggregates leave the partner banks.'),
        h('li', null, 'Every contract action and suspension is written to a signed, hash-chained ledger anchored in the public Sigstore Rekor log.'),
        h('li', null, 'Standard cryptography with a migration path to post-quantum algorithms.'),
        h('li', null, 'This application: strict Content Security Policy, no cookies or trackers; settings and ledgers stay on the device. On first use the device’s key registration is anchored automatically, and later anchors on request: each sends only a chain-head hash, its signature and the device’s public key (Solutions §9.4–9.5).')) })),
    card({ title: 'Legal analysis (Solutions §2.5)', sub: 'A proposal: no consultation with the ECB or the Commission has yet taken place',
      body: dataTable({ cols: ['Question', 'Assessment'], rows: [
        ['Basis', 'An intergovernmental agreement modelled on the ESM Treaty, which the Court of Justice upheld in Pringle (C-370/12); Art. 136(3) TFEU covers stability mechanisms with strict conditionality — Phoenix has none, so the analogy is partial.'],
        ['Monetary policy (exclusive Union competence)', 'Phoenix sets no interest rate and does not act on central-bank money; its objective is limiting exceptional idle stocks, not price stability, and its measured price effect is immaterial (§7).'],
        ['Monetary financing (Art. 123)', 'PHX balances are commercial-bank deposits; no one lends to governments; the Dragon reserve holds central-bank deposits only.'],
        ['No bail-out (Art. 125)', 'Routing moves capped wallet balances between private holders; no state assumes another’s liabilities.'],
        ['Consultation (Art. 127(4))', 'The ECB must be consulted on draft legislation in its fields of competence (Council Decision 98/415/EC for national drafts).'],
        ['Union route', 'Art. 352 TFEU (unanimity) or, for crisis use, Art. 122 TFEU — narrower and slower than an agreement.'],
        ['Open questions', 'Classification of PHX under MiCA and the e-money rules, deposit-guarantee coverage, anti-money-laundering duties and financial-promotion rules for the trials require legal opinion.']] }) }),
    explain('Position relative to existing instruments',
      h('p', null, 'The deposit facility absorbs bank reserves uniformly across the currency area; fiscal rules and automatic stabilisers act annually or through taxes and benefits. Phoenix complements them: it acts economy by economy on measured excess deposits, routes liquidity within a currency area, and records every conversion. It does not replace monetary policy: its effect on inflation is a fraction of a basis point of policy rate on the ECB’s own estimate of transmission (Solutions §7.8), and every result in this application is shown against a no-Phoenix counterfactual on the same data.')),
    objectiveChips([2, 4, 11, 12]));
}
