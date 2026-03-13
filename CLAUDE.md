# Stavehjælpen

Dansk stavetrænings-app til børn (~12 år). Single-page HTML app uden build-step.

## Arkitektur

Alt ligger i `index.html` — HTML, CSS og JavaScript i én fil.

## Vigtige dele

- **Ordbank**: `WORD_BANK` objekt med 4 kategorier (stumme bogstaver, dobbeltkonsonant, for-/efterstavelser, sammensatte ord)
- **Staveregler**: `PATTERN_RULES` objekt med forklaringer per kategori
- **TTS**: Google Cloud Text-to-Speech med browser SpeechSynthesis som fallback
- **AI-analyse**: Anthropic API (Claude) til personlig feedback efter test — med fuld offline fallback
- **Spaced repetition**: Fejlord gemmes i localStorage og kan øves igen næste gang

## API-nøgler

- **Google Cloud TTS**: Gemmes i localStorage (`gcloud_tts_key`) — valgfri, browser-stemme bruges uden
- **Anthropic API**: Gemmes KUN i hukommelsen (variabel) — forsvinder ved genindlæsning. Uden nøgle bruges offline-analyse

## Sprog

Al UI-tekst og kode-kommentarer er på dansk. Appen er målrettet danske elever.
