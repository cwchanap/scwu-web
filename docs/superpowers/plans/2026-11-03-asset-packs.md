# Asset Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load a battle's art and sounds as a few pack files instead of thousands of objects, published under a content-versioned, immutable-cached prefix.

**Architecture:** `export_assets.py` writes packs (`public/assets/packs/*.bin`) from the files it already exports, and later a version digest into `src/game/generated/`. A Phaser `File` subclass fetches a pack, decodes its images and sounds, and registers both in one step, under the keys the game already uses, so the renderer, recolor/tint and unload code do not change. `upload_r2.sh` publishes packs, the DOM-named art and the stage music under `<version>/` with `immutable` caching. The order follows the spec's: baseline, then the loader proven on the fighter packs (Task 4 is a gate), then the rest wired, versioned and published, then measured again.

**Tech Stack:** Python 3.10+ (exporter), TypeScript, Phaser 4.2.1, Vitest, Playwright, Bun, bash + AWS CLI.

**Spec:** `docs/superpowers/specs/2026-11-03-asset-packs-design.md`

## Global Constraints

- Texture keys stay `${who}-${index}`, `ui-${index}`, `text`, `select-${index}`, `t2-${index}`, `demo${n}-${index}`, `${stage}-${index}`; sound keys stay `${who}-sound-${index}`, `kgt-sound-${index}`, `select-sound-${index}`, `t2-sound-${index}`, `demo${n}-sound-${index}`. Nothing outside the loader changes how a key is used.
- The 10 ms tick, `Match` and every existing assertion are untouched. `scene.test.ts`'s Phaser and loader mocks may gain the surface the loader needs (`Loader.File`, event names, `load.addFile`); no assertion changes. `bun run validate`, `bun run build` and `bun run e2e` pass at the end.
- Residency: a pack whose contents are already loaded is not fetched, decoded or registered again (as `this.load.image` skips a cached key today), and one whose contents `unloadPlayers` evicted loads again. No "pack loaded" flag.
- A pack that fails to download or to process reports through the loader's `loaderror` event, as an individual file does; the scene's overlay listens to it.
- A pack's images and sounds enter Phaser's caches together, in one synchronous `addToCache` after everything has decoded, so a pack is never half resident. Images decode through an `Image` from a blob URL; sounds through `context.decodeAudioData` on a copy of their slice. Not through nested `loader.image`/`loader.audio` files: only `start()` and the per-frame `update()` call `checkLoadQueue`, so Phaser moves at most 32 queued files to in-flight per frame (`LoaderPlugin.js:942`, `:972`) and a nested file's cache entry would land after the pack's. Not through `sound.decodeAudio` either: its `DECODED_ALL` event is shared, so concurrent packs would resolve each other early.
- Audio is WebAudio only, the one path `createGame` configures (it never sets `disableWebAudio`). Under a sound manager with no `context` (HTML5 audio, which no browser we target needs, or disabled audio) a pack registers its images and skips its sounds, with a `ponytail:` comment naming that ceiling; `sound.add` would then fail under HTML5 audio. Say so in the final report.
- Packs use the `.bin` extension (on Cloudflare's default cached list; no zone rule needed). They hold the files as exported today (indexed PNG, 8-bit mono WAV), not re-encoded.
- One loader path everywhere: dev, e2e and production load packs the same way. No per-file fallback branch.
- Stage music (`stages.json` `sounds`) is never in a pack: it stays an individual file, fetched by `playMusic` as now.
- Versioned prefix objects: `Cache-Control: public, max-age=31536000, immutable`. `generated.tar.gz` and `fixtures.tar.gz` stay at the bucket root with `no-cache`, and `generated.tar.gz` is still uploaded last. Old versions and the legacy root-level objects are never deleted by a normal upload.
- Do not write to the production bucket, and do not ask for its URL or credentials. Measure against a local imitation of the bucket (Task 1); `vite preview` answers every file `no-cache` (`vite/dist/node/chunks/node.js:17270`, `:35071`) and cannot show a warm cache. Say in the final report that edge-cache behavior is unconfirmed.
- Tests that read exported art use `itWithArt` (`src/game/testing.ts`; skipped only when `CI` is set). They fail, not skip, when `bun run assets` has not produced what they read.
- Pack code lives in `scripts/export_assets.py` (not a new module): `inputs()` and `exporter()` hash only that file, so a second script would never invalidate the export or the `.exporter` fingerprint.
- Outputs (`public/assets/packs/`, `assets-version.json`) are gitignored build output. Never commit them. Nothing is pushed or uploaded by this plan: until Task 6's upload has run, a pushed build would find no packs in R2.
- Comments prefixed `ponytail:` mark deliberate shortcuts; update `README.md` and `CLAUDE.md` where they describe the pipeline.

## Review Focus

- A truncated, corrupt or undecodable pack must raise `loaderror` (the overlay), not hang or fail only in the console. Pinned in Tasks 2 and 4.
- Contents already resident (the boot stage on a first match, a re-picked stage, a reopened demo) are not fetched, decoded or registered again, and cause no "Texture key already in use". Pinned in Tasks 4 and 5.
- A fighter dropped by `unloadPlayers` and seated again later loads and draws without errors. Pinned in Tasks 4 and 5.
- An exported image or sound that is in no pack, or in two. Pinned in Task 3.
- A pack's textures and sounds appear together (nothing of it is resident until both have decoded), and a failure to decode either fails the whole pack through `loaderror`; a demo with no files (demo 29) requests no pack and still finishes loading. Pinned in Tasks 4 and 5.

---

### Task 1: Measurement harness and baseline (report only)

**Files:** none committed. Everything goes in the session scratchpad.

- [ ] **Step 1: Build the current tree** pointing at the bucket imitation below: `VITE_ASSET_BASE=http://127.0.0.1:8788/ bunx vite build`, then move `dist` to `<scratch>/base-dist` (the build copies `public/`, 513 MB; a move is free). Do not run `bun run assets` first: the exporter is untouched and its outputs already stand.
- [ ] **Step 2: Write `<scratch>/serve.ts`** (Bun). App on `:8787` serves a dist directory given as an argument. Bucket on `:8788` serves `public/assets` with `Access-Control-Allow-Origin: *` and an ETag (a matching `If-None-Match` gets 304). By layout: a path at the root (today's bucket) gets `Cache-Control: no-cache`; a path under `/<version>/` gets `public, max-age=31536000, immutable` and is served only if listed in the allowlist file passed as an argument (the `files` list of Task 6's `assets-version.json`), else 404. It appends `method path status` per bucket request to a log; the log's line count is the stand-in for R2 reads.
- [ ] **Step 3: Write the Playwright script** (node, the repo's `@playwright/test` chromium). A new context per run, so the HTTP cache is isolated; CDP `Network.emulateNetworkConditions` at Fast 4G; the bucket log cleared per run. Scenarios: (a) VS single, Yinan vs Gon on Sport Court (the heaviest pair); (b) TEAM VS seating eight heavy fighters (the nearest to the worst brawl, Alpha's step 7, reachable by keyboard; drive the story battle instead if that is practical). Per scenario record bucket requests (200 and 304 apart), bytes (CDP `Network.loadingFinished` `encodedDataLength`, summed), time from the pick to the first drawn match frame, and where the time goes, from a Performance trace: waiting on requests, loader pacing (Phaser moves at most 32 queued files to in-flight per frame, so 5,080 files need at least 160 frames before any network or decode cost), and image decode. Then reload in the same context and record bucket requests and bytes again (the second visit).
- [ ] **Step 4: Run it against `base-dist`** with the bucket serving the legacy root layout. Write the numbers to `<scratch>/baseline.md`. If decoding or loader pacing is most of the time, say so there. This is a report, not a gate.

---

### Task 2: Pack format reader and the select-subset module

**Files:**

- Create: `src/game/packs.ts`
- Create: `src/game/packs.test.ts`
- Modify: `src/game/scene.ts:105-120` (move `selectAssets` out; import it)

**Interfaces:**

- Produces, from `src/game/packs.ts`:
  - `type PackRange = [offset: number, length: number]`
  - `interface Pack { images: Record<string, PackRange>; sounds: Record<string, PackRange>; payload: Uint8Array<ArrayBuffer> }`
  - `parsePack(buffer: ArrayBuffer): Pack` — throws `Error` on a truncated or inconsistent pack.
  - `bytesOf(pack: Pack, range: PackRange): Uint8Array<ArrayBuffer>` — a view into `pack.payload`. Type both as `Uint8Array<ArrayBuffer>`: under TypeScript 5.9 a bare `Uint8Array` is `Uint8Array<ArrayBufferLike>`, which `new Blob([bytes])` rejects (TS2322) in `bun run check`.
  - `selectAssets: Record<Who, { images: Set<number>; sounds: Set<number> }>` — exactly the value `scene.ts` computes today.
- Pack format (fixed by this plan, used by Tasks 3 to 5): bytes 0–3 are a little-endian u32 `n`; bytes 4…4+n are UTF-8 JSON `{"images": {key: [offset, length]}, "sounds": {key: [offset, length]}}`; the payload starts at 4+n and offsets are relative to it. Keys are full cache keys.

- [ ] **Step 1: Write the failing tests** in `src/game/packs.test.ts`. A local helper `build(images, sounds)` assembles a pack per the format above. Tests:
  - `parsePack reads every entry back`: two images and one sound with distinct bytes; `bytesOf` returns each exactly.
  - `parsePack rejects a header longer than the file`: u32 `n` larger than the buffer → throws.
  - `parsePack rejects an entry that runs past the payload`: offset+length beyond `payload.length` → throws.
  - `parsePack rejects a buffer under 4 bytes` → throws.
  - `selectAssets lists Ryuko's select images and sounds`: `selectAssets.ryuko.images.size > 0` and every member is an index in `CHARACTERS.ryuko.images`.
- [ ] **Step 2: Run** `bunx vitest run src/game/packs.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `packs.ts`.** `parsePack` checks every entry range while parsing. Move the `selectAssets` derivation from `scene.ts:105-120` into it unchanged (keep its comment), exported; `scene.ts` imports it.
- [ ] **Step 4: Run** `bunx vitest run src/game/packs.test.ts`, then `bun run check`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `git add src/game/packs.ts src/game/packs.test.ts src/game/scene.ts && git commit -m "feat: pack format reader; move selectAssets out of scene.ts"` (end the message with the Co-Authored-By line).

---

### Task 3: Exporter writes the packs

**Files:**

- Modify: `scripts/export_assets.py` (new `write_pack`, `export_packs`; call `export_packs()` as the last step of `main()`, before the final `print`, at about `scripts/export_assets.py:4422`; the skip check at `:4902`)
- Modify: `src/game/packs.test.ts` (coverage tests)

**Interfaces:**

- Consumes: the pack format and `selectAssets` from Task 2.
- Produces: files `public/assets/packs/{boot,fighter-<who>,stage-<stage>,demo-<n>}.bin`.
- `write_pack(path: Path, images: dict[str, bytes], sounds: dict[str, bytes]) -> None` — writes the format above via `write_if_changed`; entries in sorted key order so the bytes are deterministic.

Pack contents (keys exactly as the Global Constraints list; files read from `PUBLIC / entry["filename"]`):

| Pack            | Images                                                                                                                                                                           | Sounds                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boot`          | `ui.json` → `ui-<i>`; `text.png` → `text`; `select.json` → `select-<i>`; `t2.json` → `t2-<i>`; each of the 45 fighters' images whose index is in its select subset → `<who>-<i>` | `ui.json` → `kgt-sound-<i>`; `select.json` → `select-sound-<i>`; `t2.json` → `t2-sound-<i>`; each fighter's select-subset sounds → `<who>-sound-<i>` |
| `fighter-<who>` | the fighter's exported images not in its select subset                                                                                                                           | likewise sounds                                                                                                                                      |
| `stage-<stage>` | `stages.json[stage].images` → `<stage>-<i>`                                                                                                                                      | none                                                                                                                                                 |
| `demo-<n>`      | `generated/demos/<n>.json` images → `demo<n>-<i>`                                                                                                                                | its sounds → `demo<n>-sound-<i>`                                                                                                                     |

Fighters are `["ryuko", *FIGHTERS]` (`assets.json` is Ryuko's; the others are `<key>.json`). The select subset mirrors `scene.ts`'s derivation: over all records in `select["actions"]` values, images are `u16(r, 3) & 8191` for `r[0] == 0x0c`, sounds are `u16(r, 2)` for `r[0] == 0x03` (the exporter's own `u16`, `export_assets.py:34`), each restricted to what the fighter exports. Write no pack for a fighter or demo with nothing in it (demo 29 exports none). Delete any `packs/*.bin` this run did not write.

- [ ] **Step 1: Write the failing coverage tests** in `packs.test.ts`, each with `itWithArt` (`PACKS = public/assets/packs`; read headers with `parsePack`). Tests:
  - `has every expected pack file and no other` — the expected names come from the data (`boot`, a `fighter-<who>` for each of the 45 fighters with something outside its select subset, 18 `stage-<stage>`, a `demo-<n>` for each `generated/demos/*.json` with images or sounds) and are compared with `readdirSync(PACKS)`; a missing pack fails with a message saying to run `bun run assets`.
  - `boot holds exactly the UI, text, select/t2 art and every fighter's select subset` — key sets equal what the table says, built from `ui.json`, `select.json`, `t2.json`, `CHARACTERS` and `selectAssets`.
  - `each fighter pack holds exactly the rest` — for every fighter with a pack: its keys = exported keys minus the select subset.
  - `each stage pack holds exactly the stage's images and no sounds` — all 18 `STAGES`.
  - `each demo pack matches its json` — demo 29 has no `demo-29.bin`.
  - `no key is in two packs` — the union of all keys across all packs has no duplicates.
  - `every pack entry is the exported file's bytes` — for `ryuko` and one stage, compare entries to `readFileSync(public/assets/<filename>)`.
- [ ] **Step 2: Run** `bunx vitest run src/game/packs.test.ts` with `CI` unset. Expected: the Task 2 tests pass; the coverage tests FAIL (no packs yet).
- [ ] **Step 3: Implement** `write_pack`, `export_packs` and the call in `main()`; one comment above `export_packs` citing `scene.ts`'s `selectAssets` (now `packs.ts`) as the mirrored derivation. In the `__main__` skip check, also require `PUBLIC / "packs"` to exist and be non-empty (today it checks only `PUBLIC` and `FIXTURES`), so deleted packs trigger a re-export instead of escaping `validate`.
- [ ] **Step 4: Run** `rm -f src/game/generated/.inputs && bun run assets` (the full export; takes minutes), then `bunx vitest run src/game/packs.test.ts`. Expected: all PASS, none skipped. `ls public/assets/packs | wc -l` ≈ 155. Run `bun run assets` again: expected "Assets are up to date."
- [ ] **Step 5: Commit** `scripts/export_assets.py` and `src/game/packs.test.ts` — `feat: export asset packs`.

---

### Task 4: PackFile, proven on the fighter packs (gate)

**Files:**

- Create: `src/game/packLoader.ts`, `src/game/packLoader.test.ts`, `src/game/phaserStub.ts` (test-only stub of the Phaser surface the loader and scene touch)
- Modify: `src/game/scene.ts` (`loadPlayer` only), `src/game/scene.test.ts` (mock only)

**Interfaces:**

- Consumes: `parsePack`, `bytesOf` (Task 2); `ASSET_BASE` from `assetBase.ts` (unchanged until Task 6).
- Produces, from `src/game/packLoader.ts`:
  - `packUrl(name: string): string` → `` `${ASSET_BASE}packs/${name}.bin` ``
  - `class PackFile extends Phaser.Loader.File` with `constructor(loader: Phaser.Loader.LoaderPlugin, name: string, resident: () => boolean)`; queue with `this.load.addFile(new PackFile(this.load, name, resident))`. `name` is `boot`, `fighter-<who>`, `stage-<stage>` or `demo-<n>`; `resident()` is true when the pack's contents are already loaded.

Behavior of `PackFile`: file type `'pack'`, key = `name`, extension `bin`, `responseType: 'arraybuffer'`, no cache. Model it on `node_modules/phaser/src/loader/filetypes/ImageFile.js` (the `onProcess` that builds an `Image` from a blob URL, `onProcessComplete`, `addToCache` registering the texture).

- `hasCacheConflict()` returns `resident()`. Phaser's `keyExists` already drops a duplicate with the same type and key that is queued or in flight.
- `onProcess` (async): `parsePack(this.xhrLoader.response)`. In parallel, for each image whose key is not already in `loader.textureManager`: a `Blob` of type `image/png` from `bytesOf`, an `Image` whose `src` is its blob URL, resolved on `onload`; for each sound whose key is not already in `loader.cacheManager.audio`, when the game's sound manager has a `context`: `context.decodeAudioData(<a copy of that sound's slice of the response>)` (decoding detaches the buffer it is given). When every one has settled, revoke the image URLs, keep the results in `this.data`, and `onProcessComplete()`. `addToCache()` registers every image with `textureManager.addImage(key, image)` and every buffer with `loader.cacheManager.audio.add(key, buffer)`; nothing else touches either cache. Register nothing on the loader in the constructor or in `onProcess`: `scene.test.ts` counts `load.once` calls.
- Any failure (a `parsePack` throw, an image `onerror`, a rejected `decodeAudioData`): revoke what was made, then `loader.emit(Phaser.Loader.Events.FILE_LOAD_ERROR, this)` followed by `this.onProcessError()`. Phaser's `onProcessError` alone only logs and completes the file (`File.js:479`) and never emits `loaderror`, which `scene.ts:279` listens to.
- A sound that fails to decode fails the whole pack (an individual WAV's failure is only logged today). The exported WAVs are uniform, so a failure means a bad export, which the overlay should report.

Scene wiring (this task): `loadPlayer(who, all)` — when `all` is false, unchanged (individual select files); when true, queue `new PackFile(this.load, `fighter-${who}`, resident)` instead of the per-file loop. Derive the rest from `CHARACTERS[who]` minus `selectAssets[who]`; `resident` is `this.textures.exists` on the rest's first image key (else `this.cache.audio.exists` on its first sound key); queue nothing if the rest is empty. Keep the comment above `loadPlayer` true ("the loader skips those already in").

- [ ] **Step 1: Write `phaserStub.ts` and adapt `scene.test.ts`'s mock** to use it: `Loader.File` (a minimal base class with `onProcessError`, `onProcessComplete` and a `loader` field), `Loader.Events` (`COMPLETE`, `FILE_LOAD_ERROR`), and `load.addFile` in `boot()`'s stub. `isolate: false` shares a worker's modules between test files, so both files mock `phaser` with this one stub (`vi.mock('phaser', async () => (await import('./phaserStub')).default)`). Run `bunx vitest run src/game/scene.test.ts`: still PASS, no assertion edited.
- [ ] **Step 2: Write the failing tests** in `packLoader.test.ts` (stub `Image` so setting `src` fires `onload`, and `URL.createObjectURL`/`revokeObjectURL`, with `vi.stubGlobal`):
  - `decodes each sound from its own slice` — `decodeAudioData` gets a copy of exactly that sound's bytes; a sound whose key is in the audio cache is not decoded.
  - `registers nothing until every entry has decoded` — with one image that never loads, neither `textureManager` nor the audio cache has any of the pack's keys; after success both have all of them.
  - `skips the sounds, keeps the images, when the sound manager has no context` — no throw.
  - `skips an image whose texture exists before decoding it` — no `Image` made for it; `addImage` not called for it.
  - `hasCacheConflict follows resident()`.
  - `a corrupt pack raises loaderror then errors the file` — `FILE_LOAD_ERROR` emitted once with the file, the file ends `FILE_ERRORED`, and `fileProcessComplete` is called.
  - `an image that fails to decode, or a sound that is rejected, raises loaderror` — same path.
  - `revokes every image blob URL` — on success and on failure.
  - In `scene.test.ts`, add `a fighter evicted by unloadPlayers is queued as a pack again` (`addFile` receives a `PackFile` named `fighter-<who>` on the second `whenReady`).
- [ ] **Step 3: Run** both files. Expected: the new tests FAIL (module missing).
- [ ] **Step 4: Implement `packLoader.ts` and the `loadPlayer` change.** Run `bun run check && bun run lint && bun run test`. Expected: PASS.
- [ ] **Step 5: Gate — browser proof** with the Playwright tools against `bun run dev` (delete `.playwright-mcp/` afterwards). Check, and report each:
  1. **Rendering equivalence**: Yinan vs Gon in practice. For every image key of the two fighters, hash the texture's pixels (draw to a canvas, hash `getImageData`) and compare with the same hashes from `<scratch>/base-dist` (individual files); for every sound key, compare the decoded buffer length. All equal. (Expose the game on `window` temporarily if the page cannot reach it; do not commit that.)
  2. **Error reporting**: truncate `public/assets/packs/fighter-yinan.bin` (restore it after) and pick Yinan: the overlay reads `Could not load fighter-yinan…`. Remove it instead: same overlay.
  3. **Retained**: pick the same pair twice in a row: the second pick fetches no pack, and the console shows no "Texture key already in use".
  4. **Evict and re-seat**: Ryuko vs Zoma, then Kiki vs Chung, then Ryuko vs Zoma again: sprites draw and sounds play every time; the first and third load fetch `fighter-ryuko` and `fighter-zoma`.
  5. Record the Yinan-vs-Gon load time and request count against `baseline.md`.
     If 1 to 4 fail, stop and report before Task 5.
- [ ] **Step 6: Commit** — `feat: load fighter art and sounds from packs`.

---

### Task 5: Boot, stage and demo packs

**Files:**

- Modify: `src/game/scene.ts` (`preload` at 264-283, `openDemo` at 537-566, `loadPlayer`, `loadStage` at 714-717), `src/game/scene.test.ts`

**Interfaces:**

- Consumes: `PackFile`, `packUrl` (Task 4); the packs of Task 3.

Scene wiring (keys unchanged, so nothing else in `scene.ts` changes):

- `preload`: `this.loadStage(this.stage)`, then `addFile(new PackFile(this.load, 'boot', …))` with `this.textures.exists('text')` as its `resident`. Remove the per-fighter select loop, the `ui.images`/`text`/`DEMOS`/`ui.sounds` loops. Keep the `loaderror` handler.
- `loadStage(stage)`: one `PackFile('stage-<stage>')`, `resident` = `this.textures.exists` on `${stage}-${STAGES[stage].images[0].index}` (the probe `whenReady` already uses). `whenReady` keeps calling it whenever fighters are missing, as today; residency, not the caller, stops the re-fetch.
- `loadPlayer(who)`: drop the `all` parameter; update both callers (`preload` no longer calls it; `whenReady` calls `loadPlayer(who)`).
- `openDemo`: keep the `selectSizes.set(...)` per image and the `demoTracks.add(key)` for sounds of `TRACK_SECONDS` or more; replace the two `load.image`/`load.audio` loops with one `PackFile('demo-<index>')`, added only if the demo has images or sounds, `resident` on its first image key (else first sound key).
- `playMusic` still uses `BASE + cue.filename`.

- [ ] **Step 1: Adapt `scene.test.ts`** where it stubbed `load.image`/`load.audio` for these paths; add: `a demo with no files queues no pack and still opens` (a demo json with empty `images` and `sounds`, `finishLoad()` opens it) and `the first match queues the boot stage's pack as already resident` (`addFile` receives a `PackFile` named `stage-<stage>` whose `hasCacheConflict()` is true when the stage's first texture exists).
- [ ] **Step 2: Implement** the wiring. After the edit, `grep -n "BASE" src/game/scene.ts` shows only the import and `playMusic`.
- [ ] **Step 3: Run** `bun run check && bun run lint && bun run test`. Expected: PASS.
- [ ] **Step 4: Build and smoke**: `bun run build && bun run e2e`. Expected: PASS.
- [ ] **Step 5: Browser pass** against `bun run dev` (delete `.playwright-mcp/` afterwards): no console errors or failed requests, and in particular no "Texture key already in use" across: title and select screens show faces and play sounds; Ryuko vs Ryuko on the boot stage (no second fetch of the boot stage's pack); change stage and back; Ryuko vs Zoma, Kiki vs Chung, Ryuko vs Zoma; open a story from the select and confirm a demo plays from `demo-<n>.bin` and that reopening it fetches nothing; demo 29 if reachable (else say it was only covered by the Task 3 and Step 1 tests); tick Music in a stage and confirm its cue loads from the individual file. Record the request count at boot and for the first Ryuko vs Zoma load.
- [ ] **Step 6: Commit** — `feat: load boot, stage and demo art from packs`.

---

### Task 6: Version, publish, document

**Files:**

- Modify: `scripts/export_assets.py` (`dom_art`, `published_files`, `assets_version`, called at the end of `export_packs`; `inputs()`), `src/game/assetBase.ts`, `scripts/upload_r2.sh`, `src/instructions/fighters.test.ts`, `vite.config.ts` (only if Step 4 finds the version JSON pulled into the `data` chunk), `README.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-11-03-asset-packs-design.md`
- Create: `src/game/assetBase.test.ts`

**Interfaces:**

- Consumes: the packs (Task 3).
- Produces:
  - `dom_art() -> list[str]` — the sorted unique matches of `[a-z0-9]+/[0-9]+\.png` in `src/App.svelte`, `src/instructions/*.svelte` and `src/instructions/moves.ts`. The literal paths in those files are the single source (`FACES`, `nameplate`, the static `select/…` and `ui/…`); `fighters.test.ts` already checks them against the exports, and the exporter has no nameplate table to derive them from, so it scans the same text.
  - `published_files() -> list[str]` — sorted keys under `PUBLIC` that the bucket serves: every `packs/*.bin`, every stage music `filename` in `stages.json`, and `dom_art()`. A listed file that does not exist fails the export, naming it.
  - `src/game/generated/assets-version.json` = `{"version": "<16 hex chars>", "files": published_files()}`; the version is the first 16 hex of one sha256 over each published key then its bytes.
  - `inputs()` also digests `dom_art()`, so `bun run assets` re-exports when the set of DOM-named paths changes. `exporter()` stays as it is: `scripts/build.sh` and `.github/scripts/fetch-generated.sh` recompute it in bash from the script and the name PNG alone.
  - `ASSET_BASE` — unchanged when `VITE_ASSET_BASE` is unset (`${import.meta.env.BASE_URL}assets/`); otherwise `<remote with exactly one trailing slash><version>/`. Bucket layout `<version>/packs/*.bin`, `<version>/<DOM art>`, `<version>/sounds/<stage>-*.wav`, plus root `generated.tar.gz` and `fixtures.tar.gz`.

`upload_r2.sh` new behavior: read `version` and `files` from `src/game/generated/assets-version.json` with `python3`; `aws s3 sync public/assets "s3://$R2_BUCKET/$version/"` with `--exclude '*'` first, then one `--include` per listed file; `--cache-control "public, max-age=31536000, immutable"`; no `--delete`. The fixtures and generated tarballs upload as now, last, with `no-cache`. Keep the header comment accurate (it currently describes `--delete` and the root layout). No source grepping and no dry-run mode: the JSON is the list, for the script, the test and Task 7's bucket imitation alike.

- [ ] **Step 1: Write the failing tests.** `assetBase.test.ts` with `vi.stubEnv`, `vi.resetModules()` and a dynamic `import('./assetBase')`: unset → `ASSET_BASE` ends with `assets/` and holds no version; `'https://cdn.test'` and `'https://cdn.test/'` → both give `` `https://cdn.test/${version}/` `` with `version` from the JSON. In `fighters.test.ts`, extend the `itWithArt` test at `:61` (rename it to say it covers every art file the DOM names): every `[a-z0-9]+/[0-9]+\.png` in `src/App.svelte`, `src/instructions/*.svelte` and `src/instructions/moves.ts` is in `assets-version.json`'s `files` and exists under `public/assets`. A new DOM-named image then fails `bun run validate` until the export has published it.
- [ ] **Step 2: Run** `bunx vitest run src/game/assetBase.test.ts src/instructions`. Expected: `assetBase.test.ts` FAILS (`assets-version.json` does not exist yet, so the file cannot load); the extended art test passes if every path exists, else it names the missing one (fix the source or the exporter, not the test).
- [ ] **Step 3: Implement** `dom_art`, `published_files`, `assets_version` and the JSON write at the end of `export_packs`, and the `inputs()` change; `assetBase.ts` imports the JSON default and appends `${version}/` in the remote branch (update its header comment: the version makes every object immutable). Re-export: `bun run assets`; `python3 -c` over `assets-version.json` shows a 16-hex version and about 155 `packs/` keys, the stage music and the DOM art, a total far below 28,000.
- [ ] **Step 4: Run** `bunx vitest run src/game/assetBase.test.ts src/instructions` and `bun run check`. Then `bunx vite build` and check that the Instructions entry does not import a `data` chunk (`vite.config.ts` puts every `game/generated/*.json` into `data` chunks of about 15 MiB, and `assetBase.ts` now imports one): read the top of `dist/assets/instructions-*.js` for its static imports. If it does, exclude `assets-version.json` from that group's `test` regex and rebuild. Expected: PASS, and the Instructions page imports no `data` chunk.
- [ ] **Step 5: Rewrite `upload_r2.sh`**; `bash -n scripts/upload_r2.sh` and, if installed, `shellcheck scripts/upload_r2.sh` pass. Without credentials, run it with a stub `aws` first in `PATH` that echoes its arguments: expected one `sync` with about 270 `--include` arguments, then the two tarball uploads last.
- [ ] **Step 6: Update the docs**: README (new bucket layout and cache headers, the version prefix, the order "export → `bun run upload:r2` → push", how to prune old versions and the legacy root objects by hand with `aws s3 rm --recursive` once no build points at them, and that the first deploy needs the upload before CI's e2e passes), `CLAUDE.md` (packs and `assets-version.json` as export outputs, the new `upload:r2` behavior, the `upload:r2` command line which says "deleting dropped keys"), and the spec (the client-side sentence that names `sound.decodeAudio` now says each sound is decoded with `context.decodeAudioData` and added to the audio cache in the same step as the pack's textures, and why: `decodeAudio`'s `DECODED_ALL` event is shared, so concurrent packs would resolve each other early, and nested loader files wait on Phaser's per-frame queue; also that audio is WebAudio only; the Measuring section's "local `vite preview`" becomes the bucket imitation, and says why). Run `bun run format` on touched files.
- [ ] **Step 7: Run** `bun run validate`. Expected: PASS.
- [ ] **Step 8: Commit** — `feat: publish packs under an immutable version prefix`.

---

### Task 7: Measure again and report

**Files:** none committed. Scripts are Task 1's, in the session scratchpad.

- [ ] **Step 1: Build** this branch: `VITE_ASSET_BASE=http://127.0.0.1:8788/ bunx vite build`, move `dist` to `<scratch>/after-dist`. Write the allowlist from `assets-version.json`'s `files`; run the bucket imitation with the version prefix serving only those keys (any 404 in the runs is a path the export fails to publish).
- [ ] **Step 2: Run Task 1's scenarios** against `after-dist`: cold, then the second visit in the same context. Record the same numbers, plus the 200/304 split on the second visit.
- [ ] **Step 3: Report** against the spec's goals: requests for the worst case (target 25 or fewer, from 5,080) and at boot (a handful, from about 363); second-visit bucket requests (target none); bytes unchanged at boot; the time split before and after, plainly stating if decoding or loader pacing was most of it. State what is unconfirmed or unsupported: edge-cache behavior and the fall in R2 reads (no deployed zone), real network latency (local runs have none), and browsers without WebAudio (packs skip their sounds there, so `sound.add` fails).
- [ ] **Step 4: Clean up**: stop the servers, delete the scratch dists and `.playwright-mcp/`, and confirm `git status` shows only the committed work.
