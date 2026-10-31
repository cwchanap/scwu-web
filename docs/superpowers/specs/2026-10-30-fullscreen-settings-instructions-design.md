# Full-screen game page, settings page, standalone instructions — design

## Intent

The training UI squeezes the 960×720 game between a toolbar and a footer, and
ships a ~1,300-line controls guide inside `App.svelte` that pauses the game when
opened. Make the game fill the viewport, move all instructions to a standalone
page opened in a new tab (one sub page per character), and collect the game
page's controls into a settings page.

## Goals

- `index.html`: the game canvas occupies the full window (width and height);
  Phaser's existing `Scale.FIT` letterboxes the 4:3 canvas inside it.
- Game page keeps only floating chrome: a gear button opening the settings
  page, pause/reset (existing `P`/`R` shortcuts still work), the touch pad on
  coarse pointers, and the compact per-fighter keyboard hint line.
- Settings page: a full-screen overlay over the paused match, holding
  everything the old toolbar and footer had — mode switch, music, character
  select, fighter/opponent/stage pickers, practice options, reset — plus a
  "Controls guide" link opening `instructions.html` in a new tab.
- `instructions.html`: a second Vite entry. Shared how-to-play rules first,
  then one section per fighter with a hash anchor (`#ryuko`, `#zoma`, …) and a
  fighter index at the top for navigation.
- `App.svelte` sheds the help panel (~1,300 lines).

## Non-goals

- Bookmarkable settings (URL params or cross-tab sync — approaches B/C,
  rejected below).
- Fullscreen API.
- New instruction prose; content moves as-is apart from fixing references
  like "Choose Fighter: Zoma below the arena" that describe the old layout.
- Any gameplay or input-mapping change.

## Anti-goals

- Don't load the instructions content on the game page.
- Don't break live setting changes (switching fighter keeps working without a
  reload).

## Constraints

- Reuse the existing live-change handlers (`setFighter`, `setPractice`, …)
  unchanged; the settings overlay is a relocation of existing markup.
- Fighter section ids use the same `Who` ids as the game.
- Settings overlay behaves as a dialog (pauses the match, `Esc` closes) the
  way the old help panel did.
- a11y: overlay gets `role="dialog"`/`aria-modal`; the instructions page is a
  normal document with a per-fighter nav.

## Approaches

- **A (chosen): settings as an in-game overlay page.** Smallest complete
  change; keeps instant tweak-while-training; no plumbing.
- **B: `settings.html` with URL params.** Bookmarkable, but settings changes
  need a game reload — loses the live flow. Rejected: not asked for.
- **C: B plus localStorage-event sync for live updates.** Most code for the
  same UX as A. Rejected.

## Builder decisions (my calls, check these)

- `instructions.html` gets its own Svelte root (`Instructions.svelte`) sharing
  `style.css`; the prose lives in `src/instructions/guides.ts` as static HTML
  strings the page renders, so a test can prove every fighter has guide text.
- The settings modal is a platform `<dialog>` opened with `showModal()` —
  focus containment and background inertness come free, and its keydown
  handler stops propagation so the game's window-level `P`/`R`/`Escape`
  shortcuts never fire from inside it. Opening Settings pauses the match,
  the pause is held across match resets (which unpause), and closing restores
  the pause state from before it opened.
- Floating pause/reset buttons stay beside the gear (touch users have no `P`/`R`).
- Both fighter pickers on the game page render from the shared roster list in
  `src/instructions/fighters.ts` (names only; the game page never imports the
  guide prose).
- The old page-footer credit line moves to the instructions page.
- The existing pause overlay (Resume button) stays.

## Left to the builder

- Exact floating-chrome placement and overlay styling.
- Which shared paragraphs are Ryuko-specific and belong under her section.
