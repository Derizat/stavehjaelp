// Indlæser app.js (og modulerne før den) i Node med simple stand-ins for browseren,
// så funktionerne kan testes direkte. Bruges af test-functions.js.
// Run: (bruges kun af andre tests)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), style: {}, dataset: {}, children: [], value: '', textContent: '', innerHTML: '',
    classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); },
      contains(c) { return this._s.has(c); }, toggle(c, on) { if (on === undefined ? !this._s.has(c) : on) this._s.add(c); else this._s.delete(c); } },
    addEventListener() {}, removeEventListener() {}, appendChild(c) { this.children.push(c); return c; }, removeChild() {},
    setAttribute() {}, getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    focus() {}, blur() {}, click() {}, insertAdjacentHTML() {}, closest() { return null; },
  };
  return el;
}

function loadApp(opts) {
  opts = opts || {};
  const root = __dirname;
  const store = {};
  const elements = {};
  const listeners = [];
  const document = {
    getElementById(id) { return elements[id] || (elements[id] = makeElement('div')); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    createElement: makeElement, createRange() { return { selectNodeContents() {}, getBoundingClientRect() { return {}; } }; },
    addEventListener(type, fn) { listeners.push({ type, fn }); }, removeEventListener() {},
    body: makeElement('body'), documentElement: makeElement('html'), visibilityState: 'visible',
  };
  const localStorage = {
    getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }, clear: () => { for (const k in store) delete store[k]; },
  };
  const ctx = {
    console, Math, JSON, Date, Object, Array, String, Number, Boolean, RegExp, Error, Promise, Set, Map, parseInt, parseFloat, isFinite, isNaN,
    setTimeout: (fn, ms) => opts.realTimers ? setTimeout(fn, ms) : 0, clearTimeout: () => {},
    setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    document, localStorage, navigator: { mediaDevices: null, userAgent: 'node' }, location: { search: opts.search || '' },
    fetch: () => new Promise(() => {}), alert() {}, confirm: () => true,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    Audio: function() { return { play: () => Promise.resolve(), pause() {}, addEventListener() {} }; },
    Image: function() { return {}; },
    AudioContext: undefined, webkitAudioContext: undefined,
  };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  vm.createContext(ctx);
  for (const f of ['sfx.js', 'fx.js', 'retrunde.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  // Ordbanken som initApp ville hente den
  const words = JSON.parse(fs.readFileSync(path.join(root, 'words.json'), 'utf8'));
  vm.runInContext('WORD_BANK = ' + JSON.stringify(words) + '; ALL_CATEGORIES = Object.keys(WORD_BANK);', ctx);
  ctx.__store = store;
  ctx.__listeners = listeners;
  return ctx;
}

module.exports = { loadApp };
