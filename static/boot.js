// Runs before first paint: refuses to run inside another site's frame (clickjacking; hosts such as GitHub
// Pages cannot send frame-ancestors headers), saved theme, plus small polyfills so older phones and
// browsers (iOS 13+, Android 7+) run the app.
if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.style.display = 'none'; } }
try { var t = localStorage.getItem('phx:theme'); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch (e) {}
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', { configurable: true, writable: true, value: function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return this[n]; } });
}
if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) {
  document.documentElement.classList.add('no-dialog');
  var proto = (typeof HTMLDialogElement !== 'undefined' ? HTMLDialogElement : HTMLElement).prototype;
  proto.showModal = proto.show = function () { this.setAttribute('open', ''); var d = this; this._esc = function (e) { if (e.key === 'Escape') d.close(); }; document.addEventListener('keydown', this._esc); };
  proto.close = function () { if (!this.hasAttribute('open')) return; this.removeAttribute('open'); document.removeEventListener('keydown', this._esc); this.dispatchEvent(new Event('close')); };
}
