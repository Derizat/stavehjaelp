#!/usr/bin/env node
// Test suite for core functions in app.js
// Run: node test-functions.js
// Loads app.js in Node via test-harness.js (browser stand-ins), so every function is tested as shipped.

const fs = require('fs');
const path = require('path');
const { loadApp } = require('./test-harness.js');

const realLog = console.log;
console.log = function() {}; // app.js logs while loading
const app = loadApp(); // console.log forbliver stille under testene; app.js logger selv

const words = app.WORD_BANK;
const allWords = Object.keys(words).reduce(function(acc, cat) {
  return acc.concat(words[cat].map(function(w) { return Object.assign({ category: cat }, w); }));
}, []);

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error('FAIL: ' + name); console.error('  ' + e.message); }
}
function assert(condition, msg) { if (!condition) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
function resetPlayer(name) { app.__store && Object.keys(app.__store).forEach(function(k) { delete app.__store[k]; }); app.activePlayer = name || 'TestSpiller'; }

// === playerKey ===

test('playerKey returns player-prefixed key', function() {
  app.activePlayer = 'TestSpiller';
  eq(app.playerKey('profile_data'), 'TestSpiller_profile_data');
});

// === generateBlanks ===

test('generateBlanks works for stumme bogstaver (hv-words)', function() {
  var r = app.generateBlanks({ word: 'hvid', category: 'Stumme bogstaver', patternHint: "stumt 'h' i 'hv'" });
  assert(r && r.correct === 'h' && r.options.length >= 2, 'got ' + JSON.stringify(r));
});

test('generateBlanks works for dobbeltkonsonant', function() {
  var r = app.generateBlanks({ word: 'hoppe', category: 'Dobbeltkonsonant', patternHint: "dobbelt-p efter kort 'o'" });
  assert(r && r.correct === 'pp', 'got ' + JSON.stringify(r));
});

test('generateBlanks works for nutids-r', function() {
  var r = app.generateBlanks({ word: 'hopper', category: 'Nutids-r', patternHint: "nutids-r: verbet ender på '-r' i nutid (hun hopper)" });
  assert(r && r.correct === 'r', 'got ' + JSON.stringify(r));
});

test('generateBlanks returns null for lydrette ord', function() {
  eq(app.generateBlanks({ word: 'sol', category: 'Lydrette ord', patternHint: 'lydrette ord — staves som det lyder' }), null);
});

test('generateBlanks: the blanked letters are exactly the correct answer, for every word', function() {
  var bad = [];
  allWords.forEach(function(w) {
    var b = app.generateBlanks(w);
    if (!b) return;
    var segment = w.word.substr(b.blankStart, b.blankLen);
    if (segment !== b.correct) bad.push(w.word + ': blanks "' + segment + '" but answer is "' + b.correct + '"');
    if (!b.options || b.options.indexOf(b.correct) < 0) bad.push(w.word + ': answer not among options');
    if (b.options && b.options.length < 2) bad.push(w.word + ': fewer than 2 options');
  });
  assert(bad.length === 0, bad.length + ' bad blanks:\n  ' + bad.slice(0, 10).join('\n  '));
});

test('generateBlanks covers majority of words', function() {
  var blanked = allWords.filter(function(w) { return app.generateBlanks(w); }).length;
  assert(blanked / allWords.length > 0.3, 'only ' + blanked + ' of ' + allWords.length);
});

// === parseMorphemes ===

test('parseMorphemes works for simple compound words', function() {
  var r = app.parseMorphemes("'fod' + 'bold'", 'fodbold');
  assert(r && r.length === 2 && r[0] === 'fod' && r[1] === 'bold', 'got ' + JSON.stringify(r));
});

test('parseMorphemes returns null for words without +', function() {
  eq(app.parseMorphemes("stumt 'h' i 'hv'", 'hvid'), null);
});

test('parseMorphemes: the pieces always rebuild the word', function() {
  var bad = [];
  allWords.forEach(function(w) {
    var r = app.parseMorphemes(w.patternHint, w.word);
    if (!r) return;
    var joined = r.map(function(p) { return p.replace(/^-/, '').replace(/-$/, ''); }).join('');
    if (joined !== w.word) bad.push(w.word + ' <- ' + r.join(' '));
  });
  assert(bad.length === 0, bad.length + ' do not rebuild:\n  ' + bad.slice(0, 10).join('\n  '));
});

test('word builder never offers a distractor that looks like a needed piece', function() {
  var bare = function(p) { return p.replace(/^-+/, '').replace(/-+$/, ''); };
  var bad = [];
  allWords.forEach(function(w) {
    var m = app.parseMorphemes(w.patternHint, w.word);
    if (!m) return;
    for (var run = 0; run < 5; run++) {
      app.wbWords = [{ wordObj: w, morphemes: m }]; app.wbIndex = 0;
      try { app.renderWBWord(); } catch (e) { bad.push(w.word + ': ' + e.message); return; }
      var needed = m.map(bare);
      app.wbShuffled.forEach(function(p) {
        if (m.indexOf(p) < 0 && needed.indexOf(bare(p)) >= 0) bad.push(w.word + ': distractor "' + p + '"');
      });
    }
  });
  assert(bad.length === 0, bad.slice(0, 8).join('\n  '));
});

// === findWordInSentence (no lookbehind; older iPads) ===

test('no JavaScript file uses regex lookbehind (breaks iPadOS before 16.4)', function() {
  var bad = [];
  fs.readdirSync(__dirname).filter(function(f) { return /\.js$/.test(f) && !/^test-/.test(f); }).forEach(function(f) {
    var src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    if (/\(\?<[=!]/.test(src)) bad.push(f);
  });
  assert(bad.length === 0, 'lookbehind found in: ' + bad.join(', '));
});

test('findWordInSentence finds every word in its own sentence', function() {
  var missing = allWords.filter(function(w) { return w.sentence && !app.findWordInSentence(w.sentence, w.word); });
  assert(missing.length === 0, missing.length + ' not found: ' + missing.slice(0, 8).map(function(w) { return w.word; }).join(', '));
});

test('replaceWordInSentence replaces a whole word, not letters inside another word', function() {
  eq(app.replaceWordInSentence('Den gamle mand sad i en stol.', 'en', 'X'), 'Den gamle mand sad i X stol.');
  eq(app.replaceWordInSentence('Hop op på stolen.', 'op', 'X'), 'Hop X på stolen.');
});

// === buildSpellingPoliceItem ===

test('buildSpellingPoliceItem builds a real error for words with misspellings', function() {
  var bad = [];
  allWords.forEach(function(w) {
    var r = app.buildSpellingPoliceItem(w);
    if (!r) return;
    var clean = r.tokens[r.targetIndex].replace(/[.,!?;:'"]+$/g, '');
    if (r.misspelledWord.toLowerCase() === r.correctWord.toLowerCase()) bad.push(w.word + ': error equals word');
    if (clean.toLowerCase() !== r.misspelledWord.toLowerCase()) bad.push(w.word + ': target token "' + clean + '" is not the error');
  });
  assert(bad.length === 0, bad.length + ' bad:\n  ' + bad.slice(0, 10).join('\n  '));
});

// === diffHighlight / alignMatchedLetters ===

function marked(correct, attempt) {
  var m = app.alignMatchedLetters(correct, attempt);
  return correct.split('').map(function(ch, i) { return m[i] ? ch : '[' + ch + ']'; }).join('');
}

test('diff marks only the missing or wrong letter', function() {
  eq(marked('hvad', 'vad'), '[h]vad');
  eq(marked('kat', 'hat'), '[k]at');
  eq(marked('rødgrød', 'røgrød'), 'rø[d]grød');
  eq(marked('kat', 'kat'), 'kat');
  eq(marked('hvid', ''), '[h][v][i][d]');
});

test('diffHighlight escapes HTML and colours letters', function() {
  var r = app.diffHighlight('kat', 'hat');
  assert(r.indexOf('var(--red)') >= 0 && r.indexOf('var(--green)') >= 0, r);
  assert(app.diffHighlight('<b>', 'x').indexOf('<b>') < 0, 'HTML not escaped');
});

// === Category levels ===

test('every category has words on its start level (otherwise it never progresses)', function() {
  var bad = Object.keys(words).filter(function(cat) {
    var sl = app.CATEGORY_START_LEVELS[cat] !== undefined ? app.CATEGORY_START_LEVELS[cat] : 1;
    return !words[cat].some(function(w) { return w.level === sl; });
  });
  assert(bad.length === 0, 'stuck categories: ' + bad.join(', '));
});

test('a new player has Fremmedord locked (no progress counted at start levels)', function() {
  resetPlayer('NyTest');
  eq(app.countCategoriesAtLevel(app.loadCategoryLevels(), 2), 0, 'gate count');
});

test('a wrong answer never counts as correct for levels', function() {
  resetPlayer('NiveauTest');
  for (var i = 0; i < 5; i++) app.updateCategoryLevel('Dobbeltkonsonant', false, 1, 'hope', 'hoppe', 'hoppe');
  var h = app.loadCategoryLevels()['Dobbeltkonsonant'].history;
  assert(h.length === 5 && h.every(function(x) { return x === false; }), 'history ' + JSON.stringify(h));
});

test('an obvious adjacent-key typo is skipped, a spelling error is not', function() {
  eq(app.isLikelyTypo('hjemme', 'hjenme'), true);
  eq(app.isLikelyTypo('hjemme', 'jemme'), false);
  eq(app.isLikelyTypo('hav', 'haf'), false);
  eq(app.isLikelyTypo('lyd', 'lud'), false);
  eq(app.isLikelyTypo('taxi', 'tasi'), false);
});

// === Session building and bosses ===

test('a brand-new player gets at most one Stavevælger per session (unmatched slots become dictation)', function() {
  resetPlayer('NySession');
  for (var run = 0; run < 5; run++) {
    app.startTrainingFromProfile();
    var picks = app.mixedQueue.filter(function(q) { return q.type === 'spellpick'; }).length;
    assert(picks <= 1, 'run ' + run + ': ' + picks + ' spellpicks in ' + app.mixedQueue.map(function(q) { return q.type; }).join(','));
    eq(app.mixedQueue.length, 10, 'session length');
  }
});

test('the silent servant boss is only offered once Stumme bogstaver is unlocked', function() {
  resetPlayer('NyBoss');
  assert(app.availableBossTypes().indexOf('silentservant') < 0, 'offered to a new player');
  var lv = app.loadCategoryLevels(); lv['Lydrette ord'].level = 1; app.saveCategoryLevels(lv);
  assert(app.availableBossTypes().indexOf('silentservant') >= 0, 'not offered after unlocking');
});

// === Shop ===

test('unlocking French twice does not charge gems twice', function() {
  resetPlayer('FranskTest');
  var rd = app.loadRewardData(); rd.gems = 30; app.saveRewardData(rd);
  eq(app.purchaseFrench(), true); eq(app.purchaseFrench(), false);
  eq(app.loadRewardData().gems, 20);
  eq(app.purchaseFrench2(), true); eq(app.purchaseFrench2(), false);
  eq(app.loadRewardData().gems, 10);
});

// === Spaced repetition ===

test('only wrong words go on the practice list', function() {
  resetPlayer('SrTest');
  app.updateSRWord('kat', true, 'Lydrette ord');
  app.updateSRWord('hjemme', false, 'Stumme bogstaver');
  eq(Object.keys(app.loadSRData().words || {}).join(','), 'hjemme');
});

// === Sync ===

test('pickNewerProfile: more XP wins, ties go to the newer timestamp', function() {
  eq(app.pickNewerProfile({ hasData: true, xp: 800, stamp: 0 }, { xp: 400, time: 9e12 }), 'local');
  eq(app.pickNewerProfile({ hasData: true, xp: 300, stamp: 9e12 }, { xp: 900, time: 1 }), 'remote');
  eq(app.pickNewerProfile({ hasData: true, xp: 500, stamp: 20 }, { xp: 500, time: 10 }), 'local');
  eq(app.pickNewerProfile({ hasData: false, xp: 0, stamp: 0 }, { xp: 0, time: 0 }), 'remote');
});

test('mergeGrowOnly keeps levels, purchases and practice words from the losing copy', function() {
  var m = app.mergeGrowOnly(
    { profile: { categoryLevels: { A: { level: 4 }, B: { level: 1 } } }, reward: { totalXP: 900, gems: 5, shop: { owned: { themes: ['ocean'] } } }, sr: { words: { kat: {} } } },
    { profile: { categoryLevels: { A: { level: 2 }, B: { level: 3 } } }, reward: { totalXP: 800, gems: 40, shop: { owned: { themes: ['sunset'] } }, frenchUnlocked: true }, sr: { words: { hund: {} } } }
  );
  eq(m.profile.categoryLevels.A.level, 4); eq(m.profile.categoryLevels.B.level, 3);
  assert(m.reward.shop.owned.themes.indexOf('sunset') >= 0 && m.reward.shop.owned.themes.indexOf('ocean') >= 0, 'shop');
  eq(m.reward.gems, 5, 'gems follow the winner'); eq(m.reward.frenchUnlocked, true);
  assert(m.sr.words.kat && m.sr.words.hund, 'sr');
});

test('sanitizeProfileRow turns HTML in numeric fields into numbers', function() {
  var r = app.sanitizeProfileRow({ reward_data: { gems: '<img onerror=x>', totalXP: '12' }, profile_data: { categoryLevels: { A: { level: '<b>' } } }, student_grade: '<i>' });
  eq(r.reward_data.gems, 0); eq(r.reward_data.totalXP, 12); eq(r.profile_data.categoryLevels.A.level, 0); eq(r.student_grade, 0);
});

// === Escaping ===

test('escapeHtml escapes quotes; jsAttr survives an onclick attribute', function() {
  eq(app.escapeHtml('<a href="x">\'</a>'), '&lt;a href=&quot;x&quot;&gt;&#39;&lt;/a&gt;');
  var evil = "x');alert(1);//";
  var decoded = app.jsAttr(evil).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  var got; var deleteClass = function(id, n) { got = n; };
  eval("deleteClass('id', '" + decoded + "')");
  eq(got, evil);
});

console.log = realLog;
console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
