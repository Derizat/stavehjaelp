# Teacher word lists ("Ugens ord")

**Date:** 2026-06-11 · **Status:** approved design

## Goal

Let a teacher type this week's words in the dashboard; students in the class get a prominent "Ugens ord" button and train exactly those words. This turns the app from a generic trainer into a tool the teacher plans the week around.

## Decided scope

| Decision | Choice |
|---|---|
| Teacher input | Words only (comma/newline separated). No per-word metadata entry |
| Word matching | Known words (in the 653-word `WORD_BANK`) get full exercise variety from existing metadata; unknown words get diktat + spellpick only |
| Student access | Dedicated "📝 Ugens ord" button on the welcome screen, visible only when the student's class has a non-empty list |
| Lifecycle | ONE active list per class; the teacher edits/replaces it in place. No archive, no week numbers (can be added later) |
| Follow-up | A "Ugens ord" column in the class overview: "7/10 · 80%" (unique words attempted / list length · correct rate). Computed from the existing `answers` table — no schema change for tracking |
| Repetition | Students may retrain the list freely; XP/boss/chests work as in normal training |
| Ruled out (YAGNI) | AI metadata generation (needs serverless proxy), multiple/named lists, per-word teacher metadata, list archive |

## Data model (Supabase)

One new table; RLS disabled like the rest of the project. Run manually in the Supabase SQL editor:

```sql
create table word_lists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique references groups(id) on delete cascade,
  words jsonb not null default '[]'::jsonb,  -- array of lowercase strings, max 30
  created_by text,
  updated_at timestamptz not null default now()
);
alter table word_lists disable row level security;
```

`words` is an array of normalized strings (trimmed, lowercased, deduplicated, 1–40 chars each, max 30 entries). The app upserts on `group_id`. Saving an empty list deletes the row.

## Teacher editor (dashboard)

New panel in `phase-dashboard`, rendered when a class is selected (above the class overview table):

- A textarea; input split on commas and newlines, normalized live.
- Below it, one chip per word: **✓ known** (green) if the normalized word matches a `WORD_BANK` entry (case-insensitive exact match on the `word` field), **◌ unknown** (orange) otherwise, with a one-line legend explaining the difference.
- "Gem ugens ord" button → upsert `{ group_id, words, created_by: activePlayer, updated_at: now }`. Empty input → delete the row. Show "Sidst opdateret" from `updated_at`.
- Validation: dedup, drop empty strings, cap at 30 words (alert if exceeded), max 40 chars per word.

New functions (names follow dashboard conventions): `renderWordListEditor(groupId)`, `parseWordListInput(text)`, `saveWordList(groupId)`, `loadWordList(groupId)`.

## Student flow

- After player selection (where class memberships are already fetched), also fetch `word_lists` rows for the player's classes (role `student`). First non-empty list wins (multi-class students: one list, simplest rule).
- Welcome screen shows the "📝 Ugens ord" button (subtitle: "N ord fra din lærer · <klassenavn>") only when a list exists.
- Click → `startWeeklyWordsSession()`:
  - For each word: case-insensitive lookup in `WORD_BANK`. Found → the full word object; enrich exactly like mixed training (`generateBlanks`, `buildSpellingPoliceItem`, `parseMorphemes`, sentence eligibility) and assign exercise types with the same quota logic. Not found → minimal object `{ word, hint: '', patternHint: '', sentence: '', level: Math.min(4, Math.floor((student_grade || 0) / 2)), category: 'Ugens ord' }`, eligible for diktat and spellpick only.
  - The session contains ALL list words (up to 30), shuffled, reusing the `mixedQueue`/`renderMixedItem` machinery (`isMixedSession` flow). XP, combo flame, boss trigger, chests, and `logAnswer` work unchanged.
- Retraining: allowed without limits; the button stays visible.

## Follow-up column

In `loadClassOverview`, additionally:
1. Fetch the class's `word_lists` row.
2. If present, fetch `answers` for the class's students filtered to `word in (list.words)` and `created_at >= list.updated_at`, and aggregate per student: `attempted = count(distinct word)`, `correctPct = correct answers / total answers`.
3. Render a "📝 Ugens ord" column in the class table: `"7/10 · 80%"`, or `"—"` when no attempts. Color coding follows the existing pct thresholds (≥80 green, ≥50 orange, else red).

Known quirk (accepted): a list word practiced in normal training also counts — the student did practice the word. Words logged from the weekly session use the word object's real category for known words and `'Ugens ord'` for unknown words; the column filters on the word string, not category, so both count.

## Audio for unknown words

The existing `speakWord` fallback chain already handles words without pre-generated MP3s: manifest miss → Google Cloud TTS (if `gcloud_tts_key` set) → browser SpeechSynthesis (Danish voice, 0.75 rate). No new audio infrastructure. Unknown words without a sentence simply skip the sentence playback.

## Error handling

- Supabase unavailable → student button hidden; teacher editor shows an inline error ("Kunne ikke hente/gemme — prøv igen").
- Save failure → alert with the Supabase error message (existing convention).
- List deleted while a student is mid-session → session continues (data already loaded); the button disappears on next welcome render.
- A student in multiple classes with lists → first list (deterministic order by group id); documented simplification.

## Testing (manual checklist)

1. Teacher: create list (mixed known/unknown words) → chips classify correctly → save → reload dashboard shows it.
2. Teacher: edit + save → `updated_at` bumps; clear + save → row deleted.
3. Student in the class: button appears with correct count/class name; not in a class → no button.
4. Training: known words appear with varied exercise types; unknown words only diktat/spellpick; unknown word is spoken via TTS fallback.
5. XP/combo/boss/chest all trigger as in normal training; answers appear in Supabase `answers`.
6. Class overview: column shows "n/m · pct" after training, "—" before; updates after more answers.
7. Version bumped; all UI text in Danish.

## Build order

1. SQL table + teacher editor (save/load/chips)
2. Student button + weekly session
3. Follow-up column
4. Polish + CLAUDE.md update

Each step releasable on its own; work on `v2`, deploy via merge to `main`.
