# Udtale: blødt d trainer

**Date:** 2026-09-28 · **Status:** approved design

## Goal

A small standalone page for practising the Danish soft d ([ð]) with a parent as judge. Built for one specific learner: a 13-year-old who substitutes soft d with "j" (*bidder* → "bijer", *hvid* → "vij"), can produce the sound when exaggerating, and starts a speech-therapy programme at school in a few months. The page bridges that gap by giving structured daily repetition with honest feedback.

This is a home tool first. It reuses the Stavehjælpen audio pipeline but is otherwise independent.

## Decided scope

| Decision | Choice |
|---|---|
| Where | Separate page in this repo: `udtale.html`, `udtale.js`, `udtale.css`, `udtale-data.js`. Not linked from Stavehjælpen. |
| Users | One learner, one device. No profiles, no Supabase, no XP. |
| Judge | A parent sits next to the learner and taps what they heard. |
| Exercises | Two: **Lyt** (perception, quick) and **Sig det** (production, the main one). |
| Audio | Existing MP3s in `audio/` plus a small set of new words generated with `generate-audio.js`. |
| Look | Plain, mobile-first, big buttons. No Fredoka font, foxes or chests. |
| Language | UI text in Danish. |

Not in scope now: self-recording, automatic scoring, multiple learners, integration into Stavehjælpen. See "Later".

## Background that shapes the design

- **Soft d vs j is the specific error.** Both are approximants; the learner keeps the vowel and swaps the consonant. Feedback must target exactly that contrast, not "was it good".
- **True minimal pairs are rare.** Danish lowers the vowel before written "j": *ned* is [neð] but *nej* is [naj]. So "ned" said with the j error sounds like *nej* with the wrong vowel, not like the word *nej*. Real pairs (*ned/nej*) are useful for a quick perception check, but for production feedback the better contrast is **the word vs. the learner's own error form** (*hvid* / *hvij*), which exists for every soft-d word.
- **Forced choice beats thumbs.** "Which did it sound closest to: *bade* or *baje*?" is a more honest judgement than 👍/👎, where a parent tends to be kind.
- **Exaggerate first, then scale down** is the standard route when the sound exists but is not automatic. The tips box says so; the tool does not enforce it.

## Files

| File | Purpose |
|---|---|
| `udtale.html` | Shell: header, two tabs (Lyt, Sig det), tips box, stats box. Loads the three scripts below. |
| `udtale.css` | Own stylesheet. Dark, neutral, mobile-first. Buttons at least 64px tall. |
| `udtale-data.js` | Global `UDTALE_DATA`: the pairs, the extra words, and the tier definitions. |
| `udtale.js` | Loads `words.json`, builds the word tiers, runs the two exercises, stores stats. |
| `udtale-mund.js` | Mouth pictures for j / soft d / l with example words (added 2026-09-30). Data plus `mount(container, initial, onPlay)`. |
| `generate-audio.js` | Extended with `--words <file>` to generate audio for a JSON list outside `words.json`. |
| `udtale-words.json` | Input for the generator: the extra words that need audio (see Audio). |
| `test-udtale.js` | Node check: every word the page can present has its MP3 files on disk. |

`udtale.js` derives audio paths by the naming convention instead of reading `audio-manifest.json`, because the manifest is generated from `words.json` only. The convention is `audio/word_<key><suffix>.mp3` and `audio/sentence_<key><suffix>.mp3` where `<key>` is `sanitizeFilename(word)` (æ→ae, ø→oe, å→aa, other non-alphanumerics→_) and `<suffix>` is `` or `_m`. `udtale.js` gets its own copy of `sanitizeFilename`.

## Data

### Word tiers (built at load time from `words.json` plus extras)

A word belongs to a tier by regex on the word form. Order is easiest to hardest for this learner.

| Tier | Rule | Examples | Count today |
|---|---|---|---|
| 1 `final` | vowel + `d` at the end | mad, hvid, rød, tid, bad, god | 37 |
| 2 `medial` | vowel + `d` or `dd` + `e/er/en/et/es/ene` at the end, not tier 3 | bade, side, sidder, hedde, hvede, rede | ~35 |
| 3 `past` | ends in `ede`, is a past-tense verb | legede, hoppede, malede, troede | ~28 |
| 4 `sentence` | every word from tiers 1–3 presented as its `sentence` | "Mor er hjemme hele dagen." | ~100 |
| 5 `pair` | the real minimal pairs below, target side random | ned / nej | 9 |

Tier 3 vs 2: the regex `ede$` also catches non-verbs (*hvede*, *rede*, *lede*, *allerede*). Tier 3 therefore requires the word's `category` to be `Verbernes bøjning`; every other `ede$` word stays in tier 2. Words with double d before the ending (*reddede*) are included; the learner's error form there is `-jede`.

Words that are in the extras list but not in `words.json` (*ved, hed, bød, fed, øde, møde*) are added to tier 1 or 2 by the same regex and have no sentence, so they are excluded from tier 4.

### Error form

`errorForm(word)`: replace `dd` with `j`, then any remaining vowel-following `d` with `j`. Only the soft-d occurrences are replaced; a hard d at the start of a word (*dag*) is not touched because it never follows a vowel. Examples: *hvid* → *hvij*, *bidder* → *bijer*, *bade* → *baje*, *reddede* → *rejeje*, *rødgrød* → *røjgrøj*. This is a label for the judge, not a claim about phonetics.

### Real pairs

Hard-coded in `udtale-data.js`:

```
mad/maj  ved/vej  hed/hej  ned/nej  bød/bøj  fed/fej  led/lej  øde/øje  møde/møje
```

Left side has soft d, right side has j. Both sides need word audio.

### Audio needed beyond what exists

`udtale-words.json` lists 15 words with no sentence: the 9 j-words and the 6 soft-d words that are not in `words.json` (*ved, hed, bød, fed, øde, møde*). Both voices are generated (run the generator twice, once with `--suffix _m --voice da-DK-Wavenet-G`), matching the rest of `audio/`. That is 30 new MP3s, committed to the repo like the others.

Generator change: `--words <file>` reads that JSON array instead of `words.json`, skips sentence generation for entries without a `sentence` field, and does **not** rewrite `audio-manifest.json`. Without the flag the script behaves exactly as today.

## Exercises

Shared behaviour: a round is 10 items drawn at random from the chosen tier without repeats (fewer if the tier is smaller). Voice (female/male) is a toggle in the header, stored in `tts_voice`, the same shared key Stavehjælpen uses, so the choice follows the learner between the two pages. Model audio plays through `new Audio(path)`; on error the page falls back to `speechSynthesis` with a `da-DK` voice, and shows a small "browser-stemme" note so the parent knows the quality dropped.

### Lyt (perception check)

For each item: pick a pair, pick a side at random, play its word audio. Show two big buttons with both words. The learner taps the one they heard. Immediate feedback (green/red, correct word highlighted), a "Hør igen" button, then "Næste". End of round: score out of 10.

Purpose: a two-minute sanity check that the contrast is heard. Expected to be near 100% for this learner; if it is not, that is worth telling the therapist.

### Sig det (production, the main exercise)

Tier picker first: Sidst (1), I midten (2), -ede (3), Sætninger (4), Par (5). Then for each item:

1. **Show** the target word large. Below it a "Hør ordet" button (model audio, optional) and the button "Jeg har sagt det".
2. The learner says the word. The parent listens without looking at the screen if they want to stay unbiased.
3. **Hide**: tapping "Jeg har sagt det" hides the target and shows the judge buttons.
4. **Judge**: two big buttons, *word* / *errorForm(word)*, in random left/right order. For tier 5 the buttons are the two pair words, and the target was one of them at random, so the parent genuinely does not know. For tier 4 (sentences) the buttons are "Alle d'er ramte" / "Et eller flere blev til j", because a sentence can contain several soft d's.
5. **Reveal**: the target comes back, the tap is scored (correct if the parent picked the target), and the stats update. "Næste" moves on; "Prøv igen" repeats the same item as practice only: the retry is not judged again and does not touch the stats or the round score.

End of round: score, list of the missed words with a "Øv disse igen" button that starts a round of only those.

### Self-recording (added 2026-09-28, after the first version shipped)

In Sig det, while the target is shown, an "● Optag" button records the learner through the microphone (`getUserMedia` + `MediaRecorder`, mime chosen from `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4`, `audio/ogg;codecs=opus` in that order so Android/Windows get webm and iPad Safari gets mp4). While recording the button reads "■ Stop" and pulses red. After stopping, a "Hør model + dig" button appears and stays through the judge and reveal phases: it plays the model MP3 and then the recording in the same `Audio` element, because iOS only lets an element play later if a tap started it. Without a model file it plays the recording alone.

The recording lives in memory only and is discarded on "Næste", "Prøv igen", "Øv disse igen", "Ny runde", "Vælg trin", tier change and tab change (which also stops the microphone stream). "Jeg har sagt det" stops a running recording first. The judge flow is unchanged; recording is an aid for the learner, not a scoring input. Denied microphone permission shows a note and the exercise keeps working. Browsers without `MediaRecorder` do not show the button. Requires a secure context (GitHub Pages or localhost).

Saving recordings to Supabase Storage was considered and deferred until the Supabase project is reachable again; see Later.

### Tier tips and mouth pictures (added 2026-09-30)

Each tier in `UDTALE_DATA.TIERS` carries a `tips` array of two to four short Danish sentences aimed at that position of the sound. Choosing a tier opens an intro card with the mouth pictures and the tips, then "Start runde". During a round a "Tips" chip in the progress line toggles the same list. "Øv disse igen" and "Ny runde, samme trin" skip the intro card.

All learner-facing text is plain Danish. No phonetic symbols (a test enforces this): the learner is 13 and the parent is not a linguist.

`udtale-mund.js` shows the mouth from the front, as in a mirror, for three sounds: j (the learner's error), soft d (the target) and l (the shaping trick). Chips switch between them with a crossfade, "Vis skiftet" plays j → soft d, and each sound has an example word with a play button: *maj*, *mad*, *mal*, which differ only in the last sound. The pictures are illustrations without any baked-in text (`images/udtale/mund-{j,d,l}.webp`), generated by the user in ChatGPT after two rounds of hand-drawn SVG side views proved unreadable ("the tongue is just a lump"). It is mounted in the front-page tips box and on every intro card (starting on j for the pair tier, soft d otherwise).

Known limitation: the front view shows clearly whether the tongue tip is up or down (l vs soft d), but the j vs soft d difference is mostly depth (where the tongue is highest), which a front view can only hint at.

Basis for the content: the tongue tip rests against the lower teeth while the front of the tongue moves toward the ridge behind the upper teeth without contact, with slight velarisation (Schachtenhaufen on schwa.dk; Basbøll 2005 via Wikipedia "Danish phonology"); acoustically the sound is an approximant or vowel, not a fricative (Proceedings of the LSA 2020); after /i/ the soft d is most closed and fronted, which is why *hvid*-type words are the hardest for a learner who substitutes j; schwa plus soft d becomes a syllabic soft d, and *-ede* is usually one long soft d. The practice order follows traditional articulation therapy (discriminate, establish in an easy context, stabilise in words, then sentences). The wording of the tips, the "lll" shaping trick and "start with a/o/å/u words" are derived from these sources, not taken from a therapy manual, and the pictures are illustrations, so both keep the note that the school's speech therapist should confirm them.

### Tips box

Collapsible "Sådan gør du" with four short points in Danish: tongue tip low behind the lower front teeth; the tongue does not touch the roof of the mouth (compare with "l", where it does); start exaggerated and slow, then shorten; practise five minutes a day rather than thirty once a week. Marked with the note that a speech therapist should confirm the instructions, because the author is not one.

## Stats

localStorage key `udtale_stats`:

```json
{
  "words": { "hvid": { "ok": 3, "fail": 1, "last": "2026-09-28" } },
  "rounds": [ { "date": "2026-09-28", "tier": "final", "score": 8, "total": 10 } ]
}
```

Sentence items are keyed as `sentence:<word>` (for example `sentence:hvid`), so a word's own stats are not mixed with its sentence stats. Pairs are keyed by the target word that was actually said.

Stats box on the front page: per tier, percent correct over all time and over the last 7 days, and the five words with the most fails (minimum two attempts). A "Nulstil" button with a confirm dialog. `rounds` is capped at the last 200 entries.

## Error handling

- `words.json` fails to load: show an error and stop. Nothing works without it.
- An MP3 404s: fall back to browser TTS for that item, as above.
- No `da-DK` browser voice either: the note says "Ingen dansk stemme, læs ordet højt selv"; the exercise still works because the parent can read the word aloud.
- localStorage unavailable: stats are kept in memory for the session and the stats box says they will not be saved.

## Testing

- `test-udtale.js`: builds the same tiers as the page (reuses the regex and the extras list), checks every word and sentence file exists in `audio/` for both voices, checks `errorForm` on a fixed table of examples, and checks that every pair word has audio. Fails with a list of missing files. Run with `node test-udtale.js`.
- Manual: one full round of each tier on a phone and on a laptop, voice toggle, retry, stats persist across reload, fallback voice by temporarily renaming an MP3.

## Later (not now)

- Saved recordings: upload each recording to Supabase Storage so the family can hear progress over weeks. Needs a bucket plus storage policies (SQL migration like `db/word-lists.sql`) and the project unpaused. Recording itself is done, see "Self-recording".
- Human voice recordings instead of TTS, if this ever goes beyond one learner.
- Speech-therapist review of the tips text and the tier order.
- More tiers: soft d before a consonant and inside compounds. The tier regexes deliberately skip these today, including 12 words from the app's own "Blødt d" category (*tredive, hæderlig, fodrer, rødlig, eddike, kodesprog, fodaftryk, tilbedelse, fodbolden, meddele, meddelelse, middelalderen*) and clear soft-d words elsewhere (*madpakke, badeværelse, madlavning, tilladelse, middel, modtog, havde*, the *ud-* prefix). They already have audio and sentences, so a curated include-list mapping word → tier is the cheap way to add them.
