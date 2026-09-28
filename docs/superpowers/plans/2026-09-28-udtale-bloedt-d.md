# Soft d pronunciation trainer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone page `udtale.html` where a learner practises the Danish soft d with a parent as judge: a quick perception check (Lyt) and a five-tier production exercise (Sig det), with stats in localStorage.

**Architecture:** Four new static files (`udtale.html`, `udtale.css`, `udtale-data.js`, `udtale.js`) that reuse `words.json` and the MP3s in `audio/`. `udtale-data.js` holds pure data and functions and runs in both browser and Node so `test-udtale.js` can test it. `udtale.js` owns UI state and rendering via `innerHTML` plus one delegated click handler per area. No build step, no framework, ES5-style code like the rest of the repo.

**Tech Stack:** Vanilla HTML/CSS/JS, Node 25 for tests and audio generation, Google Cloud TTS via the existing `generate-audio.js`.

**Spec:** `docs/superpowers/specs/2026-09-28-udtale-bloedt-d-design.md`

**Conventions:** UI text and code comments in Danish. Commit messages in English. Bump the version string in `index.html:12` (`Stavehjælpen - v1.10.6`) in the final commit of this plan, as the repo rule requires a bump on every change.

---

## File map

| File | Responsibility |
|---|---|
| `udtale-data.js` (new) | Pairs, extra words, tier definitions, `errorForm`, `tierOf`, `buildTiers`, `audioPath`, `sanitizeFilename`. Pure, no DOM. |
| `test-udtale.js` (new) | Node tests for the functions above plus an audio-file existence check. |
| `udtale-words.json` (new) | 15 words that need new audio. |
| `generate-audio.js` (modify) | `--words <file>` flag. |
| `udtale.html` (new) | Page shell: header, tabs, three panels. |
| `udtale.css` (new) | Own stylesheet. |
| `udtale.js` (new) | State, audio playback with fallback, stats, the two exercises, tabs. |
| `index.html` (modify) | Version bump only. |

---

### Task 1: `udtale-data.js` pure functions with tests

**Files:**
- Create: `udtale-data.js`
- Create: `test-udtale.js`

- [ ] **Step 1: Write the failing tests**

Create `test-udtale.js`:

```js
#!/usr/bin/env node
// Tests for the soft d trainer data layer + audio file check
// Run: node test-udtale.js

const fs = require('fs');
const path = require('path');
const D = require('./udtale-data.js');
const words = JSON.parse(fs.readFileSync('words.json', 'utf8'));

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

// === sanitizeFilename / audioPath ===

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

test('pair items carry both words', function() {
  tiers.pair.forEach(function(p) {
    assert(Array.isArray(p.pair) && p.pair.length === 2, 'bad pair ' + JSON.stringify(p));
  });
  eq(tiers.pair[0].pair.join('/'), 'mad/maj');
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test-udtale.js`
Expected: crashes with `Cannot find module './udtale-data.js'`.

- [ ] **Step 3: Write `udtale-data.js`**

```js
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
```

- [ ] **Step 4: Run tests**

Run: `node test-udtale.js`
Expected: all tests pass except the last one, which fails listing 30 missing files (`audio/word_maj.mp3`, `audio/word_maj_m.mp3`, `audio/word_vej.mp3`, … for the 9 j-words and *ved, hed, bød, fed, øde, møde*). Output ends with `udtale: 10 passed, 1 failed`. If any other test fails, fix the data layer before continuing.

- [ ] **Step 5: Commit**

```bash
git add udtale-data.js test-udtale.js
git commit -m "Add soft d trainer data layer with tests"
```

---

### Task 2: Audio for the extra words

**Files:**
- Create: `udtale-words.json`
- Modify: `generate-audio.js` (arg parsing near line 17-23, `main()` near line 88-93 and 103-117, manifest block near line 151-166)

- [ ] **Step 1: Create the word list**

`udtale-words.json`:

```json
[
  { "word": "maj" }, { "word": "vej" }, { "word": "hej" }, { "word": "nej" }, { "word": "bøj" },
  { "word": "fej" }, { "word": "lej" }, { "word": "øje" }, { "word": "møje" },
  { "word": "ved" }, { "word": "hed" }, { "word": "bød" }, { "word": "fed" }, { "word": "øde" }, { "word": "møde" }
]
```

- [ ] **Step 2: Add `--words` to `generate-audio.js`**

Replace the arg-parsing block:

```js
// Parse CLI args
const args = process.argv.slice(2);
let VOICE = process.env.TTS_VOICE || 'da-DK-Neural2-F';
let SUFFIX = '';
let WORDS_FILE = path.join(__dirname, 'words.json');
let CUSTOM_LIST = false; // --words: ekstra ordliste, rører ikke manifestet
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--voice' && args[i + 1]) { VOICE = args[i + 1]; i++; }
  if (args[i] === '--suffix' && args[i + 1]) { SUFFIX = args[i + 1]; i++; }
  if (args[i] === '--words' && args[i + 1]) { WORDS_FILE = path.resolve(args[i + 1]); CUSTOM_LIST = true; i++; }
}

const AUDIO_DIR = path.join(__dirname, 'audio');
```

Delete the old line `const WORDS_FILE = path.join(__dirname, 'words.json');` further down (it would now be a duplicate declaration).

In `main()`, replace the first two lines:

```js
  const raw = JSON.parse(fs.readFileSync(WORDS_FILE, 'utf8'));
  const allWords = Array.isArray(raw) ? raw : Object.values(raw).flat();
```

Replace the sentence block so entries without a sentence are skipped:

```js
    // Generate sentence audio (springes over hvis ordet ingen sætning har)
    if (!entry.sentence) {
      // ingen sætning for dette ord
    } else if (fs.existsSync(sentenceFile)) {
      skipped++;
    } else {
      try {
        const audio = await synthesize(entry.sentence, 0.95);
        fs.writeFileSync(sentenceFile, audio);
        generated++;
      } catch (e) {
        console.error('FEJL (sætning): ' + entry.word + ' - ' + e.message);
        errors++;
      }
      await sleep(DELAY_MS);
    }
```

Wrap the manifest block at the end of `main()`:

```js
  if (CUSTOM_LIST) {
    console.log('Ekstra ordliste: manifestet er ikke opdateret');
    return;
  }
  // Generate manifest file with both voice sets
  const manifest = {};
  ...existing manifest code unchanged...
```

Update the usage comment at the top of the file:

```js
// Usage: GOOGLE_TTS_KEY=your-api-key node generate-audio.js [--suffix _m] [--voice da-DK-Wavenet-G] [--words extra.json]
```

- [ ] **Step 3: Verify the script still parses and refuses without a key**

Run: `node generate-audio.js --words udtale-words.json`
Expected: prints `Mangler GOOGLE_TTS_KEY environment variable` and exits 1. No syntax errors.

- [ ] **Step 4: Generate the audio (needs the user's key, ~1 minute)**

Ask the user to run these two commands, or run them if the key is provided in the environment:

```bash
GOOGLE_TTS_KEY=… node generate-audio.js --words udtale-words.json
```

```bash
GOOGLE_TTS_KEY=… node generate-audio.js --words udtale-words.json --suffix _m --voice da-DK-Wavenet-G
```

Expected: each run prints `Genereret: 15`, `Fejl: 0`, then `Ekstra ordliste: manifestet er ikke opdateret`. `git status` shows 30 new files under `audio/` and no change to `audio-manifest.json`.

If the key is not available, continue with Task 3 onwards; the page works with the browser-voice fallback for these 15 words, and the last test in `test-udtale.js` stays red until the files exist.

- [ ] **Step 5: Run the tests**

Run: `node test-udtale.js`
Expected: `udtale: 11 passed, 0 failed`.

- [ ] **Step 6: Listen to two files**

Run: `afplay audio/word_oeje.mp3 && afplay audio/word_oede.mp3`
Expected: "øje" and "øde" clearly distinct. If TTS mangles a word, note it for the user; do not hand-edit audio.

- [ ] **Step 7: Commit**

```bash
git add udtale-words.json generate-audio.js audio/word_maj.mp3 audio/word_maj_m.mp3 audio/word_vej.mp3 audio/word_vej_m.mp3 audio/word_hej.mp3 audio/word_hej_m.mp3 audio/word_nej.mp3 audio/word_nej_m.mp3 audio/word_boej.mp3 audio/word_boej_m.mp3 audio/word_fej.mp3 audio/word_fej_m.mp3 audio/word_lej.mp3 audio/word_lej_m.mp3 audio/word_oeje.mp3 audio/word_oeje_m.mp3 audio/word_moeje.mp3 audio/word_moeje_m.mp3 audio/word_ved.mp3 audio/word_ved_m.mp3 audio/word_hed.mp3 audio/word_hed_m.mp3 audio/word_boed.mp3 audio/word_boed_m.mp3 audio/word_fed.mp3 audio/word_fed_m.mp3 audio/word_oede.mp3 audio/word_oede_m.mp3 audio/word_moede.mp3 audio/word_moede_m.mp3
git commit -m "Add --words flag to audio generator and audio for soft d pair words"
```

---

### Task 3: Page shell and stylesheet

**Files:**
- Create: `udtale.html`
- Create: `udtale.css`

- [ ] **Step 1: Write `udtale.html`**

```html
<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blødt d – udtaletræning</title>
  <link rel="stylesheet" href="udtale.css">
</head>
<body>
  <header>
    <h1>Blødt d</h1>
    <button id="voiceBtn" class="chip" type="button">Stemme: kvinde</button>
  </header>

  <nav class="tabs">
    <button class="tab active" type="button" data-tab="home">Start</button>
    <button class="tab" type="button" data-tab="lyt">Lyt</button>
    <button class="tab" type="button" data-tab="sig">Sig det</button>
  </nav>

  <main>
    <section id="tab-home" class="tab-panel active">
      <details class="card" id="tipsBox">
        <summary>Sådan gør du</summary>
        <ul>
          <li><strong>Tungespidsen ned</strong> bag de nederste fortænder. Den skal blive der hele tiden.</li>
          <li><strong>Tungen rører ikke ganen.</strong> Prøv at sige "l" og mærk at tungen rører oppe. Ved blødt d må den ikke.</li>
          <li><strong>Overdriv først.</strong> Sig ordet langsomt og med tydeligt, langt d. Når det sidder, gør det kortere og mere normalt.</li>
          <li><strong>Fem minutter om dagen</strong> slår en halv time om ugen.</li>
        </ul>
        <p class="note">Disse råd er skrevet af en forælder, ikke en talepædagog. Få dem bekræftet i forløbet på skolen.</p>
      </details>
      <div class="card" id="statsBox"></div>
    </section>

    <section id="tab-lyt" class="tab-panel">
      <div class="card" id="lytArea"></div>
    </section>

    <section id="tab-sig" class="tab-panel">
      <div class="card" id="sigArea"></div>
    </section>
  </main>

  <p id="audioNote" class="note toast hidden"></p>

  <script src="udtale-data.js"></script>
  <script src="udtale.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `udtale.css`**

```css
:root {
  --bg: #12141a; --card: #1c1f27; --border: #2a2e3a;
  --text: #e6e8ee; --muted: #8a90a3;
  --accent: #4f8cff; --green: #2ecc8f; --red: #ff5c6c;
  --radius: 14px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg); color: var(--text); min-height: 100vh;
  padding: 16px 16px 48px; max-width: 560px; margin: 0 auto;
}
header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
h1 { font-size: 1.5rem; font-weight: 700; }
.chip {
  background: var(--card); color: var(--muted); border: 1px solid var(--border);
  border-radius: 999px; padding: 6px 12px; font-size: 0.85rem; cursor: pointer;
}
.tabs { display: flex; gap: 6px; margin-bottom: 16px; }
.tab {
  flex: 1; min-height: 48px; background: var(--card); color: var(--muted);
  border: 1px solid var(--border); border-radius: var(--radius); font-size: 1rem; cursor: pointer;
}
.tab.active { color: var(--text); border-color: var(--accent); }
.tab-panel { display: none; }
.tab-panel.active { display: block; }
.card {
  background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 20px; margin-bottom: 16px;
}
.card summary { cursor: pointer; font-weight: 600; font-size: 1.05rem; }
.card ul { margin: 12px 0 0 20px; line-height: 1.5; }
.card li { margin-bottom: 8px; }
.note { color: var(--muted); font-size: 0.85rem; margin-top: 12px; }
.hidden { display: none !important; }
.toast {
  position: fixed; left: 16px; right: 16px; bottom: 16px; background: var(--card);
  border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; text-align: center;
}

/* Øvelses-layout */
.progress { color: var(--muted); font-size: 0.9rem; margin-bottom: 12px; }
.target {
  font-size: 2.6rem; font-weight: 700; text-align: center; margin: 24px 0;
  min-height: 3.2rem; word-break: break-word;
}
.target.sentence { font-size: 1.5rem; line-height: 1.4; }
.target.hiddenword { color: var(--muted); font-size: 1.2rem; font-weight: 400; }
.big {
  width: 100%; min-height: 64px; margin-bottom: 10px; font-size: 1.15rem; font-weight: 600;
  background: var(--accent); color: #fff; border: 0; border-radius: var(--radius); cursor: pointer;
}
.big.secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
.big:disabled { opacity: 0.5; cursor: default; }
.choices { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.choices .big { margin: 0; min-height: 80px; background: var(--card); color: var(--text); border: 2px solid var(--border); }
.choices .big.correct { border-color: var(--green); color: var(--green); }
.choices .big.wrong { border-color: var(--red); color: var(--red); }
.feedback { text-align: center; font-size: 1.1rem; font-weight: 600; min-height: 1.6rem; margin: 8px 0 12px; }
.feedback.ok { color: var(--green); }
.feedback.bad { color: var(--red); }
.tierlist .big { text-align: left; padding: 0 16px; }
.tierlist .big small { display: block; font-weight: 400; color: rgba(255,255,255,0.7); font-size: 0.85rem; }
.missed { margin: 12px 0; line-height: 1.8; }
.missed span { display: inline-block; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 2px 10px; margin: 0 6px 6px 0; }

/* Statistik */
.stats h2 { font-size: 1.05rem; margin-bottom: 10px; }
.stats table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
.stats th, .stats td { text-align: left; padding: 6px 4px; border-bottom: 1px solid var(--border); font-size: 0.95rem; }
.stats th { color: var(--muted); font-weight: 600; }
.stats td.num { text-align: right; font-variant-numeric: tabular-nums; }
.stats th.num { text-align: right; }
```

- [ ] **Step 3: Open the page**

Serve the folder: `python3 -m http.server 8765` (run in the background) and open `http://localhost:8765/udtale.html`.
Expected: header with "Blødt d" and the voice chip, three tabs, the tips box expands and collapses, empty stats card, no console errors except a 404 for `udtale.js` which does not exist yet.

- [ ] **Step 4: Commit**

```bash
git add udtale.html udtale.css
git commit -m "Add soft d trainer page shell and stylesheet"
```

---

### Task 4: `udtale.js` core: init, tabs, voice, audio, stats storage

**Files:**
- Create: `udtale.js`

- [ ] **Step 1: Write the core module**

```js
// Udtale-træner for blødt d. UI-tilstand, lyd, statistik og de to øvelser.
(function () {
  var D = window.UDTALE_DATA;
  var STATS_KEY = 'udtale_stats';
  var VOICE_KEY = 'udtale_voice';
  var ROUND_SIZE = 10;

  var tiers = null;
  var voice = 'female';
  var storageOk = true;
  var stats = loadStats();
  var currentAudio = null;
  var noteTimer = null;

  // ---------- Hjælpere ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sample(arr, n) { return shuffle(arr).slice(0, n); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function daysAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
  function tierLabel(id) {
    for (var i = 0; i < D.TIERS.length; i++) if (D.TIERS[i].id === id) return D.TIERS[i].label;
    return id;
  }
  function showNote(text) {
    var el = $('audioNote');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { el.classList.add('hidden'); }, 3000);
  }

  // ---------- Statistik ----------
  function loadStats() {
    try {
      var raw = localStorage.getItem(STATS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.words && parsed.rounds) return parsed;
      }
    } catch (e) { storageOk = false; }
    return { words: {}, rounds: [] };
  }
  function saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); }
    catch (e) { storageOk = false; }
  }
  function recordWord(key, ok) {
    var s = stats.words[key] || (stats.words[key] = { ok: 0, fail: 0, last: null });
    if (ok) s.ok++; else s.fail++;
    s.last = today();
    saveStats();
  }
  function recordRound(tier, score, total) {
    stats.rounds.push({ date: today(), tier: tier, score: score, total: total });
    if (stats.rounds.length > 200) stats.rounds = stats.rounds.slice(-200);
    saveStats();
  }
  function resetStats() {
    if (!confirm('Slet al statistik?')) return;
    stats = { words: {}, rounds: [] };
    saveStats();
    renderStats();
  }

  // ---------- Lyd ----------
  function suffix() { return voice === 'male' ? '_m' : ''; }
  function stopAudio() {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
  // kind: 'word' eller 'sentence'. Falder tilbage på browser-stemme hvis filen mangler.
  function play(word, kind, text) {
    stopAudio();
    var a = new Audio(D.audioPath(word, kind, suffix()));
    currentAudio = a;
    a.onerror = function () { speakFallback(text); };
    var p = a.play();
    if (p && p.catch) p.catch(function () { speakFallback(text); });
  }
  function speakFallback(text) {
    if (!window.speechSynthesis) { showNote('Ingen dansk stemme, læs ordet højt selv'); return; }
    var voices = window.speechSynthesis.getVoices();
    var v = null;
    for (var i = 0; i < voices.length; i++) if (voices[i].lang.indexOf('da') === 0) { v = voices[i]; break; }
    if (!v) { showNote('Ingen dansk stemme, læs ordet højt selv'); return; }
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'da-DK'; u.rate = 0.75; u.voice = v;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    showNote('Lydfil mangler, bruger browser-stemme');
  }
  function setVoice(v) {
    voice = v === 'male' ? 'male' : 'female';
    try { localStorage.setItem(VOICE_KEY, voice); } catch (e) {}
    $('voiceBtn').textContent = 'Stemme: ' + (voice === 'male' ? 'mand' : 'kvinde');
  }

  // ---------- Faner ----------
  function showTab(id) {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === id);
    var panels = document.querySelectorAll('.tab-panel');
    for (var j = 0; j < panels.length; j++) panels[j].classList.toggle('active', panels[j].id === 'tab-' + id);
    stopAudio();
    if (!tiers) return;
    if (id === 'home') renderStats();
    if (id === 'lyt') startLyt();
    if (id === 'sig') renderSigPicker();
  }

  // ---------- Statistik-boks ----------
  function renderStats() {
    var box = $('statsBox');
    var week = daysAgo(7);
    var rows = D.TIERS.map(function (t) {
      var all = { s: 0, n: 0 }, recent = { s: 0, n: 0 };
      stats.rounds.forEach(function (r) {
        if (r.tier !== t.id) return;
        all.s += r.score; all.n += r.total;
        if (r.date >= week) { recent.s += r.score; recent.n += r.total; }
      });
      function pct(x) { return x.n ? Math.round(100 * x.s / x.n) + ' %' : '–'; }
      return '<tr><td>' + esc(t.label) + '</td><td class="num">' + pct(recent) + '</td><td class="num">' + pct(all) + '</td></tr>';
    }).join('');
    var worst = Object.keys(stats.words).map(function (k) {
      var s = stats.words[k];
      return { key: k, ok: s.ok, fail: s.fail };
    }).filter(function (w) { return w.ok + w.fail >= 2 && w.fail > 0; })
      .sort(function (a, b) { return b.fail - a.fail || a.ok - b.ok; }).slice(0, 5);
    var worstHtml = worst.length
      ? '<table><tr><th>Ord</th><th class="num">Fejl</th><th class="num">Rigtige</th></tr>' +
        worst.map(function (w) {
          var label = w.key.indexOf('sentence:') === 0 ? 'sætning: ' + w.key.slice(9) : w.key;
          return '<tr><td>' + esc(label) + '</td><td class="num">' + w.fail + '</td><td class="num">' + w.ok + '</td></tr>';
        }).join('') + '</table>'
      : '<p class="note">Ingen sværeste ord endnu. Øv en runde i "Sig det".</p>';
    box.className = 'card stats';
    box.innerHTML =
      '<h2>Rigtige</h2>' +
      '<table><tr><th>Trin</th><th class="num">7 dage</th><th class="num">Alt</th></tr>' + rows + '</table>' +
      '<h2>Sværeste ord</h2>' + worstHtml +
      (storageOk ? '' : '<p class="note">Kan ikke gemme statistik i denne browser. Den forsvinder når siden lukkes.</p>') +
      '<button class="big secondary" type="button" data-action="reset">Nulstil statistik</button>';
  }

  // ---------- Lyt ----------
  var lyt = null;
  function startLyt() { /* Task 5 */ }

  // ---------- Sig det ----------
  var sig = null;
  function renderSigPicker() { /* Task 6 */ }

  // ---------- Init ----------
  function init() {
    var savedVoice = 'female';
    try { savedVoice = localStorage.getItem(VOICE_KEY) || 'female'; } catch (e) {}
    setVoice(savedVoice);
    $('voiceBtn').addEventListener('click', function () { setVoice(voice === 'male' ? 'female' : 'male'); });
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function (e) { showTab(e.currentTarget.getAttribute('data-tab')); });
    }
    $('statsBox').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (btn && btn.getAttribute('data-action') === 'reset') resetStats();
    });
    if (window.speechSynthesis) window.speechSynthesis.getVoices();

    fetch('words.json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (bank) { tiers = D.buildTiers(bank); renderStats(); })
      .catch(function () {
        $('statsBox').innerHTML = '<p class="feedback bad">Kunne ikke hente ordbanken. Genindlæs siden.</p>';
      });
  }
  init();
})();
```

- [ ] **Step 2: Check in the browser**

Reload `http://localhost:8765/udtale.html`.
Expected: stats table with five tier rows showing "–", "Ingen sværeste ord endnu", a "Nulstil statistik" button that asks for confirmation. The voice chip toggles between "kvinde" and "mand" and survives a reload. No console errors.

- [ ] **Step 3: Commit**

```bash
git add udtale.js
git commit -m "Add soft d trainer core: tabs, voice toggle, audio fallback, stats"
```

---

### Task 5: Lyt exercise

**Files:**
- Modify: `udtale.js` (replace the `startLyt` stub, add a click handler in `init`)

- [ ] **Step 1: Implement Lyt**

Replace the `// ---------- Lyt ----------` section:

```js
  // ---------- Lyt ----------
  var lyt = null;
  function startLyt() {
    var items = sample(tiers.pair, ROUND_SIZE).map(function (p) {
      var side = Math.random() < 0.5 ? 0 : 1;
      return { pair: p.pair, target: p.pair[side], order: shuffle(p.pair) };
    });
    lyt = { items: items, index: 0, score: 0, answered: false };
    renderLyt();
    playLytItem();
  }
  function playLytItem() {
    var it = lyt.items[lyt.index];
    play(it.target, 'word', it.target);
  }
  function renderLyt() {
    var area = $('lytArea');
    if (lyt.index >= lyt.items.length) {
      area.innerHTML =
        '<div class="progress">Færdig</div>' +
        '<div class="target">' + lyt.score + ' / ' + lyt.items.length + '</div>' +
        '<p class="note">' + (lyt.score === lyt.items.length ? 'Alle rigtige. Forskellen høres tydeligt.' : 'Hvis der er flere fejl over flere runder, så nævn det i forløbet på skolen.') + '</p>' +
        '<button class="big" type="button" data-action="restart">En runde til</button>';
      return;
    }
    var it = lyt.items[lyt.index];
    area.innerHTML =
      '<div class="progress">Lyt · ' + (lyt.index + 1) + ' / ' + lyt.items.length + '</div>' +
      '<p class="note">Tryk på det ord du hørte.</p>' +
      '<button class="big secondary" type="button" data-action="hear">Hør igen</button>' +
      '<div class="choices">' + it.order.map(function (w) {
        return '<button class="big" type="button" data-action="choose" data-value="' + esc(w) + '">' + esc(w) + '</button>';
      }).join('') + '</div>' +
      '<div class="feedback"></div>' +
      '<button class="big hidden" type="button" data-action="next">Næste</button>';
  }
  function answerLyt(chosen) {
    if (lyt.answered) return;
    lyt.answered = true;
    var it = lyt.items[lyt.index];
    var ok = chosen === it.target;
    if (ok) lyt.score++;
    var area = $('lytArea');
    var btns = area.querySelectorAll('.choices .big');
    for (var i = 0; i < btns.length; i++) {
      var w = btns[i].getAttribute('data-value');
      if (w === it.target) btns[i].classList.add('correct');
      else if (w === chosen) btns[i].classList.add('wrong');
      btns[i].disabled = true;
    }
    var fb = area.querySelector('.feedback');
    fb.textContent = ok ? 'Rigtigt' : 'Det var "' + it.target + '"';
    fb.className = 'feedback ' + (ok ? 'ok' : 'bad');
    area.querySelector('[data-action="next"]').classList.remove('hidden');
  }
  function nextLyt() {
    lyt.index++;
    lyt.answered = false;
    if (lyt.index >= lyt.items.length) recordRound('lyt', lyt.score, lyt.items.length);
    renderLyt();
    if (lyt.index < lyt.items.length) playLytItem();
  }
  function onLytClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'hear') playLytItem();
    else if (action === 'choose') answerLyt(btn.getAttribute('data-value'));
    else if (action === 'next') nextLyt();
    else if (action === 'restart') startLyt();
  }
```

Add to `init()`, after the `statsBox` listener:

```js
    $('lytArea').addEventListener('click', onLytClick);
```

Note: `recordRound('lyt', …)` uses tier id `lyt`, which is not in `D.TIERS`, so the stats table ignores it on purpose. The Lyt score is a sanity check, not a training metric.

- [ ] **Step 2: Test in the browser**

Open the Lyt tab.
Expected: audio plays automatically (on iOS Safari the first play may be blocked until a tap; "Hør igen" then works). Two buttons show the pair words in random order. Tapping colours the correct one green and, if wrong, the tapped one red. "Næste" advances; after 9 items (there are only 9 pairs) the summary shows the score and "En runde til" restarts. Switch voice and press "Hør igen": the male voice plays.

Rename `audio/word_nej.mp3` to `audio/word_nej.mp3.bak` temporarily, play a "nej" item.
Expected: browser voice says "nej" and the toast "Lydfil mangler, bruger browser-stemme" appears. Rename the file back.

- [ ] **Step 3: Commit**

```bash
git add udtale.js
git commit -m "Add Lyt perception exercise to soft d trainer"
```

---

### Task 6: Sig det exercise

**Files:**
- Modify: `udtale.js` (replace the `renderSigPicker` stub, add a click handler in `init`)

- [ ] **Step 1: Implement Sig det**

Replace the `// ---------- Sig det ----------` section:

```js
  // ---------- Sig det ----------
  var sig = null;
  var SENTENCE_OK = 'Alle d\'er ramte';
  var SENTENCE_BAD = 'Et eller flere blev til j';

  function renderSigPicker() {
    sig = null;
    $('sigArea').innerHTML =
      '<div class="progress">Vælg trin</div>' +
      '<div class="tierlist">' + D.TIERS.map(function (t) {
        return '<button class="big" type="button" data-action="tier" data-value="' + t.id + '">' +
          esc(t.label) + ' <small>' + esc(t.desc) + ' · ' + tiers[t.id].length + ' stk</small></button>';
      }).join('') + '</div>';
  }

  // Laver et rundeelement ud fra et trin-element. Kilden gemmes så "Øv disse igen" kan genbruge den.
  function makeSigItem(tierId, src) {
    if (tierId === 'pair') {
      var target = src.pair[Math.random() < 0.5 ? 0 : 1];
      return { kind: 'pair', word: target, key: target, display: target, options: shuffle(src.pair), correct: target, source: src };
    }
    if (tierId === 'sentence') {
      return { kind: 'sentence', word: src.word, key: src.key, display: src.sentence, options: [SENTENCE_OK, SENTENCE_BAD], correct: SENTENCE_OK, source: src };
    }
    return { kind: 'word', word: src.word, key: src.key, display: src.word, options: shuffle([src.word, D.errorForm(src.word)]), correct: src.word, source: src };
  }

  function startSig(tierId, pool) {
    var items = sample(pool || tiers[tierId], ROUND_SIZE).map(function (src) { return makeSigItem(tierId, src); });
    sig = { tier: tierId, items: items, index: 0, phase: 'show', retry: false, score: 0, missed: [] };
    renderSig();
  }

  function playSigItem() {
    var it = sig.items[sig.index];
    if (it.kind === 'sentence') play(it.word, 'sentence', it.display);
    else play(it.word, 'word', it.word);
  }

  function renderSig() {
    var area = $('sigArea');
    if (sig.index >= sig.items.length) { renderSigEnd(); return; }
    var it = sig.items[sig.index];
    var head = '<div class="progress">' + esc(tierLabel(sig.tier)) + ' · ' + (sig.index + 1) + ' / ' + sig.items.length + (sig.retry ? ' · øver igen' : '') + '</div>';
    var targetClass = 'target' + (it.kind === 'sentence' ? ' sentence' : '');

    if (sig.phase === 'show') {
      area.innerHTML = head +
        '<div class="' + targetClass + '">' + esc(it.display) + '</div>' +
        '<button class="big secondary" type="button" data-action="hear">Hør ' + (it.kind === 'sentence' ? 'sætningen' : 'ordet') + '</button>' +
        '<button class="big" type="button" data-action="said">Jeg har sagt det</button>';
    } else if (sig.phase === 'judge') {
      area.innerHTML = head +
        '<div class="target hiddenword">Hvad hørte du?</div>' +
        '<div class="choices">' + it.options.map(function (o) {
          return '<button class="big" type="button" data-action="judge" data-value="' + esc(o) + '">' + esc(o) + '</button>';
        }).join('') + '</div>';
    } else {
      var ok = sig.lastOk;
      area.innerHTML = head +
        '<div class="' + targetClass + '">' + esc(it.display) + '</div>' +
        '<div class="feedback ' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'Ramte den' : 'Blev til j') + '</div>' +
        '<button class="big secondary" type="button" data-action="retry">Prøv igen</button>' +
        '<button class="big" type="button" data-action="next">Næste</button>';
    }
  }

  function judgeSig(chosen) {
    var it = sig.items[sig.index];
    var ok = chosen === it.correct;
    sig.lastOk = ok;
    if (!sig.retry) {
      if (ok) sig.score++; else sig.missed.push(it.source);
      recordWord(it.key, ok);
    }
    sig.phase = 'reveal';
    renderSig();
  }

  function renderSigEnd() {
    var area = $('sigArea');
    var missedHtml = sig.missed.length
      ? '<div class="missed">' + sig.missed.map(function (src) {
          var label = src.pair ? src.pair.join('/') : src.word;
          return '<span>' + esc(label) + '</span>';
        }).join('') + '</div>' +
        '<button class="big" type="button" data-action="again">Øv disse igen</button>'
      : '<p class="note">Ingen fejl i denne runde.</p>';
    area.innerHTML =
      '<div class="progress">' + esc(tierLabel(sig.tier)) + ' · færdig</div>' +
      '<div class="target">' + sig.score + ' / ' + sig.items.length + '</div>' +
      missedHtml +
      '<button class="big secondary" type="button" data-action="restart">Ny runde, samme trin</button>' +
      '<button class="big secondary" type="button" data-action="picker">Vælg trin</button>';
  }

  function onSigClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'tier') { startSig(btn.getAttribute('data-value')); return; }
    if (!sig) return;
    if (action === 'hear') playSigItem();
    else if (action === 'said') { stopAudio(); sig.phase = 'judge'; renderSig(); }
    else if (action === 'judge') judgeSig(btn.getAttribute('data-value'));
    else if (action === 'retry') { sig.retry = true; sig.phase = 'show'; renderSig(); }
    else if (action === 'next') {
      sig.index++; sig.retry = false; sig.phase = 'show';
      if (sig.index >= sig.items.length) recordRound(sig.tier, sig.score, sig.items.length);
      renderSig();
    }
    else if (action === 'again') startSig(sig.tier, sig.missed);
    else if (action === 'restart') startSig(sig.tier);
    else if (action === 'picker') renderSigPicker();
  }
```

Add to `init()`, next to the Lyt listener:

```js
    $('sigArea').addEventListener('click', onSigClick);
```

- [ ] **Step 2: Test in the browser**

Open "Sig det".
Expected: five tier buttons with counts (41, 36, 28, 99, 9). Pick "Sidst i ordet":

- Word shown large, "Hør ordet" plays it, "Jeg har sagt det" hides the word and shows two buttons such as `hvid` / `hvij` in random order.
- Tapping the real word shows "Ramte den" in green; the error form shows "Blev til j" in red.
- "Prøv igen" shows the same word with "· øver igen" in the progress line; judging it again does not change the score at the end.
- After 10 items: score, missed words as chips, "Øv disse igen" starts a round with only those, "Ny runde, samme trin" and "Vælg trin" work.

Pick "Sætninger": the sentence is shown in the smaller style, "Hør sætningen" plays the sentence audio, judge buttons read "Alle d'er ramte" / "Et eller flere blev til j".

Pick "Par": the target is sometimes the j-word (for example "nej"); judge buttons are the two pair words.

Go to "Start": the stats table now shows percentages for the tiers played, and "Sværeste ord" lists words with at least two attempts and a fail. Reload: stats persist.

- [ ] **Step 3: Run the Node tests**

Run: `node test-udtale.js`
Expected: `udtale: 11 passed, 0 failed` (or 10/1 if audio was not generated in Task 2).

- [ ] **Step 4: Commit**

```bash
git add udtale.js
git commit -m "Add Sig det production exercise to soft d trainer"
```

---

### Task 7: Mobile check, docs, version bump

**Files:**
- Modify: `index.html:12` (version)
- Modify: `CLAUDE.md` (short section)

- [ ] **Step 1: Phone-width check**

In the browser devtools, emulate 375px width (or use the app's browser pane at mobile preset) and run one Sig det item and one Lyt item.
Expected: no horizontal scroll, the two judge buttons sit side by side and are at least 80px tall, the target word wraps rather than overflows for `stedfortræder`.

- [ ] **Step 2: Add a section to `CLAUDE.md`**

Append after the "## Audio" section:

```markdown
## Udtale-træner (blødt d)

Selvstændig side `udtale.html` (+ `udtale.css`, `udtale.js`, `udtale-data.js`), ikke linket fra appen. Øver blødt d med en forælder som dommer: **Lyt** (minimalpar, ned/nej) og **Sig det** (fem trin: sidst, i midten, -ede, sætninger, par; dommer vælger ordet vs. elevens fejlform, fx hvid/hvij). Bruger `words.json` og `audio/` direkte efter filnavnskonventionen, ikke manifestet. Ekstra ord uden sætning står i `udtale-words.json` og genereres med `node generate-audio.js --words udtale-words.json`. Statistik i localStorage `udtale_stats` (ikke per spiller). Test: `node test-udtale.js`. Spec: `docs/superpowers/specs/2026-09-28-udtale-bloedt-d-design.md`.
```

- [ ] **Step 3: Bump the version**

In `index.html:12` change `v1.10.6` to `v1.11.0`.

- [ ] **Step 4: Run all tests once more**

Run: `node test-udtale.js && node test-wordbank.js`
Expected: both report 0 failed.

- [ ] **Step 5: Commit**

```bash
git add index.html CLAUDE.md
git commit -m "Document soft d trainer and bump version to 1.11.0"
```

Do not push. The user pushes after review (Vercel/GitHub Pages deploy from main is live).

---

## Self-review against the spec

- **Files table:** every file in the spec has a task (data → 1, audio + generator → 2, html/css → 3, js → 4–6, test → 1). ✓
- **Tiers:** regexes and the `Verbernes bøjning` rule match the spec's corrected wording; extras land in final/medial and are excluded from sentences via `sentence: null`. ✓
- **Error form** examples match the spec table (`reddede → rejeje`). ✓
- **Lyt:** random side, two buttons, feedback, "Hør igen", score at the end. ✓
- **Sig det:** show → hide → judge → reveal, retry without scoring, missed list with "Øv disse igen", sentence buttons, pair target random. ✓
- **Stats:** schema matches (`words`, `rounds` capped at 200), per-tier 7-day and all-time percentages, five worst words with ≥2 attempts, reset with confirm, storage note. ✓
- **Error handling:** words.json failure message, MP3 error → browser voice → note. ✓
- **Not in scope:** no recording, no profiles, no Supabase. ✓
- **Names used across tasks:** `play(word, kind, text)`, `recordWord(key, ok)`, `recordRound(tier, score, total)`, `startLyt`, `renderSigPicker`, `startSig(tierId, pool)`, `D.buildTiers`, `D.errorForm`, `D.audioPath`, `D.TIERS` — consistent between Tasks 4, 5, 6. ✓
