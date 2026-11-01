# Menu Redesign, Intro Skip and Esc-to-Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the DOM chrome to a single menu button, rebuild the settings dialog in an arcade style with Tailwind, consolidate practice/CPU into one Opponent select, default music on, skip the T1 intro scenes, and let Esc leave character select for the title.

**Architecture:** All gameplay/canvas code stays untouched. Changes are: `select.ts` `Title` starts on T2 and replicates T1's globals clear; `scene.ts` handles Esc on `CharacterSelect` and reports `music`; `App.svelte` loses the chrome bar and gets a floating menu button plus a Tailwind-styled `<dialog>`; `style.css` gets `@import "tailwindcss"` and sheds the removed-chrome rules.

**Tech Stack:** Svelte 5 (runes), Tailwind CSS v4 via `@tailwindcss/vite`, Phaser 4, Vitest, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-11-01-menu-redesign-design.md`

## Global Constraints

- The 10 ms tick, `Match`, `CpuVM`, dummies, HUD (`hud.ts`) and all canvas rendering are **untouched** — no exceptions.
- Fidelity convention: mark authored (non-recovered) behavior in comments and update `docs/gameplay.md` + `docs/evidence.md` in Task 5.
- `bun run test` = Vitest (never `bun test`); `bun run check` = svelte-check; pre-commit runs `bun run validate` (assets + format:check + lint + check + test) — every commit must pass it.
- Opponent select values: each `DummyBehavior` (`'stand' | 'guard' | 'crouchGuard' | 'airGuard' | 'attack' | 'jumpIn' | 'cpu'`, `DUMMY_BEHAVIORS` order) plus the literal `'vsCpu'` for match mode.
- The settings dialog keeps its accessible wiring: `bind:this={dialog}`, `onclose={settingsClosed}`, `onkeydown={(event) => event.stopPropagation()}`.
- Tailwind classes go in markup; do not add a Tailwind config file or a prettier class-sorting plugin.

## Review Focus

- Keys inside the open settings dialog must not reach the scene's window handler — the dialog's `stopPropagation` guards it (pinned by the e2e smoke's P/R and Escape checks in Task 4).
- The Opponent select must reflect story mode: `status.mode` can be `'story'` while the App-side `mode` stays at its last non-story value, so the derived value and the reset decision read `status.mode` (pinned by `src/menu.test.ts` in Task 4).
- `Title.restart()` (menu idle countdown) must return to T2, not T1 — covered by the implementation reading `state = 2`; verified by the Task 1 test's state assertions.
- Music on-by-default must reach the title/select tracks too (`selectTrack`), not only stage music — Task 3's select-open test path and Task 4's manual dev check.
- TEAM VS and story selects are also `CharacterSelect` — Esc returns to the title from all of them; Task 2 covers the shared class, manual check on team select in Task 4.

---

### Task 1: Title skips T1 and clears the session globals

`Title` opens on T2 (press any key → menu), never playing T1's three intro scenes. T1's records zeroed `globals[0..15]`, which the match's opening paths and screens read — that clear moves to T2's start so returning to the title still resets session state. The scene also stops preloading T1's assets.

**Files:**

- Modify: `src/game/select.ts` (`Title` class, ~lines 632–728)
- Modify: `src/game/scene.ts` (`DEMOS` + `import t1`, ~lines 7, 92)
- Test: `src/game/select.test.ts` (title describe, ~lines 339–413)

**Interfaces:**

- Consumes: existing `Screen.load('t2')`, `TITLE.flags` (`& 0x40` → wait-for-press state 3), `TITLE.items`, `TITLE.cursor`.
- Produces: `Title.state` public field values — starts at 2, then 3 (T2 holding), 4 (menu setup), 5 (menu). No `Title` API changes; `scene.ts` uses it unchanged.

- [ ] **Step 1: Replace the failing test**

In `src/game/select.test.ts`, replace `it('plays T1 for its 700 ticks, then T2 until a press brings the menu')` with:

```ts
it('opens on T2 until a press brings the menu, clearing the session globals (authored)', () => {
  const title = new Title();
  title.globals[3] = 100;
  title.globals[15] = 5;
  title.step();
  // T1's action 2 zeroed globals 0–15; skipping the intro keeps that clear
  // at T2's start (authored).
  expect([title.globals[3], title.globals[15]]).toEqual([0, 0]);
  expect([title.state, title.objects.map((o) => o.container)]).toEqual([
    3,
    Array(9).fill('t2'),
  ]);
  // T2 lasts until a press: the logo (1) and the backdrop's quadrants.
  for (let t = 0; t < 2000; t++) title.step();
  expect([title.state, frame(title, 't2', 8)]).toEqual([3, 1]);
  title.step({ crouch: true });
  expect(title.state).toBe(4);
  title.step({ crouch: true });
  // The cursor (KGT 78) sets global 0, which shows T2's menu (5).
  expect(title.items).toEqual([0, 1, 2]);
  expect(title.state).toBe(5);
  title.step();
  title.step();
  expect(frame(title, 't2', 9)).toBe(5);
  expect(frame(title, 'kgt', TITLE.cursor)).toBe(137);
});
```

Keep the second test (`moves its cursor a press at a time…`) — its `while (title.state !== 3) title.step()` loop still works from state 2.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/game/select.test.ts -t "opens on T2"`
Expected: FAIL — `state` is 1 and objects are `['t1', 't1', 't1']`.

- [ ] **Step 3: Edit `Title` in `src/game/select.ts`**

- `state = 0` → `state = 2`.
- In `control`, delete `case 0` and `case 1` and the fields they used: `private wait`, `private armed`, `private flags` (keep `private countdown`, `private left`, `private cursor`, `private latch`, `private previous`).
- `case 2` becomes (note the authored clear and inlined `play`):

```ts
case 2:
  // T1's action 2 zeroed globals 0–15 (op 0x1f set records); skipping the
  // intro keeps its clear at T2's start, restart included (authored).
  this.globals.fill(0, 0, 16);
  this.left = this.load('t2').duration;
  this.countdown = this.left;
  this.state = TITLE.flags & 0x40 ? 3 : 4;
  return;
```

- Delete `private play` (its last use was `play('t1')`/`play('t2')`; the `left` field survives via the assignment above).
- `restart()`: `this.state = 0` → `this.state = 2`.
- Leave `const DEMOS = { select, t1, t2 }` and the `t1` import in place — `SelectContainer` and `programs()` still resolve `'t1'`.

- [ ] **Step 4: Drop T1's preload in `src/game/scene.ts`**

Remove `import t1 from './generated/t1.json';` and change `const DEMOS = { select: selectData, t1, t2 }` to `{ select: selectData, t2 }`. `selectSizes` and the preload loop follow automatically; T1 objects never spawn so nothing needs their sizes.

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run src/game/select.test.ts src/game/scene.test.ts`
Expected: PASS (both).

- [ ] **Step 6: Commit**

```bash
git add src/game/select.ts src/game/scene.ts src/game/select.test.ts
git commit -m "feat: skip the T1 intro, opening the title on T2"
```

### Task 2: Esc on character select returns to the title

`Escape` on any `CharacterSelect` (VS, TEAM VS, story) opens the title instead of toggling pause. Esc elsewhere keeps today's behavior (pause in a match or on the title/demos/continue screens).

**Files:**

- Modify: `src/game/scene.ts` (`keydown`, ~lines 339–349)
- Test: `src/game/scene.test.ts` (append; import `Title` alongside `CharacterSelect`)

**Interfaces:**

- Consumes: `this.select instanceof CharacterSelect` (already imported in scene.ts), private `openTitle()`.
- Produces: none new — `openTitle()` already exists.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/scene.test.ts`:

```ts
it('opens the title when Escape is pressed on the character select', () => {
  vi.stubGlobal('HTMLElement', class {});
  const { scene, view } = boot();
  scene.openSelect();
  expect(view.select).toBeInstanceOf(CharacterSelect);
  (view.keydown as (e: unknown) => void)({
    code: 'Escape',
    repeat: false,
    target: {},
    preventDefault: () => {},
  });
  expect(view.select).toBeInstanceOf(Title);
});

it('still pauses on Escape during a match', () => {
  vi.stubGlobal('HTMLElement', class {});
  const { scene, view } = boot();
  (view.keydown as (e: unknown) => void)({
    code: 'Escape',
    repeat: false,
    target: {},
    preventDefault: () => {},
  });
  expect(scene.paused).toBe(true);
});
```

(`boot()` sets `view.select = null`, so the second test exercises the pause path. `stubGlobal` keeps `e.target instanceof HTMLElement` legal under the node environment.)

- [ ] **Step 2: Run to verify the first test fails**

Run: `bunx vitest run src/game/scene.test.ts`
Expected: first test FAILS — `select` stays a `CharacterSelect` (today Escape pauses, `scene.paused === true`); second test passes already.

- [ ] **Step 3: Add the Escape branch in `scene.ts` `keydown`**

Immediately before the existing `!e.repeat && (e.code === 'Escape' || e.code === 'KeyP')` → `togglePause()` block:

```ts
// Esc on a select screen goes back to the title, not pause (authored).
if (
  !e.repeat &&
  e.code === 'Escape' &&
  this.select instanceof CharacterSelect
) {
  e.preventDefault();
  this.openTitle();
  return;
}
```

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run src/game/scene.test.ts`
Expected: PASS (all 11).

- [ ] **Step 5: Commit**

```bash
git add src/game/scene.ts src/game/scene.test.ts
git commit -m "feat: Esc on the character select returns to the title"
```

### Task 3: Music on by default, reported in GameStatus

**Files:**

- Modify: `src/game/scene.ts` (`GameStatus` ~line 52, `initialStatus` ~line 73, `music` ~line 237, `setMusic` ~line 772, `report` ~line 1316)
- Modify: `src/App.svelte` (initial `status` literal ~line 53 — adds `music: true` so `bun run check` stays green)
- Test: `src/game/scene.test.ts` (append)

**Interfaces:**

- Consumes: existing `setMusic(on: boolean)`, `playMusic`, `selectTrack`.
- Produces: `GameStatus.music: boolean` — Task 4's toggle binds `checked={status.music}`.

- [ ] **Step 1: Write the failing test**

Append to `src/game/scene.test.ts`:

```ts
it('reports music on by default and follows setMusic', () => {
  const { scene, view, statuses } = boot();
  (view.report as () => void)();
  expect(statuses.at(-1)?.music).toBe(true);
  scene.setMusic(false);
  expect(statuses.at(-1)?.music).toBe(false);
});

it('reports music while a screen is open', () => {
  const { scene, statuses } = boot();
  scene.openSelect();
  scene.setMusic(false);
  expect(statuses.at(-1)?.music).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/game/scene.test.ts -t "reports music"`
Expected: FAIL — `music` is `undefined`/`false` on both paths.

- [ ] **Step 3: Implement in `src/game/scene.ts`**

- `GameStatus`: add `music: boolean` (comment: the scene's music toggle).
- `initialStatus`: `music: true`.
- `private music = true` — update its comment to note on-by-default.
- `setMusic`: restructure the select branch's early `return` into an `if/else` so `this.report()` runs on both paths (`setModal`/`togglePause` report too):

```ts
setMusic(on: boolean) {
  this.music = on;
  if (this.select) {
    if (on) {
      this.selectTrack?.play();
      if (this.frozen()) this.selectTrack?.pause();
    } else this.selectTrack?.stop();
  } else this.playMusic();
  this.report();
}
```

- `report()`: `music: this.music` in the status literal.
- `src/App.svelte`: add `music: true` to the local `status` initial literal.

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run src/game/scene.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/scene.ts src/App.svelte src/game/scene.test.ts
git commit -m "feat: music on by default, reported in GameStatus"
```

### Task 4: Tailwind, single Menu button and the arcade-styled dialog

Removes the DOM chrome bar and rebuilds the settings dialog. Verification is `bun run check` + `bun run lint` + the updated e2e smoke test against a local build.

**Files:**

- Create: `src/menu.ts`
- Create: `src/menu.test.ts`
- Modify: `package.json`, `bun.lock` (`bun add -d tailwindcss @tailwindcss/vite`)
- Modify: `vite.config.ts` (register `tailwindcss()` first in `plugins`)
- Modify: `src/style.css` (`@import "tailwindcss"` on line 1; generic `button` rules move into `@layer base`; delete removed-chrome rules)
- Modify: `src/App.svelte` (delete `.stage-chrome` markup; add floating menu button; rebuild the `<dialog>`)
- Test: `e2e/smoke.spec.ts` (update assertions)

**Interfaces:**

- Consumes: `GameStatus.music` (Task 3), existing `reset`, `setPractice`, `setFighter`, `setOpponent`, `setStage`, `openSelect`, `openSettings`, `settingsClosed`, `focusArena`, `labelOf`, `has`, `DUMMY_BEHAVIORS`, `partnerLabels`, `stageLabels`, `ROSTER`.
- Produces: `opponentChoiceOf(mode: Mode, partner: DummyBehavior): string` and `resetModeOf(value: string, mode: Mode): Mode | null` from `src/menu.ts`, used only by App.svelte.

- [ ] **Step 1: Install Tailwind**

```bash
bun add -d tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Write the failing menu test**

Create `src/menu.test.ts` (picked up by the `src/**/*.test.ts` include):

```ts
import { describe, expect, it } from 'vitest';
import { opponentChoiceOf, resetModeOf } from './menu';

describe('opponent select', () => {
  it('maps the match mode and partner to its value', () => {
    expect(opponentChoiceOf('practice', 'guard')).toBe('guard');
    expect(opponentChoiceOf('cpu', 'stand')).toBe('vsCpu');
    expect(opponentChoiceOf('story', 'stand')).toBe('story');
  });

  it('resets to the picked mode, live partner changes aside', () => {
    expect(resetModeOf('vsCpu', 'practice')).toBe('cpu');
    expect(resetModeOf('vsCpu', 'story')).toBe('cpu');
    expect(resetModeOf('guard', 'cpu')).toBe('practice');
    expect(resetModeOf('guard', 'story')).toBe('practice');
    expect(resetModeOf('guard', 'practice')).toBeNull();
    expect(resetModeOf('story', 'practice')).toBeNull();
  });
});
```

Run: `bunx vitest run src/menu.test.ts` — expected FAIL (`./menu` not found).

- [ ] **Step 3: Create `src/menu.ts`**

The Opponent select's value/reset mapping, kept pure so it is unit-testable:

```ts
import type { DummyBehavior } from './game/dummy';
import type { Mode } from './game/match';

// The consolidated Opponent select's values: each practice partner, plus
// 'vsCpu' for a real CPU match and 'story' as a placeholder while a story
// battle runs. Reads status.mode — the App-side mode state never takes
// 'story', so it cannot see a story battle.
export const opponentChoiceOf = (mode: Mode, partner: DummyBehavior): string =>
  mode === 'cpu' ? 'vsCpu' : mode === 'story' ? 'story' : partner;

// The mode a picked value resets to: a partner while practice runs changes
// the live match without one; anything else starts that mode fresh.
export const resetModeOf = (value: string, mode: Mode): Mode | null =>
  value === 'vsCpu'
    ? 'cpu'
    : mode === 'practice' || value === 'story'
      ? null
      : 'practice';
```

Run the test again — PASS.

- [ ] **Step 4: Wire the plugin, import and CSS layers**

`vite.config.ts`: `import tailwindcss from '@tailwindcss/vite';` and add `tailwindcss()` as the first entry of `plugins`.

`src/style.css` line 1: `@import "tailwindcss";`.

Move the generic element rules into `@layer base` — the global `button` defaults, `button:hover:not(:disabled)`, `button:active:not(:disabled)`, `button:disabled`, `button:focus-visible` (keep `.arena:focus-visible` where it is), and the `h1, h2, p` reset (or drop it — the preflight already zeroes margins). Unlayered author CSS beats every layered utility regardless of source order, so these must be layered for the menu's utility classes to win. Component-scoped rules (`.touch-controls button`, `.pause-overlay button`, `.settings-dialog`→`.menu-dialog`, etc.) stay unlayered — their elements don't take utility classes.

- [ ] **Step 5: Rebuild `App.svelte`'s chrome and dialog**

Script changes:

- Import `opponentChoiceOf`/`resetModeOf` from `./menu` and derive the consolidated value from `status.mode` (which can be `'story'`):

```ts
const opponentChoice = $derived(
  opponentChoiceOf(status.mode, practice.partner),
);
function setOpponentChoice(value: string) {
  const partner = DUMMY_BEHAVIORS.find((b) => b === value);
  if (partner) setPractice({ partner });
  const to = resetModeOf(value, status.mode);
  if (to) reset(to);
}
```

Markup changes:

- Delete the whole `.stage-chrome` block (stats chip, keyboard guide, floating controls). `.stage-shell` now contains `.stage-body` only.
- Inside `.stage-body`, after the overlays, add the floating menu button (last child so it paints above; arcade styling, gear SVG + "Menu"):

```svelte
<button
  class="absolute top-2 right-2 z-10 flex items-center gap-1.5 border border-[#8a6a2f] bg-[#141a20e6] px-3 py-2 font-bold italic text-[#ffd24a] hover:bg-[#241a0c] disabled:opacity-40"
  aria-haspopup="dialog"
  disabled={!status.ready}
  onclick={openSettings}
>
  <svg …gear path… aria-hidden="true" /> Menu
</button>
```

- Keep: the `.arena` host, sr-only health meters, the winner live region (`sayWinner` stays), loading/error/pause overlays, touch controls, all of `fighterLabels`/`labelOf`/`has` (touch buttons use them).
- Rebuild the `<dialog>` contents in the arcade theme (mockup `.superpowers/brainstorm/89207-1793562086/content/menu-designs.html` card B):
  - `<dialog>` keeps `bind:this={dialog}`, `onclose={settingsClosed}`, `onkeydown` stopPropagation; `aria-label="Menu"`; Tailwind: `open:flex open:flex-col open:gap-3 w-[min(92vw,400px)] max-h-[86svh] overflow-auto border border-[#6b4e1f] bg-[#0d0b08] p-5 text-[#f2e6c8]`.
  - Title row: `SCWU MENU` (bold italic, amber, small divider rule) and a dim `Esc to close` hint.
  - `OPPONENT` label + `<select value={opponentChoice} disabled={!status.ready} onchange={e => setOpponentChoice(e.currentTarget.value)}>` — `{#if opponentChoice === 'story'}<option value="story" disabled>Story mode</option>{/if}` first so the value always has an option to land on, then `<optgroup label="Practice partner">` over `DUMMY_BEHAVIORS` (labels from `partnerLabels`, `'cpu'` renders as "CPU partner") and `<optgroup label="Match">` with `<option value="vsCpu">Vs. CPU</option>`.
  - `1P`/`2P` selects side by side (existing `setFighter`/`setOpponent`, same disables: `!status.ready || status.selecting || status.story`), `STAGE` select (`!status.ready || status.story`).
  - `MUSIC` row: checkbox `checked={status.music}` `disabled={!status.ready}`, `onchange` → `session?.scene.setMusic(checked)` + `focusArena()`.
  - `MAX STOCK`/`LOW HEALTH` checkboxes (`checked={practice.maxStock}`/`{practice.lowHealth}`, `disabled={!status.ready || opponentChoice === 'vsCpu' || opponentChoice === 'story'}` — they read only in practice).
  - Footer: `CHARACTER SELECT` button (existing `dialog.close(); openSelect()`, disabled `!status.ready || status.selecting`), `Controls guide` link (`href={\`instructions.html#${fighter}\`}`), primary `CLOSE` button (`dialog.close()`).
  - Field styling per mockup B: amber italic uppercase micro-labels, `#241a0c` field fills, `#8a6a2f` borders, amber left-border accent on the Opponent select, dashed-amber dividers, amber `CLOSE`. Option/optgroup list styling is native — don't chase it.

`src/style.css` deletions: `.mode-switch` (incl. `.active`, `.settings-dialog .mode-switch`, `@media` rules), `.text-button`, `.music-toggle`, `.stats-chip`, `.floating-controls` (+ `kbd` variant), `.match-stats`, `.result-label`, `.practice-options`, `.keyboard-guide`, `.settings-dialog` blocks except a renamed `.menu-dialog::backdrop { background: #05070ae6 }`, `.stage-chrome` + its comment, `kbd` rules, `.rematch`, and each media-query reference to removed classes. Keep: the `button` defaults (inside `@layer base`, per Step 4), focus-visible, `.stage-shell`, `.stage-body`, `.arena`, `.sr-only`, `.stage-overlay`, `.pause-overlay`, `.primary-button`, `.app-shell`, `.cabinet`, `.touch-controls`.

- [ ] **Step 6: Update `e2e/smoke.spec.ts`**

Replace the Settings assertions, and extend them past open-only coverage: the dialog must contain game keys (P does not pause, R does not reset), close on Escape, and return focus to the canvas:

```ts
const menu = page.getByRole('button', { name: 'Menu' });
const failed = page.getByText('Couldn’t enter the arena.');
await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
  timeout: 60_000,
});
await expect(failed).toBeHidden();
await expect(menu).toBeEnabled();

await menu.click();
const dialog = page.getByRole('dialog', { name: 'Menu' });
await expect(dialog).toBeVisible();
const opponent = dialog.getByLabel('Opponent');
await expect(opponent).toBeEnabled();
await expect(opponent.locator('option', { hasText: 'Vs. CPU' })).toBeAttached();
await opponent.selectOption('guard');

// Keys stay inside the dialog: P does not pause, R does not reset, and
// Escape closes it, returning focus to the canvas so P pauses again.
const resume = page.getByRole('button', { name: 'Resume match' });
await page.keyboard.press('p');
await page.keyboard.press('r');
await expect(resume).toBeHidden();
await page.keyboard.press('Escape');
await expect(dialog).toBeHidden();
await expect(page.locator('.arena canvas')).toBeFocused();
await page.keyboard.press('p');
await expect(resume).toBeVisible();
expect(errors).toEqual([]);
```

- [ ] **Step 7: Verify**

```bash
bun run format && bun run lint && bun run check
bun run build && bun run e2e
```

Expected: all green. Manual check (optional but recommended): `bun run dev`, open the page — no top bar, Menu button top-right, dialog shows the arcade panel, Esc on character select returns to the title, music plays after first interaction, re-picking the current opponent choice doesn't reset.

- [ ] **Step 8: Commit**

```bash
git add package.json bun.lock vite.config.ts src/style.css src/App.svelte src/menu.ts src/menu.test.ts e2e/smoke.spec.ts
git commit -m "feat: arcade menu over a floating button, consolidated opponent setting"
```

### Task 5: Docs and final validation

**Files:**

- Modify: `docs/gameplay.md` (title-flow paragraph ~line 7, settings/mode paragraphs)
- Modify: `docs/evidence.md` (authored-behavior entries)
- Modify: `README.md` (title/select paragraph ~line 1056, settings ~1058–1063, shortcuts table ~line 77)

- [ ] **Step 1: Update `docs/gameplay.md`**

- Title flow: the game opens on the title screen (the T1 intro is skipped — authored); any key brings the menu; Esc on the character select returns to the title.
- Settings → Menu: describe the floating Menu button and the consolidated Opponent select (practice partners + Vs. CPU); remove the mention of the keyboard guide at the top of the screen; music on by default, untick in the menu.

- [ ] **Step 2: Update `README.md`**

- Title/select paragraph: opens on the title screen directly (no intro scenes), Esc on select returns to the title; "**Reset**" button references become the `R` key; "**Character select** in Settings" → "in the Menu".
- Settings paragraph: the gear/Menu button; the Opponent select covering the partner behaviors and Vs. CPU; Music ticked by default; drop "the keyboard guide at the top of the screen".
- Shortcuts table: note `Escape` also returns to the title from the select screen (it still pauses in a match).

- [ ] **Step 3: Update `docs/evidence.md`**

Add authored-behavior entries (match the file's existing entry style): T1 intro skipped (T2 opens the title; its `globals[0..15]` clear replicated from T1 action 2's op `0x1f` records); Esc-to-title on the character select; consolidated Opponent setting; music on by default; DOM chrome bar removed.

- [ ] **Step 4: Final validation**

```bash
bun run validate && bun run build && bun run e2e
```

Expected: everything green.

- [ ] **Step 5: Commit**

```bash
git add docs/gameplay.md docs/evidence.md README.md
git commit -m "docs: menu redesign, T1 skip and Esc-to-title evidence"
```
