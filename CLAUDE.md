# Stavehjælpen

Dansk stavetrænings-app til børn (0-8. klasse). Single-page HTML app uden build-step.

## Arkitektur

- `index.html` (~440 linjer) — markup, faser og settings-panel. Versionsnummer hardcodet i headeren
- `app.js` (~8500 linjer) — al logik
- `style.css` (~1400 linjer) — al styling
- `words.json` — ordbanken (643 ord, 11 kategorier, niveau 0-5). Loades med `fetch` i `initApp()` og lægges i `WORD_BANK`

Statiske oversigtssider (ikke en del af spillet): `stumme-bogstaver.html`, `ordbank.html`, `overview.html`. Dokumentation: `PÆDAGOGIK.md`, `ordbank-oversigt.md`, `saetninger-oversigt.md`, `lektioner.txt`.

JavaScript-moduler der loades INDEN `app.js` (ingen indbyrdes afhængigheder):
- `sfx.js` — WebAudio-lydeffekter, global `SFX`, muteknap `#muteBtn` i header, localStorage-nøgle `sound_muted`
- `fx.js` — visuelle effekter, global `FX`: burst, damageNumber, confetti, slotPop, combo-badge

## Vigtige dele

- **Ordbank**: `WORD_BANK` med 11 kategorier: Lydrette ord, Stumme bogstaver, Dobbeltkonsonant, Sammensatte ord, Verbernes bøjning, Nutids-r, Fremmedord, Blødt d, Konsonantlyde, Ord fra Fransk, Ord fra Fransk 2
- **Kategori-niveauer**: Hver kategori har sit eget niveau pr. spiller (`profile.categoryLevels`). `CATEGORY_START_LEVELS` / `CATEGORY_MAX_LEVELS` definerer start og loft (mestring). Oprykning styres af `getLevelUpThreshold` — progressivt strengere jo tættere på mestring (fra 5 svar/80% op til 50 svar/90%). Tilfældige tastefejl (svar der ikke matcher kategoriens typiske misspelling) tæller ikke imod
- **Fransk-kategorier**: `PRO_CATEGORIES` — låses op for gems (`purchaseFrench` / `purchaseFrench2`). Tracker unikke korrekte ord i stedet for niveausystemet
- **Staveregler**: `PATTERN_RULES` med børnevenlige forklaringer per kategori
- **Lektioner**: `CATEGORY_LESSONS` (statisk popup) og `WIZARD_SCENARIOS` (interaktiv troldmands-lektion med to døre, død-animationer m.m.). `showLessonPopup` delegerer til wizard hvis kategorien har scenarier. Trigges af `checkLessonTrigger` ved struggle: 2 svar med 0 rigtige, eller ≥3 svar med <60% rigtige. Desuden "Lektioner"-knap med slideshow-oversigt
- **TTS**: Pre-genererede MP3-filer i `audio/` med to stemmer (kvinde: Neural2-F, mand: Wavenet-G med `_m` suffix). `audio-manifest.json` mapper ord til filer. Browser SpeechSynthesis som fallback
- **Spaced repetition**: Fejlord gemmes i `sr_data` (intervaller 0/1/3/7/14 dage) og kan øves via "review"-mode
- **Gamification**: Boss-kampe, skattekister (4 sjældenheder), avatar-progression (30 niveauer, Kylling → Ræve-Kongen), shop
- **Stavevurdering**: Dysleksiscreening med 4 deltests (nonord, fonologisk, ordkæder, RAN)
- **Misspellings fra rigtige data**: `fetchMisspellings` henter hyppige forkerte svar fra Supabase `answers`-tabellen (filtreret med `isPlausibleMisspelling`, 5 min cache) og bruger dem som distraktorer; `generateFallbackMisspellings` som fallback

Bemærk: Settings har et Anthropic API-nøgle-felt (gemmes i localStorage som `anthropic_api_key`), men der er pt. ingen kode der kalder Anthropic API — feltet er en rest fra den gamle AI-analyse.

## Multi-profil system

- `activePlayer` — den valgte spillers navn
- `playerKey(key)` — returnerer `activePlayer + '_' + key` — bruges til ALLE per-spiller localStorage-kald
- `players_list` — JSON-array af spillernavne; `last_player` — sidst valgte spiller (auto-select)
- Migration fra gammel data: `migrateOldData()` flytter uprefixede nøgler til "Spiller 1"

## Supabase

- **Projekt**: `https://cfkddsiwwujbbxjuthie.supabase.co`
- **Anon key**: `sb_publishable_kPzQnAh0XICjtfZ_HszoRw_GEeMrgJt`
- **RLS**: Disabled på alle tabeller
- **OBS (juli 2026)**: Hosten svarer ikke længere i DNS (NXDOMAIN) — projektet er formentlig pauset/slettet. Appen kører videre lokalt uden sync

### Tabeller

**answers** — logger hvert svar fra alle øvelsestyper (batches via `answerQueue` + `flushAnswers`):
- id (uuid), player (text), word (text), answer (text), correct (boolean), attempt (int), category (text), level (int), grade (int), created_at (timestamptz)

**profiles** — syncer spillerdata på tværs af enheder:
- player (text, primary key), profile_data (jsonb), reward_data (jsonb), sr_data (jsonb), student_grade (int), word_stats (jsonb), updated_at (timestamptz)

**groups** — klasser og vennegrupper:
- id (uuid, PK), name (text), join_code (text, unique), type (text: 'class'/'friendgroup'), created_by (text), created_at (timestamptz)

**group_members** — kobler spillere til grupper:
- id (uuid, PK), group_id (uuid, FK → groups.id ON DELETE CASCADE), player (text), role (text: 'teacher'/'student'/'member'), joined_at (timestamptz), UNIQUE(group_id, player)

### Sync-flow
- `syncToSupabase()` kaldes efter enhver save (profil, reward, SR, klassetrin)
- `syncFromSupabase(name, callback)` kaldes i `selectPlayer()` — loader data fra Supabase før UI refreshes
- `renderProfilePicker()` merger lokale spillere med Supabase-spillere

## Øvelsestyper

### Blandet træning (startTrainingFromProfile)
"Start stavespil"-knappen bygger en session med 10 ord via kvote-baseret matching:
- 1 af hver variation-type (wordbuilder, sentence, fillin, spellingpolice, spellpick) + evt. 1 vedligeholdelses-diktat fra mestrede kategorier (`buildMaintenancePool`) + resten diktat
- Kandidat-pool: 30 ord fra `buildPoolWithCategoryLevels` (alle kategorier, ord matches til spillerens kategoriniveau)
- Rarest-first matching: wordbuilder først, spellpick sidst. Fallback ved manglende match: ekstra spellpick + `_unfulfilled[type]++` i `exercise_stats`
- Fransk pro-ord får første match-chance (placeret forrest i kandidat-listen)
- `sessionStartLevels` snapshotter kategoriniveauer så resultatskærmen kan vise op/ned-ændringer

| Mode | type-id | Beskrivelse |
|---|---|---|
| **Diktat** | diktat | Hør ord → skriv det |
| **Udfyld bogstav** | fillin | Vælg rigtigt bogstav fra muligheder |
| **Stavepolitiet** | spellingpolice | Find stavefejlen i dyr-lineup |
| **Ordbyggeren** | wordbuilder | Byg ord af morfem-klodser |
| **Stavevælger** | spellpick | Vælg det rigtigt stavede ord ud af varianter |
| **Udfyld sætningen** | sentence | Skriv ordet der passer i sætningen |

- `isMixedSession` flag styrer om vi er i blandet modus; `mixedQueue` holder alle items med pre-beregnet data
- `renderMixedItem()` skifter mellem phases baseret på type; hver modes "next"-funktion redirecter til `nextMixedItem()` når `isMixedSession` er true
- `trackExerciseType(type)` tæller frekvens i `{player}_exercise_stats` (`_total`, `_unfulfilled`, `_updatedAt`)

### Standalone
- **Øvelser-knap** (`showExercisePicker`): øv en enkelt type — de 5 variation-typer + `wordmemory` (Ord-memory, vendespil)
- **Boss-kampe-knap** (`showBossPicker`): øv boss-minigames direkte (practice mode)
- **review** — spaced repetition-gennemgang af øveord
- **Stavevurdering** (`startScreening`) — dysleksiscreening
- Den gamle adaptive diagnostik-test er fjernet; `gameMode` er nu kun `'training' | 'review'`

### Øvelsesspecifik logik
- **generateBlanks(wordObj)** — udleder blanks fra patternHint for fillin-mode
- **buildSpellingPoliceItem(wordObj)** — indsætter stavefejl i sætning
- **parseMorphemes(hint, word)** — parser '+' notation i patternHint til morfem-klodser

## Gamification-flow

- **Boss**: Trigges efter 5 rigtige i træk (`BOSS_TRIGGER_STREAK`), max 2 per session (`MAX_BOSSES_PER_SESSION`). Bruger `pendingBoss` flag
- **Skattekiste**: Gives efter boss er besejret. Bruger `pendingChest` flag
- **Lektion**: Bruger `pendingLesson` flag
- **Interrupt-mønster**: `pendingInterruptAction` gemmer 'finish' eller 'continue' efter boss/kiste. `proceedAfterInterrupt()` genoptager flowet

### Boss-kampe
- Aktiv rotation (`BOSS_BATTLE_TYPES`): **memory** (husk og stav ordet), **cardcast** (kast bogstav-kort), **silentservant** (stumtjeneren — vælg rigtig stavemåde), **pacman** (saml bogstaver i labyrint), **snake** (styr slangen til bogstaverne)
- Deaktiverede men stadig i koden (`BOSS_DISABLED_TYPES`, kan testes via boss-picker): scramble, spellpick, rain, reverse, highway
- **Monster-identitet** bestemmes af ordkategori via `BOSS_MONSTERS` (9 navngivne monstre, hvert med AI-genereret sprite i `images/bosses/` + emoji-fallback). Kampen vises i et duel-layout med spillerens avatar mod monsteret

### Belønninger
- XP (`awardSessionXP`): 5 per rigtig, 2 per forkert, +3 per selvrettet svar, +10 for gennemført session
- Gems: 2 per session + 5 ved dagligt mål (100 XP) + kiste-drops
- Streak: daglig streak med milestone-overlay
- Avatar: 30 niveauer (`AVATAR_LEVELS`, 0 → 32.000 XP)
- Skattekister: 4 sjældenheder (55% almindelig / 25% ualmindelig / 13% sjælden / 7% episk)

### Shop (`SHOP_CATALOG`)
Købes for gems, gemmes i `reward_data.shop` (owned/active): temaer (`applyTheme`), navnestile og -rammer, stickers (5 slots på welcome/rewardbar)

## Klasser

Lærere kan oprette klasser, elever tilmelder sig via 6-tegns delekode. Ingen auth — "lærer" er selvdeklareret flag i `reward_data.isTeacher`.

### Flow
- Lærer slår "Jeg er lærer" til i settings → kan oprette klasser
- System genererer 6-tegns kode (charset: `ABCDEFGHJKMNPQRSTUVWXYZ23456789`)
- Elev indtaster kode i settings → tilmeldes klassen
- Lærer-dashboard er sin egen fase (`phase-dashboard`) med klasse- og elev-dropdowns

### Funktioner
- `generateJoinCode()`, `isTeacher()` / `toggleTeacherMode()`, `updateDashboardButton()`
- `createClass(name)` / `deleteClass(groupId)` — CRUD for klasser
- `joinClass(joinCode)` / `leaveClass(groupId)` — elev tilmelding
- `removeStudentFromClass(groupId, player)` — lærer fjerner elev
- `renderClassSettings()` — bygger klasse-UI i settings

### Dashboard (phase-dashboard)
- `openDashboard()`, `onDashboardClassChange()`, `loadClassOverview(groupId, timeFilter)`, `renderClassOverview(...)`, `onDashboardStudentChange()`, `renderStudentDetail(student)`
- Klasseoversigt-kolonner: Navn, Klassetrin, XP, Streak, Rigtige %, Antal svar, Sidst aktiv, [Fjern]
- Elevdetaljer: stat-boxes + kategori-breakdown med progress-bars
- Tidsfilter: `'week'` / `'month'` / `'all'`

## Audio

- `generate-audio.js` — genererer MP3'er via Google Cloud TTS (`GOOGLE_TTS_KEY`, `--voice`, `--suffix _m`)
- `record-audio.sh` — interaktivt optage-værktøj til at indtale ord/sætninger som MP3 (matcher manifest-formatet)
- `audio/` — ~3800 MP3-filer (ord + sætning × 2 stemmer)
- `audio-manifest.json` — mapper hvert ord til 4 stier: `word`, `sentence`, `word_m`, `sentence_m`
- Stemmer: kvinde (da-DK-Neural2-F), mand (da-DK-Wavenet-G med `_m` suffix)

## localStorage-nøgler

Per spiller (via `playerKey`):
- `{player}_profile_data` — inkl. `categoryLevels` (niveau + historik per kategori)
- `{player}_reward_data` — XP, streak, gems, shop, fransk-progression, isTeacher
- `{player}_sr_data` — spaced repetition øveord
- `{player}_screening_data` — stavevurdering-resultater
- `{player}_student_grade` — valgt klassetrin (0-8)
- `{player}_word_stats` — per-ord statistik (correct/wrong tællere)
- `{player}_exercise_stats` — frekvens af øvelsestyper + `_unfulfilled`
- `{player}_boss_seen` — hvilke boss-typer spilleren har fået instruktion til
- `{player}_wizard_recent` — senest viste wizard-scenarier (undgår gentagelse)

Delte (ikke prefixed): `players_list`, `last_player`, `tts_voice`, `gcloud_tts_key`, `anthropic_api_key`, `sound_muted`

## Ordbank-regler

- **Hints** i `words.json` må ALDRIG indeholde ordet selv eller nogen bøjningsform/stamme af ordet
- Hvert ord har: word, hint, patternHint, sentence, level (0-5), category

## Udvikling

- Versionsnummer vises i header (hardcodet i `index.html`). Bump ved HVER ændring
- Aktivt arbejde foregår på `v2`-branchen; deploy via GitHub Pages fra main
- Alle ændringer committes og pushes til GitHub (Pages)
- `generate-boss-images.js` — engangs boss-sprite-generator via gpt-image-1 (`OPENAI_API_KEY` env var; skip-existing; output `images/bosses/`, rå 1024px-originaler i gitignorerede `images/bosses_raw/`; nedskalering med cwebp)

## Sprog

Al UI-tekst og kode-kommentarer er på dansk. Appen er målrettet danske elever.
