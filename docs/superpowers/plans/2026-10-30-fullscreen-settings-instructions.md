# Full-Screen Game Page, Settings Overlay, Standalone Instructions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game canvas fills the whole window; all controls move into an in-game settings modal; the controls guide becomes a standalone `instructions.html` page (one anchored section per fighter) opened in a new tab.

**Architecture:** A second Vite HTML entry (`instructions.html`) renders a static Svelte page with zero runtime imports from `src/game/` (that tree pulls 44 MB of generated JSON); guide prose lives in `src/instructions/guides.ts` as static HTML strings, so a unit test can prove every fighter has a section, and the shared `ROSTER` list also drives the game page's two fighter pickers. The game page (`App.svelte`) drops its toolbar, footer, and ~1,300-line help panel; a floating gear button opens a platform `<dialog>` (`showModal()`) holding the relocated controls, whose existing scene calls (`setFighter`, `setPractice`, …) stay untouched; cleanup runs from the dialog's `close` event, the one path every close takes. CSS in `src/style.css` makes `.stage-shell` a `position: fixed; inset: 0` full-bleed host; Phaser's existing `Scale.FIT` letterboxes the 4:3 canvas inside it.

**Tech Stack:** Svelte 5, platform `<dialog>`, Vite (rolldown options), existing `style.css`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-30-fullscreen-settings-instructions-design.md`

## Global Constraints

- No new npm dependencies.
- No changes to `src/game/` (read-only imports in tests, and type-only imports that erase at build, are the exceptions).
- `src/instructions/` must not import anything from `src/game/` at runtime, and must not import Phaser.
- `App.svelte` may import `src/instructions/fighters.ts` (the roster) but never `guides.ts` (the prose).
- Verification commands run through Bun: `bunx vitest run`, `bun run check`, `bun run build`, `bun run validate`.
- Prose moves verbatim except the wording fixes this plan lists; no rewrites.
- This is authored web UI, not recovered source behavior — no `docs/evidence.md` changes.

## Review Focus

1. **A fighter with no guide text, or missing from a picker** (someone adds a 46th `Who` later) — pinned by the Task 1 test (roster order + non-empty text per `Who`; nav, sections, and both game-page pickers all render from the same `ROSTER`, so links and options can't dangle).
2. **Instructions page pulling in the game bundle** (one stray `src/game` value import loads 44 MB of JSON) — pinned by the source-isolation test in Task 1, which scans `src/instructions/` for runtime game/Phaser imports.
3. **Shortcuts and focus leaking out of the settings modal** (scene.ts listens on `window`; its target check skips only INPUT/SELECT/TEXTAREA, so `P`/`R`/`Escape` fire from dialog buttons, and setters call `focusArena()`) — pinned by `<dialog>.showModal()` + `onkeydown` stopPropagation + the `focusArena()` guard in Task 2, verified by the dev-server smoke step.
4. **Pause ownership breaking across resets or close paths** (`begin()` sets `paused = false`, so a fighter change behind the modal unpauses the match; and `cancel` doesn't fire on every close path) — pinned by the hold-while-open effect and `onclose`-only cleanup in Task 2, verified for initially-running and already-paused matches in the smoke step.
5. **Touch users losing pause/reset or the controls being hidden by the full-screen canvas** — pinned by floating pause/reset beside the gear and the overlay-positioned touch pad in Task 2, checked at a mobile viewport. (`.stage-shell` must keep a real height — see its `position: fixed; inset: 0` rule — or `Scale.FIT` fits the canvas into nothing.)

---

### Task 1: Standalone instructions page

**Files:**

- Create: `instructions.html`
- Create: `src/instructions/main.ts`
- Create: `src/instructions/fighters.ts`
- Create: `src/instructions/guides.ts`
- Create: `src/instructions/Instructions.svelte`
- Test: `src/instructions/fighters.test.ts`
- Modify: `vite.config.ts` (build input), `src/style.css` (guide styles)

`App.svelte` is NOT touched in this task (prose is copied; Task 2 deletes the original).

**Interfaces:**

- Consumes: `import type { Who }` from `../game/characters` (type-only; erased at build).
- Produces: `fighters.ts` exports `ROSTER: readonly { id: Who; name: string }[]` — 45 entries in `Who` roster order (`ryuko` … `training`); `guides.ts` exports `BASICS: readonly string[]` (shared paragraphs) and `GUIDE_TEXT: Record<Who, string>` (one fighter's paragraphs, concatenated). Task 2 consumes `ROSTER` and the URL `instructions.html`.

- [ ] **Step 1: Write the failing tests**

`src/instructions/fighters.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../game/characters';
import { ROSTER } from './fighters';
import { GUIDE_TEXT } from './guides';

const here = new URL('.', import.meta.url).pathname;
// `import type` lines are erased at build and so cannot pull the bundle in.
const stripTypeImports = (text: string) =>
  text.replace(/^\s*import type [^;]+;/gm, '');

describe('instructions page', () => {
  it('lists every fighter in roster order', () => {
    expect(ROSTER.map((entry) => entry.id)).toEqual(Object.keys(CHARACTERS));
  });

  it('gives every fighter real guide text', () => {
    for (const entry of ROSTER) {
      expect(GUIDE_TEXT[entry.id].length, entry.id).toBeGreaterThan(200);
    }
  });

  it('imports nothing from the game or Phaser at runtime', () => {
    const sources = readdirSync(here).filter(
      (name) => /\.(ts|svelte)$/.test(name) && name !== 'fighters.test.ts',
    );
    for (const name of sources) {
      expect(
        stripTypeImports(readFileSync(here + name, 'utf8')),
        name,
      ).not.toMatch(/from '[^']*(game\/|\bphaser\b)/);
    }
    expect(readFileSync(here + '../../instructions.html', 'utf8')).toContain(
      'src/instructions/main.ts',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/instructions/fighters.test.ts`
Expected: FAIL — cannot resolve `./fighters`.

- [ ] **Step 3: Create `src/instructions/fighters.ts`**

`ROSTER` with the 45 `{ id, name }` pairs, ids exactly the `Who` union values in order, names exactly the display labels used in `App.svelte`'s Fighter `<option>`s (Ryuko, Zoma, Kiki, Chung, Amiro, ANMC P, Giant, G Suneo, Yo, SIN, LIZARD, KAY, DIDO, SAKUYA, ALEX, SOU, HISO, ERUS, OS FENG, SEAN, GON, KATE, REMU, REAR, GIGI, SWW, OGI, ZIRO, MASA, 3-TIMES, ZENKA, Z-MEGA, ALPHA, SHIN-Z, ZAKU, PAC-HELO, GOLF, ASURA, TTRO, ASTROMAN, YINAN, AYA, DoraEmon, RARIO, TRAINING).

- [ ] **Step 4: Create `src/instructions/guides.ts` empty, and the entry files**

- `guides.ts`: `BASICS: readonly string[] = []` and `GUIDE_TEXT: Record<Who, string>` with `''` for all 45 ids (fill from Step 5).
- Run: `bunx vitest run src/instructions/fighters.test.ts` — Expected: roster test PASSES, guide-text test FAILS (documents the remaining work).
- `instructions.html`: copy `index.html`'s head/meta shape; title `SCWU — How to Play`; description naming the controls guide; `<div id="app"></div>` + `<script type="module" src="/src/instructions/main.ts"></script>`.
- `src/instructions/main.ts`: mount `Instructions.svelte` on `#app`, importing `../style.css` — mirroring `src/main.ts`.
- `vite.config.ts`: inside the existing `build.rolldownOptions`, add `input: { main: 'index.html', instructions: 'instructions.html' }` beside the existing `output`.
- `src/instructions/Instructions.svelte`: a document-style page — a "Basics" anchor plus a nav mapping `ROSTER` to `<a href={'#' + entry.id}>`, a Basics section, and per fighter a `<section id={entry.id}><h2>{entry.name}</h2>…</section>`. The prose is static authored text, so both `{@html}` uses (Basics paragraphs, fighter text) each get a preceding `<!-- eslint-disable-next-line svelte/no-at-html-tags -->` — the repo's lint config sets that rule to `error`, and the pre-commit hook runs lint.

- [ ] **Step 5: Move the prose (copy verbatim from the `{#if help}` panel in `src/App.svelte` into `guides.ts`)**

Take the panel's 58 paragraphs in document order — each runs from its opening `<p>` to its `</p>`; keep the inner HTML (with `<kbd>` tags) as one string per paragraph, `<p>` tags included. Map by order, not line number (they drift):

- `BASICS` (3): movement; stances/chains; jumps/dashes.
- `GUIDE_TEXT.ryuko` (8): drill/axe; EX; Hit Up; IORI; throw; Daisetsuzan; gauge/supers; motion commands.
- `GUIDE_TEXT.<id>` (44, one paragraph each, roster order): zoma through training — check each paragraph's opening names its fighter ("Choose Kiki to play her…", …); the last is TRAINING's practice copy.
- `BASICS` (3 more): select screen; modes/settings; pause/touch.

Wording fixes, and only these:

- Zoma opener "Choose Fighter: Zoma below the arena to play Zoma" → "Choose Zoma in Settings to play Zoma".
- Select-screen paragraph's "Character select above the arena opens it again" → "Character select in Settings opens it again".
- Modes paragraph's "Below the arena, you can also choose" → "In Settings, you can also choose".
- Pause paragraph's "use the buttons below the arena" → "use the on-screen buttons".

Also move the game page's `.page-footer` credit line ("Original SCWU art · Web training rules") to the instructions page footer; the stage-name half is dropped.

Add `.guide-*` styles to `src/style.css` (page container, sticky nav, sections); global `kbd` styling already exists there.

- [ ] **Step 6: Run tests, lint, and build**

Run: `bunx vitest run src/instructions/fighters.test.ts`
Expected: PASS (all three).

Run: `bun run validate && bun run build`
Expected: both PASS (validate runs format, lint — catching any `{@html}` rule trip — svelte-check, tsc, tests); `dist/instructions.html` exists. Bundle isolation is already pinned by the source test — no size guessing.

- [ ] **Step 7: Commit**

```bash
git add instructions.html src/instructions vite.config.ts src/style.css
git commit -m "feat: standalone per-fighter instructions page"
```

### Task 2: Full-screen game page with settings modal

**Files:**

- Modify: `src/App.svelte` (remove toolbar/help/footer and hand-written option lists; add floating controls, stats chip, settings dialog)
- Modify: `src/style.css` (full-viewport shell, overlay styles; delete dead rules)
- Modify: `index.html` (description mentions the in-game Settings and the guide page)

**Interfaces:**

- Consumes: `ROSTER` from Task 1's `src/instructions/fighters.ts` (never `guides.ts`); the URL `instructions.html`; existing scene methods (`togglePause`, `setFighter`, `setOpponent`, `setStage`, `setPractice`, `setMusic`, `control`, `reset`, `openSelect`) unchanged.
- Produces: none (end of the chain).

- [ ] **Step 1: Script changes in `App.svelte`**

- Delete `help`, `openHelp`, and the help-panel close logic.
- Add `let settingsOpen = $state(false)`, `let dialog: HTMLDialogElement`, and `let pausedBefore = false`.
- `openSettings()`: record `pausedBefore = status.paused`; if `status.ready && !status.paused && !status.resultReady` call `session?.scene.togglePause()` (the old `openHelp` guard); set `settingsOpen = true`; `dialog.showModal()`.
- Cleanup runs from `onclose` only — `cancel` doesn't fire on every close path (Chrome can skip it on Esc without recent user activation), and button/native closes all end in `close`. `settingsClosed()` (the `onclose` handler): set `settingsOpen = false`; if `status.ready && !status.resultReady && status.paused !== pausedBefore` call `session?.scene.togglePause()`; then `focusArena()`. The Close button and Character select just call `dialog.close()`; no `oncancel` handler is needed (native Esc close still fires `close`).
- Hold pause across resets — `begin()` sets `paused = false` and reports, so re-pause whenever the modal is open and the match reports unpaused: `$effect(() => { if (settingsOpen && status.ready && !status.paused && !status.resultReady) session?.scene.togglePause(); })`.
- Guard focus: `focusArena()` returns early while `settingsOpen` (setters call it after every change; without the guard focus escapes the modal).
- Dialog `onkeydown={(event) => event.stopPropagation()}` — scene.ts's window-level listener otherwise accepts `P`/`R`/`Escape` from dialog buttons.

- [ ] **Step 2: Markup restructure in `App.svelte`**

- Delete: the `.game-toolbar` header (h1, mode switch, music toggle, Character select, Controls button), the `{#if help}` help panel (all ~1,300 lines), the `.page-footer`, and both hand-written 45-entry `<option>` lists in the Fighter and Opponent selects (~88 lines).
- Both pickers render from the roster: `{#each ROSTER as { id, name } (id)}<option value={id}>{name}</option>{/each}` (the Opponent list's current Zoma-first order goes too; `value={opponent}` already defaults to Zoma).
- Keep: `.arena`, sr-only status blocks, error/pause overlays, touch controls, the compact `.keyboard-guide` per-fighter hint (now floating).
- Add a floating control cluster (top-right) — "Settings" gear button (`aria-haspopup="dialog"`, disabled while `!status.ready`), Pause/Resume button, and Reset button (same handlers as the old footer: `pause()` and `reset(...)`), so touch users keep direct access — and a stats chip (top-left) holding the existing result label / HITS · DAMAGE markup.
- Add the modal: `<dialog class="settings-dialog" bind:this={dialog} aria-label="Settings" onkeydown={...} onclose={settingsClosed}>` containing the relocated mode switch, music toggle, Character select button (`onclick={() => { dialog.close(); openSelect(); }}`), Fighter/Opponent/Stage selects, practice options (Partner, Max stock, Low health), a `<a href="instructions.html" target="_blank" rel="noopener">Controls guide</a>` link, and a Close button (`onclick={() => dialog.close()}`). Relocate markup as-is: same handlers, same `disabled` guards. No pause/reset inside the modal — they float.
- Touch controls and keyboard hint overlay the canvas (absolutely positioned) instead of flowing below it.

- [ ] **Step 3: CSS in `src/style.css`**

- `.stage-shell` becomes the full-bleed host: `position: fixed; inset: 0;` — keep `overflow: hidden`. (`.arena` is `position: absolute; inset: 0`; its height currently comes only from `.stage-shell`'s `aspect-ratio: 4 / 3`, so "drop the sizing" without a replacement collapses the game to 0 px and `Scale.FIT` fits into nothing.) `.app-shell` and `.cabinet` need no sizing rules at all.
- Style the floating cluster, stats chip, `.settings-dialog` (centered panel, `::backdrop` scrim), floating `.keyboard-guide`, and absolutely-positioned `.touch-controls` overlaying the canvas bottom.
- Delete now-dead rules: `.game-toolbar`, `h1`/`h1 span`, `.help-panel`, `.page-footer`, and the media-query blocks that only style them. Keep `.mode-switch` and `.music-toggle` styles — that markup relocates wholesale into the dialog.

- [ ] **Step 4: Verify static checks and full suite**

Run: `bun run validate`
Expected: format, lint, svelte-check, tsc, and all tests PASS.

- [ ] **Step 5: Dev-server smoke test**

Run: `bun run dev`; in a browser at `127.0.0.1:5173`: canvas fills the window; the floating Settings, Pause and Reset buttons are reachable (also at a mobile viewport with touch controls overlaid); gear opens the modal and the match pauses; Tab/Shift+Tab cycle inside the modal; `P`, `R`, and `Escape` pressed inside the modal do nothing to the match (`Escape` closes it via the native path); the Close button and Character select also close it; changing Fighter swaps the fighter live without a reload, keeps the match paused behind the modal, and keeps focus inside the modal; repeating that from a match already paused with `P` keeps it paused after closing; closing the modal resumes the match iff it was running before it opened; the fighter pickers still show all 45 names; the Controls-guide link opens `instructions.html` in a new tab with working fighter anchors. If using Playwright for this, delete `.playwright-mcp/` afterwards.

- [ ] **Step 6: Commit**

```bash
git add src/App.svelte src/style.css index.html
git commit -m "feat: full-screen game page with settings modal"
```

### Task 3: Documentation sync

**Files:**

- Modify: `README.md`, `docs/gameplay.md`, `CLAUDE.md`

**Interfaces:**

- Consumes: the shipped UI from Tasks 1–2.
- Produces: none.

- [ ] **Step 1: Fix every old-layout reference, then update the three docs**

Run: `grep -rniE '(above|below) the arena' README.md docs/ src/instructions/ src/App.svelte`
Expected hits to rewrite (this list is known-stale; the grep is the authority): README.md's `#play` section (e.g., "Below the arena, you can also choose…", "Choosing a fighter below the arena"), `docs/gameplay.md` line 7 ("Character select above the arena" twice, "Below the arena, you can also choose your fighter"), line 13 ("until a fighter is chosen below the arena"), line 25 ("Tick **Music** above the arena"), and `src/instructions/` if any prose slipped a stale phrase through. Rewrite each to name the floating controls, the Settings modal, or the in-game guide link as fits.

Then: `README.md` `#play` gains a line pointing to the in-game Controls guide link / `instructions.html` for per-fighter move lists. `CLAUDE.md`'s `src/App.svelte` bullet becomes: full-screen shell with floating controls, settings modal, and touch buttons, guide on `instructions.html`, pickers from `src/instructions/fighters.ts`.

- [ ] **Step 2: Verify the sweep and commit**

Run: `grep -rniE '(above|below) the arena' README.md docs/ src/instructions/ src/App.svelte`
Expected: no output.

Run: `bun run validate`
Expected: PASS.

```bash
git add README.md docs/gameplay.md CLAUDE.md
git commit -m "docs: settings modal and instructions page"
```
