# Boss juice: sound, effects, and monsters

**Date:** 2026-06-11 · **Status:** approved design (amended after code audit — see "Code audit corrections")

## Goal

Lift the boss fights (and to a lesser degree the exercises) from "functional but visually basic" to feeling like a real game — without a canvas rewrite, without gameplay changes, and without a build step.

Three efforts: **sound effects** (WebAudio synth), **CSS juice** (particles etc.), and **boss monsters** (AI-generated sprites in a duel layout against the student's avatar).

## Code audit corrections

The repo's CLAUDE.md was stale. Verified against app.js:

- Boss **monster identity is per word category**, not per game: `BOSS_MONSTERS` (app.js:3306) already maps 9 categories to named monsters with emoji (Spøgelsesbossen, Dobbeltdragen, Troldmanden, Samlemonsteret, Bøjningszombien, Endelsesalienen, Lydbjørnen, R-Rex, Lydflagermussen).
- The **battle type is picked at random** per fight from `BOSS_BATTLE_TYPES = ['memory', 'cardcast', 'silentservant', 'pacman', 'snake']` (app.js:3318). scramble/rain/reverse/highway/spellpick exist in code but are not in the active rotation.
- All games share UI helpers: `renderBossHeader` (3554), `updateBossHP` (3592), `bossHitAnim` (3598), `bossAttackAnim` (3605), `revealBossSlot` (3614), `bossDefeated` (5268) — so juice hooks go in ~6 shared functions, not in every game.

## Decided scope

| Decision | Choice |
|---|---|
| Sound coverage | Everywhere: exercises (correct/wrong), boss fights, chests, level-up. On by default, mute button in header |
| Sound tech | WebAudio synth — no audio files, no licensing, works offline |
| Boss visuals | AI-generated monster sprites (gpt-image-1) in a duel layout against the student's avatar animal |
| Roster | One sprite per **category monster** — the existing `BOSS_MONSTERS` table (9 named monsters) gets an `image` field. No logic change |
| Effects | Boss-hit particles, letter-slot pop, floating damage numbers, combo flame, victory confetti |
| Effect scope | Combo flame follows the streak everywhere (also in training); the rest are boss-only |
| Ruled out | Screen shake (rejected by user), canvas rewrite (too costly vs. gain), gameplay changes |

## Architecture

Approach: **layer-on-top with new files.** app.js (352KB) barely grows; the juice lives in two new modules loaded via `<script>` tags in index.html (before app.js):

```
sfx.js          # WebAudio synth engine + 8 named sounds
fx.js           # Particles, damage numbers, confetti, combo badge, slot pop
style.css       # New keyframes/classes (duel layout, pop, flame, confetti)
app.js          # ONLY: duel layout in renderBossHeader() + one-line hook calls
index.html      # Two script tags + mute button + version bump
images/bosses/  # 9 monster webp files (1024×1024, transparent, ~50-150KB each)
generate-boss-images.js  # one-off gpt-image-1 generation script (follows generate-audio.js convention)
```

### sfx.js

- `AudioContext` is created lazily and unlocked on the first user interaction (one-shot pointerdown/keydown listener) — required on iOS/Safari.
- API: `SFX.play(name)` — fire-and-forget. Each sound is a small function of oscillators/noise + gain envelopes.
- Sounds: `correct`, `wrong`, `letterCatch` (a word slot fills), `bossHit`, `bossDefeat` (doubles as victory fanfare), `chestOpen`, `combo` (pitch rises with the streak count), `levelup`.
- Mute: 🔊/🔇 button in the header. Stored in localStorage as a **shared** key `sound_muted` (not player-prefixed — a device setting like `tts_voice`). Default: sound on.
- `SFX.play` is a no-op when muted or when WebAudio is unavailable — call sites need no guards.

### fx.js

All functions are fire-and-forget; spawned DOM elements are removed automatically.

- `FX.burst(el)` — ~12 particles (colored divs) out from the element's center. Used on boss hit.
- `FX.damageNumber(el, n)` — "-n" floats up from the boss and fades.
- `FX.confetti(container)` — confetti rain on boss defeat (on top of the existing death keyframes).
- `FX.slotPop(el)` — bounce class on a letter slot.
- `FX.combo.set(n)` / `FX.combo.reset()` — flame badge (🔥×n, shown from n≥2) that bumps on each increase. Driven by the existing `sessionCorrectStreak`; shown in both boss fights and training (the flame "heralds" the boss, which triggers at `BOSS_TRIGGER_STREAK = 5`).
- Respects `prefers-reduced-motion`: particles/confetti are skipped; damage numbers, colors, and sound remain.
- Particle cap: max ~30 concurrent effect elements — protects older iPads.

### Duel layout + monsters

`renderBossHeader()` (app.js:3554) is rebuilt once, shared by all battle types:

```
[student's avatar PNG]   VS   [boss-monster.webp]
        [HP bar — unchanged ids: bossHPBar, bossHPText]
        [monster name; battle-type label unchanged]
```

- The avatar is the student's displayed animal PNG: `AVATAR_LEVELS[rewardData.displayedLevel]` (the level the player shows on the welcome screen). It reacts via CSS classes: hops on slot reveal, ducks on boss attack. Pure decoration — no mechanics.
- 9 sprites in `images/bosses/<slug>.webp`, one per `BOSS_MONSTERS` entry. Names already exist in the table; only an `image` field is added.
- Generation: one-off node script (`generate-boss-images.js`) calling gpt-image-1 with one consistent style ("cute-but-dangerous cartoon monster, transparent background"). User curates before commit; skip-existing pattern allows per-monster regeneration.
- Preload: all 9 images preloaded at app start (<1.5MB total, cached after first visit).
- Fallback: `onerror` on the `<img>` → replaced by the entry's existing emoji. Nothing breaks if an image is missing or fails.

### Integration points in app.js (verified)

One-line calls where the outcome is already decided — no logic moves:

| Site | Call |
|---|---|
| `bossHitAnim()` (3598) — every boss hit, all games | `SFX.play('bossHit'); FX.burst(monsterEl)` |
| `updateBossHP()` (3592) — tracks HP delta | `FX.damageNumber(monsterEl, delta)` |
| `revealBossSlot()` (3614) — slot fills | `SFX.play('letterCatch'); FX.slotPop(slot)` + avatar hop |
| `bossAttackAnim()` (3605) — boss strikes player | `SFX.play('wrong')` + avatar duck |
| `bossDefeated()` (5268) | `SFX.play('bossDefeat'); FX.confetti(...)` |
| `showTreasureChest()` (5495) | `SFX.play('chestOpen')` |
| `doLevelUp()` (5642) | `SFX.play('levelup')` |
| 6 answer handlers: `checkSpelling` (2923), `checkFillIn` (6689), `checkSpellingPolice` (6992), `wordBuilderComplete` (7348), `pickSpkOption` (7575), `checkSentence` (7714) | `SFX.play('correct'/'wrong')` + `FX.combo.set(sessionCorrectStreak)` / `.reset()` |

## Error handling

- WebAudio unavailable/blocked → `SFX.play` is a silent no-op.
- Monster image fails → emoji fallback via `onerror`.
- `prefers-reduced-motion` → no particles/confetti.
- Load order: sfx.js and fx.js are plain synchronous scripts loaded BEFORE app.js in index.html, so `SFX`/`FX` globals always exist when app.js runs.

## Testing (manual checklist)

1. All 5 active battle types (memory, cardcast, silentservant, pacman, snake): hit particles, damage numbers, slot pop, victory confetti + sounds.
2. Training modes: correct/wrong sounds, combo flame builds from ×2 and resets on error.
3. Mute button: silences everything, persists across reload, shared across players.
4. iPad Safari: sound starts after first tap (not before), no jank in particles.
5. Offline/image failure: emoji fallback shows.
6. `prefers-reduced-motion` enabled: no particles/confetti, sound still works.
7. Version number bumped in the header (every change, per repo convention).

## Build order

1. **Sound** — sfx.js + mute button + script tag (value from day one, no dependencies)
2. **Sound hooks** — boss helpers, chests, level-up, answer handlers
3. **CSS effects** — fx.js + style.css keyframes
4. **FX hooks** — boss flow + combo at answer sites
5. **Duel layout** — rebuilt boss header with avatar (emoji as interim boss)
6. **Monsters** — generation script + curation + `image` fields + preload

Each step is releasable on its own (GitHub Pages deploys from main; work happens on the `v2` branch).
