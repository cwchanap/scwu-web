# SHUWA art

Everything that makes SHUWA's sprites (the first of the four new fighters planned in Nov 2026): the prompts and
pose guides for the drawings, the script that asks the OpenAI Images API for them, and the builders that turn the
drawings into game-size sprite clips and a preview page.

## Make the drawings

```sh
bash art/shuwa/draw.sh b2            # a whole batch: b1 body, b2 attacks, b3 specials, b4 supers
bash art/shuwa/draw.sh p1-33 k1-72   # or single poses
```

The `ui` batch draws his select portrait and face close-ups instead; `ui/README.md` covers those and the rest of
his select and HUD art.

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
- `game/ui/`: his select portrait, select-sheet face tile, HUD face, name lettering and colour schemes (HPA-1306, made by
  `tools/ui.py`; see `ui/README.md`).
- `game/spec.json`: his stats, command table, which drawing stands in for each donor image, the images he shows as
  nothing, the frames SWING drops, his chest lamp and the moves grafted from other fighters. The exporter (`export_authored` in `scripts/export_assets.py`) builds
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
| `ui/portrait.png`  | His select portrait (donor image 419) and guide hero                                               |
| `ui/name.png`      | His name lettering (donor image 464): select screen, HUD, Menu and guide                           |
| `ui/tile.png`      | His 24 x 60 face, painted over cell 42 of the select sheets                                        |
| `ui/hud-face.png`  | The HUD face (donor images 2000 to 2002 show it)                                                   |
| `ui/palettes.json` | His eight colour schemes                                                                           |
| `sound/<clip>`     | His own sounds, once HPA-1307 adds them (`spec.json` `sounds`)                                     |
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
  `new` fills entries he does not keep: `{entry: fields}` over the inert entry (its `name` from `names`), with `window`, the `near`,
  `far`, `air` and `crouch` actions and the `steps`. His are 3 GIANT STEP, 8 SHUWATCH, 9 SPECIUM, 15 BARRIER and 16 RECHARGE; their
  actions are the donor's (231, her EX Fire) or a graft's (11278, 12261, 13229, 14347, below). The shortcut keys of those entries
  (`commands.ts` `KEYS.shuwa`) are the donor's keys for the same numbers, BARRIER on F (her IORI) and RECHARGE on E (her EX).
- `images`: donor image id -> drawing name. Every image a fighter-owned script, clip, held or idle record shows must be here (or in
  `blank`, `fx`, or `scriptImages`). Objects' images (hit sparks, dust, the super flash) are not listed and stay the donor's.
  An image he shows is exported as his own: `filename shuwa/<id>.png` (the drawing's bytes), the drawing's width and height.
  His drawings and portrait take his colour schemes; effects, blanks, the HUD face and the name are `own: true` (so no palette
  swap touches them).
- `scriptImages`: `{script key: {donor image id: drawing}}`. The donor shows one image in two roles (image 10 is her walk step and the
  wind-up of three moves); in the listed scripts (and the scripts they reach) the frames show a new image id (10000 + the donor id, one per
  drawing) that maps to the drawing instead.
- `fx`: donor image ids he redraws; the file is `fx/<id>.png` and it has the donor image's exact size (the exporter checks), so the
  donor's frame offsets and boxes stay true. Exported as `shuwa/<id>.png`, `own: true`.
- `blank`: donor image ids he shows as nothing (a transparent PNG of the donor image's size): her giant robot (329 to 336), her emblem (327, 328)
  (his lettering replaces her name plate, 464, through `ui.name`).
- `drop`: `{action: [image ids]}`. From every script the closure of that action reaches (the fighter's own timeline, not objects), remove the
  frames that show those images together with the events on them (SWING is her Daisetsuzan without the missile volley after the toss).
  The scripts must still end and the throw must still deal its damage.
- `cutInputs`: donor actions his input checks may not jump to. The exporter removes every op 0x16 (`input` event) of his scripts
  that jumps to one, and refuses if his own timeline still reaches one. Her intros (30 to 34, 36) jump to Chage Character (37)
  while down is held, which sets variable 0 to 10, her EX mode; he has none, so 37 is cut. Her EX Fire (231, his SPECIUM)
  enters its forward-held charge (its check at age 18 into 237 and 238); one lamp charge is one shot, so both are cut.
- `ui`: his select and HUD art. `portrait` replaces the donor's 419 and `name` her 464 (the select programs' face and
  lettering; the exporter refuses if they show any other image). `tile` is painted over cell 42 of the CHAR SELECT sheets
  (`select/13.png`, `select/30.png`). `hudFaceImages` take `hudFace` (their own width and height). `palettes` is his eight
  schemes: his rows replace the donor's rows for the same colours, and his drawings and portrait take them.
- `sounds`: `{donor sound index: clip}`, a clip under `sound/` that the export publishes as `sounds/shuwa-<index>.wav` in
  place of the donor's sound. Empty until HPA-1307.
- `levels`: `{action: level}` over the donor's (the header byte a cancel window tests). The donor's 231 has none, since she enters it
  only in EX mode; SPECIUM gives it RING's 31.
- `cpu`: CPU entries (the export's `cpu` shape) added to the donor's table, after the donor's entries for the commands `new` fills are
  dropped. The grafts add their donors' entries too (`grafts[].cpu`).
- `lamp`: his chest lamp, kept in player variable `variable` (10, which RYUKO never uses): 0 is full, each shot adds `step`, and
  `charges` shots empty it. The exporter puts, first in each `shots` script (`{action: age}`), a test that jumps to `empty`
  (RECHARGE) when the lamp is at `step × charges`, and an add of `step` at the age the shot fires. Each `refund` script gets an add of
  `-step` (a landed Chuck), first in its tick, so no jump of that tick skips it. The engine keeps the lamp between full and empty and,
  at his low-life line (`lifeLineMark`), passes the test and skips the adds, so shots are free. `colors` (`{from: to}`, hex RGB) are
  the lamp's blues and the reds they blink to; the export lists his own drawings (not the donor's effects) as `lamp.images`, the
  images the scene recolours.
- `grafts`: moves taken from other fighters, each `{move, donor, base, actions, ...}` (see "Grafts" below).

The donor's op 0x11 life thresholds (native HP of the fighter's own bar) are scaled from the donor's life to his
(`scale_life`): RYUKO's 153 of 510 is his 144 of 480, both 30%.

#### Grafts

A graft copies one move from another fighter's export (`src/game/generated/<donor>.json`) into his. From its `actions` (the move's
roots), the exporter follows every script the move reaches (its next script, jumps, calls, handlers and the objects it spawns, as
`script_edges` lists them) and renumbers each by
`base` + the donor's number, together with the images, sound indexes and variables they use, so nothing clashes with RYUKO's tables
(DoraEmon 11000, ALEX 12000, ZOMA 13000, REMU 14000).

- `host`: `{donor action: his action}`. The walk stops there and jumps go to his own script instead (a landing, the super flash,
  dust). The target must be one of his scripts or engine states.
- `cut`: donor actions the move may not reach; events that jump to or spawn one are removed (ALEX's REFLACT's follow-up 274).
- `variables`: `{donor variable: his}` for the move's own counters (ALEX's variable 2 is his 11; ZOMA's ammo, variable 0, is his
  lamp, 10).
- `images`: `{donor image: drawing}`, placed as above against the donor's own image and reference placement. Every other image the
  move shows (its effects and objects) stays the donor's picture, exported as `own` under the donor's filename.
- `level`: the roots' cancel level, else the donor's.
- `cpu`: `{donor command: his}`. The donor's CPU entries whose commands are all listed are added with his numbers.
- `patch`: `[{script, op, ...match, set | drop}]`. Each changes (`set`) or removes (`drop`) the donor events of `script` that match
  every other field (`t`, `slot`, `action`, ...); a patch that matches nothing stops the export. GIANT STEP's patches spend one stock
  (REMU spends three), spawn his foot, make the dive a straight stamp down about 250 px ahead and set its box at the sole, for 100.

Grafted scripts may not use op 0x07's held poses (the exporter refuses them), and their life thresholds are scaled like his own.

#### Placing a drawing

A donor frame carries `dx, dy, width, height`; the engine's position point sits at `(width // 2 - dx, height - dy)` inside the image.
Let `ref(m)` be donor image `m`'s own first placement (`dx_ref, dy_ref`, taken in `tools/donor_data.py frames()` order: the scripts he
follows, the other scripts, the clips). A frame of his that shows drawing `d` in place of donor image `m`, where the donor's frame has `dx_f, dy_f`, gets

    dx = (w_d // 2 - ax_d) + (dx_f - dx_ref(m))
    dy = (h_d - ay_d)      + (dy_f - dy_ref(m))
    width, height = w_d, h_d      (flip_x, duration, events and boxes stay the donor's)

so his anchor lands where the donor's position point would, moved by whatever the script itself shifts that image. `(ax_d, ay_d)` and
`(w_d, h_d)` come from `anchors.json`. The donor's body boxes (op 0x19) are untouched.

A frame the game draws flipped (`flip_x`, `flip_y`) mirrors the image about its own centre, and the point on it, so the landing is
solved again for the flipped axis, with `(w_m, h_m)` the donor image's size and `rx = dx_ref(m)`, `ry = dy_ref(m)`:

    flip_x:  dx = dx_f + rx + ax_d + (w_m % 2) - (w_d - w_d // 2)
    flip_y:  dy = dy_f + ry + ay_d - h_m

Either facing then puts his anchor on the same point of the donor image (the exporter test checks it through `placement()` for both).

Held poses (op 0x07's table, the export's `held`) draw from the image's top-left corner instead (`heldPlacement`: `left = x + dx`,
mirrored by the holder's facing XOR `flip_x`, negated with `flip_y`). They keep the donor's corner offsets and move by the anchor:

    dx = dx_f + (ax_m - ax_d)
    dy = dy_f + (ay_m - ay_d)
    width, height = w_d, h_d

where `(ax_m, ay_m)` is the donor point his normal frames put the anchor on, `(w_m // 2 - dx_ref(m), h_m - dy_ref(m))`, or the donor
image's bottom centre `(w_m // 2, h_m)` when the donor shows `m` only held. Held records never set `ref`.

#### What the exporter checks

- every action in `commands` (and Counter Hit, action 174) exists in the donor's scripts;
- nothing of his reaches a `cutInputs` action once its checks are cut;
- every graft patch matches an event, every `host` target is his, no graft action or image clashes with his or another graft's;
- every fighter-shown image of every script those actions reach maps to a drawing, is blanked or kept (list the exceptions);
- every `images`/`scriptImages` drawing and every `fx` file exists and has an anchor; each `fx` file has the donor image's size;
- nothing under `art/` is a file of the game (the test compares hashes with `public/assets`).
