# SHUWA art

Everything that makes SHUWA's sprites (the first of the four new fighters planned in Nov 2026): the prompts and
pose guides for the drawings, the script that asks the OpenAI Images API for them, and the builders that turn the
drawings into game-size sprite clips and a preview page.

## Make the drawings

```sh
bash art/shuwa/draw.sh b2            # a whole batch: b1 body, b2 attacks, b3 specials, b4 supers
bash art/shuwa/draw.sh p1-33 k1-72   # or single poses
```

Each pose is one image edit: SHUWA's key drawing (`refs/base.png`, or `refs/hero.png` for the powered form) as
image 1, and, where the pose has one, the donor fighter's sprite for the same move as a pose and size guide.
`poses.txt` lists every pose with its batch, guide, form and canvas; `prompts/<pose>.txt` is its prompt.
Drawings land in `out/raw/<pose>.png` (not committed; about 1.5 MB each).

Nothing cut from the game is committed here. The guides (`out/posrefs/`, made by `tools/posref.py`) are the game's
sprites scaled up, and the donors' frame offsets and move scripts (`out/data/`, copied by `tools/donor_data.py`) come
from its export, so both scripts make them from your checkout's `public/assets` and `src/game/generated`
(`ASSETS` and `GENERATED` point elsewhere). A pose with no guide (`-` in `poses.txt`, such as `timeover` or
`giant-foot`, so all of `b4`) needs neither.

It needs `OPENAI_API_KEY` in the environment and never prints it. The model is `gpt-image-2.6-sunburst`
(`IMAGE_MODEL` overrides it). Four requests run at once; a refused pose prints `FAILED <pose>` and the rest carry on.

## Build the sprites and the page

```sh
bash art/shuwa/build.sh
```

Needs python3 with numpy, scipy, pillow and opencv-python, every drawing in `out/raw/`, and the game's exported
sprites in `public/assets` (`ASSETS=<dir>` points elsewhere). Steps, each building on the one before:

| Step    | Builder                                  | Adds                                                                       |
| ------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| round 7 | `round7/` (kept, built by `tools/v4.py`) | idle, walk, transform, SPECIUM                                             |
| b1      | `tools/b1.py`                            | jump, land, crouch, guards, hits, knockdown, get-up, KO, time over, dashes |
| b2      | `tools/b2.py`, `tools/b2_poses.py`       | punches and kicks, crouch and air attacks, Hit Up, Chuck                   |
| b3      | `tools/b3.py`, `tools/b3_poses.py`       | RING, SHUWATCH, BARRIER, SWING, RECHARGE                                   |
| b4      | `tools/b4.py`, `tools/fx.py`             | effect layers, SPECIUM RAY, THREE MINUTES, GIANT STEP, ULTRA SWING         |

`out/b4/` then holds every clip (`frames.json` plus the frames) and `out/shuwa-animations.html` is the preview page.

How a drawing becomes a sprite:

- `tools/crisp.py` pixels it in the cast's style (1 px coloured outlines, two-tone ramps) at one shared scale,
  matched on the head; a drawing whose head can't be matched takes its form's median scale.
- Each clip plays the donor's own script for the move (RYUKO for most; DoraEmon, ALEX and ZOMA for some specials),
  with every donor image swapped for a SHUWA sprite, so timing, reach and travel match the donor.
  `out/data/` holds those scripts, taken from the game's export.
- A sprite's anchor height is its feet plus the donor's offset from feet to position point in the image it was drawn
  from. Its anchor x is where it stands on its drawing canvas: the guide's position point, or the key drawing's
  feet for a pose drawn without a guide (b2; b1 and b3 still use the feet).
- Worker-form action drawings take a 1.1x scale on top of the head match (`BASE_ACTION` in `tools/v4.py`): the model
  draws his hard hat and body about 11% smaller in action poses than in the key drawing.
- Where the donor's drill, sweep, gun or tank tread reaches past SHUWA's fist or foot, the strike frame gets a sweep of
  light out to the donor's front edge (`STRIKES` in `tools/b2.py`, `fx.swoosh`), so he reaches where the hit lands.
- Glows, rings, walls of light and beams are soft-light layers drawn in code (`tools/fx.py`, `tools/b4.py`),
  never part of the fighter drawings.

## The game's drawings

`build.sh` ends with `tools/game_art.py`, which cuts the drawings the game uses into `game/` (committed, so the exporter
can read them without the raw drawings or the game's files):

- `game/drawings/<name>.png`: one cropped 8-bit palette PNG per drawing, all on one palette (colour 0 is clear), cut the
  same way as the preview sprites (same head match and scale). `game/anchors.json` gives each one's anchor, the pixel the
  game puts on the fighter's position: the donor's position point as it lands on the drawing (the guide's point for
  x on a guided pose, his feet plus the donor's feet-to-position offset for y).
- `game/fx/<donor image>.png`: his effects (saw ring, beam, muzzle bloom, the two wide beams of THREE MINUTES), drawn in
  code by `tools/game_fx.py` at the size of the donor image each one replaces.
- `game/ui/`: the Menu's 24 x 60 face tile and the HUD's 70 x 21 face, cut from `refs/base.png`.
- `game/spec.json`: his stats, command table, which drawing stands in for each donor image, the images he shows as
  nothing, and the frames SWING drops. The exporter (`export_authored` in `scripts/export_assets.py`) builds
  `generated/shuwa.json` and the `fighter-shuwa` pack from it and the donor's own export.

Nothing here is cut from the game: the anchors are numbers about his drawings, and the donor's offsets only decided them.
Run `bun run format` after, since `game/*.json` follow the repo's prettier layout. The contract the exporter reads
(`spec.json`'s keys, how a drawing is placed, what the exporter checks) is the last section below; it lives here and not in
`game/` because every file under `game/` is part of the assets fingerprint, and a doc edit must not force an upload.

`tools/lineup.py` puts SHUWA's sprites beside the donor's at the same scale, for checking a pose's size and reach.
`tools/posref.py` makes one pose guide from a donor sprite (`python3 -I tools/posref.py <sprites> ryuko 34 base 1024x1536`);
draw.sh runs it for every guide it needs.

## The game's spec

What `scripts/export_assets.py` reads to build SHUWA, a fighter with no original file (an authored fighter). Everything
here is his own and committed; the donor's data is read from the game's files at export time. Nothing under `art/` may be
cut from the game.

| File               | What it is                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `drawings/<n>.png` | His drawings: 8-bit palette PNGs on one shared palette (colour 0 is clear), cropped to the figure  |
| `anchors.json`     | `{drawing: {anchor: [x, y], size: [w, h]}}`: the pixel of the drawing the game puts on the fighter |
| `fx/<id>.png`      | His effects, one per donor image they replace, the donor image's exact size (palette PNGs)         |
| `ui/face-tile.png` | The Menu's 24 x 60 face tile                                                                       |
| `ui/hud-face.png`  | The HUD face (donor images 2000 to 2002 show it)                                                   |
| `spec.json`        | Stats, command table, which drawing stands in for each donor image (below)                         |

`tools/game_art.py` and `tools/game_fx.py` make the PNGs and `anchors.json` from the raw drawings; `spec.json` is written by hand.

### `spec.json`

- `donor`: `ryuko`. The donor's own export (`assets.json`'s data, built in `main()`) supplies every script, clip, box,
  response, CPU and held table, the sounds, the idle program and the palettes. His data is that export with the changes below.
- `stats`: `life`, `stocks`, `chip`. `perStock`, `scale`, `decay`, `start` and `charge` stay the donor's.
- `commands`: his command table. Entries keep the donor's numbering, because the CPU table and the shortcut keys (`commands.ts`
  `CONTROLS`) name entries by number. `keep` lists the donor entries he has. Every other entry becomes the same inert entry as the donor's
  own entry 21 (`name "--------"`, no actions, `steps [0x2000]`). `names` renames kept entries; `steps` replaces an entry's steps
  (the steps are the donor's raw words: `commands.ts` documents the bits). `near` stays the donor's.
  RING and ULTRA SWING take the ticket's inputs: the donor's axe entry is down, forward, P and her CGA ends in K, his are down, back, G and
  forward, down, back, forward, down, back, G (G is the P button, H the K button).
- `images`: donor image id -> drawing name. Every image a fighter-owned script, clip, held or idle record shows must be here (or in
  `blank`, `fx`, or `scriptImages`). Objects' images (hit sparks, dust, the super flash) are not listed and stay the donor's.
  An image he shows is exported as his own: `filename shuwa/<id>.png` (the drawing's bytes), the drawing's width and height,
  `own: true` (so no palette swap touches it).
- `scriptImages`: `{script key: {donor image id: drawing}}`. The donor shows one image in two roles (image 10 is her walk step and the
  wind-up of three moves); in the listed scripts (and the scripts they reach) the frames show a new image id (10000 + the donor id, one per
  drawing) that maps to the drawing instead.
- `fx`: donor image ids he redraws; the file is `fx/<id>.png` and it has the donor image's exact size (the exporter checks), so the
  donor's frame offsets and boxes stay true. Exported as `shuwa/<id>.png`, `own: true`.
- `blank`: donor image ids he shows as nothing (a transparent PNG of the donor image's size): her giant robot (329 to 336), her emblem (327, 328)
  and her name plate (464).
- `drop`: `{action: [image ids]}`. From every script the closure of that action reaches (the fighter's own timeline, not objects), remove the
  frames that show those images together with the events on them (SWING is her Daisetsuzan without the missile volley after the toss).
  The scripts must still end and the throw must still deal its damage.
- `cutInputs`: donor actions his input checks may not jump to. The exporter removes every op 0x16 (`input` event) of his scripts
  that jumps to one, and refuses if his own timeline still reaches one. Her intros (30 to 34, 36) jump to Chage Character (37)
  while down is held, which sets variable 0 to 10, her EX mode; he has none, so 37 is cut.
- `ui`: the Menu and HUD stand-ins. `hudFaceImages` take `ui/hud-face.png` (their own width and height).

#### Placing a drawing

A donor frame carries `dx, dy, width, height`; the engine's position point sits at `(width // 2 - dx, height - dy)` inside the image.
Let `ref(m)` be donor image `m`'s own first placement (`dx_ref, dy_ref`, taken in `tools/donor_data.py frames()` order: the scripts he
follows, the other scripts, the clips). A frame of his that shows drawing `d` in place of donor image `m`, where the donor's frame has `dx_f, dy_f`, gets

    dx = (w_d // 2 - ax_d) + (dx_f - dx_ref(m))
    dy = (h_d - ay_d)      + (dy_f - dy_ref(m))
    width, height = w_d, h_d      (flip_x, duration, events and boxes stay the donor's)

so his anchor lands where the donor's position point would, moved by whatever the script itself shifts that image. `(ax_d, ay_d)` and
`(w_d, h_d)` come from `anchors.json`. The donor's body boxes (op 0x19) are untouched.

#### What the exporter checks

- every action in `commands` (and Counter Hit, action 174) exists in the donor's scripts;
- nothing of his reaches a `cutInputs` action once its checks are cut;
- every fighter-shown image of every script those actions reach maps to a drawing, is blanked or kept (list the exceptions);
- every `images`/`scriptImages` drawing and every `fx` file exists and has an anchor; each `fx` file has the donor image's size;
- nothing under `art/` is a file of the game (the test compares hashes with `public/assets`).
