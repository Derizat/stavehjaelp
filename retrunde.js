// Ret-runde til diktat: efter et forkert svar skriver eleven ordet igen, med feedback per bogstav.
// Ren logik uden DOM, så den kan testes i Node (test-retrunde.js). Global RETRUNDE i browseren.
(function (root) {
  var MAX_MISSES = 2; // efter så mange fejl på samme plads foræres bogstavet

  function create(word) {
    return { word: word, typed: '', misses: 0, revealed: 0, done: false };
  }

  // Behandler ét tastet tegn og opdaterer state.
  // result: 'ok' (rigtigt bogstav), 'wrong' (afvist), 'reveal' (afvist, og det rigtige bogstav blev sat ind), 'ignored'
  function type(state, ch) {
    if (state.done || !ch) return { result: 'ignored' };
    var expected = state.word.charAt(state.typed.length);
    if (ch.toLowerCase() === expected.toLowerCase()) {
      state.typed += expected;
      state.misses = 0;
      state.done = state.typed.length === state.word.length;
      return { result: 'ok', letter: expected };
    }
    // Mellemrum er ikke et gæt: dobbelt-mellemrum bruges til at høre ordet igen
    if (/\s/.test(ch)) return { result: 'ignored' };
    state.misses++;
    if (state.misses >= MAX_MISSES) {
      state.typed += expected;
      state.misses = 0;
      state.revealed++;
      state.done = state.typed.length === state.word.length;
      return { result: 'reveal', letter: expected, rejected: ch };
    }
    return { result: 'wrong', rejected: ch };
  }

  // Afstemmer state med feltets tekst efter en input-hændelse (tastning, sletning, indsætning).
  // Godkendte bogstaver er låst. Feltets nye værdi skal altid være state.typed.
  function sync(state, value) {
    var events = [];
    if (state.done) return events;
    if (value.toLowerCase().indexOf(state.typed.toLowerCase()) !== 0) return events; // sletning eller redigering midt i
    for (var i = state.typed.length; i < value.length && !state.done; i++) {
      var ev = type(state, value.charAt(i));
      if (ev.result === 'ignored') continue;
      events.push(ev);
      if (ev.result !== 'ok') break; // resten af en indsætning kasseres efter en fejl
    }
    return events;
  }

  var api = { MAX_MISSES: MAX_MISSES, create: create, type: type, sync: sync };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RETRUNDE = api;
})(typeof window !== 'undefined' ? window : this);
