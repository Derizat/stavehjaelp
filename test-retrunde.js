#!/usr/bin/env node
// Tests for the dictation correction round logic (retrunde.js)
// Run: node test-retrunde.js

const R = require('./retrunde.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error('FAIL: ' + name); console.error('  ' + e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
function results(events) { return events.map(function(e) { return e.result; }).join(','); }

test('correct letters are accepted one by one and finish the word', function() {
  const s = R.create('hund');
  ['h', 'u', 'n'].forEach(function(c) { eq(R.type(s, c).result, 'ok'); });
  eq(s.done, false);
  eq(R.type(s, 'd').result, 'ok');
  eq(s.typed, 'hund'); eq(s.done, true); eq(s.revealed, 0);
});

test('a wrong letter is rejected and does not advance', function() {
  const s = R.create('hund');
  R.type(s, 'h');
  const ev = R.type(s, 'o');
  eq(ev.result, 'wrong'); eq(ev.rejected, 'o');
  eq(s.typed, 'h'); eq(s.misses, 1);
});

test('two misses at the same position reveal the letter', function() {
  const s = R.create('hund');
  'hun'.split('').forEach(function(c) { R.type(s, c); });
  eq(R.type(s, 't').result, 'wrong');
  const ev = R.type(s, 'e');
  eq(ev.result, 'reveal'); eq(ev.letter, 'd');
  eq(s.typed, 'hund'); eq(s.revealed, 1); eq(s.done, true);
});

test('misses reset after a correct letter', function() {
  const s = R.create('kat');
  eq(R.type(s, 'x').result, 'wrong');
  eq(R.type(s, 'k').result, 'ok');
  eq(R.type(s, 'x').result, 'wrong'); // første fejl på ny plads, ikke afsløring
  eq(s.revealed, 0);
});

test('case is ignored and the word keeps its own casing', function() {
  const s = R.create('hund');
  eq(R.type(s, 'H').result, 'ok');
  eq(s.typed, 'h');
});

test('whitespace is ignored and never counts as a miss', function() {
  const s = R.create('hund');
  eq(R.type(s, ' ').result, 'ignored');
  eq(R.type(s, ' ').result, 'ignored');
  eq(s.misses, 0); eq(s.typed, '');
});

test('a space that belongs to the word is accepted', function() {
  const s = R.create('i dag');
  eq(results(R.sync(s, 'i dag')), 'ok,ok,ok,ok,ok');
  eq(s.done, true);
});

test('nothing happens after the word is done', function() {
  const s = R.create('is');
  R.sync(s, 'is');
  eq(R.type(s, 's').result, 'ignored');
  eq(R.sync(s, 'iss').length, 0);
});

test('sync handles normal typing: one new character per input event', function() {
  const s = R.create('mad');
  eq(results(R.sync(s, 'm')), 'ok');
  eq(results(R.sync(s, 'mj')), 'wrong');
  eq(s.typed, 'm');
  eq(results(R.sync(s, 'ma')), 'ok');
  eq(results(R.sync(s, 'mad')), 'ok');
  eq(s.done, true);
});

test('sync ignores deletion: accepted letters are locked', function() {
  const s = R.create('mad');
  R.sync(s, 'ma');
  eq(R.sync(s, 'm').length, 0);
  eq(s.typed, 'ma');
  eq(R.sync(s, '').length, 0);
  eq(s.typed, 'ma');
});

test('sync accepts a pasted correct word and stops a paste at the first error', function() {
  const a = R.create('skole');
  eq(results(R.sync(a, 'skole')), 'ok,ok,ok,ok,ok');
  const b = R.create('skole');
  eq(results(R.sync(b, 'skåle')), 'ok,ok,wrong');
  eq(b.typed, 'sk');
});

test('sync skips trailing spaces from the double-space shortcut', function() {
  const s = R.create('mad');
  R.sync(s, 'ma');
  eq(R.sync(s, 'ma ').length, 0);
  eq(s.typed, 'ma'); eq(s.misses, 0);
});

test('danish letters work', function() {
  const s = R.create('rødgrød');
  eq(R.sync(s, 'rødgrød').length, 7);
  eq(s.done, true);
});

console.log('');
console.log('retrunde: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
