# Stavehjælpen

Dansk stavetrænings-app til børn (0-8. klasse). Single-page HTML app uden build-step.

## Arkitektur

Alt ligger i `index.html` — HTML, CSS og JavaScript (~6500 linjer).
Ordbanken ligger i `words.json` (653 ord, 8 kategorier, 5 niveauer).

## Vigtige dele

- **Ordbank**: `WORD_BANK` objekt med 8 kategorier (lydrette ord, stumme bogstaver, dobbeltkonsonant, for-/efterstavelser, sammensatte ord, verbernes bøjning, navneordsendelser, nutids-r)
- **Staveregler**: `PATTERN_RULES` objekt med børnevenlige forklaringer per kategori
- **Kategori-lektioner**: `CATEGORY_LESSONS` — popup med regler, eksempler og tricks. Trigges efter 3 fejl i samme kategori
- **TTS**: Pre-genererede MP3-filer i `audio/` med to stemmer (kvinde: Neural2-F, mand: Wavenet-G med `_m` suffix). `audio-manifest.json` mapper ord til filer. Browser SpeechSynthesis som fallback
- **AI-analyse**: Anthropic API (Claude) til personlig feedback efter diagnostisk test — med fuld offline fallback
- **Spaced repetition**: Fejlord gemmes i localStorage og kan øves igen næste gang
- **Adaptiv diagnostik**: Starter let, bliver sværere baseret på korrekte svar. Estimerer staveniveau 0-4
- **Gamification**: Boss-kampe (5 typer), skattekister (4 sjældenheder), avatar-progression (8 niveauer med XP)
- **Stavevurdering**: Dysleksiscreening med 4 deltests (nonord, fonologisk, ordkæder, RAN)

## Multi-profil system

- `activePlayer` — den valgte spillers navn
- `playerKey(key)` — returnerer `activePlayer + '_' + key` — bruges til ALLE localStorage-kald
- Per-spiller nøgler: `profile_data`, `reward_data`, `sr_data`, `screening_data`, `student_grade`
- Delte nøgler (ikke prefixed): `tts_voice`, `gcloud_tts_key`
- `players_list` — JSON-array af spillernavne i localStorage
- `last_player` — sidst valgte spiller (til auto-select)
- Migration fra gammel data: `migrateOldData()` flytter uprefixede nøgler til "Spiller 1"

## Supabase

- **Projekt**: `https://cfkddsiwwujbbxjuthie.supabase.co`
- **Anon key**: `sb_publishable_kPzQnAh0XICjtfZ_HszoRw_GEeMrgJt`
- **RLS**: Disabled på alle tabeller

### Tabeller

**answers** — logger hvert svar fra alle øvelsestyper:
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
"Fortsæt træning"-knappen bygger en session med 10 ord hvor hver får tilfældig øvelsestype:

| Mode | gameMode | Beskrivelse | Sandsynlighed |
|---|---|---|---|
| **Diktat** | training | Hør ord → skriv det | 50% (alle lige slots) |
| **Udfyld bogstav** | fillin | Vælg rigtigt bogstav fra muligheder | Lige fordelt |
| **Stavepolitiet** | spellingpolice | Find stavefejlen i dyr-lineup | Lige fordelt |
| **Ordbyggeren** | wordbuilder | Byg ord af morfem-klodser | Lige fordelt |

- `isMixedSession` flag styrer om vi er i blandet modus
- `mixedQueue` holder alle 10 items med pre-beregnet data
- `renderMixedItem()` skifter mellem phases baseret på type
- Hver modes "next"-funktion redirecter til `nextMixedItem()` når `isMixedSession` er true

### Standalone modes
- **diagnostic** — Adaptiv stavetest, estimerer niveau
- **review** — Spaced repetition gennemgang af øveord

### Øvelsesspecifik logik

- **generateBlanks(wordObj)** — udleder blanks fra patternHint for fillin-mode
- **generateMisspelling(wordObj)** — laver realistiske stavefejl per kategori
- **buildSpellingPoliceItem(wordObj)** — indsætter stavefejl i sætning
- **parseMorphemes(hint, word)** — parser '+' notation i patternHint til morfem-klodser

## Gamification-flow

- **Boss**: Trigges efter 5 rigtige i træk (belønning). Bruger `pendingBoss` flag
- **Skattekiste**: Gives efter boss er besejret. Bruger `pendingChest` flag
- **Kategori-lektion**: Trigges efter 3 fejl i samme kategori. Bruger `pendingLesson` flag
- **Interrupt-mønster**: `pendingInterruptAction` gemmer 'finish' eller 'continue' efter boss/kiste. `proceedAfterInterrupt()` genoptager flowet

### Boss-kampe (5 typer)
1. **scramble** — saml bogstaverne i rækkefølge
2. **rain** — fang faldende bogstaver (guided mode for niveau 0-2)
3. **memory** — husk og stav ordet
4. **reverse** — ordet er baglæns, skriv det rigtigt
5. **pacman** — saml bogstaver i labyrint, undgå spøgelset

### Belønninger
- XP: 10 per rigtig, 5 per forkert, 15 bonus per boss
- Gems: session-belønning + kiste-drops
- Streak: daglig streak med freeze-system
- Avatar: 8 niveauer (Baby Ræv → Stavedragen) baseret på total XP
- Skattekister: 4 sjældenheder (60% almindelig → 5% episk)
- Milestones: ved 3, 7, 14, 30, 50, 100 dages streak

## Klasser

Lærere kan oprette klasser, elever tilmelder sig via 6-tegns delekode. Ingen auth — "lærer" er selvdeklareret flag i `reward_data.isTeacher`.

### Flow
- Lærer slår "Jeg er lærer" til i settings → kan oprette klasser
- System genererer 6-tegns kode (charset: `ABCDEFGHJKMNPQRSTUVWXYZ23456789`)
- Elev indtaster kode i settings → tilmeldes klassen
- Lærer-dashboard er sin egen fase (`phase-dashboard`) med klasse- og elev-dropdowns

### Funktioner
- `generateJoinCode()` — 6-tegns unik kode
- `isTeacher()` / `toggleTeacherMode()` — lærer-toggle i reward_data
- `updateDashboardButton()` — viser/skjuler dashboard-knap på welcome
- `createClass(name)` / `deleteClass(groupId)` — CRUD for klasser
- `joinClass(joinCode)` / `leaveClass(groupId)` — elev tilmelding
- `removeStudentFromClass(groupId, player)` — lærer fjerner elev
- `renderClassSettings()` — bygger klasse-UI i settings

### Dashboard (phase-dashboard)
- `openDashboard()` — åbner dashboard-fasen, henter lærerens klasser
- `onDashboardClassChange()` — klasse valgt i dropdown
- `loadClassOverview(groupId, timeFilter)` — henter profiler + svar med kategoridata
- `renderClassOverview(groupId, students, timeFilter)` — klassetabel med tidsfilter
- `onDashboardStudentChange()` — elev valgt i dropdown
- `renderStudentDetail(student)` — detaljeret elevvisning med kategori-breakdown

### Klasseoversigt-kolonner
Navn, Klassetrin, XP, Streak, Rigtige %, Antal svar, Sidst aktiv, [Fjern]

### Elevdetaljer
- Stat-boxes: XP, Streak, Rigtige %, Svar i alt
- Kategori-breakdown: ikon, navn, niveau, progress-bar med korrektprocent, antal svar

### Tidsfilter
- `'week'` — seneste 7 dage
- `'month'` — seneste 30 dage
- `'all'` — alt

## Audio

- `generate-audio.js` — genererer MP3'er via Google Cloud TTS
- `audio/` — 2616 MP3-filer (653 ord × 2 stemmer × 2 typer)
- `audio-manifest.json` — mapper hvert ord til 4 stier: `word`, `sentence`, `word_m`, `sentence_m`
- Stemmer: kvinde (da-DK-Neural2-F), mand (da-DK-Wavenet-G med `_m` suffix)

## localStorage-nøgler (prefixed med spillernavn)

- `{player}_profile_data` — staveniveau, svage kategorier, diagnostik-resultater
- `{player}_reward_data` — XP, streak, gems, avatar-progression
- `{player}_sr_data` — spaced repetition øveord
- `{player}_screening_data` — stavevurdering-resultater
- `{player}_student_grade` — valgt klassetrin (0-8)
- `{player}_word_stats` — per-ord statistik (correct/wrong tællere per ord)

## API-nøgler

- **Google Cloud TTS**: Gemmes i localStorage (`gcloud_tts_key`) — valgfri, pre-genererede filer bruges som standard
- **Anthropic API**: Gemmes KUN i hukommelsen (variabel) — forsvinder ved genindlæsning. Uden nøgle bruges offline-analyse

## Ordbank-regler

- **Hints** i `words.json` må ALDRIG indeholde ordet selv eller nogen bøjningsform/stamme af ordet
- Hver ord har: word, hint, patternHint, sentence, level (0-4), category

## Udvikling

- Versionsnummer vises i header (hardcodet i HTML). Bump ved HVER ændring
- Alle ændringer committes og pushes til GitHub (Pages)
- Deploy via GitHub Pages fra main branch

## Sprog

Al UI-tekst og kode-kommentarer er på dansk. Appen er målrettet danske elever.
