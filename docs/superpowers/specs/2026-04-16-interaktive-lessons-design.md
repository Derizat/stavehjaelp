# Interaktive trolmand-lessons (pilot: Dobbeltkonsonant)

**Status:** Design godkendt 2026-04-16. Klar til implementations-plan.

## Mål

Erstatte den nuværende statiske lesson-popup med en interaktiv mini-scene hvor en trolmand stiller en gåde. Skal både være mere engagerende (sjov, slapstick-humor) og pædagogisk effektiv (scenarier viser reglen i kontekst). Pilot kun for kategorien **Dobbeltkonsonant**; andre 8 kategorier beholder den eksisterende popup indtil piloten er valideret.

## Brugerflow

1. **Trigger** — uændret. Spilleren laver 3 fejl i Dobbeltkonsonant under en blandet træning. `pendingLesson = true` → `triggerCategoryLesson('Dobbeltkonsonant')`. Plus ny test-knap på welcome under udvikling.
2. **Intro (~3s)** — Overlay fader ind. 🧙‍♂️ glider ind fra venstre med bounce. Tale-boble pop-in med kort velkomst.
3. **Gåde (~8-12s)** — Tale-boble skifter til scenariets `setup` (kontekst der ikke afslører svaret), så til `riddle` (selve spørgsmålet). To døre fader ind med stagger.
4. **Valg:**
   - **Rigtigt på første forsøg:** Døren glow grøn, trolmand jubler, +15 XP.
   - **Forkert første forsøg:** Tilfældig "death animation" (ambolt, drage, lyn, banan, UFO, sten, spøgelse, eksplosion). Døren disabled. Trolmand kommer sig på 1.5s, retry med kun den anden dør tilbage.
   - **Rigtigt på andet forsøg:** Glow grøn, +10 XP.
5. **Reveal (~10s)** — Forkert dør forsvinder. Trolmand peger på rigtig dør og forklarer reglen via `reveal`-tekst. "Forstået!" knap toner ind.
6. **Afslutning** — Klik → XP tildeles og floats opad, overlay fader ud, træningen fortsætter på næste ord.

Total varighed: 30-60s afhængigt af læsehastighed og om første forsøg er rigtigt.

## Datastruktur

Nyt globalt objekt `WIZARD_SCENARIOS` ved siden af eksisterende `CATEGORY_LESSONS`:

```javascript
var WIZARD_SCENARIOS = {
  "Dobbeltkonsonant": [
    {
      setup: "Jeg vil lave en kage til min fødselsdag.",
      riddle: "I opskriften står et ord — hvilken stavemåde er rigtig?",
      options: ["bage", "bagge"],
      correct: 0,
      reveal: "Det rigtige er BAGE. Vokalen 'a' er LANG (baaaa-ge), så enkelt 'g'. Hvis det var hop-pe, ville 'o' være kort og vi skulle have dobbelt p."
    },
    {
      setup: "Jeg vil sidde på min stol og slappe af.",
      riddle: "Skal jeg skrive 'sidde' eller 'side' i min dagbog?",
      options: ["sidde", "side"],
      correct: 0,
      reveal: "AHA — jeg vil SIDDE (kort 'i' → dobbelt d). En SIDE er noget helt andet (en side i en bog)!"
    }
    // ... 5-8 i alt
  ]
};
```

| Felt | Formål |
|---|---|
| `setup` | Trolmandens kontekst — sætter scenen uden at afsløre svaret |
| `riddle` | Selve gåde-spørgsmålet — vises efter setup |
| `options` | Præcis 2 ord. Døren-position shuffles ved render |
| `correct` | Index af det rigtige ord (0 eller 1) |
| `reveal` | Forklaring efter svaret. For minimale par: forklar at den anden også er et rigtigt ord med anden betydning |

### Pilot-bibliotek (5-8 scenarier)

| # | Type | Eksempel-ord |
|---|---|---|
| 1 | Klassisk | bage / bagge |
| 2 | Minimalt par | sidde / side |
| 3 | Klassisk | koppe / kope |
| 4 | Minimalt par | hedde / hede |
| 5 | Minimalt par | masse / mase |
| 6 | Klassisk | hoppe / hope |
| 7 | Klassisk | klappe / klape |
| 8 | Klassisk | slikke / slike |

### Scenarie-rotation

Per-spiller localStorage-nøgle `{player}_wizard_recent` = `{categoryName: [seneste 3 scenarie-indices]}`. Ved trigger: vælg uniformt fra scenarier ikke i recent-listen. Når alle er recente, nulstil og vælg uniformt. Forhindrer gentagelse i træk uden at gøre rotationen for streng.

## Komponent-struktur

**Ny funktion:** `showWizardLesson(category)` erstatter `showLessonPopup(category)` for kategorier med scenarier i `WIZARD_SCENARIOS`. Andre kategorier falder tilbage til den eksisterende statiske popup.

**HTML** (genereret dynamisk i overlay):

```
.wizard-overlay              ← fullscreen mørk baggrund
  .wizard-card               ← centreret kort (max 420px)
    .wizard-header           ← lille label "Trolmandens gåde"
    .wizard-stage            ← scene
      .wizard-character      ← 🧙‍♂️ emoji (animeret)
      .wizard-speech         ← tale-boble (skifter tekst)
    .wizard-doors            ← to dør-knapper (vises fra phase=riddle)
      .wizard-door[data-idx="0"]
      .wizard-door[data-idx="1"]
    .wizard-footer           ← "Forstået!" knap (vises fra phase=reveal)
```

**State-maskine:**

```
intro       → trolmand glider ind, speech = scenario.setup
              (efter 2.5s auto-fortsæt → riddle)
riddle      → speech skifter til scenario.riddle, døre fader ind
              (vent på klik)
wrong-1     → klikket dør shake+rød+disabled, trolmand "dør"
              (efter 1.8s tilbage → riddle med kun 1 dør tilbage)
correct     → klikket dør glow grøn, trolmand jubler
              (efter 1.2s → reveal)
reveal      → speech = scenario.reveal, "Forstået!" knap fader ind
              (vent på klik → done)
done        → XP tildeles, overlay fader ud, dismissLessonPopup() kaldes
```

**Modul-niveau state-variabler:**

```javascript
var wizardCurrentScenario = null;
var wizardPhase = null;
var wizardTries = 0;
var wizardFirstTryCorrect = false;
var wizardDoorOrder = [0, 1];
```

**Filplacering:**
- HTML: dynamisk genereret i overlay (ingen ændring i `index.html`)
- JavaScript: tilføjes til `app.js` lige efter eksisterende lesson-funktioner (~linje 1095)
- CSS: ny sektion i `style.css`

## Animationer

### Intro (0-800ms)

```
0ms     overlay fader in (opacity 0 → 1, 250ms)
100ms   wizard-card slider op fra bunden (translateY 40px → 0, 350ms)
300ms   trolmand glider ind fra venstre + bounce (translateX -100px → 0 + scale 0.7 → 1, 400ms)
700ms   tale-boble pop-in (scale 0 → 1.05 → 1, 250ms spring)
```

### Idle (kontinuerlig)

`@keyframes wizard-float` — translate Y 0 → -6px → 0 over 2.4s, ease-in-out. Drop-shadow filter pulserer let.

### Tekst-skift i tale-boble

```
Gammel tekst: opacity 1 → 0 (180ms)
Boblen "puster" (scale 1 → 1.03 → 1)
Ny tekst: opacity 0 → 1 (220ms) + translateY 4px → 0
```

### Døre fader ind (riddle phase)

Stagger — venstre først, højre 100ms efter. Hver dør: opacity 0 → 1, translateY 20px → 0, 320ms ease-out. Hover: glow + scale 1.03.

### Rigtigt valg

```
Klikket dør: background → grøn, scale 1 → 1.08 → 1, box-shadow glow
Trolmand: wiggle (rotate -8 → 8 → -4 → 0, 600ms)
Stjerne-burst: 3 ⭐ flyver op og fader (CSS keyframes, staggered)
Speech: "Perfekt! 🌟" eller "Næsten! Kig her..."
```

### Forkert valg — "Trolmandens forfærdelige skæbne"

6-8 slapstick-død i rotation, valgt tilfældigt (eksklusiv senest viste). Total per death: 1.5-2.0s.

| # | Død | Sekvens |
|---|---|---|
| 1 | 🔨 Ambolt | ⚠️ blink → 🔨 falder → IMPACT, 🧙‍♂️ → 🥞 m. ⭐💫 → puff → tilbage |
| 2 | 🐉 Drage | 🐉 flyver ind → 🔥🔥🔥 → 🧙‍♂️ → 💀 → 💨 røg → tilbage sodet |
| 3 | ⚡ Lyn | ☁️ samles → ⚡ → invert+shake → tilbage rystende |
| 4 | 🍌 Banan | 🍌 → trolmand glider ud (rotate+translate) → kravler ind igen |
| 5 | 👽 UFO | 🛸 ind øverst → blå stråle → trolmand stiger op → puff → teleport tilbage |
| 6 | 🪨 Sten | 🪨 falder → IMPACT, fladtrykt → puff → tilbage |
| 7 | 👻 Spøgelse | 👻 popper bag fra → 🧙‍♂️ → 😱 → hopper og tilbage |
| 8 | 💣 Eksplosion | Trolmand peger med stav → ✨ → 💥 → sortet ansigt + 🤯 hår |

**Implementation:** Hvert death er en CSS-only sekvens. JavaScript vælger tilfældigt fra `WIZARD_DEATHS` array. Fælles `triggerWizardDeath(deathName)` håndterer timing.

### Reveal

Forkert dør fader ud (opacity 0 over 250ms, så collapse height). Et lille 👉 emoji vises ved siden af trolmand pegende mod den rigtige dør (slider ind, lille bounce). Speech fader til reveal-tekst. "Forstået!" knap fader ind med 800ms delay.

### XP-feedback

Når "Forstået!" klikkes: knap-bounce, XP-badge floats opad via eksisterende `showRewardFloat()`, overlay fader ud, træningen fortsætter.

### Performance

Alle animationer = CSS transforms/opacity (GPU-accelereret). Ingen JS-driven animation løkker. Total tilføjet kode-volumen: ~60kB (CSS+JS).

## Integration

**Touch-points i `app.js`:**

| Hvor | Ændring |
|---|---|
| `CATEGORY_LESSONS` (~815) | Ingen — beholdes som fallback |
| `showLessonPopup` (~984) | Tilføj if-tjek for `WIZARD_SCENARIOS[category]`; fald tilbage hvis ikke til stede |
| Ny sektion ~1095 | Hele wizard-systemet (~250 linjer) |
| `triggerCategoryLesson` (~958) | Uændret |

**Touch-points i `style.css`:** ny sektion `/* === Wizard lesson === */` (~150 linjer).

**Touch-points i `index.html`:** Ny knap "🧙‍♂️ Test trolmand-lesson" i welcome settings-sektion (markeres med TODO-kommentar; fjernes ved pilot go-live).

## XP-integration

```javascript
// I "Forstået!"-handler:
var xpReward = wizardFirstTryCorrect ? 15 : 10;
var data = loadRewardData();
data.totalXP = (data.totalXP || 0) + xpReward;
data.todayXP = (data.todayXP || 0) + xpReward;
saveRewardData(data);
updateRewardBar();
showRewardFloat('+' + xpReward + ' XP \u2728');
```

Bruger eksisterende XP-pipeline.

## localStorage

Ny per-spiller nøgle: `{player}_wizard_recent` — JSON `{categoryName: [seneste 3 scenarie-indices]}`. Bruges af scenarie-rotation. Plus eksisterende `exercise_stats` får valgfri `_wizardLessonsCompleted` tæller.

## Error handling

| Situation | Håndtering |
|---|---|
| `WIZARD_SCENARIOS[category]` mangler | Fallback til gammel `showLessonPopup` |
| Tomt scenario-array | Fallback til gammel popup, console.warn |
| localStorage skrivefejl | Catch silently — rotation fungerer bare ikke optimalt |
| Bruger lukker browseren midt i lesson | Ingen state at gemme — næste gang starter ny lesson |
| Skærm <340px | Media query: doors stack vertikalt |

## Test-strategi

Manuel test (ingen automatiserede tests i projektet):

1. **Trigger-test** — 3 Dobbeltkonsonant-fejl i blandet træning, verificer wizard popper op
2. **Test-knap** — klik welcome-knap, wizard popper op direkte
3. **Scenarie-rotation** — kør 3 lessons i træk, verificer ingen gentagelse
4. **First-try korrekt** — vælg rigtigt med det samme → +15 XP
5. **Wrong-then-right** — vælg forkert → death animation spillede → vælg rigtigt → +10 XP
6. **Responsivt design** — DevTools mobile mode (375px), verificer doors fungerer
7. **Animation timing** — kør hver af 6-8 deaths, verificer ingen hænger fast
8. **Fallback** — midlertidigt ryd `WIZARD_SCENARIOS["Dobbeltkonsonant"]`, verificer den gamle popup vises

## Migration / rollback

Ren tilføjelse — ingen migration nødvendig. Rollback = `git revert`. Eksisterende lessons fortsætter med at virke da `WIZARD_SCENARIOS` kun udvides, ikke erstatter.

## Out of scope

- De andre 8 kategorier — håndteres efter pilot-validering
- Lyd-effekter (ding/whoops) — kan tilføjes senere som valgfri toggle
- Multi-step gåder (>2 valg) — strukturen kan udvides, men ikke i pilot
- A/B-testing eller analytics — vi måler subjektivt via test-feedback i pilot-fasen

## Næste skridt

1. Skriv implementations-plan via `superpowers:writing-plans` skill
2. Implementér i denne rækkefølge: scenarie-data → state-maskine → grundlæggende UI → animationer → death-animations → polish
3. Test-knap synlig under hele udviklingen
4. Når validatert: hånd-skriv scenarier til de andre 8 kategorier (~30-40 stk i alt)
