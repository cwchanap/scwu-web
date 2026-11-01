# Menu redesign, intro skip and Esc-to-title — design

## Intent

Strip the app's DOM chrome down to a single menu button, turn music on by
default, consolidate the practice/CPU choice into one setting, and rebuild the
settings menu with Tailwind in an arcade style. On the game-flow side, skip the
T1 intro (volume warning → ALICUU → NEO TEAM F.K.) so the title opens on T2,
and let Esc leave the character select for the title.

## Goals

- The top DOM bar goes away entirely: stats chip (HITS/DAMAGE), keyboard
  guide, Settings/Pause/Reset buttons. One floating Menu button top-right of
  the arena opens the settings dialog.
- Music on by default; the menu toggle is controlled and reflects the scene's
  state. (Browser autoplay rules still hold audio until first interaction.)
- One "Opponent" select replaces the mode switch + partner select: practice
  partner behaviors plus "Vs. CPU" in an optgroup'd dropdown.
- Settings dialog restyled with Tailwind — arcade theme: amber (`#ffd24a`) on
  near-black, bold italic caps, hard edges.
- `Title` starts on T2 (press any key → menu), never playing T1.
- Esc on a `CharacterSelect` screen (VS, TEAM VS and story variants) opens the
  title instead of toggling pause.

## Non-goals / anti-goals

- Nothing on the canvas changes: in-game HUD (life bars, timer, portraits,
  gauges), pause overlay, screens, letterings and all match rules untouched.
- Pause and Reset get no buttons anywhere — not in the bar, not in the menu.
  P/R/Esc keyboard shortcuts keep working (Esc still pauses during a match).
- Story mode's demos and continue screen unchanged; `Match`, `CpuVM`, dummies
  untouched.

## Approaches considered

- **Menu container**: restyle the native `<dialog>` with Tailwind (chosen) —
  it already provides Esc-close, a focus trap and the scene's modal freeze
  (`setModal`). A custom overlay or drawer would re-implement all three.
- **Opponent consolidation**: one select covering partner behaviors and the
  CPU match (chosen) vs. keeping a mode switch plus a practice-only partner
  select. The consolidated select matches the request and removes today's
  overlap (the partner list already had its own "Original CPU").
- **Theme**: arcade (chosen, via mockup) over clean-dark and glass.

## The parts

### Tailwind

- Add dev deps `tailwindcss` + `@tailwindcss/vite`, register the plugin in
  `vite.config.ts`, `@import "tailwindcss"` at the top of `src/style.css`.
- Existing stylesheet stays for the canvas shell, overlays and touch
  controls; menu markup uses Tailwind utilities. `dialog::backdrop` keeps a
  small CSS rule (Tailwind can't reach it).

### App.svelte

- `.stage-chrome` and its contents deleted; `.stage-shell` holds `.stage-body`
  plus a floating button (gear SVG + "Menu", `aria-haspopup="dialog"`,
  positioned top-right over the arena).
- Kept: the sr-only health meters and winner live region, loading/error/
  pause overlays, touch controls, and the dialog machinery (`focusArena`,
  `openSettings`, `settingsClosed`). `fighterLabels`/`labelOf`/`has` stay —
  the touch buttons still use them; the `keyboard-guide` markup goes.
- Menu contents (arcade-styled, small uppercase italic labels, amber
  accents):
  - **Opponent** select — optgroup "Practice partner": Stand, Guard, Crouch
    guard, Air guard, Attack, Jump in, CPU partner; optgroup "Match":
    Vs. CPU. While a story battle runs it shows a disabled "Story mode"
    entry (`status.mode` is `'story'`, which the App-side `mode` state never
    takes); picking any real option leaves the story for that mode.
  - **Fighter** / **Opponent** / **Stage** selects (existing data).
  - **Music** — switch, bound to a new `music` field on `GameStatus`.
  - **Max stock** / **Low health** checkboxes — enabled for the practice
    partners, disabled on Vs. CPU.
  - **Character select**, **Controls guide** link, **Close**.
- Opponent logic in App: `vsCpu` → `reset('cpu')`; a behavior →
  `setPractice({ partner })` and, if the mode isn't practice,
  `reset('practice')`. Same live-apply-then-reset pattern as today.

### scene.ts

- `private music = true`.
- `GameStatus` gains `music: boolean`; `report()` fills it so the toggle
  can't drift from the scene.
- `keydown`: `Escape` while `this.select instanceof CharacterSelect` →
  `openTitle()` (returning early, so it doesn't also toggle pause). Esc on
  the title, demos and continue screen still pauses, as today.
- `DEMOS` drops `t1` (its images/sounds no longer preload; `selectSizes`
  loses nothing since T1 objects never spawn). `select.ts`'s own `DEMOS`
  keeps `t1` — the type union and exports are unaffected.

### select.ts

- `Title.state` starts at 2; states 0–1 and their fields (`wait`, `armed`,
  `flags`) go. `restart()` returns to state 2 (the idle-countdown path replays
  T2 instead of T1).
- T1's records had one side effect worth keeping: its action 2's op `0x1f`
  records zero `globals[0..15]` (the session flags the screens and match
  openings read). `case 2:` zeroes them before `play('t2')` — same timing as
  the original (every title open, including `restart()`). Comment marks it
  authored.

### Tests and e2e

- `select.test.ts`: the T1 test becomes "opens on T2 until a press brings the
  menu, clearing globals 0–15"; the cursor test's `while (state !== 3)` loop
  still works.
- `scene.test.ts`: new test — Escape on a `CharacterSelect` opens a `Title`
  (stub `HTMLElement`/`HTMLButtonElement` globals so `keydown` runs in the
  node env).
- `e2e/smoke.spec.ts`: Menu button instead of Settings; assert the dialog
  opens and the Opponent select lists its options.

### Docs

- `docs/gameplay.md`: title opens on T2; Esc on character select returns to
  the title; the settings description updated.
- `docs/evidence.md`: record the authored changes (T1 skip, Esc-to-title,
  consolidated opponent setting, music default).
- `README.md`: update anything describing the top bar / Settings row.

## What's left to the builder

- Exact Tailwind class composition inside the arcade theme (spacing, focus
  rings, hover states) — follow the chosen mockup (`.superpowers/brainstorm/
89207-1793562086/content/menu-designs.html`, card B).
- Whether the Menu button shows a gear icon plus the word "Menu" or icon only.
