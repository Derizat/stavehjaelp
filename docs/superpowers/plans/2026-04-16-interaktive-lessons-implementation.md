# Interaktive trolmand-lessons (Dobbeltkonsonant pilot) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erstatte den nuværende statiske `showLessonPopup` med en interaktiv trolmand-scene for kategorien Dobbeltkonsonant — komplet med scenarie-baserede gåder, slapstick død-animationer ved forkerte svar, og XP-belønning.

**Architecture:** Ren tilføjelse til eksisterende vanilla JS-app — ingen build step, ingen frameworks. Wizard-system bor i `app.js` ved siden af eksisterende `CATEGORY_LESSONS`. CSS i `style.css`. HTML overlay genereres dynamisk (samme pattern som eksisterende `lessonOverlay`). `showLessonPopup` udvides til at delegere til `showWizardLesson` hvis kategorien har scenarier i `WIZARD_SCENARIOS`.

**Tech Stack:** Vanilla JavaScript (ES5-stil — `var`, function declarations, ingen arrow functions i state-kode for at matche kodebasen). CSS3 keyframes for animationer. localStorage for scenarie-rotation.

**Test approach:** Projektet har ingen automatiserede tests. Hver task slutter med en konkret manuel verifikation i browseren via test-knappen i welcome-settings.

**Spec reference:** `docs/superpowers/specs/2026-04-16-interaktive-lessons-design.md`

---

## File Structure

| Fil | Hvad |
|---|---|
| `app.js` | Hele wizard-systemet (~300 nye linjer). Tilføjes som ny sektion lige efter eksisterende `dismissLessonPopup` (omkring linje 1024). `showLessonPopup` modificeres til at delegere. |
| `style.css` | Ny sektion `/* === Wizard lesson === */` i bunden af filen. ~150 linjer CSS med keyframes for animationer og death-effekter. |
| `index.html` | Ny test-knap-boks i settings-panel (efter "Test boss-kampe", før "Klasser"). ~12 linjer HTML. |

Ingen nye filer oprettes.

---

## Task 1: Tilføj scenarie-data og test-knap

**Files:**
- Modify: `app.js` (ny sektion efter `dismissLessonPopup`, omkring linje 1024)
- Modify: `index.html` (ny test-knap-boks i settings, efter linje 145)

- [ ] **Step 1: Tilføj WIZARD_SCENARIOS objektet i app.js**

Find linjen `function dismissLessonPopup() {` (omkring linje 1018-1022) og indsæt følgende EFTER `var pendingLesson = false;` linjen (omkring linje 1024):

```javascript

// ===== WIZARD LESSONS (interaktiv trolmand) =====

var WIZARD_SCENARIOS = {
  "Dobbeltkonsonant": [
    {
      setup: "Jeg vil lave en kage til min f\u00F8dselsdag.",
      riddle: "I opskriften st\u00E5r et ord \u2014 hvilken stavem\u00E5de er rigtig?",
      options: ["bage", "bagge"],
      correct: 0,
      reveal: "Det rigtige er BAGE. Vokalen 'a' er LANG (baaaa-ge), s\u00E5 enkelt 'g'. Hvis det var hop-pe, ville 'o' v\u00E6re kort og vi skulle have dobbelt p."
    },
    {
      setup: "Jeg vil sidde p\u00E5 min stol og slappe af.",
      riddle: "Skal jeg skrive 'sidde' eller 'side' i min dagbog?",
      options: ["sidde", "side"],
      correct: 0,
      reveal: "AHA \u2014 jeg vil SIDDE (kort 'i' \u2192 dobbelt d). En SIDE er noget helt andet (en side i en bog)!"
    },
    {
      setup: "Jeg er ved at koge vand til min te.",
      riddle: "Hvilken stavem\u00E5de af 'koppe' er rigtig?",
      options: ["koppe", "kope"],
      correct: 0,
      reveal: "KOPPE er rigtigt \u2014 kort 'o' s\u00E5 dobbelt p. T\u00E6nk p\u00E5 lyden: 'kop-pe', ikke 'koo-pe'."
    },
    {
      setup: "Min ven sp\u00F8rger hvad jeg hedder.",
      riddle: "Skal jeg skrive 'jeg hedder' eller 'jeg heder'?",
      options: ["hedder", "heder"],
      correct: 0,
      reveal: "HEDDER er rigtigt \u2014 kort 'e' s\u00E5 dobbelt d. En HEDE er forresten et landskab med lyng \u2014 helt andet ord!"
    },
    {
      setup: "Der er en MASSE \u00E6bler i tr\u00E6et.",
      riddle: "Skal jeg skrive 'masse' eller 'mase'?",
      options: ["masse", "mase"],
      correct: 0,
      reveal: "MASSE betyder mange \u2014 kort 'a' s\u00E5 dobbelt s. At MASE er noget andet (presse p\u00E5)!"
    },
    {
      setup: "Jeg elsker at hoppe p\u00E5 trampolin.",
      riddle: "Hvordan staves det?",
      options: ["hoppe", "hope"],
      correct: 0,
      reveal: "HOPPE \u2014 kort 'o' s\u00E5 dobbelt p. Tip: f\u00F8les vokalen 'o' kort eller lang? Kort = dobbelt."
    },
    {
      setup: "B\u00F8rnene klapper i takt til musikken.",
      riddle: "Hvordan staves grundformen?",
      options: ["klappe", "klape"],
      correct: 0,
      reveal: "KLAPPE \u2014 kort 'a' s\u00E5 dobbelt p. Pr\u00F8v at sige det langsomt: klap-pe."
    },
    {
      setup: "Jeg vil slikke is en hel time!",
      riddle: "Hvordan staves det?",
      options: ["slikke", "slike"],
      correct: 0,
      reveal: "SLIKKE \u2014 kort 'i' s\u00E5 dobbelt k. Lang vokal som i 'rige' ville v\u00E6re enkelt."
    }
  ]
};

// State for nuv\u00E6rende wizard-session
var wizardCurrentScenario = null;
var wizardCurrentCategory = null;
var wizardPhase = null;
var wizardTries = 0;
var wizardFirstTryCorrect = false;
var wizardDoorOrder = [0, 1];
var wizardLastDeath = null;

function showWizardLesson(category) {
  console.log('[wizard] showWizardLesson called for', category);
  // Stub \u2014 udfyldes i senere tasks
}
```

- [ ] **Step 2: Tilføj test-knap i index.html**

Find blokken `<div style="background:var(--card2)..."><span style="font-size:1.2rem">&#x1F47E;</span>` (Test boss-kampe blokken, omkring linje 130-145). Indsæt FØLGENDE BLOK efter `</div>` der lukker boss-kampe-blokken (efter linje 145), FØR linjen `<div style="background:var(--card2)...><span>...</span><strong>...Klasser</strong>`:

```html
    <div style="background:var(--card2);border-radius:12px;padding:14px 16px;border:1px solid #3d4270;margin-top:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:1.2rem">&#x1F9D9;&#x200D;&#x2642;&#xFE0F;</span>
        <strong style="font-size:0.9rem">Test trolmand-lesson</strong>
        <span style="font-size:0.7rem;color:var(--muted)">(udvikling)</span>
      </div>
      <button class="btn btn-full" onclick="showWizardLesson('Dobbeltkonsonant')" style="background:#3d4270;color:var(--text);font-size:0.85rem;padding:10px">&#x1F9D9;&#x200D;&#x2642;&#xFE0F; \u00C5bn Dobbeltkonsonant-lesson</button>
    </div>
```

- [ ] **Step 3: Verificer i browser**

Åbn `index.html` i browseren. Vælg/opret en spiller for at komme til welcome-skærmen. Klik "⚙️ Indstillinger". Scroll ned til "🧙‍♂️ Test trolmand-lesson"-boksen og klik knappen. Åbn DevTools console.

Forventet output: `[wizard] showWizardLesson called for Dobbeltkonsonant`. Ingen fejl.

- [ ] **Step 4: Commit**

```bash
git add app.js index.html
git commit -m "$(cat <<'EOF'
Wizard lesson: scenarie-data + stub-funktion + test-knap

Tilføjer WIZARD_SCENARIOS objekt med 8 hånd-skrevne scenarier til
Dobbeltkonsonant. Inkluderer 3 minimale par (sidde/side, hedde/hede,
masse/mase) hvor begge stavemåder er rigtige danske ord.

Test-knap i welcome-settings kalder showWizardLesson direkte for
hurtig udvikling.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Render overlay + intro-fase

**Files:**
- Modify: `app.js` (udvid `showWizardLesson`, tilføj render-helpers)
- Modify: `style.css` (ny sektion i bunden)

- [ ] **Step 1: Tilføj CSS for overlay og card**

Tilføj følgende sektion i bunden af `style.css`:

```css

/* === Wizard lesson === */
.wizard-overlay {
  position: fixed; inset: 0;
  background: rgba(13, 15, 38, 0.85);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
  opacity: 0;
  animation: wizard-overlay-in 250ms ease-out forwards;
}
@keyframes wizard-overlay-in {
  to { opacity: 1; }
}
.wizard-overlay.fading-out {
  animation: wizard-overlay-out 250ms ease-out forwards;
}
@keyframes wizard-overlay-out {
  to { opacity: 0; }
}

.wizard-card {
  background: var(--card);
  border-radius: 16px;
  padding: 20px;
  max-width: 420px;
  width: calc(100% - 32px);
  border: 2px solid var(--accent);
  box-shadow: 0 8px 32px rgba(124, 58, 237, 0.3);
  transform: translateY(40px);
  animation: wizard-card-in 350ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  animation-delay: 100ms;
}
@keyframes wizard-card-in {
  to { transform: translateY(0); }
}

.wizard-header {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--accent);
  text-align: center;
  margin-bottom: 12px;
  font-weight: 700;
}

.wizard-stage {
  display: flex; align-items: flex-start; gap: 12px;
  min-height: 140px;
  margin-bottom: 16px;
  position: relative;
}

.wizard-character {
  font-size: 4rem;
  flex-shrink: 0;
  transform: translateX(-100px) scale(0.7);
  opacity: 0;
  animation: wizard-char-in 400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  animation-delay: 300ms;
  filter: drop-shadow(0 4px 12px rgba(124, 58, 237, 0.5));
}
@keyframes wizard-char-in {
  to { transform: translateX(0) scale(1); opacity: 1; }
}
.wizard-character.idle {
  animation: wizard-float 2.4s ease-in-out infinite alternate;
}
@keyframes wizard-float {
  from { transform: translateY(0); }
  to { transform: translateY(-6px); }
}

.wizard-speech {
  background: rgba(255, 255, 255, 0.95);
  color: var(--bg);
  padding: 12px 16px;
  border-radius: 14px;
  border: 2px solid var(--accent2);
  font-size: 0.92rem;
  line-height: 1.5;
  font-weight: 600;
  position: relative;
  flex: 1;
  opacity: 0;
  transform: scale(0);
  animation: wizard-speech-in 250ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  animation-delay: 700ms;
}
.wizard-speech::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 20px;
  width: 0; height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-right: 10px solid var(--accent2);
}
@keyframes wizard-speech-in {
  to { opacity: 1; transform: scale(1); }
}
.wizard-speech.text-changing {
  animation: wizard-speech-pulse 400ms ease-out;
}
@keyframes wizard-speech-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.03); }
  100% { transform: scale(1); }
}
```

- [ ] **Step 2: Implementér showWizardLesson + intro-fase**

Erstat hele stub-funktionen `function showWizardLesson(category) { ... }` i app.js med:

```javascript
function showWizardLesson(category) {
  var scenarios = WIZARD_SCENARIOS[category];
  if (!scenarios || scenarios.length === 0) {
    console.warn('[wizard] No scenarios for', category, '\u2014 falling back to legacy popup');
    showLessonPopup(category); // fallback (vil aldrig kalde os igen pga. delegation \u2014 se Task 9)
    return;
  }

  // V\u00E6lg scenarie (simpel for nu \u2014 rotation tilf\u00F8jes i Task 8)
  wizardCurrentScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  wizardCurrentCategory = category;
  wizardPhase = 'intro';
  wizardTries = 0;
  wizardFirstTryCorrect = false;

  // Shuffle d\u00F8r-position s\u00E5 rigtigt ord ikke altid er venstre
  wizardDoorOrder = Math.random() < 0.5 ? [0, 1] : [1, 0];

  renderWizardOverlay();
  pendingLesson = true;

  // Auto-overgang til riddle efter 2.5s
  setTimeout(function() {
    if (wizardPhase === 'intro') wizardTransitionTo('riddle');
  }, 2500);
}

function renderWizardOverlay() {
  var overlay = document.getElementById('wizardOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'wizardOverlay';
    overlay.className = 'wizard-overlay';
    document.body.appendChild(overlay);
  } else {
    overlay.className = 'wizard-overlay';
  }

  var html = '<div class="wizard-card">';
  html += '<div class="wizard-header">\u{1F9D9}\u200D\u2642\uFE0F Trolmandens g\u00E5de</div>';
  html += '<div class="wizard-stage">';
  html += '<div class="wizard-character" id="wizardChar">\u{1F9D9}\u200D\u2642\uFE0F</div>';
  html += '<div class="wizard-speech" id="wizardSpeech">' + escapeHtml(wizardCurrentScenario.setup) + '</div>';
  html += '</div>';
  html += '<div class="wizard-doors" id="wizardDoors"></div>';
  html += '<div class="wizard-footer" id="wizardFooter"></div>';
  html += '</div>';

  overlay.innerHTML = html;

  // Aktiver idle-float p\u00E5 karakter efter intro-animation
  setTimeout(function() {
    var ch = document.getElementById('wizardChar');
    if (ch) ch.classList.add('idle');
  }, 750);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wizardTransitionTo(phase) {
  wizardPhase = phase;
  // Stub \u2014 udvides i senere tasks
  console.log('[wizard] Transition to phase:', phase);
}
```

- [ ] **Step 3: Verificer i browser**

Genindlæs siden, klik test-knappen. Forventet:
- Mørkt overlay fader ind
- Wizard-card glider op
- Trolmand-emoji 🧙‍♂️ glider ind fra venstre med bounce
- Tale-boble pop'er ind med "Jeg vil lave en kage til min fødselsdag." (eller et andet scenarie)
- Trolmanden svæver let op/ned (idle-float)
- Efter 2.5s ses i console: `[wizard] Transition to phase: riddle`

Hvis OK, gentag flere gange — hver gang skal et tilfældigt scenarie vises.

Hvis IKKE OK: tjek DevTools console for fejl. Verificer at `WIZARD_SCENARIOS` objektet er korrekt formateret (JSON-validt).

- [ ] **Step 4: Commit**

```bash
git add app.js style.css
git commit -m "$(cat <<'EOF'
Wizard lesson: overlay-render og intro-fase

Implementerer showWizardLesson opening: vælger random scenarie,
renderer overlay med kortet, trolmand-karakter og tale-boble.
CSS-keyframes: overlay fade, card slide-up, character slide-in
fra venstre, speech bubble pop-in, idle floating.

Auto-transition til riddle-fase efter 2.5s (stub).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Render gåde-fase med døre

**Files:**
- Modify: `app.js` (udvid `wizardTransitionTo` med riddle-fase)
- Modify: `style.css` (CSS for døre)

- [ ] **Step 1: Tilføj CSS for døre**

Tilføj i bunden af `style.css` (efter wizard-speech-blokken):

```css
.wizard-doors {
  display: flex; gap: 12px;
  margin-bottom: 12px;
}

.wizard-door {
  flex: 1;
  background: var(--card2);
  border: 2px solid var(--accent2);
  color: var(--text);
  padding: 18px 12px;
  border-radius: 14px;
  font-family: 'Fredoka One', cursive;
  font-size: 1.4rem;
  letter-spacing: 1px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s, background 0.2s;
  opacity: 0;
  transform: translateY(20px);
  text-align: center;
}
.wizard-door.appearing {
  animation: wizard-door-in 320ms ease-out forwards;
}
@keyframes wizard-door-in {
  to { opacity: 1; transform: translateY(0); }
}
.wizard-door:hover:not(.disabled) {
  transform: scale(1.03);
  box-shadow: 0 4px 16px rgba(124, 58, 237, 0.4);
  background: var(--card);
}

.wizard-door.disabled {
  opacity: 0.3;
  pointer-events: none;
}

@media (max-width: 340px) {
  .wizard-doors { flex-direction: column; }
}
```

- [ ] **Step 2: Udvid wizardTransitionTo med riddle-fase**

Erstat den eksisterende `function wizardTransitionTo(phase) {` med:

```javascript
function wizardTransitionTo(phase) {
  wizardPhase = phase;

  if (phase === 'riddle') {
    wizardChangeSpeech(wizardCurrentScenario.riddle);
    wizardRenderDoors();
  }
}

function wizardChangeSpeech(newText) {
  var bubble = document.getElementById('wizardSpeech');
  if (!bubble) return;
  bubble.classList.add('text-changing');
  setTimeout(function() {
    bubble.innerHTML = escapeHtml(newText);
  }, 180);
  setTimeout(function() {
    bubble.classList.remove('text-changing');
  }, 400);
}

function wizardRenderDoors() {
  var container = document.getElementById('wizardDoors');
  if (!container) return;
  var html = '';
  for (var i = 0; i < wizardDoorOrder.length; i++) {
    var optIdx = wizardDoorOrder[i];
    var word = wizardCurrentScenario.options[optIdx];
    html += '<button class="wizard-door appearing" data-idx="' + optIdx + '" ';
    html += 'style="animation-delay:' + (i * 100) + 'ms" ';
    html += 'onclick="wizardPickDoor(' + optIdx + ', this)">';
    html += escapeHtml(word) + '</button>';
  }
  container.innerHTML = html;
}

function wizardPickDoor(optIdx, btn) {
  console.log('[wizard] Door picked, idx:', optIdx, 'correct:', wizardCurrentScenario.correct);
  // Stub \u2014 udvides i Task 4 og 5
}
```

- [ ] **Step 3: Verificer i browser**

Genindlæs, klik test-knap. Forventet:
- Intro spiller som før
- Efter 2.5s skifter tale-boble (med "puff"-pulse) til riddle-teksten
- To døre fader ind nedenunder med stagger (venstre først)
- Hover viser glow + scale
- Klik på en dør logger: `[wizard] Door picked, idx: 0, correct: 0`
- Hver gang test-knappen klikkes igen kan dør-rækkefølgen variere (ikke garanteret men forekommer ~50%)

Hvis IKKE OK: tjek at `wizardCurrentScenario.options` er to elementer; tjek at `wizardDoorOrder` er sat.

- [ ] **Step 4: Commit**

```bash
git add app.js style.css
git commit -m "$(cat <<'EOF'
Wizard lesson: gåde-fase med døre

Tale-boble skifter fra setup til riddle med "puff"-animation.
To døre renderes med shuffled position (rigtigt svar ikke altid
venstre) og fader ind med stagger.

Stub click-handler logger valg til console — håndteres i næste task.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rigtigt svar-flow + reveal + XP

**Files:**
- Modify: `app.js` (implementér wizardPickDoor, reveal-fase, done-fase)
- Modify: `style.css` (CSS for correct-flash, reveal, footer)

- [ ] **Step 1: Tilføj CSS for correct-flash, footer og reveal**

Tilføj i bunden af `style.css`:

```css
.wizard-door.correct-flash {
  background: var(--green) !important;
  color: #fff !important;
  border-color: var(--green) !important;
  box-shadow: 0 0 24px var(--green);
  animation: wizard-correct-bounce 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes wizard-correct-bounce {
  0% { transform: scale(1); }
  50% { transform: scale(1.08); }
  100% { transform: scale(1); }
}

.wizard-character.cheer {
  animation: wizard-cheer 600ms ease-out;
}
@keyframes wizard-cheer {
  0% { transform: rotate(0); }
  25% { transform: rotate(-8deg); }
  50% { transform: rotate(8deg); }
  75% { transform: rotate(-4deg); }
  100% { transform: rotate(0); }
}

.wizard-pointer {
  position: absolute;
  font-size: 2rem;
  bottom: 20px;
  opacity: 0;
  animation: wizard-pointer-in 350ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes wizard-pointer-in {
  to { opacity: 1; transform: translateY(-4px); }
}

.wizard-footer {
  text-align: center;
  margin-top: 8px;
  min-height: 48px;
}

.wizard-footer .wizard-done-btn {
  background: var(--accent);
  color: var(--bg);
  border: none;
  padding: 12px 24px;
  border-radius: 10px;
  font-family: 'Fredoka One', cursive;
  font-size: 1rem;
  cursor: pointer;
  opacity: 0;
  animation: wizard-done-in 250ms ease-out forwards;
  animation-delay: 800ms;
}
@keyframes wizard-done-in {
  to { opacity: 1; }
}
.wizard-done-btn:active {
  transform: scale(0.95);
}

.wizard-door.fade-out {
  animation: wizard-door-out 250ms ease-out forwards;
}
@keyframes wizard-door-out {
  to { opacity: 0; transform: scale(0.9); }
}
```

- [ ] **Step 2: Implementér rigtigt-svar-flow**

Erstat den eksisterende `function wizardPickDoor(optIdx, btn) { ... }` med:

```javascript
function wizardPickDoor(optIdx, btn) {
  if (wizardPhase !== 'riddle') return; // ignorer dobbeltklik
  var isCorrect = (optIdx === wizardCurrentScenario.correct);

  if (isCorrect) {
    if (wizardTries === 0) wizardFirstTryCorrect = true;
    wizardHandleCorrect(btn);
  } else {
    wizardHandleWrong(optIdx, btn);
  }
}

function wizardHandleCorrect(btn) {
  wizardPhase = 'correct';
  btn.classList.add('correct-flash');

  var ch = document.getElementById('wizardChar');
  if (ch) {
    ch.classList.remove('idle');
    ch.classList.add('cheer');
    setTimeout(function() {
      ch.classList.remove('cheer');
      ch.classList.add('idle');
    }, 600);
  }

  wizardChangeSpeech(wizardFirstTryCorrect ? 'Perfekt! \u{1F31F}' : 'N\u00E6sten! Kig her...');

  setTimeout(function() { wizardTransitionTo('reveal'); }, 1200);
}

function wizardHandleWrong(optIdx, btn) {
  // Stub \u2014 implementeres i Task 5
  console.log('[wizard] Wrong answer (death animation kommer i Task 5)');
  wizardTries++;
  btn.classList.add('disabled');
}
```

- [ ] **Step 3: Implementér reveal- og done-fase**

Udvid `wizardTransitionTo` (find den nuværende if-else og tilføj de nye phases):

```javascript
function wizardTransitionTo(phase) {
  wizardPhase = phase;

  if (phase === 'riddle') {
    wizardChangeSpeech(wizardCurrentScenario.riddle);
    wizardRenderDoors();
  }
  else if (phase === 'reveal') {
    wizardRenderReveal();
  }
  else if (phase === 'done') {
    wizardComplete();
  }
}

function wizardRenderReveal() {
  // Fade ud forkert d\u00F8r
  var doors = document.querySelectorAll('.wizard-door');
  for (var i = 0; i < doors.length; i++) {
    var idx = parseInt(doors[i].getAttribute('data-idx'), 10);
    if (idx !== wizardCurrentScenario.correct) {
      doors[i].classList.add('fade-out');
      (function(d) { setTimeout(function() { d.style.display = 'none'; }, 260); })(doors[i]);
    }
  }

  // Find positionen af den rigtige d\u00F8r og placer pegefingeren mellem trolmand og d\u00F8r
  var correctDoorPosition = wizardDoorOrder.indexOf(wizardCurrentScenario.correct);
  // Pegefinger emoji (simpel: peger ned mod d\u00F8re)
  var stage = document.querySelector('.wizard-stage');
  if (stage && !document.getElementById('wizardPointer')) {
    var pointer = document.createElement('div');
    pointer.id = 'wizardPointer';
    pointer.className = 'wizard-pointer';
    pointer.style.left = correctDoorPosition === 0 ? '20%' : '70%';
    pointer.innerHTML = '\u{1F447}';
    stage.appendChild(pointer);
  }

  // Skift speech til reveal-tekst
  setTimeout(function() {
    wizardChangeSpeech(wizardCurrentScenario.reveal);
  }, 300);

  // Tilføj "Forst\u00E5et!" knap
  var footer = document.getElementById('wizardFooter');
  if (footer) {
    footer.innerHTML = '<button class="wizard-done-btn" onclick="wizardTransitionTo(\'done\')">Forst\u00E5et! \u{1F4AA}</button>';
  }
}

function wizardComplete() {
  // Tildel XP
  var xpReward = wizardFirstTryCorrect ? 15 : 10;
  if (typeof loadRewardData === 'function' && typeof saveRewardData === 'function') {
    var data = loadRewardData();
    data.totalXP = (data.totalXP || 0) + xpReward;
    data.todayXP = (data.todayXP || 0) + xpReward;
    saveRewardData(data);
    if (typeof updateRewardBar === 'function') updateRewardBar();
    if (typeof showRewardFloat === 'function') showRewardFloat('+' + xpReward + ' XP \u2728');
  }

  // Fade ud overlay
  var overlay = document.getElementById('wizardOverlay');
  if (overlay) {
    overlay.classList.add('fading-out');
    setTimeout(function() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 280);
  }

  pendingLesson = false;

  // Reset state
  wizardCurrentScenario = null;
  wizardPhase = null;
}
```

- [ ] **Step 4: Verificer i browser**

Genindlæs, klik test-knap, vælg det RIGTIGE ord på første forsøg. Forventet:
- Den rigtige dør glow grøn med bounce
- Trolmand wiggler
- Tale-boble skifter til "Perfekt! 🌟"
- Efter 1.2s: forkert dør fader ud, 👇 emoji vises over rigtige dør, tale-boble skifter til reveal-teksten
- "Forstået! 💪" knap fader ind nederst
- Klik knappen: overlay fader ud, +15 XP vises i top-bar

Genindlæs og prøv igen. Verificer ny scenarie ofte vælges (random) og at flow gentages.

- [ ] **Step 5: Commit**

```bash
git add app.js style.css
git commit -m "$(cat <<'EOF'
Wizard lesson: rigtigt svar, reveal og XP-belønning

Korrekt klik: dør glow grøn med bounce, trolmand wiggler.
Reveal-fase: forkert dør fader ud, pegefinger emoji peger på
rigtigt svar, speech skifter til forklaring.

Forstået-knap fader ind, klik tildeler 15 XP (første forsøg) eller
10 XP via eksisterende showRewardFloat-pipeline. Overlay fader ud.

Wrong-svar er stadig stub — håndteres i næste task.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Forkert svar + retry + første død-animation (ambolt)

**Files:**
- Modify: `app.js` (implementér wizardHandleWrong + ambolt)
- Modify: `style.css` (CSS for wrong-flash, ambolt-effekt)

- [ ] **Step 1: Tilføj CSS for wrong-flash og ambolt-effekt**

Tilføj i bunden af `style.css`:

```css
.wizard-door.wrong-flash {
  background: rgba(244, 63, 94, 0.3) !important;
  border-color: var(--red) !important;
  animation: wizard-shake 400ms ease-out;
}
@keyframes wizard-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}

.wizard-character.flat {
  font-size: 2rem !important;
  filter: brightness(0.7);
  transform: scaleY(0.3) scaleX(1.4);
  transition: transform 200ms ease-out, font-size 200ms;
}

.wizard-effect-overlay {
  position: absolute;
  pointer-events: none;
}

/* Ambolt-fald */
.wizard-anvil {
  position: absolute;
  font-size: 3rem;
  left: 5px;
  top: -200px;
  animation: wizard-anvil-fall 300ms cubic-bezier(0.7, 0, 1, 0.5) forwards;
  animation-delay: 600ms;
}
@keyframes wizard-anvil-fall {
  to { top: 30px; }
}

.wizard-warning {
  position: absolute;
  font-size: 1.5rem;
  left: 18px;
  top: -30px;
  animation: wizard-warning-blink 600ms steps(6) forwards;
}
@keyframes wizard-warning-blink {
  0%, 33%, 66% { opacity: 1; }
  16%, 50%, 83%, 100% { opacity: 0; }
}

.wizard-stars {
  position: absolute;
  left: 0; top: 30px;
  width: 80px; text-align: center;
  font-size: 1.2rem;
  opacity: 0;
  animation: wizard-stars-pop 800ms ease-out forwards;
  animation-delay: 900ms;
}
@keyframes wizard-stars-pop {
  0% { opacity: 0; transform: scale(0.5); }
  30% { opacity: 1; transform: scale(1.2); }
  100% { opacity: 0; transform: scale(1); }
}
```

- [ ] **Step 2: Implementér wrong-flow med ambolt-død**

Erstat den eksisterende stub `function wizardHandleWrong(optIdx, btn) { ... }` med:

```javascript
function wizardHandleWrong(optIdx, btn) {
  wizardPhase = 'wrong-1';
  wizardTries++;

  // Marker d\u00F8r som forkert + disabled
  btn.classList.add('wrong-flash', 'disabled');

  // Trigger d\u00F8d-animation (kun ambolt for nu \u2014 flere i Task 6)
  wizardTriggerDeath('anvil');

  // Skift speech midlertidigt
  wizardChangeSpeech('Hov hov hov...');

  // Efter 1.8s: tilbage til riddle med kun \u00E9n d\u00F8r tilbage
  setTimeout(function() {
    if (wizardPhase !== 'wrong-1') return;
    wizardChangeSpeech(wizardCurrentScenario.riddle);
    wizardPhase = 'riddle'; // tillader klik igen
    wizardClearDeathEffects();
  }, 1800);
}

function wizardTriggerDeath(deathName) {
  var stage = document.querySelector('.wizard-stage');
  var ch = document.getElementById('wizardChar');
  if (!stage || !ch) return;
  wizardLastDeath = deathName;

  if (deathName === 'anvil') {
    // Tilf\u00F8j warning, ambolt og stjerner
    var warning = document.createElement('div');
    warning.className = 'wizard-warning wizard-effect-overlay';
    warning.innerHTML = '\u26A0\uFE0F';
    stage.appendChild(warning);

    var anvil = document.createElement('div');
    anvil.className = 'wizard-anvil wizard-effect-overlay';
    anvil.innerHTML = '\u{1F528}'; // hammer (ambolt-emoji findes ikke standard)
    stage.appendChild(anvil);

    // Trolmanden bliver flad ved impact
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('flat');
      ch.innerHTML = '\u{1F95E}'; // pandekage
    }, 900);

    // Stjerner kredser
    var stars = document.createElement('div');
    stars.className = 'wizard-stars wizard-effect-overlay';
    stars.innerHTML = '\u2B50\u{1F4AB}\u2B50';
    stage.appendChild(stars);
  }
}

function wizardClearDeathEffects() {
  var ch = document.getElementById('wizardChar');
  if (ch) {
    ch.classList.remove('flat');
    ch.innerHTML = '\u{1F9D9}\u200D\u2642\uFE0F';
    ch.classList.add('idle');
  }
  var effects = document.querySelectorAll('.wizard-effect-overlay');
  for (var i = 0; i < effects.length; i++) {
    effects[i].parentNode.removeChild(effects[i]);
  }
}
```

- [ ] **Step 3: Verificer i browser**

Genindlæs, klik test-knap, vælg det FORKERTE ord. Forventet:
- ⚠️ blinker over trolmanden
- 🔨 falder ned
- Trolmanden bliver til 🥞 (fladtrykt)
- ⭐💫⭐ stjerner pop'er op kort
- Tale-boble: "Hov hov hov..."
- Efter ~1.8s: alle effekter forsvinder, trolmand kommer tilbage normalt, tale-boble tilbage til riddle, den anden dør stadig klikbar
- Klik den rigtige dør nu: flow fortsætter til reveal med +10 XP (ikke +15, fordi første forsøg var forkert)

- [ ] **Step 4: Commit**

```bash
git add app.js style.css
git commit -m "$(cat <<'EOF'
Wizard lesson: forkert svar, retry og ambolt-død-animation

Forkert klik: dør shake+rød+disabled, ambolt-effekt med warning,
trolmand bliver flad pandekage med stjerner. Efter 1.8s ryddes
effekterne og spilleren kan vælge den anden dør.

Hvis andet forsøg er rigtigt: +10 XP (ikke +15) i reveal-fase.

Kun ambolt-død implementeret — 7 flere kommer i næste task.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Tilføj 7 flere død-animationer

**Files:**
- Modify: `app.js` (udvid wizardTriggerDeath + tilfældigt valg)
- Modify: `style.css` (CSS for 7 nye effekter)

- [ ] **Step 1: Tilføj CSS for de 7 nye effekter**

Tilføj i bunden af `style.css`:

```css
/* Drage */
.wizard-dragon {
  position: absolute;
  font-size: 3rem;
  right: -80px;
  top: 0;
  animation: wizard-dragon-fly 700ms ease-out forwards;
  animation-delay: 300ms;
}
@keyframes wizard-dragon-fly {
  to { right: 90px; }
}
.wizard-flames {
  position: absolute;
  right: 100px;
  top: 20px;
  font-size: 1.4rem;
  opacity: 0;
  animation: wizard-flames-burst 400ms ease-out forwards;
  animation-delay: 1000ms;
}
@keyframes wizard-flames-burst {
  to { opacity: 1; right: 60px; }
}

/* Lyn */
.wizard-cloud {
  position: absolute;
  font-size: 2rem;
  left: 5px;
  top: -10px;
  opacity: 0;
  animation: wizard-cloud-in 500ms ease-out forwards;
  animation-delay: 200ms;
}
@keyframes wizard-cloud-in {
  to { opacity: 1; }
}
.wizard-bolt {
  position: absolute;
  font-size: 2rem;
  left: 25px;
  top: 20px;
  opacity: 0;
  animation: wizard-bolt-strike 200ms ease-out forwards;
  animation-delay: 700ms;
}
@keyframes wizard-bolt-strike {
  0% { opacity: 0; transform: scaleY(0.5); }
  100% { opacity: 1; transform: scaleY(1); }
}
.wizard-character.zapped {
  filter: invert(1) brightness(1.5);
  animation: wizard-zap-shake 200ms steps(4) 3;
}
@keyframes wizard-zap-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}

/* Banan */
.wizard-banana {
  position: absolute;
  font-size: 1.8rem;
  left: 20px;
  top: 70px;
  opacity: 0;
  animation: wizard-banana-appear 200ms ease-out forwards;
  animation-delay: 400ms;
}
@keyframes wizard-banana-appear {
  to { opacity: 1; }
}
.wizard-character.slipping {
  animation: wizard-slip 800ms cubic-bezier(0.5, 0, 1, 0.5) forwards;
}
@keyframes wizard-slip {
  to { transform: translate(-150px, 80px) rotate(-90deg); opacity: 0.6; }
}

/* UFO */
.wizard-ufo {
  position: absolute;
  font-size: 2.5rem;
  left: 10px;
  top: -60px;
  opacity: 0;
  animation: wizard-ufo-in 500ms ease-out forwards;
  animation-delay: 300ms;
}
@keyframes wizard-ufo-in {
  to { opacity: 1; top: -10px; }
}
.wizard-beam {
  position: absolute;
  left: 25px;
  top: 30px;
  width: 60px;
  height: 80px;
  background: linear-gradient(180deg, rgba(135, 206, 250, 0.6) 0%, transparent 100%);
  opacity: 0;
  animation: wizard-beam-on 300ms ease-out forwards;
  animation-delay: 800ms;
}
@keyframes wizard-beam-on {
  to { opacity: 1; }
}
.wizard-character.abducted {
  animation: wizard-abduct 600ms cubic-bezier(0.5, 0, 1, 0) forwards;
}
@keyframes wizard-abduct {
  to { transform: translateY(-100px) scale(0.3); opacity: 0; }
}

/* Sten */
.wizard-rock {
  position: absolute;
  font-size: 3rem;
  left: 5px;
  top: -180px;
  animation: wizard-rock-fall 300ms cubic-bezier(0.7, 0, 1, 0.5) forwards;
  animation-delay: 500ms;
}
@keyframes wizard-rock-fall {
  to { top: 30px; }
}

/* Spøgelse */
.wizard-ghost {
  position: absolute;
  font-size: 2rem;
  right: 90px;
  top: 0;
  opacity: 0;
  animation: wizard-ghost-pop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  animation-delay: 400ms;
}
@keyframes wizard-ghost-pop {
  to { opacity: 1; transform: scale(1.2) translateX(-30px); }
}
.wizard-character.scared {
  animation: wizard-scared 600ms ease-out;
}
@keyframes wizard-scared {
  0% { transform: translateY(0); }
  20% { transform: translateY(-30px) scale(1.2); }
  60% { transform: translateY(0) scale(1); }
  100% { transform: translateY(0); }
}

/* Eksplosion */
.wizard-spark {
  position: absolute;
  font-size: 1.5rem;
  left: 30px;
  top: 30px;
  opacity: 0;
  animation: wizard-spark-fizz 400ms ease-out forwards;
  animation-delay: 200ms;
}
@keyframes wizard-spark-fizz {
  to { opacity: 1; transform: scale(1.3); }
}
.wizard-boom {
  position: absolute;
  font-size: 4rem;
  left: 0;
  top: 0;
  opacity: 0;
  animation: wizard-boom 400ms ease-out forwards;
  animation-delay: 700ms;
}
@keyframes wizard-boom {
  0% { opacity: 0; transform: scale(0); }
  50% { opacity: 1; transform: scale(1.5); }
  100% { opacity: 0; transform: scale(1.2); }
}
.wizard-character.charred {
  filter: brightness(0.3);
}
```

- [ ] **Step 2: Udvid wizardTriggerDeath med 7 nye animationer**

Erstat den eksisterende `function wizardTriggerDeath(deathName) { ... }` med (behold ambolt-koden, tilføj de 7 nye):

```javascript
var WIZARD_DEATHS = ['anvil', 'dragon', 'lightning', 'banana', 'ufo', 'rock', 'ghost', 'explosion'];

function pickWizardDeath() {
  var pool = WIZARD_DEATHS.filter(function(d) { return d !== wizardLastDeath; });
  return pool[Math.floor(Math.random() * pool.length)];
}

function wizardTriggerDeath(deathName) {
  var stage = document.querySelector('.wizard-stage');
  var ch = document.getElementById('wizardChar');
  if (!stage || !ch) return;
  wizardLastDeath = deathName;

  if (deathName === 'anvil') {
    var warning = document.createElement('div');
    warning.className = 'wizard-warning wizard-effect-overlay';
    warning.innerHTML = '\u26A0\uFE0F';
    stage.appendChild(warning);
    var anvil = document.createElement('div');
    anvil.className = 'wizard-anvil wizard-effect-overlay';
    anvil.innerHTML = '\u{1F528}';
    stage.appendChild(anvil);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('flat');
      ch.innerHTML = '\u{1F95E}';
    }, 900);
    var stars = document.createElement('div');
    stars.className = 'wizard-stars wizard-effect-overlay';
    stars.innerHTML = '\u2B50\u{1F4AB}\u2B50';
    stage.appendChild(stars);
  }
  else if (deathName === 'dragon') {
    var dragon = document.createElement('div');
    dragon.className = 'wizard-dragon wizard-effect-overlay';
    dragon.innerHTML = '\u{1F409}';
    stage.appendChild(dragon);
    var flames = document.createElement('div');
    flames.className = 'wizard-flames wizard-effect-overlay';
    flames.innerHTML = '\u{1F525}\u{1F525}\u{1F525}';
    stage.appendChild(flames);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('charred');
    }, 1200);
  }
  else if (deathName === 'lightning') {
    var cloud = document.createElement('div');
    cloud.className = 'wizard-cloud wizard-effect-overlay';
    cloud.innerHTML = '\u2601\uFE0F';
    stage.appendChild(cloud);
    var bolt = document.createElement('div');
    bolt.className = 'wizard-bolt wizard-effect-overlay';
    bolt.innerHTML = '\u26A1';
    stage.appendChild(bolt);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('zapped');
    }, 700);
  }
  else if (deathName === 'banana') {
    var banana = document.createElement('div');
    banana.className = 'wizard-banana wizard-effect-overlay';
    banana.innerHTML = '\u{1F34C}';
    stage.appendChild(banana);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('slipping');
    }, 600);
  }
  else if (deathName === 'ufo') {
    var ufo = document.createElement('div');
    ufo.className = 'wizard-ufo wizard-effect-overlay';
    ufo.innerHTML = '\u{1F6F8}';
    stage.appendChild(ufo);
    var beam = document.createElement('div');
    beam.className = 'wizard-beam wizard-effect-overlay';
    stage.appendChild(beam);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('abducted');
    }, 1100);
  }
  else if (deathName === 'rock') {
    var rock = document.createElement('div');
    rock.className = 'wizard-rock wizard-effect-overlay';
    rock.innerHTML = '\u{1FAA8}';
    stage.appendChild(rock);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('flat');
      ch.innerHTML = '\u{1F95E}';
    }, 800);
  }
  else if (deathName === 'ghost') {
    var ghost = document.createElement('div');
    ghost.className = 'wizard-ghost wizard-effect-overlay';
    ghost.innerHTML = '\u{1F47B}';
    stage.appendChild(ghost);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('scared');
      ch.innerHTML = '\u{1F628}';
    }, 800);
  }
  else if (deathName === 'explosion') {
    var spark = document.createElement('div');
    spark.className = 'wizard-spark wizard-effect-overlay';
    spark.innerHTML = '\u2728';
    stage.appendChild(spark);
    var boom = document.createElement('div');
    boom.className = 'wizard-boom wizard-effect-overlay';
    boom.innerHTML = '\u{1F4A5}';
    stage.appendChild(boom);
    setTimeout(function() {
      ch.classList.remove('idle');
      ch.classList.add('charred');
      ch.innerHTML = '\u{1F92F}';
    }, 1100);
  }
}
```

- [ ] **Step 3: Brug pickWizardDeath() i wrong-handler**

Find linjen `wizardTriggerDeath('anvil');` i `wizardHandleWrong` og udskift den med:

```javascript
  wizardTriggerDeath(pickWizardDeath());
```

- [ ] **Step 4: Udvid wizardClearDeathEffects til at rydde alle classes**

Erstat den eksisterende `function wizardClearDeathEffects() { ... }` med:

```javascript
function wizardClearDeathEffects() {
  var ch = document.getElementById('wizardChar');
  if (ch) {
    ch.classList.remove('flat', 'charred', 'zapped', 'slipping', 'abducted', 'scared');
    ch.style.transform = '';
    ch.style.filter = '';
    ch.innerHTML = '\u{1F9D9}\u200D\u2642\uFE0F';
    ch.classList.add('idle');
  }
  var effects = document.querySelectorAll('.wizard-effect-overlay');
  for (var i = 0; i < effects.length; i++) {
    effects[i].parentNode.removeChild(effects[i]);
  }
}
```

- [ ] **Step 5: Verificer i browser**

Genindlæs siden. Kør test-knappen mindst 8 gange og vælg forkert hver gang. Verificer:
- Hver gang ses en *anden* død-animation (ingen direkte gentagelse)
- Alle 8 animationer (ambolt, drage, lyn, banan, UFO, sten, spøgelse, eksplosion) ses over flere kørsler
- Efter hver: trolmanden kommer tilbage til normal og spilleren kan vælge den anden dør
- Ingen visual artefakter eller hængende elementer

Hvis en specifik animation hænger eller ser dårlig ud: noter den, juster CSS-timing eller emoji-valg, commit som hotfix.

- [ ] **Step 6: Commit**

```bash
git add app.js style.css
git commit -m "$(cat <<'EOF'
Wizard lesson: 7 ekstra død-animationer + tilfældigt valg

Tilføjer 7 nye slapstick-død til pool: drage med flammer, lyn fra
sky, banan-skred, UFO-bortførelse, kæmpesten, spøgelse-skræk og
selvfremkaldt eksplosion. Hver er CSS-only.

pickWizardDeath() vælger uniformt fra 8 muligheder eksklusiv senest
viste, så barnet ikke ser samme to gange i træk.

wizardClearDeathEffects rydder alle midlertidige classes så trolmand
kommer tilbage til normal tilstand mellem forsøg.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Scenarie-rotation med localStorage

**Files:**
- Modify: `app.js` (udvid scenarie-valg + tilføj rotations-helpers)

- [ ] **Step 1: Tilføj rotations-helpers**

Indsæt FØR `function showWizardLesson(category) {` følgende helpers:

```javascript
function loadWizardRecent() {
  if (typeof activePlayer === 'undefined' || !activePlayer) return {};
  try {
    var raw = localStorage.getItem(playerKey('wizard_recent'));
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function saveWizardRecent(data) {
  if (typeof activePlayer === 'undefined' || !activePlayer) return;
  try { localStorage.setItem(playerKey('wizard_recent'), JSON.stringify(data)); } catch(e) {}
}

function pickScenarioForCategory(category) {
  var scenarios = WIZARD_SCENARIOS[category] || [];
  if (scenarios.length === 0) return null;
  if (scenarios.length === 1) return { scenario: scenarios[0], index: 0 };

  var recent = loadWizardRecent();
  var recentList = recent[category] || [];

  // Filtrer scenarier der ikke er i recent
  var available = [];
  for (var i = 0; i < scenarios.length; i++) {
    if (recentList.indexOf(i) === -1) available.push(i);
  }
  // Hvis alle er recente, nulstil
  if (available.length === 0) {
    recentList = [];
    available = scenarios.map(function(_, i) { return i; });
  }

  var pickedIdx = available[Math.floor(Math.random() * available.length)];

  // Opdater recent (max 3)
  recentList.push(pickedIdx);
  if (recentList.length > 3) recentList = recentList.slice(-3);
  recent[category] = recentList;
  saveWizardRecent(recent);

  return { scenario: scenarios[pickedIdx], index: pickedIdx };
}
```

- [ ] **Step 2: Brug pickScenarioForCategory i showWizardLesson**

Find linjen i `showWizardLesson`:

```javascript
  wizardCurrentScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
```

og udskift den med:

```javascript
  var picked = pickScenarioForCategory(category);
  if (!picked) {
    console.warn('[wizard] No scenario could be picked for', category);
    return;
  }
  wizardCurrentScenario = picked.scenario;
```

- [ ] **Step 3: Verificer i browser**

Genindlæs. Klik test-knappen 4 gange i træk og noter hvilket scenarie der vises hver gang. Forventet:
- De første 3-4 kørsler viser FORSKELLIGE scenarier (ingen gentagelse)
- I DevTools kan du verificere localStorage:

```js
JSON.parse(localStorage.getItem(activePlayer + '_wizard_recent'))
// Forventet: {"Dobbeltkonsonant":[3,7,2]} eller lignende — array af op til 3 indices
```

- Efter at have set ALLE 8 scenarier nulstilles listen automatisk

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
Wizard lesson: scenarie-rotation via localStorage

pickScenarioForCategory vælger uniformt fra scenarier som ikke er
i seneste-3-listen. Når alle er set, nulstilles listen og vi starter
forfra.

Per-spiller localStorage-nøgle: {player}_wizard_recent.

Sikrer at spilleren ikke får samme scenarie 2-3 gange i træk uden
at gøre rotationen for streng.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire up til triggerCategoryLesson (delegation fra showLessonPopup)

**Files:**
- Modify: `app.js` (udvid showLessonPopup med delegation)

- [ ] **Step 1: Modificér showLessonPopup**

Find funktionen `function showLessonPopup(category) {` (omkring linje 984) og tilføj DELEGATION som første handling i funktionen — INDSÆT lige efter `function showLessonPopup(category) {` linjen og FØR den eksisterende `var lesson = CATEGORY_LESSONS[category]; if (!lesson) return;`:

```javascript
  // Delegation: hvis kategorien har wizard-scenarier, brug det interaktive flow
  if (typeof WIZARD_SCENARIOS !== 'undefined' && WIZARD_SCENARIOS[category] && WIZARD_SCENARIOS[category].length > 0) {
    showWizardLesson(category);
    return;
  }
```

Den fulde start af funktionen skal nu se sådan ud:

```javascript
function showLessonPopup(category) {
  // Delegation: hvis kategorien har wizard-scenarier, brug det interaktive flow
  if (typeof WIZARD_SCENARIOS !== 'undefined' && WIZARD_SCENARIOS[category] && WIZARD_SCENARIOS[category].length > 0) {
    showWizardLesson(category);
    return;
  }

  var lesson = CATEGORY_LESSONS[category];
  if (!lesson) return;
  // ... resten uændret
```

- [ ] **Step 2: Verificer trigger-flow i browser**

Dette er det mest realistiske test. I browseren:

1. Åbn DevTools console.
2. Vælg/opret spiller, gå til welcome.
3. Kør følgende JavaScript i console for at simulere 3 fejl i Dobbeltkonsonant:

```javascript
sessionLessonCategories = [];
var levels = loadCategoryLevels();
levels['Dobbeltkonsonant'] = { level: 1, history: [false, false, false] };
saveCategoryLevels(levels);
checkLessonTrigger('Dobbeltkonsonant');
```

Forventet: trolmand-overlay popper op (ikke den gamle popup).

4. Test med en anden kategori uden wizard-scenarier:

```javascript
sessionLessonCategories = [];
var levels = loadCategoryLevels();
levels['Stumme bogstaver'] = { level: 1, history: [false, false, false] };
saveCategoryLevels(levels);
checkLessonTrigger('Stumme bogstaver');
```

Forventet: den GAMLE statiske popup vises (ikke wizard).

5. Lav en rigtig blandet træning hvor du svarer forkert på dobbeltkonsonant-ord 3 gange — verificer at wizard popper op midt i sessionen og at træningen fortsætter efter "Forstået!".

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
Wizard lesson: wire up til trigger-flow

showLessonPopup delegerer til showWizardLesson hvis kategorien har
WIZARD_SCENARIOS — ellers fald tilbage til den eksisterende statiske
popup.

3-fejls-trigger i blandet træning aktiverer nu wizard for
Dobbeltkonsonant. Andre 8 kategorier får uændret oplevelse indtil
deres scenarier hånd-skrives.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Polish, version bump og afsluttende test

**Files:**
- Modify: `index.html` (bump version)
- Modify: `app.js` (eventuel oprydning)

- [ ] **Step 1: Verificer hele flowet end-to-end**

Lav en fuld blandet træning og:
- Sørg for at lave 3 fejl i Dobbeltkonsonant for at trigge wizard
- Vælg rigtigt på første forsøg → +15 XP
- Lav en ny session, lav 3 fejl, vælg forkert → se død-animation → vælg rigtigt → +10 XP
- Verificer at træningen fortsætter normalt efter "Forstået!"
- Verificer at boss-kampe og skattekister stadig trigges normalt
- Test på lille skærm (DevTools mobile mode 375x667): doors skal stadig fungere

- [ ] **Step 2: Bump version i index.html**

Find linjen:

```html
<div class="logo" onclick="goHome()" style="cursor:pointer">&#x1F98A; Stavehjælpen - v1.9.6</div>
```

Erstat versionen med næste patch (`v1.9.7` eller hvad der er aktuelt på det tidspunkt — tjek først nuværende version i `index.html`).

- [ ] **Step 3: Commit + push**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Bump version: interaktive trolmand-lessons live (vX.Y.Z)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin v2
```

- [ ] **Step 4: Afsluttende sanity-check i browser**

Åbn den deployerede app (eller kør lokal). Test trolmand mindst 5 gange. Bekræft:
- Ingen console-fejl
- Animationer flydende på desktop
- Animationer flydende på mobil
- Test-knappen virker
- Trigger fra rigtig blandet træning virker
- Andre kategoriers gamle popup uændret

Hvis alt OK: piloten er klar til feedback fra brugere. Test-knappen forbliver synlig under feedback-fasen — fjernes i en senere commit når formatet er valideret.

---

## Out of scope (efterfølgende arbejde)

- Hånd-skrive scenarier for de 8 andre kategorier (~30-40 stk) — separat plan når pilot er valideret
- Lyd-effekter (whoops/ding) — kan tilføjes senere som valgfri toggle
- Fjernelse af test-knap når pilot går live (én simpel commit)
- A/B-måling af engagement vs gammel popup — ikke nødvendigt for v1
