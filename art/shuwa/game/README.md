# SHUWA's game art and spec

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

## `spec.json`

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
- `ui`: the Menu and HUD stand-ins. `hudFaceImages` take `ui/hud-face.png` (their own width and height).

### Placing a drawing

A donor frame carries `dx, dy, width, height`; the engine's position point sits at `(width // 2 - dx, height - dy)` inside the image.
Let `ref(m)` be donor image `m`'s own first placement (`dx_ref, dy_ref`, taken in `tools/donor_data.py frames()` order: the scripts he
follows, the other scripts, the clips). A frame of his that shows drawing `d` in place of donor image `m`, where the donor's frame has `dx_f, dy_f`, gets

    dx = (w_d // 2 - ax_d) + (dx_f - dx_ref(m))
    dy = (h_d - ay_d)      + (dy_f - dy_ref(m))
    width, height = w_d, h_d      (flip_x, duration, events and boxes stay the donor's)

so his anchor lands where the donor's position point would, moved by whatever the script itself shifts that image. `(ax_d, ay_d)` and
`(w_d, h_d)` come from `anchors.json`. The donor's body boxes (op 0x19) are untouched.

### What the exporter checks

- every action in `commands` (and Counter Hit, action 174) exists in the donor's scripts;
- every fighter-shown image of every script those actions reach maps to a drawing, is blanked or kept (list the exceptions);
- every `images`/`scriptImages` drawing and every `fx` file exists and has an anchor; each `fx` file has the donor image's size;
- nothing under `art/` is a file of the game (the test compares hashes with `public/assets`).
