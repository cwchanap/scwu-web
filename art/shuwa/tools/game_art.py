"""SHUWA's game drawings: one shared-palette PNG per drawing and its anchor (art/shuwa/game/).

usage: python3 -I tools/game_art.py RAW_DIR REFS_DIR ROUND7_DIR DATA_DIR ASSETS_DIR OUT_DIR
RAW_DIR holds every drawing (draw.sh output, with the hand-drawn and fixed ones laid over the first pass), REFS_DIR the
key drawings, ROUND7_DIR the committed round 7 build (idle, walk and the powered key sprites), DATA_DIR out/data
(tools/donor_data.py: each donor's frame offsets and idle size) and ASSETS_DIR the game's exported sprites (the donors'
feet are read from them).
Writes OUT_DIR/drawings/<name>.png, OUT_DIR/anchors.json, OUT_DIR/fx/<donor image>.png (his effects, drawn in code at
the size of the donor image they replace) and OUT_DIR/ui/ (the Menu's face tile and the HUD face, cut from his key drawing).

A drawing is cut the same way the preview builders cut it (same head match, same scale, tools/crisp.py), so the game
shows what the preview page showed. Its anchor is the point the game puts on the fighter's position: the point where
the donor's own position point lands on the drawing.
- A pose drawn on the donor's guide takes the guide's position point for x (the model keeps him over it), and his feet
  plus the donor's offset from feet to position point for y; a pose drawn without a guide takes his feet's x
  (the key drawing's place on a 1024x1536 canvas) and the same y.
- The donor image a drawing stands in for sets that offset (SOURCE below); the exporter then moves every use of the
  drawing by how far the donor's script shifts that image (spec.json lists which drawing stands in for each donor image).
- A special drawn for another donor's move (b3_poses: DoraEmon's SHUWATCH, ALEX's BARRIER) takes that donor's offset
  and guide point, scaled from its idle height to RYUKO's as b3.py does; RECHARGE's free poses (ZOMA sits in a tank)
  take none, so their anchor is their feet. GIANT STEP's foot is cut 330 px tall (as b4.py does) and anchored on its sole.
Drawings share one palette (index 0 is transparent): the cast's two-tone ramps leave 31 opaque colours in all.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import game_fx  # noqa: E402
import posref  # noqa: E402
from b2_poses import POSES as B2  # noqa: E402
from b3_poses import POSES as B3  # noqa: E402
from v4 import BASE_ACTION, Ref, feet, load, pixel  # noqa: E402

HERE = Path(__file__).parent.parent
# GIANT STEP's foot: cut to this height in game px, anchored on its sole.
FOOT = ("giant-foot", 330)
# Donor folders under ASSETS_DIR and their out/data names (b3_poses names RYUKO "ryuko").
FOLDER = {"ryuko": "ryuko", "dora": "dora", "alex": "alex", "zoma": "zoma"}
# Round 7 key sprites kept as they are (the powered stances); anchor = feet.
ROUND7_KEYS = ["p-charge", "p-fire", "p-fistup"]
# Donor image a drawing is placed for, when it is not the number after the dash in its name.
SOURCE = {"timeover": 420}
# Lying and flying drawings: the anchor sits on the sprite's lowest row, whatever the feet do.
POSES_FILE = HERE / "poses.txt"
# Effects he draws himself, by the donor image each one replaces: image -> (shape, extra arguments).
FX = {
    **{n: ("ring", dict(phase=i * 0.4)) for i, n in enumerate((424, 425, 426, 427, 428))},  # the saw ring (her axe)
    **{n: ("muzzle", dict(seed=i)) for i, n in enumerate((308, 309, 310, 311, 312))},  # his beam's muzzle bloom
    313: ("beam", dict(core=0.62, mid=0.82, seed=1)), 314: ("beam", dict(core=0.62, mid=0.82, seed=2)),
    315: ("beam", dict(core=0.4, mid=0.7, seed=3, stripes=6)), 316: ("beam", dict(core=0.4, mid=0.7, seed=4, stripes=6)),
    317: ("beam", dict(core=0.3, mid=0.62, seed=5, stripes=4)), 318: ("beam", dict(core=0.3, mid=0.66, seed=6)),
    319: ("beam", dict(core=0.45, mid=0.8, seed=7, taper=0)),
    337: ("cone", dict(seed=1)), 338: ("cone", dict(seed=2)), 339: ("cone", dict(seed=3)),  # the sky beam's head
    340: ("band", dict(seed=1)), 341: ("band", dict(seed=2)), 342: ("band", dict(seed=3)),  # and its body
}


def poses():
    """poses.txt rows -> {name: dict(batch, guide, form, size)}."""
    out = {}
    for line in POSES_FILE.read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        name, batch, guide, form, size = line.split()
        out[name] = dict(batch=batch, guide=guide, form=form, size=size)
    return out


def source(name, row):
    if name in SOURCE:
        return SOURCE[name]
    if row["guide"] != "-":
        return int(row["guide"].split("-")[1])
    if name in B2:
        return B2[name][0]
    if name in B3:
        return B3[name][1]
    return int(name.rsplit("-", 1)[1])


def save_indexed(rgba, path):
    """An 8-bit palette PNG holding exactly the image's colours; colour 0 is clear when anything is."""
    flat = rgba.reshape(-1, 4)
    clear = flat[:, 3] == 0
    cols = sorted({tuple(int(v) for v in c) for c in flat[~clear][:, :3]})
    assert (0, 0, 0) not in cols, "the engine reads black as clear"
    pal = {c: i + 1 for i, c in enumerate(cols)} if clear.any() else {c: i for i, c in enumerate(cols)}
    idx = np.zeros(len(flat), np.uint8)
    idx[~clear] = [pal[tuple(int(v) for v in c)] for c in flat[~clear][:, :3]]
    im = Image.fromarray(idx.reshape(rgba.shape[:2]), "P")
    im.putpalette([0, 0, 0] * bool(clear.any()) + [v for c in cols for v in c])
    im.save(path, **({"transparency": 0} if clear.any() else {}), optimize=True)


def main(raw, refs_dir, round7, data, assets, out):
    raw, refs_dir, round7, data, assets, out = map(Path, (raw, refs_dir, round7, data, assets, out))
    frames = {d: json.loads((data / f"{d}.json").read_text())["frames"] for d in FOLDER}
    R = frames["ryuko"]
    idle = {("ryuko" if d == "assets" else d): v["idle"][2] for d, v in json.loads((data / "donors.json").read_text()).items()}
    rows = poses()

    def donor_offset(donor, n, vertical_only):
        """The donor's position point minus its feet, in its image n, in SHUWA sprite px (other donors are scaled from
        their idle height to RYUKO's, as b3.py does)."""
        dx, dy, w, h = frames[donor][str(n)]
        im = np.asarray(Image.open(assets / FOLDER[donor] / f"{n}.png").convert("RGBA"))
        fx, fy = feet(im)
        k = 1.0 if donor == "ryuko" else idle["ryuko"] / idle[donor]
        return (0 if vertical_only else round(((w // 2 - dx) - fx) * k)), round(((h - dy) - fy) * k)

    def ryuko_offset(n, vertical_only):
        return donor_offset("ryuko", n, vertical_only)

    refs = {}
    for form, h in (("base", 208.0), ("hero", 205.0)):
        a, bg = load(refs_dir, form)
        r = Ref(a, bg)
        refs[form] = (r, h / r.fig_h)

    found = {}
    for name, row in rows.items():
        # Only the sprite batches: b4 (effects and supers) and ui (select art, tools/ui.py) are built elsewhere.
        if not (raw / f"{name}.png").exists() or row["batch"] not in ("b1", "b2", "b3"):
            continue
        a, bg = load(raw, name)
        (f, _, _), score = refs[row["form"]][0].find(a, np.arange(0.75, 1.26, 0.01))
        found[name] = a, bg, f, score
    # A head the template can't match (score under 0.6: spins, back views, arms over the head) takes the median scale
    # of its batch and form, as the preview builders do.
    median = {}
    for batch in ("b1", "b2", "b3"):
        for form in ("base", "hero"):
            fs = [v[2] for k, v in found.items() if rows[k]["batch"] == batch and rows[k]["form"] == form and v[3] >= 0.6]
            median[batch, form] = float(np.median(fs or [1.0]))

    sprites, anchors = {}, {}
    for name, (a, bg, f, score) in found.items():
        row = rows[name]
        form, size = row["form"], row["size"]
        use = f if score >= 0.6 else median[row["batch"], form]
        s0 = refs[form][1] * (BASE_ACTION if form == "base" else 1.0)
        spr, (x0, _) = pixel(a, bg, s0 / use)
        n = source(name, row)
        guided = row["guide"] != "-"
        # b3's specials for other donors; sw-328 stood in for RYUKO's flight first (THREE MINUTES) and keeps her offset
        donor = B3[name][0] if name in B3 and name != "sw-328" else "ryuko"
        fx_, fy_ = feet(spr)
        ox, oy = (0, 0) if donor == "zoma" else donor_offset(donor, n, vertical_only=not guided)
        ax, ay = int(fx_ + ox), int(fy_ + oy)
        if guided:
            k = 1.0 if donor == "ryuko" else idle["ryuko"] / idle[donor]
            ax = (posref.point(frames[donor][str(n)], form, size, posref.SCALE[form] * k)[0] - x0) * s0 / use
        elif (form, size) in posref.POINT and size == "1024x1536":
            ax = (posref.POINT[form, size][0] - x0) * s0 / use
        sprites[name] = spr
        anchors[name] = [round(float(ax)), int(ay)]

    a, bg = load(raw, FOOT[0])
    sprites[FOOT[0]], _ = pixel(a, bg, FOOT[1] / a.shape[0])  # the leg fills the canvas height
    anchors[FOOT[0]] = [int(v) for v in feet(sprites[FOOT[0]])]

    # Round 7: idle and walk keep the canvases and anchors the preview page built, the powered stances their feet.
    meta = json.loads((round7 / "frames.json").read_text())
    for clip, names in (("idle", ["idle-c", "idle-a", "idle-b"]), ("walk", ["walk-1", "walk-2", "walk-3"])):
        m = meta[clip]
        for key, name in zip(m["keys"], names):
            sprites[name] = np.asarray(Image.open(round7 / m["frames"][key - 1]).convert("RGBA"))
            anchors[name] = list(m["anchor"])
    for name in ROUND7_KEYS:
        sprites[name] = np.asarray(Image.open(round7 / f"key-{name}.png").convert("RGBA"))
        anchors[name] = [int(v) for v in feet(sprites[name])]
    # idle and walk stand in for donor images with their own feet-to-position offsets (idle: stance 31, walk: 9 to 11)
    for name, n in (("idle-a", 31), ("idle-b", 31), ("idle-c", 31), ("walk-1", 9), ("walk-2", 10), ("walk-3", 11)):
        ox, oy = ryuko_offset(n, vertical_only=name.startswith("walk"))
        anchors[name] = [int(anchors[name][0] + ox), int(anchors[name][1] + oy)]

    # spun copies of the launch drawing for the victim's tumble (RYUKO's twisting 233 and 234)
    up, (uax, uay) = sprites["launchup-102"], anchors["launchup-102"]
    uh, uw = up.shape[:2]
    sprites["spin-l"], anchors["spin-l"] = np.ascontiguousarray(np.rot90(up, 1)), [uay, uw - 1 - uax]
    sprites["spin-r"], anchors["spin-r"] = np.ascontiguousarray(np.rot90(up, -1)), [uh - 1 - uay, uax]

    # one palette for all of them
    colours = sorted({tuple(int(v) for v in c) for s in sprites.values() for c in s[s[..., 3] > 0][:, :3]})
    for s in sprites.values():
        assert set(np.unique(s[..., 3])) <= {0, 255}, "drawings must have hard edges"
    pal = {c: i + 1 for i, c in enumerate(colours)}
    flat = [0, 0, 0] + [v for c in colours for v in c]
    (out / "drawings").mkdir(parents=True, exist_ok=True)
    for name, s in sorted(sprites.items()):
        idx = np.zeros(s.shape[:2], np.uint8)
        ys, xs = np.nonzero(s[..., 3] > 0)
        idx[ys, xs] = [pal[tuple(int(v) for v in c)] for c in s[ys, xs, :3]]
        im = Image.fromarray(idx, "P")
        im.putpalette(flat)
        im.save(out / "drawings" / f"{name}.png", transparency=0, optimize=True)
    table = {n: dict(anchor=anchors[n], size=[sprites[n].shape[1], sprites[n].shape[0]]) for n in sorted(sprites)}
    lines = [f'  "{n}": {{ "anchor": [{v["anchor"][0]}, {v["anchor"][1]}], "size": [{v["size"][0]}, {v["size"][1]}] }}'
             for n, v in table.items()]  # the layout prettier gives the file
    (out / "anchors.json").write_text("{\n" + ",\n".join(lines) + "\n}\n")
    print(f"{len(sprites)} drawings, {len(colours)} colours")

    (out / "fx").mkdir(exist_ok=True)
    for n, (shape, kw) in FX.items():
        dx, dy, w, h = R[str(n)]
        save_indexed(getattr(game_fx, shape)(w, h, **kw), out / "fx" / f"{n}.png")
    print(f"{len(FX)} effects")  # game/ui/ is the select and HUD art, tools/ui.py's


if __name__ == "__main__":
    main(*sys.argv[1:7])
