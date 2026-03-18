# Stavehjælpen

Dansk stavetrænings-app til børn (8-14 år). Single-page HTML app uden build-step.

## Arkitektur

Alt ligger i `index.html` — HTML, CSS og JavaScript i én fil (~3600 linjer).
Ordbanken ligger i `words.json` (454 ord, 8 kategorier, 5 niveauer).

## Vigtige dele

- **Ordbank**: `WORD_BANK` objekt med 8 kategorier (lydrette ord, stumme bogstaver, dobbeltkonsonant, for-/efterstavelser, sammensatte ord, verbernes bøjning, navneordsendelser, nutids-r)
- **Staveregler**: `PATTERN_RULES` objekt med forklaringer per kategori
- **TTS**: Pre-genererede MP3-filer i `audio/` med to stemmer (kvinde: Neural2-F, mand: Wavenet-G med `_m` suffix). `audio-manifest.json` mapper ord til filer. Browser SpeechSynthesis som fallback
- **AI-analyse**: Anthropic API (Claude) til personlig feedback efter test — med fuld offline fallback
- **Spaced repetition**: Fejlord gemmes i localStorage (`sr_data`) og kan øves igen næste gang
- **Adaptiv diagnostik**: Starter let, bliver sværere baseret på korrekte svar. Estimerer staveniveau
- **Gamification**: Boss-kampe (4 typer), skattekister (4 sjældenheder), avatar-progression (8 niveauer med XP)
- **Stavevurdering**: Dysleksiscreening med 4 deltests (nonord, fonologisk, ordkæder, RAN)

## Gamification-flow

- **Boss**: Trigges når et ord besvares forkert efter begge forsøg (træning/gennemgang). Bruger `pendingBoss` flag i `nextWord()`
- **Skattekiste**: Trigges efter hver 5. rigtige svar. Bruger `pendingChest` flag checket i toppen af `nextWord()` FØR index incrementeres. Kisten åbnes ved klik
- **Interrupt-mønster**: `pendingInterruptAction` gemmer om testen skal 'finish' eller 'continue' efter boss/kiste. `proceedAfterInterrupt()` genoptager flowet

## Audio

- `generate-audio.js` — genererer MP3'er via Google Cloud TTS. Understøtter `--voice` og `--suffix` flags
- `audio/` — ~1816 MP3-filer (908 kvinde + 908 mand)
- `audio-manifest.json` — mapper hvert ord til 4 stier: `word`, `sentence`, `word_m`, `sentence_m`

## localStorage-nøgler

- `profile_data` — staveniveau, svage kategorier, diagnostik-resultater
- `reward_data` — XP, streak, gems, avatar-progression
- `sr_data` — spaced repetition øveord
- `screening_data` — stavevurdering-resultater
- `gcloud_tts_key` — Google Cloud TTS API-nøgle (valgfri)
- `tts_voice` — 'male' eller 'female'
- `student_grade` — valgt klassetrin

## API-nøgler

- **Google Cloud TTS**: Gemmes i localStorage (`gcloud_tts_key`) — valgfri, pre-genererede filer bruges som standard
- **Anthropic API**: Gemmes KUN i hukommelsen (variabel) — forsvinder ved genindlæsning. Uden nøgle bruges offline-analyse

## Udvikling

- Versionsnummer vises i header-overskriften (hardcodet i HTML). Bump ved hver ændring under test
- Alle ændringer committes og pushes til GitHub (Pages)

## Sprog

Al UI-tekst og kode-kommentarer er på dansk. Appen er målrettet danske elever.
