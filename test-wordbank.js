#!/usr/bin/env node
// Test suite for words.json data integrity
// Run: node test-wordbank.js

const fs = require('fs');
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

const allWords = Object.values(words).flat();
const expectedCategories = [
  'Stumme bogstaver', 'Dobbeltkonsonant', 'For- og efterstavelser',
  'Sammensatte ord', 'Verbernes bøjning', 'Navneordsendelser',
  'Lydrette ord', 'Nutids-r', 'Fremmedord', 'Blødt d'
];

// === STRUCTURAL TESTS ===

test('All expected categories exist', function() {
  expectedCategories.forEach(function(cat) {
    assert(words[cat], 'Missing category: ' + cat);
    assert(Array.isArray(words[cat]), cat + ' is not an array');
  });
});

test('No empty categories', function() {
  Object.entries(words).forEach(function([cat, list]) {
    assert(list.length > 0, cat + ' has no words');
  });
});

test('Every word has required fields', function() {
  var errors = [];
  allWords.forEach(function(w) {
    if (!w.word) errors.push('Missing word field: ' + JSON.stringify(w).substring(0, 80));
    if (!w.hint) errors.push('Missing hint for: ' + w.word);
    if (!w.sentence) errors.push('Missing sentence for: ' + w.word);
    if (!w.category) errors.push('Missing category for: ' + w.word);
    if (w.level === undefined || w.level === null) errors.push('Missing level for: ' + w.word);
    if (!w.patternHint) errors.push('Missing patternHint for: ' + w.word);
  });
  assert(errors.length === 0, errors.length + ' errors:\n  ' + errors.slice(0, 10).join('\n  '));
});

test('All levels are 0-4', function() {
  var bad = allWords.filter(function(w) { return w.level < 0 || w.level > 4; });
  assert(bad.length === 0, 'Bad levels: ' + bad.map(function(w) { return w.word + '=' + w.level; }).join(', '));
});

// === DUPLICATE TESTS ===

test('No duplicate words across entire bank', function() {
  var seen = {};
  var dupes = [];
  allWords.forEach(function(w) {
    var key = w.word.toLowerCase();
    if (seen[key]) dupes.push(w.word + ' (in ' + w.category + ' and ' + seen[key] + ')');
    seen[key] = w.category;
  });
  assert(dupes.length === 0, 'Duplicates: ' + dupes.join(', '));
});

test('No duplicate words within same category', function() {
  var dupes = [];
  Object.entries(words).forEach(function([cat, list]) {
    var seen = {};
    list.forEach(function(w) {
      if (seen[w.word]) dupes.push(w.word + ' in ' + cat);
      seen[w.word] = true;
    });
  });
  assert(dupes.length === 0, 'Duplicates: ' + dupes.join(', '));
});

// === HINT QUALITY TESTS ===

test('Hints do not contain the word itself', function() {
  var bad = [];
  allWords.forEach(function(w) {
    var hint = w.hint.toLowerCase();
    var word = w.word.toLowerCase();
    // Check exact word match (with word boundaries)
    var regex = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (regex.test(hint)) bad.push(w.word + ': "' + w.hint + '"');
  });
  assert(bad.length === 0, bad.length + ' hints contain the word:\n  ' + bad.slice(0, 10).join('\n  '));
});

// === SENTENCE QUALITY TESTS ===

test('Sentences contain the exact word', function() {
  var bad = [];
  allWords.forEach(function(w) {
    var sentence = w.sentence.toLowerCase();
    var word = w.word.toLowerCase();
    if (!sentence.includes(word)) {
      bad.push(w.word + ': "' + w.sentence + '"');
    }
  });
  assert(bad.length === 0, bad.length + ' sentences missing the word:\n  ' + bad.slice(0, 10).join('\n  '));
});

test('Sentences are reasonable length (5-100 chars)', function() {
  var bad = allWords.filter(function(w) {
    return w.sentence.length < 5 || w.sentence.length > 100;
  });
  assert(bad.length === 0, 'Bad sentence lengths: ' + bad.map(function(w) { return w.word + '=' + w.sentence.length; }).join(', '));
});

// === CATEGORY CONSISTENCY TESTS ===

test('Word category field matches its actual category', function() {
  var bad = [];
  Object.entries(words).forEach(function([cat, list]) {
    list.forEach(function(w) {
      if (w.category !== cat) bad.push(w.word + ': says "' + w.category + '" but is in "' + cat + '"');
    });
  });
  assert(bad.length === 0, 'Mismatched categories:\n  ' + bad.slice(0, 10).join('\n  '));
});

// === LEVEL DISTRIBUTION TESTS ===

test('Every category has words at level 1 or above', function() {
  var bad = [];
  Object.entries(words).forEach(function([cat, list]) {
    var hasL1Plus = list.some(function(w) { return w.level >= 1; });
    if (!hasL1Plus) bad.push(cat);
  });
  assert(bad.length === 0, 'Categories with no level 1+ words: ' + bad.join(', '));
});

test('Lydrette ord has level 0 words', function() {
  var l0 = words['Lydrette ord'].filter(function(w) { return w.level === 0; });
  assert(l0.length > 0, 'No level 0 words in Lydrette ord');
});

test('Level 0 words in Lydrette ord are simple (max 5 chars)', function() {
  var bad = words['Lydrette ord'].filter(function(w) {
    return w.level === 0 && w.word.length > 5;
  });
  assert(bad.length === 0, 'Level 0 lydrette words too long: ' + bad.map(function(w) { return w.word + '(' + w.word.length + ')'; }).join(', '));
});

test('No non-Lydrette categories have level 0 words', function() {
  var bad = [];
  Object.entries(words).forEach(function([cat, list]) {
    if (cat === 'Lydrette ord') return;
    var l0 = list.filter(function(w) { return w.level === 0; });
    if (l0.length > 0) bad.push(cat + ': ' + l0.map(function(w) { return w.word; }).join(', '));
  });
  assert(bad.length === 0, 'Non-lydrette categories with level 0:\n  ' + bad.join('\n  '));
});

// === AUDIO MANIFEST TEST ===

test('Audio manifest covers all words', function() {
  if (!fs.existsSync('audio-manifest.json')) {
    throw new Error('audio-manifest.json not found');
  }
  var manifest = JSON.parse(fs.readFileSync('audio-manifest.json', 'utf8'));
  var missing = [];
  allWords.forEach(function(w) {
    if (!manifest[w.word]) missing.push(w.word);
  });
  assert(missing.length === 0, missing.length + ' words missing from audio manifest:\n  ' + missing.slice(0, 10).join('\n  '));
});

// === RESULTS ===

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
