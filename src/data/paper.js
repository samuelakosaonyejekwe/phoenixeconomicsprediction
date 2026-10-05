// The published results of Phoenix Economics Solutions (paper/results-2026-10-04.json), served with the
// application and loaded once on demand, so that every figure the app quotes from the paper is the
// paper's own number rather than a copy.
let promise = null, value = null;
export function paperResults() {
  // The single-file offline edition carries the paper's data inside the page (scripts/build.mjs).
  if (!promise && globalThis.PHX_EMBED_PAPER?.results) promise = Promise.resolve((value = globalThis.PHX_EMBED_PAPER.results));
  if (!promise) promise = fetch(new URL('data/paper/results-2026-10-04.json', location.href)).then(r => (r.ok ? r.json() : null)).then(j => (value = j)).catch(() => null);
  return promise;
}
export const paperNow = () => value;
