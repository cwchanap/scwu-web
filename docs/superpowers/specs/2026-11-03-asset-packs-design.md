# Asset packs and immutable caching

Date: 2026-11-03. Status: approved by the owner on 2026-11-03.

## Why

Loading a story brawl takes more than 10 seconds, and the owner is worried about the number of R2 operations the game sends. Both come from the same cause: the art and audio are 28,655 separate objects (26,193 PNG, 2,462 WAV, 513 MB), and the game fetches them one request each.

What the game fetches (counted from the exports; `scene.ts` `preload`, `whenReady`, `loadPlayer`, `openDemo`):

- Boot: about 363 requests (192 select-screen fighter images, 105 UI images and 10 sounds, `text.png`, the select and title demos) plus the starting stage's images.
- Any match: every image and sound of each fighter it seats, plus the stage. A median fighter is 497 images and about 50 sounds.
- A story battle seats the player and up to 7 CPUs, and loads all of them before it starts. The worst brawl (Alpha's step 7, park) seats 8 fighters: **5,080 files, 49 MB** (35 MB PNG, 13 MB WAV, 0.8 MB stage). The median of all 101 story battles is 1,660 files and 15 MB. Fighters the next battle does not seat are unloaded and fetched again later.
- Fighter images are small: median 3.7 KB, 4,271 files under 2 KB. Per-request overhead dominates.

R2 and caching today:

- `scripts/upload_r2.sh` uploads everything with `Cache-Control: no-cache`. Per Cloudflare's docs a `no-cache` response is stored but treated as stale at once, so the edge revalidates against R2 on every request, and a returning visitor repeats every request.
- Cloudflare's edge decides cache eligibility by file extension, not MIME type. PNG is on the default list; `.wav` and `.json` are not, so WAV requests go to R2 unless the zone has a Cache Rule saying otherwise (the zone's rules have not been inspected).
- R2 Class B reads cost $0.36 per million after 10 million free a month; egress is free. A worst brawl is about 5,000 reads, so ordinary traffic costs nothing, but the public bucket has no spend cap and `no-cache` means the edge absorbs none of the reads.

## Goals

1. Cut the objects a battle fetches from thousands to tens. Target for the worst brawl on a cold cache: 25 requests or fewer, down from 5,080. Boot: a handful, down from about 363.
2. Make repeat loads free: a returning visitor re-fetches nothing, and the edge serves repeat reads without touching R2.
3. Change nothing the player sees or the simulation does. Rendering stays pixel-identical; `Match` and its tests are untouched.

## Non-goals

- True sprite atlases (packed sheets with frame rectangles). They would put every `setTexture(key)`, `recolored()`, `tint()`, `unloadPlayers()` and HUD path onto frames, add gutters for the 1.5x pixel scaling, and be capped by the 4096 px texture limit. Packs get the same request count with none of that.
- Deferring reinforcements until they enter, and compressing audio (WAV to OGG). Both cut bytes and are a separate design: after this work a brawl is bandwidth-bound (49 MB), not request-bound.
- Moving the art off R2 onto Worker static assets. Packs leave a few hundred objects, well under the 20,000-file free limit, so it becomes possible later, but this design keeps R2.
- Any gameplay, timing or `docs/evidence.md` change.

## Anti-goals

- First-visit bytes at boot must not grow: boot packs hold what boot loads today and no whole fighters.
- Decoded memory must not exceed today's. A fighter's images and sounds still free as a unit when it is dropped (`unloadPlayers`), and per-image texture keys (`${who}-${index}`) and sound keys (`${who}-sound-${index}`) stay exactly as they are, so the renderer, recolor and tint code does not change.
- No window in which a deployed build points at objects that are not uploaded yet.

## Design

### 1. Packs

The exporter writes packs in addition to the individual files it writes now. A pack is one object holding many images and sounds, as stored today (indexed PNG, 8-bit mono WAV), not re-encoded. Self-describing layout: a length-prefixed JSON header listing each entry's kind, index, offset and length, then the payload. Extension `.bin`, which is on Cloudflare's default cached list, so no zone rule is needed.

Pack boundaries, by when the game needs the files:

| Pack                 | Contents                                                                                                                                        | When loaded                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| boot (one, or a few) | UI images and sounds, `text.png`, the select and title demo art, every fighter's select-screen images and sounds (`selectAssets` in `scene.ts`) | `preload`                                     |
| `<who>` rest, 45     | the fighter's remaining images and sounds                                                                                                       | `whenReady`, for each fighter the match seats |
| `<stage>`, 18        | the stage's images only                                                                                                                         | `loadStage`                                   |
| `demo<n>`, about 90  | a story demo's images and sounds                                                                                                                | `openDemo`                                    |

Total: about 155 objects instead of 28,655.

A stage's sounds are not in its pack. They are its music cues, 3 to 6 MB each (about 95 MB over the 18 stages against 15 MB of stage images), and `playMusic` fetches one on demand, only with Music ticked. Folding them into the stage pack would make every Music-off player download them and grow the starting stage's boot bytes. They stay individual objects, published under the version prefix and loaded exactly as now, so Music on costs one extra request. (A demo's sounds do stay in its pack: `openDemo` already loads all of a demo's sounds whether or not Music is on.)

The split between boot and a fighter's rest pack must come from one place. Today `selectAssets` derives it at runtime from the select programs' ops 0x0c and 0x03. The exporter has to make the same cut, so either it writes the set into the generated data and `scene.ts` reads it, or a test fails if the two disagree. Whichever is chosen, a test must prove every image and sound named in each fighter's, stage's and demo's exported data is in exactly the packs the loader will request, since a missing asset would otherwise surface as a blank sprite mid-match.

Client side: the pack loads through the existing Phaser loader as a custom file type, so `this.load.once(COMPLETE)`, the `loaderror` handler, and the `loading`/`wanted` logic in `whenReady` and `openDemo` keep working unchanged. When the pack arrives, each image becomes a texture under its current key (`textures.addImage`), and each sound is decoded with `context.decodeAudioData` and added to the audio cache under its current key, in the same step as the pack's textures. Sounds do not go through `sound.decodeAudio`: its `DECODED_ALL` event is shared by every call, so concurrent packs would resolve each other's waits early, and nested loader files would wait on Phaser's per-frame queue. Pack audio is WebAudio only: without an `AudioContext` the loader skips a pack's sounds. That `textures.addImage` and `decodeAudioData` accept these sources is what the spike in Order, step 2, proved.

One loader path everywhere (authored call): local dev and the e2e build load packs exactly as the deployed game does, with no per-file fallback branch. The exporter writes the packs into `public/assets/` (unversioned there) alongside the individual files it writes today, which remain as the export's intermediates and cost nothing in the repo, as now. CI's e2e run reads packs from R2, so a pack-format change needs `bun run assets && bun run upload:r2` before pushing; that is already the rule for any `export_assets.py` change.

A small set is still published individually, because something other than the pack loader names it: art the DOM or CSS names directly (the Instructions page's `select/2, 13, 15`, `ui/27`, each fighter's `guide.art` and `guide.nameplate`, and whatever `App.svelte` names through `ASSET_BASE`) and the stage music cues. Everything else is published only inside packs.

### 2. Versioned, immutable assets

Packs and the individual DOM files are published under a content-versioned prefix, `<version>/` in the bucket, with `Cache-Control: public, max-age=31536000, immutable`. The version is a digest of the published bytes, written by the exporter into the generated data (`src/game/generated/`), so it travels in `generated.tar.gz` to Workers Builds and CI, which have no handoff. `assetBase.ts` appends it to `VITE_ASSET_BASE`; with `VITE_ASSET_BASE` unset (local dev, tests) assets still come from `/assets/` and no version is involved. `VITE_ASSET_BASE` itself stays the bucket URL, so no dashboard variable changes per export.

Stays at the bucket root with `no-cache`, as now: `generated.tar.gz` and `fixtures.tar.gz`, which `scripts/build.sh` and `.github/scripts/fetch-generated.sh` fetch from a fixed URL. `upload_r2.sh` keeps its ordering: art first, `generated.tar.gz` last, so a build never sees a version whose objects are missing.

Old versions and the legacy root-level objects are not deleted by a normal upload, because a deployed build or a visitor's open tab may still point at them. Deleting them is a separate, deliberate step (keep the previous version or two).

## Constraints

- The 10 ms tick, determinism, and every existing test stay as they are. `bun run validate`, `bun run build` and `bun run e2e` must pass.
- `scripts/r2_cors.json` allows GET and HEAD from any origin, which covers `fetch` of a pack; nothing more is needed.
- `export_assets.py` must keep its input hash checks and its `generated/.inputs` skip, and `build.sh` keeps checking the `.exporter` fingerprint.
- Packs and the version are build output like the rest of `public/assets/`: gitignored, regenerated, never committed. Update the README ("Deploy to Cloudflare", the cache and upload notes) and `CLAUDE.md`'s pipeline section.

## Order, and what could change the plan

1. **Baseline first.** Measure a cold-cache brawl load on the current build: request count, bytes, and how the time splits between network and decoding about 4,000 PNGs. This is a report, not a gate: the owner decided the packs get built regardless of the split, since the R2-read savings stand on their own. If decoding turns out to be most of the 10 seconds, say so plainly in the final report, because packing then fixes the request count and R2 operations but not the time. There is no load-time target; the goals are the request and R2-read ones.
2. **Spike one fighter** to prove a pack's images become textures and its sounds become audio under the existing keys, render identically, and free correctly on unload. Compare its load time with the baseline's.
3. Then the exporter, loader, versioning and upload script, in whatever slices the plan finds safe.
4. Measure again and report against the goals.

## Left to the builder

Pack header encoding and exact boundaries (for example, one boot pack or several); whether the loader is a `Phaser.Loader.File` subclass or an awaited promise; `ImageBitmap` versus an `HTMLImageElement` as the texture source; how the version digest is computed; how the select/rest cut is shared between Python and TypeScript; the exact list of individually published files; the prune script for old versions.

## Measuring, and writing to the production bucket

Authored call: the builder does not write to the production bucket, and is not given its URL or credentials, unless the owner says so. Until then, the baseline and final measurements run against a local imitation of the bucket with network throttling, not `vite preview`: `vite preview` answers every file `Cache-Control: no-cache` (its static server sends that with each ETag), so it cannot show a warm cache. The imitation lives in the session's scratch directory, not the repo. It serves `<version>/` paths with the immutable header and the root with `no-cache`, and logs each request, which counts R2 reads as the bucket's request log would. The report says plainly that edge-cache behavior (`cf-cache-status`, the fall in R2 reads) is unconfirmed. Local runs have no real network latency, so the network-versus-decode split they give is an estimate; the report says that too. The owner confirms the edge numbers on the deployed site, or provides a staging bucket or a go-ahead to publish a new version prefix (additive, so old builds are unaffected).

## Owner's side, outside the code

- Confirm the R2 bucket's custom-domain zone has no Cache Rule or Page Rule that bypasses cache for it, and that Origin Cache Control is on (the default on Free, Pro and Business), so `immutable` is honored. Smart Tiered Cache is optional and helps cold-edge hits.
- After a deploy, the first visit to each pack is a cache miss and one R2 read; every later visit anywhere in that region is an edge hit with no R2 operation.
