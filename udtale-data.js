// Data og rene funktioner til udtale-træneren (blødt d).
// Kører både i browseren (global UDTALE_DATA) og i Node (test-udtale.js).
(function (root) {
  var VOWELS = 'aeiouyæøå';
  var RE_FINAL = new RegExp('[' + VOWELS + ']d$');
  var RE_MEDIAL = new RegExp('[' + VOWELS + ']dd?(e|er|en|et|es|ene)$');
  var RE_PAST = /ede$/;
  var RE_SOFT_D = new RegExp('([' + VOWELS + '])dd?', 'g');
  var PAST_CATEGORY = 'Verbernes bøjning';

  // Rigtige minimalpar: venstre har blødt d, højre har j
  var PAIRS = [
    ['mad', 'maj'], ['ved', 'vej'], ['hed', 'hej'], ['ned', 'nej'], ['bød', 'bøj'],
    ['fed', 'fej'], ['led', 'lej'], ['øde', 'øje'], ['møde', 'møje']
  ];

  // Ord med blødt d som ikke findes i words.json (ingen sætning)
  var EXTRA_WORDS = ['ved', 'hed', 'bød', 'fed', 'øde', 'møde'];

  var TIERS = [
    { id: 'final', label: 'Sidst i ordet', desc: 'mad, hvid, rød' },
    { id: 'medial', label: 'I midten', desc: 'bade, side, sidder' },
    { id: 'past', label: '-ede', desc: 'legede, hoppede' },
    { id: 'sentence', label: 'Sætninger', desc: 'hele sætninger med blødt d' },
    { id: 'pair', label: 'Par', desc: 'ned/nej, mad/maj' }
  ];

  function sanitizeFilename(word) {
    return word.toLowerCase()
      .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
      .replace(/[^a-z0-9]/g, '_');
  }

  // Sti til MP3 efter samme konvention som generate-audio.js
  function audioPath(word, kind, suffix) {
    return 'audio/' + kind + '_' + sanitizeFilename(word) + (suffix || '') + '.mp3';
  }

  // Elevens fejlform: blødt d (vokal + d/dd) bliver til j
  function errorForm(word) {
    return word.replace(RE_SOFT_D, '$1j');
  }

  // Hvilket trin hører et ord fra words.json til? null = ikke med
  function tierOf(entry) {
    var w = entry.word;
    if (RE_PAST.test(w) && entry.category === PAST_CATEGORY) return 'past';
    if (RE_MEDIAL.test(w)) return 'medial';
    if (RE_FINAL.test(w)) return 'final';
    return null;
  }

  // Bygger { final, medial, past, sentence, pair } ud fra ordbanken
  function buildTiers(wordBank) {
    var tiers = { final: [], medial: [], past: [], sentence: [], pair: [] };
    var entries = Object.keys(wordBank).reduce(function (acc, cat) {
      return acc.concat(wordBank[cat]);
    }, []);
    var seen = {};
    entries.forEach(function (e) {
      var t = tierOf(e);
      if (!t || seen[e.word]) return;
      seen[e.word] = true;
      tiers[t].push({ word: e.word, sentence: e.sentence || null, key: e.word });
      if (e.sentence) tiers.sentence.push({ word: e.word, sentence: e.sentence, key: 'sentence:' + e.word });
    });
    EXTRA_WORDS.forEach(function (w) {
      if (seen[w]) return;
      seen[w] = true;
      var t = tierOf({ word: w, category: '' });
      if (t) tiers[t].push({ word: w, sentence: null, key: w });
    });
    PAIRS.forEach(function (p) { tiers.pair.push({ pair: p.slice() }); });
    return tiers;
  }

  var api = {
    PAIRS: PAIRS, EXTRA_WORDS: EXTRA_WORDS, TIERS: TIERS,
    sanitizeFilename: sanitizeFilename, audioPath: audioPath,
    errorForm: errorForm, tierOf: tierOf, buildTiers: buildTiers
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UDTALE_DATA = api;
})(typeof window !== 'undefined' ? window : this);
