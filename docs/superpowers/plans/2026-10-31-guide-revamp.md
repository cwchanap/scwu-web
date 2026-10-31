# Guide Revamp — Per-Fighter Pages in the New Mockup's Design — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-page prose guide with the user-authored mockup's design — one page per fighter (hash routing), roster navigated by the select screen's own face grid, moves in tables with input keycaps, motion glyphs and gauge-pip costs.

**Architecture:** `instructions.html` stays the entry. `src/instructions/Instructions.svelte` is rebuilt to the mockup's layout with Svelte-scoped styles; the prose data model (`guides.ts` strings) is replaced by structured per-fighter data (`moves.ts`): sections of rows (name / input / optional cost / description), authored from the existing prose. The roster sidebar's face grid uses the select sheet (`/assets/select/13.png`) with the hardcoded grid order from `src/game/select.ts`'s ROSTER (no runtime import). Per-fighter hero art and nameplate paths live in the data; text fallbacks render when absent.

**Tech Stack:** Svelte 5 (scoped styles), existing Vite entry, Google Fonts via `<link>` in `instructions.html` (shortcut: self-host when this ships). No new npm dependencies.

**Spec:** the user-authored mockup at `docs/superpowers/specs/2026-10-31-guide-revamp-mockup.html` IS the design (colors, grid math, section chrome, pips, responsive behavior); `docs/superpowers/specs/2026-10-30-fullscreen-settings-instructions-design.md` still governs the entry's isolation constraints.

## Global Constraints

- No new npm dependencies; no changes to `src/game/` (read-only test imports and type-only imports are the exceptions).
- `src/instructions/` must not import anything from `src/game/` at runtime, and must not import Phaser; `App.svelte` never imports `guides.ts`/`moves.ts`.
- The grid order, tile origins (`XS`), pips, and styling are copied from the mockup verbatim; where prose numbers differ per fighter, table rows carry that fighter's numbers.
- Table rows are authored from the current prose in `src/instructions/guides.ts` (git history keeps the prose) — no new gameplay facts invented; the old prose paragraphs are deleted with the old model.
- Verification through Bun; tests stay in `src/instructions/fighters.test.ts` (adapted to the new model).

## Review Focus

1. **A fighter with no rows** (46th `Who` lands silently with an empty page) — pinned by the adapted completeness test: every ROSTER id has ≥2 sections and ≥4 rows total.
2. **Roster grid drift** (select.ts ROSTER order changes and the face grid points at wrong faces) — pinned by a test comparing the hardcoded GRID names against `CHARACTERS` keys (nulls dropped).
3. **Game bundle leaking onto the instructions page** — unchanged source-isolation test still guards it.
4. **Content infidelity** (a fighter's rows contradict its prose — wrong stock costs, wrong motions) — pinned by per-batch task review against the prose (Task 3's reviewer reads both); costs are cross-checked against `stocks`/`perStock` in each fighter's JSON where the prose is explicit.
5. **Broken hash routing / mobile stacking** — controller smoke pass: `#ryuko` and `#zoma` render only that fighter, roster folds on narrow viewports, rows stack.

---

### Task 1: Framework — new Instructions page + data model + Ryuko

**Files:**

- Modify: `src/instructions/Instructions.svelte` (full rewrite to the mockup's design)
- Modify: `src/instructions/main.ts` (unchanged mount; only if needed)
- Create: `src/instructions/moves.ts` (data model + Ryuko's guide)
- Modify: `src/instructions/guides.ts` → deleted (prose lives in git history)
- Modify: `src/instructions/fighters.test.ts` (new model)
- Modify: `instructions.html` (fonts link)
- Reference: `docs/superpowers/specs/2026-10-31-guide-revamp-mockup.html`

**Interfaces:**

- Produces: `moves.ts` exports `GRID: readonly (string | null)[]` (select-grid order, GATE LOCK cells null), `XS: readonly number[]` (tile x origins), `FighterGuide` type, and `GUIDES_DATA: Record<Who, FighterGuide>` with `FighterGuide = { art: string; nameplate: string; role: string; tag: string; ex: boolean; sections: { title: string; note: string; cost: boolean; rows: { name: string; input: string; desc: string; cost: number }[] }[] }` — `input`/`desc` are authored static HTML (`<kbd>`, `<span class="motion">`, `<b>`), `cost` is 0.5/1/2/3 stocks (0 = none), `art`/`nameplate` are `/assets/<who>/<n>.png` paths (empty string = render text fallback).

- [ ] **Step 1: Adapt the tests** (TDD): completeness per the new shape (≥2 sections, ≥4 rows, non-empty role/art for every ROSTER id); GRID names (nulls dropped) equal `Object.keys(CHARACTERS)`; keep the isolation tests; `GUIDE_TEXT` import replaced. Run → FAIL (cannot resolve `./moves`).
- [ ] **Step 2: Port the mockup** into `Instructions.svelte`: scoped styles verbatim from the mockup; hash routing (`location.hash` → current fighter, default `ryuko`; one fighter rendered; hashchange listener; roster `aria-current`); roster face grid generated from `GRID`/`XS`; pips from `cost` (0.5 → `.half`); text fallback when `nameplate` is empty (`.role`-style display text); back link `href="/"`. Fonts `<link>` in `instructions.html`.
- [ ] **Step 3: Ryuko's data** ported from the mockup's three tables verbatim (Movement & basics / Specials / Supers & system + gauge note).
- [ ] **Step 4: Verify** — `bunx vitest run src/instructions/fighters.test.ts` green; `bun run validate` green; `bun run build` emits `dist/instructions.html`.
- [ ] **Step 5: Commit** `feat: guide revamp framework — per-fighter pages from the select-screen design`.

### Task 2: Per-fighter art and nameplates (vision)

**Files:**

- Modify: `src/instructions/moves.ts` (`art`, `nameplate` per fighter)

**Interfaces:**

- Consumes: Task 1's model; `/assets/<who>/` image folders; `selectFace`/JSON only for cross-checks.
- Produces: `art`/`nameplate` filled for all 45 (empty string where no good candidate exists).

- [ ] **Step 1:** Build a throwaway contact-sheet page (one section per fighter, every image at thumbnail height with its index) served by the dev server; do NOT commit it.
- [ ] **Step 2:** For each fighter, pick: hero art (tall standing/action pose, like Ryuko's `419.png`) and nameplate (wide thin banner like Ryuko's `464.png`, only if the fighter has one — many will not; empty string then). Record picks in `moves.ts`. Delete the contact sheet.
- [ ] **Step 3:** Verify tests + validate; commit `feat: per-fighter hero art and nameplates for the guide`.

### Task 3: Content — all fighters' move tables (batches)

**Files:**

- Modify: `src/instructions/moves.ts` (`GUIDES_DATA` for the 44 remaining fighters)
- Reference: the old prose via `git show 0850ece:src/instructions/guides.ts` (each batch's dispatch quotes its fighters' paragraphs — subagents do not run git)

Three batches of ~15 fighters (zoma…suneo/yo; sin…ziro; masa…training), each: rows authored from that fighter's paragraph only, per the mockup's row style (names as the prose names them — e.g. "DRAGON", "G Beam" — inputs with the fighter's keys AND motions where the prose gives them, costs from the prose's stock counts, EX/ Evil / desperation variants inside the desc or a suffixed row). Where a fighter's prose describes system behavior (COUNTER HIT, chains), it gets a row like Ryuko's page has.

- [ ] Per batch: author rows → `bunx vitest run src/instructions/fighters.test.ts` green → `bun run validate` → commit `feat: guide tables for <batch>`.
- [ ] Reviewer per batch checks rows against the quoted prose (Review Focus 4).

### Task 4: Sweep, smoke, docs

- [ ] Controller smoke: hash routing renders one fighter; roster folds <900px; rows stack ≤700px; no game resources on the page; back link works.
- [ ] README `#play` guide pointer mentions per-fighter pages (one line).
- [ ] Final: `bun run validate` green; commit.
