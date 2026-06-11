# Boss juice: sound, effects, and monsters

**Date:** 2026-06-11 · **Status:** approved design

## Goal

Lift the boss fights (and to a lesser degree the exercises) from "functional but visually basic" to feeling like a real game — without a canvas rewrite, without gameplay changes, and without a build step.

Three efforts: **sound effects** (WebAudio synth), **CSS juice** (particles etc.), and **boss monsters** (AI-generated sprites in a duel layout against the student's avatar).

## Decided scope

| Decision | Choice |
|---|---|
| Sound coverage | Everywhere: exercises (correct/wrong), boss fights, chests, level-up. On by default, mute button in header |
| Sound tech | WebAudio synth — no audio files, no licensing, works offline |
| Boss visuals | 5 AI-generated monsters (gpt-image-1) in a duel layout against the student's avatar animal |
| Roster | One fixed, named monster per boss game (recognizability over variety) |
| Effects | Boss-hit particles, letter-slot pop, floating damage numbers, combo flame, victory confetti |
| Effect scope | Combo flame follows the streak everywhere (also in training); the rest are boss-only |
| Ruled out | Screen shake (rejected by user), canvas rewrite (too costly vs. gain), gameplay changes |

## Architecture

Approach: **layer-on-top with new files.** app.js (352KB) barely grows; the juice lives in two new modules loaded via `<script>` tags in index.html:

```
sfx.js          # WebAudio synth engine + ~10 named sounds
fx.js           # Particles, damage numbers, confetti, combo badge, slot pop
style.css       # New keyframes/classes (duel layout, pop, flame, confetti)
app.js          # ONLY: rebuilt renderBossHeader() + ~12-15 one-line hook calls
index.html      # Two script tags + version bump
images/bosses/  # 5 monster webp files (~512×512, transparent, <60KB each)
```

### sfx.js

- `AudioContext` is created lazily and unlocked on the first user interaction (one-shot pointerdown/keydown listener) — required on iOS/Safari.
- API: `SFX.play(name)` — fire-and-forget. Each sound is a small function of oscillators/noise + gain envelopes.
- Sounds: `correct`, `wrong`, `click` (tapping letter buttons in scramble/fillin), `bossHit`, `bossDefeat`, `chestOpen` (variant per rarity), `combo` (pitch rises with the streak count), `letterCatch` (rain/pacman), `fanfare` (victory), `levelup`.
- Mute: 🔊/🔇 button in the header. Stored in localStorage as a **shared** key `sound_muted` (not player-prefixed — a device setting like `tts_voice`). Default: sound on.
- `SFX.play` is a no-op when muted or when WebAudio is unavailable — call sites need no guards.

### fx.js

All functions are fire-and-forget; spawned DOM elements are removed on `animationend`.

- `FX.burst(el)` — ~12 particles (colored divs) out from the element's center. Used on boss hit.
- `FX.damageNumber(el, n)` — "-n" floats up from the boss and fades.
- `FX.confetti(container)` — confetti rain on boss defeat (on top of the existing death keyframes).
- `FX.slotPop(el)` — adds/removes a bounce class on a letter slot.
- `FX.combo.set(n)` / `FX.combo.reset()` — flame badge (🔥×n) that glows more at higher streaks. Reuses the existing streak counter; shown in both boss fights and mixed training (the flame "heralds" the boss, which triggers at 5 in a row).
- Respects `prefers-reduced-motion`: particles/confetti are skipped; color feedback and sound remain.
- Particle cap: max ~30 concurrent effect elements (oldest removed first) — protects older iPads.

### Duel layout + monsters

`renderBossHeader()` is rebuilt once, shared by all 5 games:

```
[student's avatar PNG]   VS   [boss-monster.webp]
                              [HP bar]
                              [monster name · game name]
```

- The avatar is the student's existing animal PNG (`images/animal_levels/`, by XP level). It reacts via CSS classes: hops on a correct answer, ducks on a wrong one. Pure decoration — no mechanics.
- 5 monsters in `images/bosses/<game>.webp`: scramble, rain, memory, reverse, pacman. Danish names (e.g. Bogstav-Trolden, Glemsels-Spøgelset) — final names are chosen during curation and hardcoded in a small `BOSS_MONSTERS` table in app.js (name + image + emoji fallback per game).
- Generation: one-off task with gpt-image-1, one consistent style ("cute-but-dangerous cartoon monster, transparent background"). User curates before commit. 1024×1024 → downscaled webp.
- Preload: all 5 images preloaded at app start (<300KB total).
- Fallback: `onerror` on the `<img>` → replaced by the current emoji. Nothing breaks if an image is missing or fails.

### Integration points in app.js

One-line calls at the places where the outcome is already decided — no logic moves:

| Site | Call |
|---|---|
| Boss takes damage (all 5 games) | `SFX.play('bossHit'); FX.burst(monsterEl); FX.damageNumber(monsterEl, dmg)` |
| Letter caught/guessed (slots fill) | `SFX.play('letterCatch'); FX.slotPop(slotEl)` |
| Boss defeated | `SFX.play('bossDefeat'); FX.confetti(bossArea)` + fanfare |
| Wrong answer (boss + exercises) | `SFX.play('wrong')` |
| Correct answer (exercises) | `SFX.play('correct'); FX.combo.set(streak)` |
| Streak broken | `FX.combo.reset()` |
| Chest opened | `SFX.play('chestOpen')` |
| Level-up | `SFX.play('levelup')` |

## Error handling

- WebAudio unavailable/blocked → `SFX.play` is a silent no-op.
- Monster image fails → emoji fallback via `onerror`.
- `prefers-reduced-motion` → no particles/confetti.
- fx.js/sfx.js missing (cache mishap) → hook calls are not individually wrapped; the files define global objects and are loaded synchronously BEFORE app.js in index.html.

## Testing (manual checklist)

1. All 5 boss games: hit particles, damage numbers, slot pop, victory confetti + sounds.
2. Mixed training: correct/wrong sounds, combo flame builds up and resets.
3. Mute button: silences everything, persists across reload, shared across players.
4. iPad Safari: sound starts after first tap (not before), no jank in particles.
5. Offline/image failure: emoji fallback shows.
6. `prefers-reduced-motion` enabled: no particles, sound still works.
7. Version number bumped in the header.

## Build order

1. **Sound** — sfx.js + mute button + hooks (value from day one, no dependencies)
2. **CSS effects** — fx.js + style.css + hooks
3. **Duel layout** — rebuilt boss header with avatar + emoji as interim boss
4. **Monsters** — generation + curation + `BOSS_MONSTERS` + preload (the only step with an external dependency)

Each step is releasable on its own (GitHub Pages auto-deploys from main; work happens on the `v2` branch).
