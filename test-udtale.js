#!/usr/bin/env node
// Tests for the soft d trainer data layer + audio file check
// Run: node test-udtale.js

const fs = require('fs');
const path = require('path');
const D = require('./udtale-data.js');
const M = require('./udtale-mund.js');
const words = JSON.parse(fs.readFileSync(path.join(__dirname, 'words.json'), 'utf8'));

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error('FAIL: ' + name); console.error('  ' + e.message); }
}
function assert(condition, msg) { if (!condition) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }

// === errorForm ===

test('errorForm replaces soft d with j', function() {
  const table = {
    'hvid': 'hvij', 'bidder': 'bijer', 'bade': 'baje', 'reddede': 'rejeje',
    'rødgrød': 'røjgrøj', 'hedde': 'heje', 'bladene': 'blajene', 'mad': 'maj',
    'opdagede': 'opdageje', 'udviklede': 'ujvikleje', 'sengetid': 'sengetij'
  };
  Object.keys(table).forEach(function(w) { eq(D.errorForm(w), table[w], w); });
});

test('errorForm leaves hard d alone', function() {
  eq(D.errorForm('dag'), 'dag');
  eq(D.errorForm('dreng'), 'dreng');
});

// === tierOf ===

function entry(word, category) { return { word: word, category: category || 'Blødt d', sentence: 'x' }; }

test('tierOf classifies by position', function() {
  eq(D.tierOf(entry('hvid')), 'final');
  eq(D.tierOf(entry('mad')), 'final');
  eq(D.tierOf(entry('bade')), 'medial');
  eq(D.tierOf(entry('sidder')), 'medial');
  eq(D.tierOf(entry('hedde')), 'medial');
  eq(D.tierOf(entry('bladene')), 'medial');
  eq(D.tierOf(entry('legede', 'Verbernes bøjning')), 'past');
  eq(D.tierOf(entry('reddede', 'Verbernes bøjning')), 'past');
  eq(D.tierOf(entry('hvede', 'Stumme bogstaver')), 'medial');
  eq(D.tierOf(entry('rede')), 'medial');
});

test('tierOf rejects words without soft d', function() {
  eq(D.tierOf(entry('plads')), null);
  eq(D.tierOf(entry('bedst')), null);
  eq(D.tierOf(entry('dag')), null);
  eq(D.tierOf(entry('middag')), null);
});

test('tierOf only treats -ede as past tense for verbs', function() {
  eq(D.tierOf(entry('legede', 'Blødt d')), 'medial');
  eq(D.tierOf(entry('legede', 'Verbernes bøjning')), 'past');
});

test('tierOf tolerates malformed entries', function() {
  eq(D.tierOf({}), null);
  eq(D.tierOf(null), null);
  eq(D.tierOf({ word: 42 }), null);
});

test('errorForm of a pair\'s soft-d word is its j-word', function() {
  D.PAIRS.forEach(function(p) { eq(D.errorForm(p[0]), p[1], p.join('/')); });
});

// === sanitizeFilename / audioPath ===

test('sanitizeFilename replaces Danish letters and separators', function() {
  eq(D.sanitizeFilename('a b-c'), 'a_b_c');
  eq(D.sanitizeFilename('Æde'), 'aede');
});

test('audioPath follows the audio/ naming convention', function() {
  eq(D.audioPath('rødgrød', 'word', ''), 'audio/word_roedgroed.mp3');
  eq(D.audioPath('rødgrød', 'sentence', '_m'), 'audio/sentence_roedgroed_m.mp3');
  eq(D.audioPath('håndklæde', 'word', ''), 'audio/word_haandklaede.mp3');
});

// === buildTiers on the real word bank ===

const tiers = D.buildTiers(words);

test('buildTiers produces all five tiers with content', function() {
  ['final', 'medial', 'past', 'sentence', 'pair'].forEach(function(t) {
    assert(Array.isArray(tiers[t]) && tiers[t].length > 0, 'tier ' + t + ' empty');
  });
  assert(tiers.final.length >= 30, 'final too small: ' + tiers.final.length);
  assert(tiers.medial.length >= 20, 'medial too small: ' + tiers.medial.length);
  assert(tiers.past.length >= 20, 'past too small: ' + tiers.past.length);
  eq(tiers.pair.length, 9, 'pairs');
});

test('word items have word, key, sentence; extras have sentence null', function() {
  const ved = tiers.final.find(function(i) { return i.word === 'ved'; });
  assert(ved, 'extra word ved missing from final');
  eq(ved.sentence, null, 'ved sentence');
  eq(ved.key, 'ved');
  const hvid = tiers.final.find(function(i) { return i.word === 'hvid'; });
  assert(hvid && typeof hvid.sentence === 'string' && hvid.sentence.length > 0, 'hvid sentence');
  const oede = tiers.medial.find(function(i) { return i.word === 'øde'; });
  assert(oede, 'extra word øde missing from medial');
});

test('sentence tier covers every word with a sentence, keyed sentence:<word>', function() {
  const withSentence = tiers.final.concat(tiers.medial, tiers.past).filter(function(i) { return i.sentence; });
  eq(tiers.sentence.length, withSentence.length, 'sentence count');
  tiers.sentence.forEach(function(i) {
    eq(i.key, 'sentence:' + i.word, 'sentence key');
    assert(i.sentence, 'sentence text missing for ' + i.word);
  });
});

test('no word appears in two word tiers', function() {
  const seen = {};
  ['final', 'medial', 'past'].forEach(function(t) {
    tiers[t].forEach(function(i) {
      assert(!seen[i.word], i.word + ' in both ' + seen[i.word] + ' and ' + t);
      seen[i.word] = t;
    });
  });
});

test('j-words from pairs never appear in the word tiers', function() {
  const jWords = D.PAIRS.map(function(p) { return p[1]; });
  ['final', 'medial', 'past'].forEach(function(t) {
    tiers[t].forEach(function(i) { assert(jWords.indexOf(i.word) === -1, i.word + ' is a j-word in tier ' + t); });
  });
});

test('pair items carry both words', function() {
  tiers.pair.forEach(function(p) {
    assert(Array.isArray(p.pair) && p.pair.length === 2, 'bad pair ' + JSON.stringify(p));
  });
  eq(tiers.pair[0].pair.join('/'), 'mad/maj');
});

// === trin-tips ===

test('every tier has at least two non-empty tips', function() {
  D.TIERS.forEach(function(t) {
    assert(Array.isArray(t.tips) && t.tips.length >= 2, 'tier ' + t.id + ' lacks tips');
    t.tips.forEach(function(x) {
      assert(typeof x === 'string' && x.length > 10, 'empty tip in ' + t.id);
      assert(!/[ðəɐˀ]/.test(x), 'phonetic symbol in tip for ' + t.id + ': ' + x);
    });
  });
});

// === mundbilleder ===

test('every mouth has label, example word, plain text and an image on disk', function() {
  eq(M.ORDER.join(','), 'j,d,l');
  M.ORDER.forEach(function(k) {
    const m = M.MOUTHS[k];
    assert(m && m.label && m.word && m.text && m.img, k + ' incomplete');
    assert(!/[ðəɐˀ]/.test(m.text + m.label), 'phonetic symbol in mouth text for ' + k);
    assert(fs.existsSync(path.join(__dirname, m.img)), 'missing image ' + m.img);
  });
});

test('example words differ only in the last sound', function() {
  eq(M.MOUTHS.j.word, 'maj'); eq(M.MOUTHS.d.word, 'mad'); eq(M.MOUTHS.l.word, 'mal');
});

// === audio files on disk ===

test('every presentable item has MP3 files for both voices', function() {
  const missing = [];
  const seen = {};
  function check(word, kind) {
    ['', '_m'].forEach(function(suffix) {
      const p = D.audioPath(word, kind, suffix);
      if (seen[p]) return;
      seen[p] = true;
      if (!fs.existsSync(path.join(__dirname, p))) missing.push(p);
    });
  }
  tiers.final.concat(tiers.medial, tiers.past).forEach(function(i) {
    check(i.word, 'word');
    if (i.sentence) check(i.word, 'sentence');
  });
  tiers.pair.forEach(function(p) { check(p.pair[0], 'word'); check(p.pair[1], 'word'); });
  assert(missing.length === 0, missing.length + ' missing files:\n  ' + missing.join('\n  '));
});

console.log('');
console.log('udtale: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
