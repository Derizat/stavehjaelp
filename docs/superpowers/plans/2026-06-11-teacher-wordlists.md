# Teacher Word Lists ("Ugens ord") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers type this week's words in the dashboard; students in the class get an "Ugens ord" button that trains exactly those words, and the class overview shows per-student progress on the list.

**Architecture:** One new Supabase table (`word_lists`, one row per class, upsert on `group_id`). Teacher editor renders inside the existing `phase-dashboard`. The student session reuses the existing `mixedQueue`/`renderMixedItem` machinery — known words get full exercise variety via existing enrichment functions; unknown words fall back to diktat/spellpick. The follow-up column is computed from the existing `answers` table (no schema change).

**Tech Stack:** Vanilla ES5-style JS (no build step), Supabase JS client (already loaded), existing TTS fallback chain.

**Spec:** `docs/superpowers/specs/2026-06-11-teacher-wordlists-design.md`
**Repo:** `/Users/janlarsen/programmering/stavehjælp` (directory name contains `æ` — always quote paths in shell commands). Branch: `v2`.

**Conventions for every task:**
- Bump the version in index.html's `.logo` div (starts at `v1.10.6`) in EVERY commit.
- All UI strings in Danish. Use unicode escapes (`æ`, `&#x1F4DD;`) in JS/HTML string literals to match existing file conventions.
- No test framework: verification = `node --check app.js` + manual browser steps (`python3 -m http.server 8080` from repo root). Subagents skip browser steps (human checkpoints).
- Locate code by quoted anchors via grep, not line numbers (they drift).
- Commit per task; never push.

---

### Task 1: SQL migration (USER GATE)

**Files:**
- Create: `db/word-lists.sql`

- [ ] **Step 1: Create `db/word-lists.sql`** (new `db/` directory):

```sql
-- Word lists: one active list per class ("Ugens ord").
-- Run manually in the Supabase SQL editor (project cfkddsiwwujbbxjuthie).
create table word_lists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique references groups(id) on delete cascade,
  words jsonb not null default '[]'::jsonb,
  created_by text,
  updated_at timestamptz not null default now()
);
alter table word_lists disable row level security;
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/janlarsen/programmering/stavehjælp"
git add db/word-lists.sql
git commit -m "Add word_lists table migration for teacher word lists"
```

- [ ] **Step 3: USER GATE — STOP.** Ask the user to run the SQL in the Supabase SQL editor and confirm. Tasks 2-4 read/write this table; nothing works until it exists.

---

### Task 2: Teacher editor in the dashboard

**Files:**
- Modify: `app.js` (5 new functions + 1 hook), `index.html` (container div + version bump), `style.css` (chips)

- [ ] **Step 1: Add the container in index.html.** Inside `<div id="phase-dashboard" ...>` (~line 410), directly BEFORE the element that holds the class overview (find `id="dashboardClassOverview"` and place the new div as its previous sibling):

```html
<div id="dashboardWordList"></div>
```

- [ ] **Step 2: Add five functions to app.js**, directly after `renderStudentDetail`'s closing brace (grep `function renderStudentDetail`):

```js
// ===== UGENS ORD (teacher word lists) =====

function parseWordListInput(text) {
  var seen = {};
  var out = [];
  var parts = (text || '').split(/[\n,]+/);
  for (var i = 0; i < parts.length; i++) {
    var w = parts[i].trim().toLowerCase();
    if (!w || w.length > 40 || seen[w]) continue;
    seen[w] = true;
    out.push(w);
  }
  return out.slice(0, 30);
}

function findWordInBank(raw) {
  var target = (raw || '').trim().toLowerCase();
  for (var cat in WORD_BANK) {
    var list = WORD_BANK[cat] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].word.toLowerCase() === target) {
        return Object.assign({}, list[i], { category: cat });
      }
    }
  }
  return null;
}

async function loadWordList(groupId) {
  if (!supabaseClient) return null;
  var res = await supabaseClient.from('word_lists').select('*').eq('group_id', groupId).maybeSingle();
  if (res.error) { console.warn('word_lists fejl:', res.error.message); return null; }
  return res.data; // null if no row
}

function renderWordListChips() {
  var ta = document.getElementById('wordListInput');
  var box = document.getElementById('wordListChips');
  if (!ta || !box) return;
  var words = parseWordListInput(ta.value);
  var html = '';
  for (var i = 0; i < words.length; i++) {
    var known = !!findWordInBank(words[i]);
    html += '<span class="wl-chip ' + (known ? 'known' : 'unknown') + '">' +
      escapeHtml(words[i]) + (known ? ' ✓' : ' ◌') + '</span>';
  }
  if (words.length > 0) {
    html += '<div style="font-size:0.75rem;color:var(--muted);margin-top:6px">' +
      '✓ = kendt af appen (fuld øvelsesvariation) · ◌ = ukendt (diktat + vælg stavemåde)</div>';
  }
  box.innerHTML = html;
}

async function renderWordListEditor(groupId) {
  var container = document.getElementById('dashboardWordList');
  if (!container) return;
  var list = await loadWordList(groupId);
  var words = (list && list.words) || [];
  var updated = list && list.updated_at ?
    'Sidst opdateret: ' + new Date(list.updated_at).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  container.innerHTML =
    '<div style="background:var(--card2);border-radius:12px;padding:14px 16px;border:1px solid #3d4270;margin-bottom:16px">' +
      '<div style="font-family:\'Fredoka One\',cursive;color:var(--accent);margin-bottom:8px">📝 Ugens ord</div>' +
      '<textarea id="wordListInput" rows="2" oninput="renderWordListChips()" ' +
        'placeholder="Skriv ugens ord adskilt af komma eller linjeskift" ' +
        'style="width:100%;box-sizing:border-box;background:var(--card);border:1px solid #3d4270;border-radius:8px;color:var(--text);padding:8px;font-family:\'Nunito\',sans-serif;font-size:0.9rem">' +
        escapeHtml(words.join(', ')) + '</textarea>' +
      '<div id="wordListChips" style="margin-top:8px"></div>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-top:8px">' +
        '<button class="btn btn-green" style="font-size:0.85rem;padding:8px 18px" onclick="saveWordList(\'' + groupId + '\')">Gem ugens ord</button>' +
        '<span id="wordListStatus" style="font-size:0.78rem;color:var(--muted)">' + updated + '</span>' +
      '</div>' +
    '</div>';
  renderWordListChips();
}

async function saveWordList(groupId) {
  if (!supabaseClient) { alert('Kræver internetforbindelse'); return; }
  var ta = document.getElementById('wordListInput');
  var statusEl = document.getElementById('wordListStatus');
  var words = parseWordListInput(ta ? ta.value : '');
  var res;
  if (words.length === 0) {
    res = await supabaseClient.from('word_lists').delete().eq('group_id', groupId);
  } else {
    res = await supabaseClient.from('word_lists').upsert({
      group_id: groupId, words: words, created_by: activePlayer,
      updated_at: new Date().toISOString()
    }, { onConflict: 'group_id' });
  }
  if (res.error) { alert('Kunne ikke gemme: ' + res.error.message); return; }
  if (statusEl) statusEl.textContent = words.length === 0 ? 'Listen er slettet' : 'Gemt ✓ (' + words.length + ' ord)';
}
```

Note: `escapeHtml`, `WORD_BANK`, `supabaseClient`, `activePlayer` are existing globals. `maybeSingle()` exists in supabase-js v2.

- [ ] **Step 3: Hook into class selection.** In `onDashboardClassChange()` (grep `function onDashboardClassChange`), after the existing call to `loadClassOverview(...)`, add:

```js
  renderWordListEditor(groupId);
```

(Use the same groupId variable name that function already uses — read the function first. Also find where the dashboard resets when NO class is selected and clear the container: `document.getElementById('dashboardWordList').innerHTML = '';`)

- [ ] **Step 4: Chip CSS — append to style.css:**

```css
/* ===== Ugens ord (word list editor) ===== */
.wl-chip {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 14px;
  margin: 2px 3px 2px 0;
  font-size: 0.82rem;
  font-weight: 700;
}
.wl-chip.known { background: rgba(34, 211, 160, 0.13); border: 1px solid var(--green); color: var(--green); }
.wl-chip.unknown { background: rgba(245, 166, 35, 0.13); border: 1px solid var(--accent); color: var(--accent); }
```

- [ ] **Step 5: Verify + version bump + commit**

`node --check app.js` → exit 0. Bump version to `v1.10.7`.

```bash
git add app.js index.html style.css
git commit -m "Add teacher word list editor to dashboard"
```

---

### Task 3: Student button + weekly session

**Files:**
- Modify: `app.js` (3 new functions + state + 2 hooks), `index.html` (button + version bump), `style.css` (button style)

- [ ] **Step 1: Add the button in index.html.** Inside `#phase-welcome`, the start button block reads:

```html
  <div style="margin-top:20px;margin-bottom:60px;display:flex;flex-direction:column;align-items:center;gap:8px">
    <button class="btn btn-accent" style="min-width:220px;max-width:320px;width:auto;padding:14px 32px" onclick="startTrainingFromProfile()">&#x1F680; Start stavespil!</button>
  </div>
```

Add the weekly button INSIDE that flex div, after the start button:

```html
    <button class="btn btn-week hidden" id="weeklyWordsBtn" onclick="startWeeklyWordsSession()">&#x1F4DD; Ugens ord<span id="weeklyWordsSub" style="display:block;font-family:'Nunito',sans-serif;font-size:0.72rem;font-weight:600;opacity:0.85"></span></button>
```

- [ ] **Step 2: Button CSS — append to style.css:**

```css
.btn-week {
  min-width: 220px;
  max-width: 320px;
  padding: 12px 32px;
  background: linear-gradient(135deg, var(--accent2), var(--blue));
  color: #fff;
}
```

- [ ] **Step 3: Add state + loader + button updater to app.js**, directly after the `saveWordList` function from Task 2:

```js
var weeklyWordList = null; // { words: [...], groupName: '...' } for the active player

async function loadWeeklyWordList() {
  weeklyWordList = null;
  if (!supabaseClient || !activePlayer) { updateWeeklyWordsButton(); return; }
  try {
    var memberships = await supabaseClient.from('group_members')
      .select('group_id, groups(name)')
      .eq('player', activePlayer).eq('role', 'student');
    if (memberships.error || !memberships.data || memberships.data.length === 0) { updateWeeklyWordsButton(); return; }
    var ids = memberships.data.map(function (m) { return m.group_id; }).sort();
    var lists = await supabaseClient.from('word_lists').select('*').in('group_id', ids);
    if (lists.error || !lists.data) { updateWeeklyWordsButton(); return; }
    // First non-empty list, deterministic by group id (documented simplification)
    lists.data.sort(function (a, b) { return a.group_id < b.group_id ? -1 : 1; });
    for (var i = 0; i < lists.data.length; i++) {
      var row = lists.data[i];
      if (row.words && row.words.length > 0) {
        var m = memberships.data.find(function (mm) { return mm.group_id === row.group_id; });
        weeklyWordList = { words: row.words, groupName: (m && m.groups && m.groups.name) || '' };
        break;
      }
    }
  } catch (e) { console.warn('loadWeeklyWordList fejl:', e); }
  updateWeeklyWordsButton();
}

function updateWeeklyWordsButton() {
  var btn = document.getElementById('weeklyWordsBtn');
  var sub = document.getElementById('weeklyWordsSub');
  if (!btn) return;
  if (weeklyWordList && weeklyWordList.words.length > 0) {
    if (sub) sub.textContent = weeklyWordList.words.length + ' ord fra din lærer' +
      (weeklyWordList.groupName ? ' · ' + weeklyWordList.groupName : '');
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}
```

- [ ] **Step 4: Add `startWeeklyWordsSession()` to app.js**, directly after `updateWeeklyWordsButton`. It mirrors `startTrainingFromProfile` (grep it and compare) but uses exactly the list's words:

```js
function startWeeklyWordsSession() {
  if (!weeklyWordList || !weeklyWordList.words || weeklyWordList.words.length === 0) return;
  hide('phase-results');
  var resultsEl = document.getElementById('resultsContent');
  if (resultsEl) resultsEl.innerHTML = '';
  isMixedSession = true;
  pendingBoss = null;
  sessionLessonCategories = [];
  sessionCorrectCount = 0; sessionCorrectStreak = 0; sessionCategoryErrors = {}; FX.combo.reset();
  sessionBossCount = 0;
  pendingChest = false;
  wrongCountPerWord = {};
  sessionUsedWords = {};
  results = [];
  var startLevels = loadCategoryLevels();
  sessionStartLevels = {};
  for (var slCat in startLevels) sessionStartLevels[slCat] = startLevels[slCat].level;

  var grade = parseInt(localStorage.getItem(playerKey('student_grade')) || '0', 10) || 0;
  var fallbackLevel = Math.min(4, Math.floor(grade / 2));

  var enriched = shuffle(weeklyWordList.words.map(function (raw) {
    var w = findWordInBank(raw);
    if (!w) {
      w = { word: raw, hint: '', patternHint: '', sentence: '', level: fallbackLevel, category: 'Ugens ord' };
    }
    return {
      wordObj: w,
      blanks: generateBlanks(w),
      spItem: buildSpellingPoliceItem(w),
      morphemes: parseMorphemes(w.patternHint, w.word),
      sentenceOk: !!(w.hint && w.level >= 1)
    };
  }));

  // Every list word appears exactly once. Every other slot tries a variation
  // type (round-robin, eligibility-checked); the rest are diktat.
  var variationTypes = ['fillin', 'spellingpolice', 'wordbuilder', 'sentence', 'spellpick'];
  var vi = 0;
  mixedQueue = enriched.map(function (e, idx) {
    var type = 'diktat';
    if (idx % 2 === 1) {
      for (var t = 0; t < variationTypes.length; t++) {
        var cand = variationTypes[(vi + t) % variationTypes.length];
        var ok = (cand === 'spellpick') ||
                 (cand === 'fillin' && !!e.blanks) ||
                 (cand === 'spellingpolice' && !!e.spItem) ||
                 (cand === 'wordbuilder' && !!e.morphemes) ||
                 (cand === 'sentence' && e.sentenceOk);
        if (ok) { type = cand; vi = vi + t + 1; break; }
      }
    }
    return { wordObj: e.wordObj, type: type, blanks: e.blanks, spItem: e.spItem, morphemes: e.morphemes };
  });

  for (var qi = 0; qi < mixedQueue.length; qi++) {
    sessionUsedWords[mixedQueue[qi].wordObj.word.toLowerCase()] = true;
  }
  if (mixedQueue.length === 0) { alert('Ingen ord i ugens liste.'); return; }
  mixedIndex = 0;
  hide('phase-welcome');
  updateRewardBar();
  document.querySelectorAll('.session-badge').forEach(function (el) { el.remove(); });
  renderMixedItem();
}
```

- [ ] **Step 5: Hook the loader.** Find where player selection finishes and the welcome screen is prepared — the function that calls `renderClassSettings(); updateDashboardButton();` (grep `updateDashboardButton();` — the call site around app.js:305). Add after it:

```js
  loadWeeklyWordList();
```

(It's async fire-and-forget; the button appears when the fetch lands.)

- [ ] **Step 6: Verify + version bump + commit**

`node --check app.js` → exit 0. Bump version to `v1.10.8`.

```bash
git add app.js index.html style.css
git commit -m "Add Ugens ord student button and weekly words session"
```

---

### Task 4: Follow-up column in the class overview

**Files:**
- Modify: `app.js` (`loadClassOverview` + `renderClassOverview`), `index.html` (version bump)

- [ ] **Step 1: Fetch list progress in `loadClassOverview`.** Read the function first (grep `function loadClassOverview`). It builds `studentNames`, runs `Promise.all` fetches, then builds the `students` array and calls `renderClassOverview(groupId, students, timeFilter)`. Add — after the students array is fully built, before the render call:

```js
  // Ugens ord-progress pr. elev (beregnet fra answers — ingen skemaændring)
  var wl = await loadWordList(groupId);
  if (wl && wl.words && wl.words.length > 0) {
    var wlAnswers = await supabaseClient.from('answers')
      .select('player, word, correct')
      .in('player', studentNames)
      .in('word', wl.words)
      .gte('created_at', wl.updated_at);
    if (!wlAnswers.error && wlAnswers.data) {
      var byPlayer = {};
      for (var wa = 0; wa < wlAnswers.data.length; wa++) {
        var row = wlAnswers.data[wa];
        var bp = byPlayer[row.player] || (byPlayer[row.player] = { words: {}, total: 0, correct: 0 });
        bp.words[row.word] = true;
        bp.total++;
        if (row.correct) bp.correct++;
      }
      for (var si = 0; si < students.length; si++) {
        var stats = byPlayer[students[si].name];
        students[si].weekly = stats ? {
          attempted: Object.keys(stats.words).length,
          listLength: wl.words.length,
          pct: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
        } : null;
      }
    }
  }
```

(`loadWordList` was added in Task 2. If the variable holding student names differs, adapt to the function's actual name — read before editing.)

- [ ] **Step 2: Render the column.** In `renderClassOverview` (quoted in full below as it exists today — grep `function renderClassOverview`), the header row is:

```js
  html += '<table class="dashboard-table"><thead><tr>' +
    '<th>Navn</th><th>Kl.</th><th>XP</th><th>Rigtige</th><th>Svar</th><th>Sidst aktiv</th><th></th>' +
    '</tr></thead><tbody>';
```

Insert `<th>📝 Ugens ord</th>` between `<th>Svar</th>` and `<th>Sidst aktiv</th>`. Then in the row loop, after the `st.totalAnswers` cell, insert:

```js
      '<td>' + (st.weekly
        ? '<span style="color:' + (st.weekly.pct >= 80 ? 'var(--green)' : st.weekly.pct >= 50 ? 'var(--accent)' : 'var(--red)') + ';font-weight:700">' +
          st.weekly.attempted + '/' + st.weekly.listLength + ' · ' + st.weekly.pct + '%</span>'
        : '<span style="color:var(--muted)">—</span>') + '</td>' +
```

- [ ] **Step 3: Verify + version bump + commit**

`node --check app.js` → exit 0. Bump version to `v1.10.9`.

```bash
git add app.js index.html
git commit -m "Show Ugens ord progress column in class overview"
```

---

### Task 5: Docs + regression checklist

**Files:**
- Modify: `CLAUDE.md`, `index.html` (version bump)

- [ ] **Step 1: Update CLAUDE.md:** add to the Supabase tables section: `word_lists` (group_id unique FK, words jsonb, updated_at — one active list per class). Add a feature bullet under the relevant section: "Ugens ord" — teacher word lists (editor in dashboard, student button on welcome, progress column; known words matched against WORD_BANK, unknown words diktat/spellpick with TTS fallback; new functions `renderWordListEditor`/`saveWordList`/`loadWeeklyWordList`/`startWeeklyWordsSession`).

- [ ] **Step 2: Full manual regression (HUMAN — the spec's checklist):**
1. Teacher: create list with known + unknown words → chips classify → save → reload shows it; edit → `updated_at` bumps; clear+save → row gone, student button disappears.
2. Student in class: button with correct count/name; player without class: no button.
3. Session: all list words exactly once; known words show varied types; unknown only diktat/spellpick; unknown word is spoken (browser TTS); XP/combo/boss/chest work; retraining allowed.
4. Dashboard column: "n/m · pct" after training, "—" before.
5. Offline/Supabase blocked: no button, editor shows alert on save.

- [ ] **Step 3: Final version bump to `v1.11.0` + commit**

```bash
git add CLAUDE.md index.html
git commit -m "Document Ugens ord feature in CLAUDE.md"
```
