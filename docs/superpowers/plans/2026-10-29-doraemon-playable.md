# DoraEmon Select and Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DoraEmon's grid cell shows his face, every select screen lets you pick him, and story mode runs a fixed story for him on SHIN-Z's route.

**Architecture:**

- **Cell face:** the asset exporter paints his face into the exported grid PNGs.
- **Unlock:** `selectable()` admits his cell as an authored exception.
- **Story:** `scenarioOf('dora')` returns an authored story derived from SHIN-Z's and ALPHA's exported records.
- **No new code paths:** the story battles, demos and his KO path already run through existing code.

**Tech Stack:** Python 3 stdlib exporter, TypeScript, Vitest (`bun run test`), Bun.

**Spec:** `docs/superpowers/specs/2026-10-29-doraemon-playable-design.md`

## Global Constraints

- **Authored labels:** everything here is authored: the original locks him out (select flag 0, empty story). Say so in code comments and in `docs/evidence.md`, citing the recovered fact each change departs from.
- **Source files:** never edit `scwu-web-handoff/`. Don't hand-edit `src/game/generated/` or `public/assets/`; they come from `bun run assets`, and both are gitignored.
- **Exporter dependencies:** it imports only the stdlib and the handoff's tools. No PIL.
- **Tests:** run them with `bun run test` / `bunx vitest run <file>`, never `bun test`. Assertions use exact values.
- **Commits:** go on `main` (no branch). Each ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The pre-commit hook runs `bun run validate`.
- **Roster indices:** ryuko 0, zoma 1, kiki 2, chung 3, amiro 4, anmc 5, giant 6, suneo 7, yo 8, sin 9, lizard 10, kay 11, dido 12, sakuya 13, alex 14, sou 15, hiso 16, erus 17, feng 18, sean 19, gon 20, kate 21, remu 22, rear 23, gigi 24, sww 25, ogi 26, ziro 27, masa 28, times 29, zenka 30, zmega 31, alpha 32, shinz 33, zaku 34, pachelo 35, golf 36, asura 37, ttro 38, astroman 39, yinan 40, aya 41, dora 45.
- **Story globals:** story battles in tests use the globals the real route leaves. Pick DoraEmon on the story select screen, then play every earlier demo step through `StoryDemo` on the shared `globals`; battles in between are skipped. Global 3 is 10 at steps 1–3, 0 at 5–17 and 10 at 19–24.

## Review Focus

1. **TEAM VS:** a TEAM VS cursor resting on cell 45 stands DoraEmon's face as that seat's member, like any fighter (Task 2 test).
2. **Story select:** resting on cell 45 shows his select face and starts his story, not a lock (Task 2 test).
3. **Losing step 1** (GIANT) must lead to Continue, not on to step 2: battle `flags` bit 0 (Task 3 test).
4. **The final SHIN-Z battle:** a KO there is a loss, not a win for the 1P (`koScorer` 2) (Task 3 test).
5. **KO with three or more stocks:** in a duel he enters KO RELOAD (72) and still loses, with stock and life unrecovered. In a brawl he revives, spending three stocks for 600 life. A brawl KO with fewer stocks is a draw (Task 3 tests).

---

### Task 1: Paint his face into the exported grids

**Files:**

- Modify: `scripts/export_assets.py`: `export_demo` (≈4733–4780), plus new helpers beside `export_images` (≈805).
- Modify: `docs/evidence.md`: the **Character select** entry (line ≈86).
- Test: `src/game/select.test.ts`.
- Also commit: the spec and this plan.

**Interfaces:**

- Produces (Python, internal to the exporter):
  - `rgba_png(width: int, height: int, rgba: bytes) -> bytes`: an 8-bit RGBA PNG (colour type 6), each row filter 0, IDAT from `zlib.compress`.
  - `image_rgba(c, index) -> bytearray`: decode through `c.pixels_and_palette(index)`. A palette colour of pure black gets alpha 0 (`indexed_png`'s `tRNS` rule); everything else gets 255.
  - `paint_dora_cell(grid: bytearray, width: int, face: bytes) -> None`: paints in place.
  - `DORA_GRIDS = {"select": (13, 30), "demo11": (13,)}`: the CHAR SELECT and TEAM VS grid images that get painted.

- [ ] **Step 1: Write the failing test** in `select.test.ts` (new `it` in the `character select` describe):

```ts
it("paints DoraEmon's face over his GATE LOCK cell (authored)", () => {
  // Decodes our own RGBA, filter-0 PNG.
  const pixel = (file: string, x: number, y: number) => {
    const png = readFileSync(
      new URL(`../../public/assets/${file}`, import.meta.url),
    );
    expect(png[25]).toBe(6);
    const width = png.readUInt32BE(16);
    const idat: Buffer[] = [];
    for (let at = 8; at < png.length;) {
      const size = png.readUInt32BE(at);
      if (png.toString('latin1', at + 4, at + 8) === 'IDAT')
        idat.push(png.subarray(at + 8, at + 8 + size));
      at += size + 12;
    }
    const rows = inflateSync(Buffer.concat(idat));
    const at = y * (1 + 4 * width);
    expect(rows[at]).toBe(0);
    return [...rows.subarray(at + 1 + 4 * x, at + 5 + 4 * x)];
  };
  for (const file of ['select/13.png', 'select/30.png', 'demo11/13.png']) {
    expect(pixel(file, 130, 366)).toEqual([240, 192, 0, 255]); // his yellow eye
    expect(pixel(file, 146, 370)).toEqual([224, 0, 0, 255]); // his red nose
    expect(pixel(file, 110, 380)).toEqual([254, 254, 254, 255]); // cell 44's GATE LOCK, untouched
  }
});
```

(Import `readFileSync` from `node:fs` and `inflateSync` from `node:zlib`.)

- [ ] **Step 2: Run it and see it fail**

Run: `bunx vitest run src/game/select.test.ts -t "paints DoraEmon"`
Expected: FAIL. `png[25]` is 3, since the grids are still indexed.

- [ ] **Step 3: Implement the helpers and hook them into `export_demo`**

`paint_dora_cell` is pinned by the approved mockup:

```
cell = x 128, y 345, 25 × 72 in the 206 × 417 grid
face = DoraEmon's image 266 (98 × 133), scaled 1.5× to 147 × 199,
       top-left at cell + (−92, −29); scaled pixel (sx, sy) samples face
       (int((sx + 0.5) / 1.5), int((sy + 0.5) / 1.5))
for each cell pixel: alpha 0 → leave; r + g + b < 120 → leave (the border);
  else → the face pixel if inside the scaled face and opaque, else (30, 60, 140, 255)
```

- **Hook:** in `export_demo`, after `export_images` has written `key`'s images, for each index in `DORA_GRIDS.get(key, ())`:
  1. Decode that grid with `image_rgba(c, index)`.
  2. Paint it with `paint_dora_cell(...)`.
  3. Write it with `write_if_changed(PUBLIC / f"{key}/{index}.png", rgba_png(...))`.
- **His face:** take it from `player(*FIGHTERS["dora"]["source"])`, which checks the hash, then `image_rgba(c, 266)`.
- **Comment:** the code says why this is authored: his cell is GATE LOCK in the source, and the `0x4452cc` flag is 0.

- [ ] **Step 4: Re-export and run the test**

Run: `bun run assets && bunx vitest run src/game/select.test.ts`
Expected: PASS, every select test included.

- [ ] **Step 5: Record it in `docs/evidence.md`**

Add an **Authored** sentence to the Character select entry. It says:

- The source draws cell 45 as GATE LOCK.
- The export paints his image 266 over it in CHAR SELECT 13 and 30 and TEAM VS 13, at 1.5×, keeping the cell's border.
- See Task 2 for the unlock.

- [ ] **Step 6: Commit**

```bash
git add scripts/export_assets.py src/game/select.test.ts docs/evidence.md docs/superpowers/specs/2026-10-29-doraemon-playable-design.md docs/superpowers/plans/2026-10-29-doraemon-playable.md
git commit -m "Paint DoraEmon's face over his GATE LOCK cell"
```

---

### Task 2: Let every select screen pick him

**Files:**

- Modify: `src/game/select.ts:91-99` (`selectable` and its comment).
- Modify: `src/game/select.test.ts`: the two locked-list assertions (≈52, ≈369), plus new tests.
- Modify: `src/game/vs.test.ts:170` (the test title's "whom it never offers").
- Modify: `docs/evidence.md`: the **Character select**, **VS paths** and **Story screens** entries, which call him locked or never offered.
- Modify: `docs/gameplay.md:7`, `README.md:1025`, `src/App.svelte` (≈2213–2218, the GATE LOCK sentence).

**Interfaces:**

- Produces: `selectable(index: number, bit = 2): boolean`, true for index 45 at both bits. The signature is unchanged.

- [ ] **Step 1: Write the failing tests** in `select.test.ts`:
  - Locked lists:
    - VS becomes `[33, 42, 43, 44, 48, 49]`.
    - Story becomes `[42, 43, 44, 47, 48, 49]`.
    - Update both comments.
  - `it('lets VS pick DoraEmon (45), authored')`:
    1. `new CharacterSelect([[5, 5], [0, 0]])`, then `step()`.
    2. Expect `select.hover[0]` to be `45` and `shown(select, 'dora', 84)` to be defined.
    3. `run(select, [{ punch: true }, {}])`, then `run(select, tap({ kick: true }))`.
    4. Step until `done`.
    5. Expect `select.done` to equal `['dora', 'ryuko']`.
  - `it('lets TEAM VS seat DoraEmon')`:
    1. `new CharacterSelect([[5, 5], [0, 0]], false, teamDemo as Demo)`, then `step()`.
    2. Expect `select.hover[0]` to be `45`, and a `container === 'dora'` object with `owner === 3`.
  - In the `story select` describe, `it('lets story mode choose DoraEmon')`:
    1. `new CharacterSelect([[5, 5]], true)`, then `step()`.
    2. Expect `hover` to equal `[45, -1]`.
    3. `run(select, tap({ punch: true }))`, then step until `done`.
    4. Expect `select.done` to equal `['dora', 'dora']`.

- [ ] **Step 2: Run them and see them fail**

Run: `bunx vitest run src/game/select.test.ts`
Expected: FAIL. `hover[0]` is `-1`, and the locked lists still include 45.

- [ ] **Step 3: Change `selectable`** so index 45 passes the flag test at either bit. The other checks stay as they are.

Add a comment that this is authored: his flag byte is 0 and nothing writes `0x4452cc`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `bunx vitest run src/game/select.test.ts src/game/vs.test.ts src/game/team.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the docs and help**
  - **Locked cells:** they're now SHIN-Z (VS only) and the empty slots.
  - **DoraEmon's cell:** locked in the original, it shows his face here and can be chosen in VS, TEAM VS and story (authored).
  - **Where:** `gameplay.md:7`, `README.md:1025` and the help in `App.svelte`.
  - **Wording:** in `evidence.md`'s VS paths entry, "whom VS single never offers" becomes "whom the original's VS single never offers".
  - **`vs.test.ts:170` title:** make the same change.

- [ ] **Step 6: Commit**

```bash
git add src/game/select.ts src/game/select.test.ts src/game/vs.test.ts docs/evidence.md docs/gameplay.md README.md src/App.svelte
git commit -m "Let the select screens choose DoraEmon"
```

---

### Task 3: His story

**Files:**

- Modify: `src/game/story.ts:47-48` (`scenarioOf`).
- Test: `src/game/story.test.ts` (the table) and `src/game/dora.test.ts` (battles).
- Modify: `docs/evidence.md`: the **DoraEmon** entry (line ≈82) and the **Story screens** entry.
- Modify: `docs/gameplay.md:17` and the DoraEmon paragraph in `src/App.svelte` (≈2156).

**Interfaces:**

- Consumes: `scenarioOf('shinz')` and `scenarioOf('alpha')`, the exported records, unchanged.
- Produces: `scenarioOf(who: Who): readonly Step[]`. For `'dora'` it returns 27 steps. The signature is unchanged.

**The story** (substitutions on SHIN-Z's steps 0–25. Each list replaces the `player` of that step's non-null slots, in order):

| Step | Change from `shinz[step]`                  |
| ---- | ------------------------------------------ |
| 1    | players `[6]`, battle `flags` 1            |
| 3    | `[14]`                                     |
| 5    | `[13, 3, 9, 8, 20, 21, 36]`                |
| 7    | `[26, 11, 15, 10, 5, 24, 37]`              |
| 9    | `[19, 0, 23, 17, 4, 16, 36]`               |
| 11   | `[7, 22, 18, 1, 12, 2, 37]`                |
| 15   | `[28, 27, 29, 25, 39, 38, 31]`             |
| 23   | `{ type: 2, demo: 8 }`                     |
| 24   | `{ ...scenarioOf('alpha')[21], stage: 3 }` |
| 25   | `{ type: 2, demo: 89 }`                    |
| 26   | `{ type: 4 }`                              |

Every other step from 0–22 is `shinz[step]` unchanged.

- [ ] **Step 1: Write the failing table test** in `story.test.ts`, as `it("runs DoraEmon's authored story on SHIN-Z's route")`:
  - `scenarioOf('dora')` has length 27.
  - For each battle step in the table, `slots.filter(Boolean).map((s) => s.player)` equals the list.
  - Step 1 matches `{ stage: 8, flags: 1 }`.
  - Steps 0, 2, 4, 6, 8, 10, 12, 13, 14, 16, 17, 18, 19, 20, 21 and 22 equal `scenarioOf('shinz')[i]`.
  - Steps 23–26 equal the table's values.
  - `new Story('dora').next()` is `{ kind: 'demo', demo: 3 }`, and the following `next()` is a battle with GIANT (6).
  - `retry()` then returns that same battle again. That's the continue screen's yes.
  - The spec's demo check needs no test. `StoryDemo` never takes the 1P (`new StoryDemo(index, demo, seed)`), so demos 3–89 play the same for him as for SHIN-Z.

- [ ] **Step 2: Write the failing battle tests** in `dora.test.ts`, in a new `describe("DoraEmon's story (authored)")`.

Shared helpers:

- `reach(step): number[]` returns the globals at that step:
  1. Pick him on the story select screen: `new CharacterSelect([[5, 5]], true)`, tap punch, step until `done`, then take `select.globals`.
  2. For each demo step before `step`, run `new StoryDemo(demo, data, 0)` with `.globals` set to that array. Step it with `{}`, adding a fresh punch every other tick after 3000 ticks, so demo 25 (which waits for a press) ends.
- `lose(step, stock, until = (m) => !!m.winner)`:
  1. `Match.story('dora', scenarioOf('dora')[step] as Battle, 0, undefined, reach(step))`.
  2. Step until `roundTicks > fightTick`, and record `dora.action` there as `atFight`.
  3. Set `[dora.stock, dora.hp] = [stock, 1]`.
  4. Step until `until(match)`, capped at 20000 ticks, collecting each tick's `dora.action === 'script' ? String(dora.branch) : dora.action`.
  5. Return `{ globals, atFight, winner, points, path, stock, hp }`.

The tests:

- `it('loses step 1 to GIANT on a KO, which offers Continue')`:
  - `lose(1, 0)` has `globals[3]` `10`, `atFight` `'idle'`, `winner` `'opponent'` and `points[1] >= 100`.
  - `scenarioOf('dora')[1].flags & 1` is `1`.
- `it('enters KO RELOAD in a duel with three stocks but still loses, unrecovered')`:
  - `lose(1, 4)` has a `path` containing `'72'`, `winner` `'opponent'`, `stock` `4` and `hp` ≤ 1.
- `it('revives through KO RELOAD in a brawl, spending three stocks for 600 life')`:
  - `lose(5, 4, (m) => m.fighters[0].hp === 600)` has `globals[3]` `0`, `atFight` `'idle'`, a `path` containing `'72'` then `'74'`, `stock` `1` and `hp` `600`.
- `it('draws a brawl when KO'd with fewer than three stocks')`:
  - `lose(5, 0)` has `winner` `'draw'`.
- `it('loses the final SHIN-Z battle (step 24) on a KO')`:
  - `lose(24, 0)` has `globals[3]` `10`, `atFight` `'idle'` and `winner` `'opponent'`.

- [ ] **Step 3: Run them and see them fail**

Run: `bunx vitest run src/game/story.test.ts src/game/dora.test.ts`
Expected: FAIL. `scenarioOf('dora')` is `[]`.

- [ ] **Step 4: Implement `scenarioOf`'s `'dora'` case** in `story.ts`:
  - Build it once at module load from the substitution table above.
  - Comment it as authored: his file's story is empty and the original never offers him in story. It follows SHIN-Z's route, with SHIN-Z in DoraEmon's secret place and ALPHA's SHIN-Z record, so a KO loses. Step 1's `flags` is 1, as in ALPHA's and ZENKA's step 1, so a loss offers Continue.

- [ ] **Step 5: Run the tests and see them pass**

Run: `bunx vitest run src/game/story.test.ts src/game/dora.test.ts`
Expected: PASS.

- [ ] **Step 6: Update the docs and help**
  - **`evidence.md`:** an authored paragraph in the DoraEmon entry, with:
    - the step table, and how it was drawn: one seeded shuffle of the 26 regulars outside step 15, with step 15 kept to the late group and TTRO/ASTROMAN in its late places;
    - the grunt allies (GOLF/ASURA, Z-MEGA at 15);
    - step 1's flags;
    - step 24 from ALPHA's record;
    - the dropped DoraOP/DoraED.
    - The globals the demos leave, by step.
    - In duels and boss fights `knockOut`'s points end the battle first, so he never revives there, as ALPHA's KO Boss only works as the CPU.
    - In brawls nobody scores the 1P's KO: with three or more stocks KO RELOAD revives him (three stocks for 600 life), and with fewer the brawl ends as a draw.
  - **Story screens entry:** no longer lists him as locked.
  - **`gameplay.md:17`:** DoraEmon can be chosen. His story runs the boss route, with GOLF and ASURA as allies, ZENKA and ALPHA, and SHIN-Z last.
  - **`App.svelte`:** one sentence in his help paragraph saying the same.

- [ ] **Step 7: Commit**

```bash
git add src/game/story.ts src/game/story.test.ts src/game/dora.test.ts docs/evidence.md docs/gameplay.md src/App.svelte
git commit -m "Give DoraEmon a story on SHIN-Z's route"
```

---

### Task 4: Verify in the browser

**Files:** none changed, unless a check fails.

- [ ] **Step 1: Run the full checks**

Run: `bun run validate && bun run build`
Expected: both pass.

- [ ] **Step 2: Check the screens**
  1. Start `bun run dev`, then in the browser go from the title to **VS**.
  2. Check that his cell shows the face from the approved mockup, and that the 1P arrow rests on it and shows his select face.
  3. Pick him against anyone. Check that the match starts with his intro.
  4. Back on the title, go to **SINGLE**, pick him, and check that demo 3 plays and then the GIANT duel starts.
  5. Check the **TEAM VS** grid shows his face.

- [ ] **Step 3: Clean up**

Delete `.playwright-mcp/` if the check made one. Leave the dev tab ready to play.
