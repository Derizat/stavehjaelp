# Boss Juice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WebAudio sound effects, CSS juice (particles, damage numbers, combo flame, confetti), and AI-generated monster sprites in a duel layout to the boss fights of Stavehjælpen.

**Architecture:** Two new dependency-free modules (`sfx.js`, `fx.js`) loaded via `<script>` tags before `app.js`; one-line hook calls inside existing shared boss helpers and answer handlers; the existing `BOSS_MONSTERS` table gains `image` fields pointing at `images/bosses/*.webp`.

**Tech Stack:** Vanilla JS (no build step), Web Audio API, CSS keyframes, gpt-image-1 (one-off generation script). Deploys via GitHub Pages; work happens on the `v2` branch.

**Spec:** `docs/superpowers/specs/2026-06-11-boss-juice-design.md`

**Repo:** `/Users/janlarsen/programmering/stavehjælp` (note: directory name contains `æ`)

**Conventions that apply to every task:**
- Bump the version number in the `<div class="logo">` line of index.html (currently `v1.9.7`) in EVERY commit — repo rule.
- Manual testing happens in a browser served via `python3 -m http.server 8080` from the repo root (file:// breaks fetch of audio-manifest.json). Open `http://localhost:8080`.
- There is no test framework. Verification = `node --check` for syntax plus the manual steps given per task. (The repo's `test-functions.js` extracts functions from index.html and is stale — do not extend it.)
- Line numbers below are accurate as of commit `f6c6d4f` and will drift as tasks land — always locate by the quoted anchor code, not the number alone.
- Commit after every task. Do NOT push — the user pushes manually after review.

---

### Task 1: sfx.js — sound engine + mute button

**Files:**
- Create: `sfx.js`
- Modify: `index.html:435-436` (script tags), `index.html:11-14` (header), `style.css` (append)

- [ ] **Step 1: Create `sfx.js` with the complete engine**

```js
// sfx.js — WebAudio sound effects for Stavehjælpen.
// Loaded before app.js. Exposes a global SFX object. No dependencies.
// All sounds are synthesized (no audio files). SFX.play() is a silent
// no-op when muted or when WebAudio is unavailable.
(function () {
  var ctx = null;
  var muted = localStorage.getItem('sound_muted') === '1';

  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // iOS/Safari requires the AudioContext to be created/resumed inside a
  // user gesture. One-shot unlock on the first interaction.
  function unlock() {
    ensureCtx();
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  }
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  // One enveloped oscillator note.
  // opts: type ('sine'|'triangle'|'square'|'sawtooth'), vol, delay (s), slide (target Hz)
  function tone(freq, dur, opts) {
    opts = opts || {};
    var c = ensureCtx();
    if (!c) return;
    var t = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
    var vol = opts.vol || 0.15;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // Short filtered noise burst (impacts).
  function noise(dur, opts) {
    opts = opts || {};
    var c = ensureCtx();
    if (!c) return;
    var t = c.currentTime + (opts.delay || 0);
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource();
    src.buffer = buf;
    var filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = opts.cutoff || 700;
    var gain = c.createGain();
    gain.gain.setValueAtTime(opts.vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start(t);
  }

  var SOUNDS = {
    correct: function () {
      tone(523.25, 0.11, { type: 'triangle' });               // C5
      tone(659.25, 0.11, { type: 'triangle', delay: 0.09 });  // E5
      tone(783.99, 0.18, { type: 'triangle', delay: 0.18 });  // G5
    },
    wrong: function () {
      tone(220, 0.28, { type: 'sawtooth', slide: 110, vol: 0.1 });
    },
    letterCatch: function () {
      tone(660, 0.07, { type: 'square', vol: 0.06, slide: 990 });
    },
    bossHit: function () {
      noise(0.12, { vol: 0.22, cutoff: 500 });
      tone(150, 0.16, { type: 'square', vol: 0.14, slide: 55 });
    },
    bossDefeat: function () {
      // Rising arpeggio + final chord — doubles as the victory fanfare.
      var notes = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        tone(notes[i], 0.14, { type: 'triangle', delay: i * 0.11 });
      }
      tone(1046.5, 0.5, { type: 'triangle', delay: 0.5, vol: 0.12 });
      tone(1318.5, 0.5, { type: 'triangle', delay: 0.5, vol: 0.1 });
    },
    chestOpen: function () {
      tone(392, 0.1, { type: 'triangle' });                    // G4
      tone(523.25, 0.1, { type: 'triangle', delay: 0.1 });
      tone(659.25, 0.25, { type: 'triangle', delay: 0.2 });
      tone(1318.5, 0.3, { type: 'sine', delay: 0.28, vol: 0.07 }); // sparkle
    },
    combo: function (n) {
      // Pitch rises with the streak; capped so it never gets shrill.
      var f = 440 * Math.pow(1.1225, Math.min(n || 2, 10));
      tone(f, 0.08, { type: 'square', vol: 0.06 });
      tone(f * 1.5, 0.1, { type: 'square', vol: 0.05, delay: 0.07 });
    },
    levelup: function () {
      var notes = [392, 523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        tone(notes[i], 0.13, { type: 'triangle', delay: i * 0.09 });
      }
    }
  };

  window.SFX = {
    play: function (name, arg) {
      if (muted) return;
      var fn = SOUNDS[name];
      if (!fn) return;
      try { fn(arg); } catch (e) { /* never break the game over a sound */ }
    },
    isMuted: function () { return muted; },
    toggleMute: function () {
      muted = !muted;
      localStorage.setItem('sound_muted', muted ? '1' : '0');
      var btn = document.getElementById('muteBtn');
      if (btn) btn.textContent = muted ? '🔇' : '🔊';
      if (!muted) window.SFX.play('correct');
      return muted;
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('muteBtn');
    if (btn && muted) btn.textContent = '🔇';
  });
})();
```

- [ ] **Step 2: Syntax-check**

Run: `cd /Users/janlarsen/programmering/stavehjælp && node --check sfx.js`
Expected: no output (exit 0).

- [ ] **Step 3: Load it in index.html + add the mute button + bump version**

index.html currently has (lines 435-436):

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="app.js"></script>
```

Change to:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="sfx.js"></script>
<script src="app.js"></script>
```

And the header (lines 11-14) currently:

```html
<header>
  <div class="logo" onclick="goHome()" style="cursor:pointer">&#x1F98A; Stavehjælpen - v1.9.7</div>
  <p>Evidensbaseret stavetræning med AI</p>
</header>
```

Change to (version bump + button):

```html
<header>
  <div class="logo" onclick="goHome()" style="cursor:pointer">&#x1F98A; Stavehjælpen - v1.9.8</div>
  <p>Evidensbaseret stavetræning med AI</p>
  <button id="muteBtn" class="mute-btn" onclick="SFX.toggleMute()" aria-label="Lyd til/fra">&#x1F50A;</button>
</header>
```

- [ ] **Step 4: Style the button — append to style.css**

First check whether the `header` rule already sets `position`; if not, add `position: relative;` to it. Then append:

```css
/* ===== SFX mute button (sfx.js) ===== */
.mute-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--card);
  border: 1px solid var(--card2);
  font-size: 1.1rem;
  cursor: pointer;
  line-height: 1;
}
.mute-btn:hover { border-color: var(--accent); }
```

- [ ] **Step 5: Manual verification**

Run: `cd /Users/janlarsen/programmering/stavehjælp && python3 -m http.server 8080`
In the browser at `http://localhost:8080`:
1. Click anywhere once (unlock), then in DevTools console: `SFX.play('correct')` → ascending chime. Try `'wrong'`, `'bossHit'`, `'bossDefeat'`, `'chestOpen'`, `'levelup'`, `SFX.play('combo', 5)`.
2. Click 🔊 → becomes 🔇; `SFX.play('correct')` → silence.
3. Reload → button still shows 🔇 (persisted). Toggle back on.

- [ ] **Step 6: Commit**

```bash
cd /Users/janlarsen/programmering/stavehjælp
git add sfx.js index.html style.css
git commit -m "Add WebAudio sound engine (sfx.js) with header mute button"
```

---

### Task 2: Sound hooks in app.js

**Files:**
- Modify: `app.js` (7 small edits), `index.html` (version bump)

All edits are one-line insertions. Locate by anchor code, not line number.

- [ ] **Step 1: Boss helpers — 4 hooks**

In `bossHitAnim()` (~app.js:3598), after `if (!monster) return;` insert:

```js
  SFX.play('bossHit');
```

In `bossAttackAnim()` (~app.js:3605), after `if (!monster) return;` insert:

```js
  SFX.play('wrong');
```

In `revealBossSlot(index, letter)` (~app.js:3614), inside the `if (slot)` block:

```js
function revealBossSlot(index, letter) {
  var slot = document.getElementById('bossSlot' + index);
  if (slot) { slot.textContent = letter; slot.classList.add('revealed'); SFX.play('letterCatch'); }
}
```

In `bossDefeated()` (~app.js:5268), after the line `bossState = null;` insert:

```js
  SFX.play('bossDefeat');
```

- [ ] **Step 2: Chest + level-up — 2 hooks**

In `showTreasureChest()` (~app.js:5495), insert as the first line of the function body:

```js
  SFX.play('chestOpen');
```

In `doLevelUp()` (~app.js:5642), after the early-return guard `if (newIdx > actualLevel.index) return;` insert:

```js
  SFX.play('levelup');
```

- [ ] **Step 3: Answer handlers — 6 hooks (correct/wrong)**

Six functions contain the streak pattern. Find them with:
`grep -n "sessionCorrectStreak++" app.js`
→ `checkSpelling` (~2952), `checkFillIn` (~6760), `checkSpellingPolice` (~7042), `wordBuilderComplete` (~7380), `pickSpkOption` (~7601), `checkSentence` (~7751).

In EACH of the six, the pattern is (modulo small variations like a one-line else):

```js
  if (ok) {
    sessionCorrectCount++;
    sessionCorrectStreak++;
    if (sessionCorrectStreak >= BOSS_TRIGGER_STREAK) {
      ...
    }
  } else {
    sessionCorrectStreak = 0;
    ...
  }
```

Insert `SFX.play('correct');` as the first line of the `if (ok)` branch and `SFX.play('wrong');` as the first line of the `else` branch — in all six functions. (In `pickSpkOption` the else branch is a one-liner: `} else { sessionCorrectStreak = 0; trackCategoryError(w.category); }` — expand it.)

Note: boss minigames call `bossHitAnim`/`bossAttackAnim` for their own right/wrong, so the six handlers above never double-fire with those.

- [ ] **Step 4: Syntax-check + version bump**

Run: `node --check app.js` → exit 0.
Bump index.html logo to `v1.9.9`.

- [ ] **Step 5: Manual verification**

Serve and play a training session ("Fortsæt træning"):
1. Correct answer → chime; wrong answer → buzz.
2. For fast boss testing, temporarily set `var BOSS_TRIGGER_STREAK = 5;` (app.js:4) to `1`, answer 1 correct → boss appears. In the boss: each hit → thud; word slots filling → blip; defeat → fanfare; chest after → chest arpeggio. **Revert to 5 afterwards.**
3. Mute → everything silent.

- [ ] **Step 6: Commit**

```bash
git add app.js index.html
git commit -m "Hook SFX into boss helpers, chest, level-up and answer handlers"
```

---

### Task 3: fx.js — visual effects module + CSS

**Files:**
- Create: `fx.js`
- Modify: `index.html` (script tag + version), `style.css` (append)

- [ ] **Step 1: Create `fx.js`**

```js
// fx.js — visual effects for Stavehjælpen.
// Loaded after sfx.js, before app.js. Exposes a global FX object.
// All effects are fire-and-forget: spawned elements remove themselves.
// Respects prefers-reduced-motion (particles/confetti skipped).
(function () {
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var liveCount = 0;
  var MAX_LIVE = 30; // cap concurrent effect elements (older iPads)

  var COLORS = ['#f5a623', '#22d3a0', '#7c3aed', '#f43f5e', '#0ea5e9', '#fde047'];

  function spawn(cls, styles, ttl) {
    if (liveCount >= MAX_LIVE) return null;
    var el = document.createElement('div');
    el.className = cls;
    for (var k in styles) {
      if (k.indexOf('--') === 0) el.style.setProperty(k, styles[k]);
      else el.style[k] = styles[k];
    }
    document.body.appendChild(el);
    liveCount++;
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      liveCount--;
    }, ttl);
    return el;
  }

  function burst(el, count) {
    if (reduceMotion || !el) return;
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    count = count || 12;
    for (var i = 0; i < count; i++) {
      var ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      var dist = 40 + Math.random() * 50;
      spawn('fx-particle', {
        left: cx + 'px',
        top: cy + 'px',
        background: COLORS[i % COLORS.length],
        '--dx': (Math.cos(ang) * dist) + 'px',
        '--dy': (Math.sin(ang) * dist) + 'px'
      }, 700);
    }
  }

  function damageNumber(el, n) {
    if (!el || !n) return;
    var r = el.getBoundingClientRect();
    var d = spawn('fx-damage', {
      left: (r.left + r.width / 2) + 'px',
      top: r.top + 'px'
    }, 900);
    if (d) d.textContent = '-' + n;
  }

  function confetti(container) {
    if (reduceMotion) return;
    var r = (container || document.body).getBoundingClientRect();
    for (var i = 0; i < 24; i++) {
      spawn('fx-confetti', {
        left: (r.left + Math.random() * r.width) + 'px',
        top: (r.top - 10) + 'px',
        background: COLORS[i % COLORS.length],
        animationDelay: (Math.random() * 0.6) + 's',
        animationDuration: (1.6 + Math.random()) + 's'
      }, 2800);
    }
  }

  function slotPop(el) {
    if (!el) return;
    el.classList.remove('fx-pop');
    void el.offsetWidth; // restart animation
    el.classList.add('fx-pop');
  }

  // Combo flame badge — a single fixed element managed by fx.js.
  var lastCombo = 0;
  function ensureBadge() {
    var b = document.getElementById('fxComboBadge');
    if (!b) {
      b = document.createElement('div');
      b.id = 'fxComboBadge';
      b.className = 'fx-combo-badge hidden';
      document.body.appendChild(b);
    }
    return b;
  }
  var combo = {
    set: function (n) {
      var b = ensureBadge();
      if (n >= 2) {
        b.textContent = '🔥 ×' + n;
        b.classList.remove('hidden');
        b.classList.remove('fx-pop');
        void b.offsetWidth;
        b.classList.add('fx-pop');
        if (n > lastCombo && window.SFX) SFX.play('combo', n);
      } else {
        b.classList.add('hidden');
      }
      lastCombo = n;
    },
    reset: function () { combo.set(0); }
  };

  window.FX = {
    burst: burst,
    damageNumber: damageNumber,
    confetti: confetti,
    slotPop: slotPop,
    combo: combo
  };
})();
```

- [ ] **Step 2: Syntax-check**

Run: `node --check fx.js` → exit 0.

- [ ] **Step 3: Append effect CSS to style.css**

```css
/* ===== FX effects (fx.js) ===== */
.fx-particle {
  position: fixed;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 9999;
  animation: fx-burst 0.65s ease-out forwards;
}
@keyframes fx-burst {
  from { transform: translate(0, 0) scale(1); opacity: 1; }
  to   { transform: translate(var(--dx), var(--dy)) scale(0.3); opacity: 0; }
}
.fx-damage {
  position: fixed;
  pointer-events: none;
  z-index: 9999;
  font-family: 'Fredoka One', cursive;
  font-size: 1.3rem;
  color: #fde047;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7);
  transform: translateX(-50%);
  animation: fx-damage-float 0.85s ease-out forwards;
}
@keyframes fx-damage-float {
  to { transform: translate(-50%, -52px); opacity: 0; }
}
.fx-confetti {
  position: fixed;
  width: 9px;
  height: 14px;
  pointer-events: none;
  z-index: 9999;
  opacity: 0;
  animation-name: fx-confetti-fall;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
@keyframes fx-confetti-fall {
  0%   { opacity: 1; transform: translateY(0) rotate(0); }
  100% { opacity: 0; transform: translateY(140px) rotate(540deg); }
}
.fx-pop { animation: fx-pop 0.35s ease; }
@keyframes fx-pop {
  0%   { transform: scale(0.4); }
  60%  { transform: scale(1.35); }
  100% { transform: scale(1); }
}
.fx-combo-badge {
  position: fixed;
  top: 64px;
  right: 12px;
  z-index: 9000;
  background: var(--card);
  border: 2px solid var(--accent);
  border-radius: 22px;
  padding: 6px 14px;
  font-family: 'Fredoka One', cursive;
  color: var(--accent);
  font-size: 1.05rem;
  box-shadow: 0 0 14px rgba(245, 166, 35, 0.5);
}
```

- [ ] **Step 4: Add script tag + version bump**

In index.html, between the sfx.js and app.js tags:

```html
<script src="sfx.js"></script>
<script src="fx.js"></script>
<script src="app.js"></script>
```

Bump logo to `v1.10.0`.

- [ ] **Step 5: Manual verification**

Serve, open console:
1. `FX.burst(document.querySelector('.logo'))` → particles fly from the logo.
2. `FX.damageNumber(document.querySelector('.logo'), 12)` → "-12" floats up.
3. `FX.confetti()` → confetti rains over the page.
4. `FX.combo.set(3)` → 🔥 ×3 badge top-right with bump + rising blip; `FX.combo.reset()` hides it.
5. DevTools → Rendering → emulate `prefers-reduced-motion: reduce` → burst/confetti do nothing; damage numbers and badge still work.

- [ ] **Step 6: Commit**

```bash
git add fx.js style.css index.html
git commit -m "Add visual effects module (fx.js): particles, damage numbers, confetti, combo badge"
```

---

### Task 4: FX hooks in the boss flow

**Files:**
- Modify: `app.js` (4 edits), `index.html` (version bump)

- [ ] **Step 1: Particles on hit — extend `bossHitAnim()`**

```js
function bossHitAnim() {
  var monster = document.getElementById('bossMonster');
  if (!monster) return;
  SFX.play('bossHit');
  FX.burst(monster);
  monster.className = 'boss-monster boss-hit';
  setTimeout(function() {
    if (bossState) monster.className = 'boss-monster ' + bossState.idleAnim;
  }, 400);
}
```

- [ ] **Step 2: Damage numbers — extend `updateBossHP()`**

The current function (~app.js:3592):

```js
function updateBossHP() {
  var pct = (bossState.hp / bossState.maxHP) * 100;
  document.getElementById('bossHPBar').style.width = pct + '%';
  document.getElementById('bossHPText').textContent = 'HP: ' + bossState.hp + '/' + bossState.maxHP;
}
```

Becomes (delta-tracking via a field on bossState):

```js
function updateBossHP() {
  var prev = bossState._shownHP;
  if (typeof prev === 'number' && bossState.hp < prev) {
    FX.damageNumber(document.getElementById('bossMonster'), prev - bossState.hp);
  }
  bossState._shownHP = bossState.hp;
  var pct = (bossState.hp / bossState.maxHP) * 100;
  document.getElementById('bossHPBar').style.width = pct + '%';
  document.getElementById('bossHPText').textContent = 'HP: ' + bossState.hp + '/' + bossState.maxHP;
}
```

- [ ] **Step 3: Slot pop — extend `revealBossSlot()`**

```js
function revealBossSlot(index, letter) {
  var slot = document.getElementById('bossSlot' + index);
  if (slot) { slot.textContent = letter; slot.classList.add('revealed'); SFX.play('letterCatch'); FX.slotPop(slot); }
}
```

- [ ] **Step 4: Confetti on defeat — extend `bossDefeated()`**

In `bossDefeated()` (~app.js:5268), directly after the existing `SFX.play('bossDefeat');` (added in Task 2), insert:

```js
  FX.confetti(document.getElementById('bossContent'));
```

- [ ] **Step 5: Verify + version bump**

`node --check app.js` → exit 0. Bump logo to `v1.10.1`.
Serve, set `BOSS_TRIGGER_STREAK` to 1 temporarily, fight a boss: hits → particles + floating damage numbers; slots → pop; defeat → confetti. **Revert trigger to 5.**

- [ ] **Step 6: Commit**

```bash
git add app.js index.html
git commit -m "Hook FX into boss flow: hit particles, damage numbers, slot pop, victory confetti"
```

---

### Task 5: Combo flame at the answer sites

**Files:**
- Modify: `app.js` (6 edits, same functions as Task 2 step 3), `index.html` (version bump)

- [ ] **Step 1: Add combo calls in all six answer handlers**

In each of `checkSpelling`, `checkFillIn`, `checkSpellingPolice`, `wordBuilderComplete`, `pickSpkOption`, `checkSentence` — immediately after `sessionCorrectStreak++;` insert:

```js
    FX.combo.set(sessionCorrectStreak);
```

And immediately after `sessionCorrectStreak = 0;` in the corresponding else/wrong branch insert:

```js
    FX.combo.reset();
```

IMPORTANT: do NOT add `FX.combo.reset()` after the reset inside the `if (sessionCorrectStreak >= BOSS_TRIGGER_STREAK)` block (the streak resets there only because the boss triggers — the flame should stay lit at ×5 while the boss fight runs). Only the wrong-answer resets get the call.

- [ ] **Step 2: Verify + version bump**

`node --check app.js` → exit 0. Bump logo to `v1.10.2`.
Serve, run training: 2 correct → 🔥 ×2 appears with blip; grows to ×4; a wrong answer hides it; at ×5 the boss triggers and the flame stays at ×5 during the fight.

- [ ] **Step 3: Commit**

```bash
git add app.js index.html
git commit -m "Show combo flame badge driven by answer streak"
```

---

### Task 6: Duel layout in the boss header

**Files:**
- Modify: `app.js` (rebuild `renderBossHeader`, extend `revealBossSlot`/`bossAttackAnim`, add helper), `style.css` (append), `index.html` (version bump)

- [ ] **Step 1: Add `bossMonsterHTML()` helper + rebuild `renderBossHeader()`**

Directly above `function renderBossHeader` (~app.js:3554) add:

```js
function bossMonsterHTML(boss) {
  if (boss.image) {
    return '<img src="' + boss.image + '" alt="' + boss.name + '" class="boss-monster-img" ' +
      'onerror="this.parentNode.textContent=\'' + boss.emoji + '\'">';
  }
  return boss.emoji;
}

function duelAvatarReact(cls) {
  var a = document.getElementById('duelAvatar');
  if (!a) return;
  a.classList.remove('avatar-hop', 'avatar-duck');
  void a.offsetWidth;
  a.classList.add(cls);
}
```

Then in `renderBossHeader(boss, idleAnim, hp, maxHP)`: keep the `catBadge` block and the `bossPhaseLabel` block exactly as they are, and replace ONLY the final `return` statement. Current:

```js
  return '<div style="text-align:center">' +
    catBadge +
    '<div class="boss-hp-wrap"><div class="boss-hp-bar" id="bossHPBar" style="width:100%"></div></div>' +
    '<div style="font-size:0.8rem;color:var(--muted);margin-bottom:4px" id="bossHPText">HP: ' + hp + '/' + maxHP + '</div>' +
    '<div id="bossMonster" class="boss-monster ' + idleAnim + '">' + boss.emoji + '</div>' +
    '</div>';
```

New:

```js
  var avatarLevel = AVATAR_LEVELS[loadRewardData().displayedLevel || 0];
  return '<div style="text-align:center">' +
    catBadge +
    '<div class="boss-hp-wrap"><div class="boss-hp-bar" id="bossHPBar" style="width:100%"></div></div>' +
    '<div style="font-size:0.8rem;color:var(--muted);margin-bottom:4px" id="bossHPText">HP: ' + hp + '/' + maxHP + '</div>' +
    '<div class="boss-duel">' +
      '<div class="duel-avatar" id="duelAvatar"><img src="' + avatarLevel.image + '" alt="' + avatarLevel.title + '"></div>' +
      '<div class="duel-vs">VS</div>' +
      '<div id="bossMonster" class="boss-monster ' + idleAnim + '">' + bossMonsterHTML(boss) + '</div>' +
    '</div>' +
    '<div style="font-size:0.85rem;color:var(--muted);margin-top:2px">' + boss.name + '</div>' +
    '</div>';
```

(`boss.image` does not exist yet — `bossMonsterHTML` falls back to the emoji until Task 7. `loadRewardData` and `AVATAR_LEVELS` are existing app.js globals.)

- [ ] **Step 2: Avatar reactions**

In `revealBossSlot()`, inside the `if (slot)` block, append `duelAvatarReact('avatar-hop');`:

```js
  if (slot) { slot.textContent = letter; slot.classList.add('revealed'); SFX.play('letterCatch'); FX.slotPop(slot); duelAvatarReact('avatar-hop'); }
```

In `bossAttackAnim()`, after the `SFX.play('wrong');` line (Task 2), insert:

```js
  duelAvatarReact('avatar-duck');
```

- [ ] **Step 3: Duel CSS — append to style.css**

```css
/* ===== Boss duel layout ===== */
.boss-duel {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}
.duel-avatar img {
  width: 64px;
  height: 64px;
  object-fit: contain;
}
.duel-vs {
  font-family: 'Fredoka One', cursive;
  color: var(--muted);
  font-size: 1.1rem;
}
.boss-monster-img {
  width: 88px;
  height: 88px;
  object-fit: contain;
  display: block;
}
.avatar-hop { animation: fx-avatar-hop 0.45s ease; }
@keyframes fx-avatar-hop {
  0%, 100% { transform: translateY(0); }
  40%      { transform: translateY(-14px); }
}
.avatar-duck { animation: fx-avatar-duck 0.45s ease; }
@keyframes fx-avatar-duck {
  0%, 100% { transform: translateY(0) scale(1); }
  40%      { transform: translateY(6px) scale(0.92); }
}
```

- [ ] **Step 4: Verify + version bump**

`node --check app.js` → exit 0. Bump logo to `v1.10.3`.
Serve, trigger a boss (temporary trigger=1, revert): avatar left, VS, emoji boss right, monster name below; correct letter → avatar hops; boss attack → avatar ducks. Check the boss idle/hit/death animations still play on the monster element. Test at iPad width (~768px) — the duel row must not overflow.

- [ ] **Step 5: Commit**

```bash
git add app.js style.css index.html
git commit -m "Boss duel layout: avatar vs monster with hop/duck reactions"
```

---

### Task 7: Monster sprites — generation + wiring

**Files:**
- Create: `generate-boss-images.js`, `images/bosses/*.webp` (9 files, user-curated)
- Modify: `app.js` (BOSS_MONSTERS + preload), `index.html` (version bump)

- [ ] **Step 1: Create `generate-boss-images.js`**

```js
#!/usr/bin/env node
// One-off: generate boss monster sprites via OpenAI gpt-image-1.
// Run: OPENAI_API_KEY=sk-... node generate-boss-images.js [slug]
// Existing files are skipped — delete a file to regenerate it.
const fs = require('fs');
const path = require('path');

const STYLE = "Cute-but-dangerous cartoon monster for a children's spelling game. " +
  'Bold rounded shapes, thick outlines, vivid saturated colors, playful menace. ' +
  'Single character, centered, full body. No text, no background elements.';

const MONSTERS = [
  { slug: 'stumme-bogstaver',   desc: 'a mischievous translucent ghost hugging a big glowing letter H' },
  { slug: 'dobbeltkonsonant',   desc: 'a two-headed dragon whose heads are identical twins' },
  { slug: 'for-efterstavelser', desc: 'a wizard juggling glowing word-fragment runes' },
  { slug: 'sammensatte-ord',    desc: 'a goofy ogre visibly stitched together from mismatched parts' },
  { slug: 'verbernes-bojning',  desc: 'a silly zombie bending and twisting its rubbery arms' },
  { slug: 'navneordsendelser',  desc: 'a small alien with several differently-shaped tails' },
  { slug: 'lydrette-ord',       desc: 'a big friendly bear roaring visible musical sound waves' },
  { slug: 'nutids-r',           desc: 'a tyrannosaurus rex with a bold letter R marked on its chest' },
  { slug: 'konsonantlyde',      desc: 'a bat with huge ears emitting echo rings' }
];

async function gen(m) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.OPENAI_API_KEY
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: STYLE + ' This monster: ' + m.desc + '.',
      size: '1024x1024',
      quality: 'medium',
      background: 'transparent',
      output_format: 'webp'
    })
  });
  if (!res.ok) throw new Error(m.slug + ': HTTP ' + res.status + ' ' + (await res.text()));
  const data = await res.json();
  const out = path.join('images', 'bosses', m.slug + '.webp');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(data.data[0].b64_json, 'base64'));
  console.log('OK', out);
}

(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Set OPENAI_API_KEY first.');
    process.exit(1);
  }
  const only = process.argv[2];
  for (const m of MONSTERS) {
    if (only && m.slug !== only) continue;
    if (fs.existsSync(path.join('images', 'bosses', m.slug + '.webp'))) {
      console.log('skip (exists)', m.slug);
      continue;
    }
    await gen(m);
  }
})();
```

Run: `node --check generate-boss-images.js` → exit 0.

- [ ] **Step 2: Generate + curate (USER IN THE LOOP)**

The API key lives in the user's `~/.zshrc` (same setup as the quizzo_gen sibling repo):

```bash
cd /Users/janlarsen/programmering/stavehjælp
zsh -ic 'node generate-boss-images.js'
```

≈9 images, costs well under $1. **STOP and show the user the 9 files** (e.g. `open images/bosses/`) — the user approves or deletes the ones to regenerate (re-run regenerates only missing files; per-slug: `zsh -ic 'node generate-boss-images.js dobbeltkonsonant'`). Do not proceed until all 9 are approved. Check each file is < ~300KB (`ls -lh images/bosses/`).

- [ ] **Step 3: Add `image` fields + preload in app.js**

In `BOSS_MONSTERS` (~app.js:3306), add an `image` field to each entry — keep the existing unicode escapes for emoji/names exactly as they are, only append the field:

```js
var BOSS_MONSTERS = {
  "Stumme bogstaver": { emoji: "👻", name: "Spøgelsesbossen", image: "images/bosses/stumme-bogstaver.webp" },
  "Dobbeltkonsonant": { emoji: "🐉", name: "Dobbeltdragen", image: "images/bosses/dobbeltkonsonant.webp" },
  "For- og efterstavelser": { emoji: "🧙", name: "Troldmanden", image: "images/bosses/for-efterstavelser.webp" },
  "Sammensatte ord": { emoji: "👹", name: "Samlemonsteret", image: "images/bosses/sammensatte-ord.webp" },
  "Verbernes bøjning": { emoji: "🧟", name: "Bøjningszombien", image: "images/bosses/verbernes-bojning.webp" },
  "Navneordsendelser": { emoji: "👾", name: "Endelsesalienen", image: "images/bosses/navneordsendelser.webp" },
  "Lydrette ord": { emoji: "🐻", name: "Lydbjørnen", image: "images/bosses/lydrette-ord.webp" },
  "Nutids-r": { emoji: "🦖", name: "R-Rex", image: "images/bosses/nutids-r.webp" },
  "Konsonantlyde": { emoji: "🦇", name: "Lydflagermussen", image: "images/bosses/konsonantlyde.webp" }
};

// Preload boss sprites so the first fight doesn't flash the fallback emoji
Object.keys(BOSS_MONSTERS).forEach(function (k) {
  if (BOSS_MONSTERS[k].image) { var img = new Image(); img.src = BOSS_MONSTERS[k].image; }
});
```

- [ ] **Step 4: Verify + version bump**

`node --check app.js` → exit 0. Bump logo to `v1.10.4`.
Serve: boss fight now shows the sprite (idle float/hit/death animations apply to the img's parent and still work). Temporarily rename one webp → that category's boss falls back to its emoji (then rename back).

- [ ] **Step 5: Commit**

```bash
git add generate-boss-images.js images/bosses app.js index.html
git commit -m "Add AI-generated boss monster sprites with emoji fallback and preload"
```

---

### Task 8: Docs + full regression pass

**Files:**
- Modify: `CLAUDE.md` (stale facts), `index.html` (version bump)

- [ ] **Step 1: Update CLAUDE.md**

Fix/add in `/Users/janlarsen/programmering/stavehjælp/CLAUDE.md`:
1. Boss section: monster identity is per category via `BOSS_MONSTERS` (9 named monsters with sprite + emoji fallback in `images/bosses/`); active battle types are `memory, cardcast, silentservant, pacman, snake` (replace the stale "5 typer: scramble/rain/memory/reverse/pacman" list).
2. Architecture: mention `sfx.js` (WebAudio sounds, global `SFX`) and `fx.js` (visual effects, global `FX`), loaded before app.js.
3. Shared localStorage keys: add `sound_muted` next to `tts_voice`/`gcloud_tts_key`.
4. Commands/files: `generate-boss-images.js` (one-off sprite generation, OPENAI_API_KEY from ~/.zshrc, skip-existing).

- [ ] **Step 2: Full manual regression (spec checklist)**

Serve and run through:
1. All 5 active battle types (force with temporary `BOSS_BATTLE_TYPES = ['memory']` etc., one at a time — **revert after**): particles, damage numbers, slot pop, confetti, sounds, duel layout, avatar reactions.
2. Training: correct/wrong sounds, combo flame from ×2, reset on wrong, flame stays during boss.
3. Mute: silences everything, persists, shared across profiles.
4. `prefers-reduced-motion`: no particles/confetti; sound + damage numbers still work.
5. Sprite fallback: rename a webp → emoji appears (rename back).
6. iPad-width viewport: duel row fits, no overflow.
7. Version bumped (final bump to `v1.10.5`).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md index.html
git commit -m "Update CLAUDE.md: sfx/fx modules, category boss sprites, active battle types"
```

Do NOT push — the user reviews and pushes manually.
