# Correction round in dictation ("ret-runde")

**Date:** 2026-10-04 · **Status:** approved design, implemented in v1.13.0

## Goal

After a wrong answer in dictation the student saw "Du skrev X, rigtigt er Y" and pressed Næste. They never wrote the correct word. The correction round makes them write it, with per-letter feedback, before moving on.

## Why not per-letter feedback on the first attempt

The original idea was green/red per letter while typing every dictation word. Rejected as the default because:

- It gives away the hard part. In *hund* the difficulty is knowing there is a d at all; a word that is not yet accepted tells the student something is missing.
- It turns spelling into guessing letters until one sticks.
- Constant immediate feedback raises performance during practice and lowers retention (guidance hypothesis, Soderstrom & Bjork). The effort of retrieving the whole word is what stores it.
- The app's level system, practice-word queue and real-misspelling distractors all need a complete wrong answer.

What survives from the idea is its strength: the student should not leave a word having only produced the wrong form (Jacoby & Hollingshead 1990), and immediate self-correction is the active ingredient in cover-copy-compare, which has large effects in spelling (Joseph et al. 2012).

## Flow

1. First attempt is unchanged: free recall, "Tjek stavning", counted in category level, practice words, score and streak.
2. On a wrong answer the feedback box shows the student's answer and the correct word as today, and the button reads **"Skriv det rigtigt"** instead of "Næste ord".
3. Pressing it (or Enter) covers the correct word, brings the listen box back, clears the field and plays the word.
4. Each correct letter stays, in green. A wrong letter makes the field shake, is shown in red under the field and is removed at once.
5. Two misses at the same position: the correct letter is inserted and the note says "Næste bogstav er d".
6. When the word is complete: "Nu sidder den!" (or "Godt, du kom igennem!" if a letter was given), the field locks, and "Næste ord" appears.

## Rules

| Question | Decision |
|---|---|
| Is the correct word visible while retyping? | No. It is covered, so the student retrieves instead of copying. |
| Does the round affect category level, practice words, score or streak? | No. The first attempt is the measurement. |
| XP | `selfCorrected = true` on the result if no letter was given, which earns the existing +3 XP. |
| Can it be skipped? | No. The two-miss rule guarantees the student always gets through. |
| Where? | Dictation in training, mixed sessions and review. Other exercise types have no free typing. |
| Red letter duration | About 0.3 s shake, then gone. The 2 s from the original idea only adds waiting. |
| Spaces | Ignored unless the word contains one, so the double-space "hear again" shortcut never counts as a miss. |
| Deleting | Accepted letters are locked; backspace does nothing. |

## Implementation

- `retrunde.js` (new, loaded before `app.js`, global `RETRUNDE`): pure logic. `create(word)` returns the state; `type(state, ch)` handles one character and returns `ok` / `wrong` / `reveal` / `ignored`; `sync(state, value)` reconciles the state with the field after an `input` event (typing, paste, deletion) and returns the events. The field's value must always equal `state.typed`.
- `app.js`: `correctionPhase` (`null | 'pending' | 'active' | 'done'`) and `correctionState`. `checkSpelling()` sets `pending` and shows `#correctBtn` on a wrong answer. `startCorrection()`, `onCorrectionInput()` (delegated `input` listener on `#spellingInput`), `finishCorrection()`, `resetCorrection()` (called from `renderWord()`). The Enter handler starts a pending round and ignores Enter while active; `nextWord()` returns early while pending or active.
- The ordinary text field is kept instead of letter boxes. Because wrong letters are removed immediately, everything in the field is correct and the whole field can be green. This works with mobile keyboards and does not reveal the word's length.
- If `retrunde.js` fails to load, dictation behaves as before.

## Testing

- `node test-retrunde.js`: 13 tests of the pure logic (acceptance, rejection, reveal after two misses, miss reset, case, whitespace, words with spaces, paste, locked deletion, Danish letters).
- Browser: wrong answer → pending → Enter → typing with a wrong letter → completion → Enter to next word, in a real mixed session with real key events; correct first answers still go straight to "Næste ord"; 375 px width.

## Not verified

Android keyboards with predictive text compose a whole word before committing it. The field's value is rewritten when a letter is rejected, which normally cancels the composition, but some keyboards re-insert the composing text. Needs a test on the family's Android phone.
