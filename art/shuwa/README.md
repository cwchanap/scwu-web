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
Run `bun run format` after, since `game/*.json` follow the repo's prettier layout.

`tools/lineup.py` puts SHUWA's sprites beside the donor's at the same scale, for checking a pose's size and reach.
`tools/posref.py` makes one pose guide from a donor sprite (`python3 -I tools/posref.py <sprites> ryuko 34 base 1024x1536`);
draw.sh runs it for every guide it needs.
