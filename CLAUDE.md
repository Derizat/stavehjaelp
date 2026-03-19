# Stavehjælpen

Dansk stavetrænings-app til børn (8-14 år). Single-page HTML app uden build-step.

## Versioner

- **v1** (`index.html` på main branch): Original version, uændret
- **v2** (`v2/index.html` på main branch): Ny version med ændringer — deployed på `/v2/`
- Begge serveres via GitHub Pages fra main branch
- **Vigtig regel**: v1 skal ALDRIG ændres. Alle ændringer laves KUN i v2
- v2 bruger `BASE_PATH = '../'` til at referere til delte assets (words.json, audio/)

## Arkitektur

Alt ligger i én `index.html` — HTML, CSS og JavaScript (~4800 linjer i v2).
Ordbanken ligger i `words.json` (454 ord, 8 kategorier, 5 niveauer).

## v2-ændringer vs v1

- **Multi-profil**: Spillere vælges ved navn. `playerKey(key)` prefixer localStorage-nøgler med spillernavn
- **Supabase-integration**: Svar logges til `answers`-tabel, profiler synces via `profiles`-tabel
- **Forenklet quiz**: Ingen retry/hint ved forkert svar — registreres direkte. Ingen "Tjek stavning"-knap (Enter submitter). Ingen kategori-badge under quiz. Ingen "Diagnostisk test" label
- **Forenklet velkomstskærm**: Ingen avatar-titel, XP-bar, intro-tekst, stavevurdering-knap eller kategori-bokse
- **Centrerede knapper**: Action-knapper er ikke fuld bredde, men centrerede med max-width

## Supabase

- **Projekt**: `https://cfkddsiwwujbbxjuthie.supabase.co`
- **Anon key**: `sb_publishable_kPzQnAh0XICjtfZ_HszoRw_GEeMrgJt`
- **RLS**: Disabled på begge tabeller (grant til anon-rolle)

### Tabeller

**answers** — logger hvert svar i quizzen:
- id (uuid), player (text), word (text), answer (text), correct (boolean), attempt (int), category (text), level (int), grade (int), created_at (timestamptz)

**profiles** — syncer spillerdata på tværs af enheder:
- player (text, primary key), profile_data (jsonb), reward_data (jsonb), sr_data (jsonb), student_grade (int), updated_at (timestamptz)

### Sync-flow
- `syncToSupabase()` kaldes efter enhver save (profil, reward, SR, klassetrin)
- `syncFromSupabase(name, callback)` kaldes i `selectPlayer()` — loader data fra Supabase før UI refreshes
- `renderProfilePicker()` merger lokale spillere med Supabase-spillere så profiler fra andre enheder vises

## Vigtige dele

- **Ordbank**: `WORD_BANK` objekt med 8 kategorier (lydrette ord, stumme bogstaver, dobbeltkonsonant, for-/efterstavelser, sammensatte ord, verbernes bøjning, navneordsendelser, nutids-r)
- **Staveregler**: `PATTERN_RULES` objekt med forklaringer per kategori
- **TTS**: Pre-genererede MP3-filer i `audio/` med to stemmer (kvinde: Neural2-F, mand: Wavenet-G med `_m` suffix). `audio-manifest.json` mapper ord til filer. Browser SpeechSynthesis som fallback
- **AI-analyse**: Anthropic API (Claude) til personlig feedback efter test — med fuld offline fallback
- **Spaced repetition**: Fejlord gemmes i localStorage (`sr_data`) og kan øves igen næste gang
- **Adaptiv diagnostik**: Starter let, bliver sværere baseret på korrekte svar. Estimerer staveniveau
- **Gamification**: Boss-kampe (4 typer), skattekister (4 sjældenheder), avatar-progression (8 niveauer med XP)
- **Stavevurdering**: Dysleksiscreening med 4 deltests (nonord, fonologisk, ordkæder, RAN) — fjernet fra v2 velkomstskærm

## Multi-profil system (v2)

- `activePlayer` — den valgte spillers navn
- `playerKey(key)` — returnerer `activePlayer + '_' + key`
- Per-spiller nøgler: `profile_data`, `reward_data`, `sr_data`, `screening_data`, `student_grade`
- Delte nøgler (ikke prefixed): `tts_voice`, `gcloud_tts_key`, `anthropic_api_key`
- `players_list` — JSON-array af spillernavne i localStorage
- `last_player` — sidst valgte spiller (til auto-select)
- Migration fra v1-data: `migrateOldData()` flytter uprefixede nøgler til "Spiller 1"

## Gamification-flow

- **Boss**: Trigges efter 5 rigtige i streg (reward-baseret). Bruger `pendingBoss` flag
- **Skattekiste**: Trigges sammen med boss. Bruger `pendingChest` flag
- **Interrupt-mønster**: `pendingInterruptAction` gemmer om testen skal 'finish' eller 'continue' efter boss/kiste

## Audio

- `generate-audio.js` — genererer MP3'er via Google Cloud TTS. Understøtter `--voice` og `--suffix` flags
- `audio/` — ~1816 MP3-filer (908 kvinde + 908 mand)
- `audio-manifest.json` — mapper hvert ord til 4 stier: `word`, `sentence`, `word_m`, `sentence_m`

## localStorage-nøgler (v2, prefixed med spillernavn)

- `{player}_profile_data` — staveniveau, svage kategorier, diagnostik-resultater
- `{player}_reward_data` — XP, streak, gems, avatar-progression
- `{player}_sr_data` — spaced repetition øveord
- `{player}_screening_data` — stavevurdering-resultater
- `{player}_student_grade` — valgt klassetrin

## API-nøgler

- **Google Cloud TTS**: Gemmes i localStorage (`gcloud_tts_key`) — valgfri, pre-genererede filer bruges som standard
- **Anthropic API**: Gemmes KUN i hukommelsen (variabel) — forsvinder ved genindlæsning. Uden nøgle bruges offline-analyse

## Ordbank-regler

- **Hints** i `words.json` må ALDRIG indeholde ordet selv eller nogen bøjningsform/stamme af ordet. Hintet skal beskrive betydningen uden at afsløre stavningen.

## Udvikling

- v1 forbliver uændret — alle nye features laves i v2
- Ændringer i v2 skal laves i BÅDE `v2/index.html` (main branch, til GitHub Pages) — v2 branch bruges ikke længere til deployment
- Alle ændringer committes og pushes til GitHub (Pages)

## Sprog

Al UI-tekst og kode-kommentarer er på dansk. Appen er målrettet danske elever.
