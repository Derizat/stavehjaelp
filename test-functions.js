#!/usr/bin/env node
// Test suite for core spelling functions
// Run: node test-functions.js
// Extracts functions from index.html and tests them in isolation

const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const words = JSON.parse(fs.readFileSync('words.json', 'utf8'));

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error('FAIL: ' + name);
    console.error('  ' + e.message);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// === EXTRACT FUNCTIONS FROM HTML ===
// Extract the script content and eval pure functions we need

function shuffle(arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

// Extract specific functions by finding their boundaries
function extractFunction(name) {
  var scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
  var script = scriptMatch[1].replace(/<\/?script[^>]*>/g, '');
  var lines = script.split('\n');
  var funcLines = [], inFunc = false, braceCount = 0;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].includes('function ' + name + '(')) inFunc = true;
    if (inFunc) {
      funcLines.push(lines[i]);
      braceCount += (lines[i].match(/{/g) || []).length;
      braceCount -= (lines[i].match(/}/g) || []).length;
      if (braceCount === 0 && funcLines.length > 1) break;
    }
  }
  return funcLines.join('\n');
}

// Load the functions we want to test
eval(extractFunction('generateBlanks'));
eval(extractFunction('generateMisspelling'));
eval(extractFunction('parseMorphemes'));
eval(extractFunction('buildSpellingPoliceItem'));
eval(extractFunction('playerKey'));
eval(extractFunction('diffHighlight'));

// Stub globals needed by functions
var activePlayer = 'TestSpiller';
var WORD_BANK = words;
var ALL_CATEGORIES = Object.keys(words);

// === playerKey TESTS ===

test('playerKey returns player-prefixed key', function() {
  assert(playerKey('profile_data') === 'TestSpiller_profile_data', 'Got: ' + playerKey('profile_data'));
});

test('playerKey works with empty player', function() {
  activePlayer = '';
  assert(playerKey('test') === '_test', 'Got: ' + playerKey('test'));
  activePlayer = 'TestSpiller';
});

// === generateBlanks TESTS ===

test('generateBlanks works for stumme bogstaver (hv-words)', function() {
  var result = generateBlanks({ word: 'hvid', category: 'Stumme bogstaver', patternHint: "stumt 'h' i 'hv'" });
  assert(result !== null, 'Should return result for hvid');
  assert(result.correct === 'h', 'Correct should be h, got: ' + result.correct);
  assert(result.options.length >= 2, 'Should have at least 2 options');
});

test('generateBlanks works for dobbeltkonsonant', function() {
  var result = generateBlanks({ word: 'hoppe', category: 'Dobbeltkonsonant', patternHint: "dobbelt-p efter kort 'o'" });
  assert(result !== null, 'Should return result for hoppe');
  assert(result.correct === 'pp', 'Correct should be pp, got: ' + result.correct);
});

test('generateBlanks works for nutids-r', function() {
  var result = generateBlanks({ word: 'hopper', category: 'Nutids-r', patternHint: "nutids-r: verbet ender på '-r' i nutid (hun hopper)" });
  assert(result !== null, 'Should return result for hopper');
  assert(result.correct === 'r', 'Correct should be r, got: ' + result.correct);
});

test('generateBlanks returns null for lydrette ord', function() {
  var result = generateBlanks({ word: 'sol', category: 'Lydrette ord', patternHint: "lydrette ord — staves som det lyder" });
  assert(result === null, 'Should return null for lydrette ord');
});

test('generateBlanks covers majority of words', function() {
  var total = 0, blanked = 0;
  Object.values(words).flat().forEach(function(w) {
    total++;
    if (generateBlanks(w)) blanked++;
  });
  var pct = Math.round(blanked / total * 100);
  assert(pct > 30, 'Only ' + pct + '% of words have blanks (expected >30%)');
});

// === generateMisspelling TESTS ===

test('generateMisspelling works for stumme bogstaver', function() {
  var result = generateMisspelling({ word: 'hvid', category: 'Stumme bogstaver', patternHint: "stumt 'h' i 'hv'" });
  assert(result !== null, 'Should return result for hvid');
  assert(result.misspelled === 'vid', 'Misspelled should be vid, got: ' + result.misspelled);
});

test('generateMisspelling works for dobbeltkonsonant', function() {
  var result = generateMisspelling({ word: 'hoppe', category: 'Dobbeltkonsonant', patternHint: "dobbelt-p efter kort 'o'" });
  assert(result !== null, 'Should return result for hoppe');
  assert(result.misspelled === 'hope', 'Misspelled should be hope, got: ' + result.misspelled);
});

test('generateMisspelling works for nutids-r', function() {
  var result = generateMisspelling({ word: 'hopper', category: 'Nutids-r', patternHint: "nutids-r: verbet ender på '-r' i nutid (hun hopper)" });
  assert(result !== null, 'Should return result for hopper');
  assert(result.misspelled === 'hoppe', 'Misspelled should be hoppe, got: ' + result.misspelled);
});

test('generateMisspelling returns different word than original', function() {
  var allWords = Object.values(words).flat();
  var bad = [];
  allWords.forEach(function(w) {
    var ms = generateMisspelling(w);
    if (ms && ms.misspelled === w.word) bad.push(w.word);
  });
  assert(bad.length === 0, 'Misspelling same as original: ' + bad.join(', '));
});

// === parseMorphemes TESTS ===

test('parseMorphemes works for simple compound words', function() {
  var result = parseMorphemes("'fod' + 'bold'", 'fodbold');
  assert(result !== null, 'Should parse fodbold');
  assert(result.length === 2, 'Should have 2 parts, got: ' + result.length);
  assert(result[0] === 'fod' && result[1] === 'bold', 'Parts: ' + result.join(', '));
});

test('parseMorphemes works for prefix+suffix words', function() {
  var result = parseMorphemes("'for-' + 'bered' + '-else'", 'forberedelse');
  assert(result !== null, 'Should parse forberedelse');
  assert(result.length === 3, 'Should have 3 parts, got: ' + result.length);
});

test('parseMorphemes derives stem from affixes', function() {
  var result = parseMorphemes("'for-' + '-else'", 'forståelse');
  assert(result !== null, 'Should parse forståelse');
  assert(result.length >= 2, 'Should have at least 2 parts');
  // Should derive 'stå' as stem
  var joined = result.map(function(p) { return p.replace(/^-/, '').replace(/-$/, ''); }).join('');
  assert(joined === 'forståelse', 'Parts should reconstruct word, got: ' + joined);
});

test('parseMorphemes returns null for words without +', function() {
  var result = parseMorphemes("stumt 'h' i 'hv'", 'hvid');
  assert(result === null, 'Should return null for non-compound hints');
});

test('parseMorphemes covers compound/affix words', function() {
  var total = 0, parsed = 0;
  Object.values(words).flat().forEach(function(w) {
    if (w.patternHint && w.patternHint.indexOf('+') >= 0) {
      total++;
      if (parseMorphemes(w.patternHint, w.word)) parsed++;
    }
  });
  var pct = total > 0 ? Math.round(parsed / total * 100) : 0;
  assert(pct > 70, 'Only ' + pct + '% of compound hints parsed (expected >70%)');
});

// === buildSpellingPoliceItem TESTS ===

test('buildSpellingPoliceItem works for words with misspellings and sentences', function() {
  var w = { word: 'hvid', hint: 'En farve som sne', patternHint: "stumt 'h' i 'hv'", sentence: 'Sneen er helt hvid i dag.', category: 'Stumme bogstaver', level: 1 };
  var result = buildSpellingPoliceItem(w);
  assert(result !== null, 'Should build item for hvid');
  assert(result.tokens.length > 0, 'Should have tokens');
  assert(result.targetIndex >= 0, 'Should have target index');
  assert(result.misspelledWord !== result.correctWord, 'Misspelled should differ from correct');
});

// === diffHighlight TESTS ===

test('diffHighlight marks correct letters green', function() {
  var result = diffHighlight('kat', 'kat');
  assert(result.includes('var(--green)'), 'All correct should be green');
  assert(!result.includes('var(--red)'), 'Should have no red');
});

test('diffHighlight marks wrong letters red', function() {
  var result = diffHighlight('kat', 'hat');
  assert(result.includes('var(--red)'), 'Wrong letter should be red');
  assert(result.includes('var(--green)'), 'Correct letters should be green');
});

// === CROSS-FUNCTION CONSISTENCY ===

test('Every word with generateBlanks also has valid options', function() {
  var bad = [];
  Object.values(words).flat().forEach(function(w) {
    var b = generateBlanks(w);
    if (b) {
      if (!b.options || b.options.length < 2) bad.push(w.word + ': only ' + (b.options ? b.options.length : 0) + ' options');
      if (b.options && b.options.indexOf(b.correct) < 0) bad.push(w.word + ': correct "' + b.correct + '" not in options');
    }
  });
  assert(bad.length === 0, 'Bad blanks:\n  ' + bad.slice(0, 10).join('\n  '));
});

// === RESULTS ===

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
