"""SHUWA's select and HUD art (HPA-1306), written to art/shuwa/ui/.

    python3 art/shuwa/tools/ui.py name schemes      # drawn in code, no drawings needed
    python3 art/shuwa/tools/ui.py variants          # out/raw/{portrait,face}-<v>.png -> out/ui/ (needs draw.sh ui)
    python3 art/shuwa/tools/ui.py pick a b          # portrait a and face b -> ui/portrait.png, tile.png, hud-face.png

- name: the "SHUWA" lettering in the cast's nameplate style, 20 px high.
- schemes: the seven alternate colour schemes: ui/palettes.json (each current colour to its colour in all eight)
  and each scheme's recoloured key drawings, ui/schemes/{base,giant}-<n>.png.
- variants: each drawn portrait and face cleaned up to the cast's pixel style (crisp.py), into out/ui/ (not committed)
  FRAMES holds each face drawing's tile and HUD framing.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import crisp  # noqa: E402
ART = HERE.parent
UI = ART / "ui"
OUT = ART / "out"
BG = (40, 88, 156)  # the drawings' flat background (refs/base.png)

# --- Name lettering -------------------------------------------------------------------------------------------
# Squared capitals, 16 px tall with 4 px upright strokes and 2 px bars, like the cast's plates. Each letter then gets a 1 px clear inset
# (the dark edge, wherever it is shown) and a 1 px light grey outline around that, so the plate is 20 px high.
GLYPHS = {
    "S": [".###########.", "#############", "####.....####", "####.....####", "####.........", "####.........",
          "#####........", "#############", "#############", "........#####", ".........####", ".........####",
          "####.....####", "####.....####", "#############", ".###########."],
    "H": ["####.....####"] * 7 + ["#############"] * 2 + ["####.....####"] * 7,
    "U": ["####.....####"] * 13 + ["#####...#####", "#############", ".###########."],
    "W": ["####...........####"] * 8 + ["####...#####...####"] * 6 + ["###################", ".#################."],
    "A": [".###########.", "#############"] + ["####.....####"] * 5 + ["#############"] * 2 + ["####.....####"] * 7,
}
FACE, EDGE = (255, 255, 255), (199, 206, 209)  # the cast's plate colours
SPACING = 4  # letter to letter: inset, outline, outline, inset


def lettering(word="SHUWA"):
    w = 2 + sum(len(GLYPHS[c][0]) for c in word) + SPACING * (len(word) - 1) + 2
    face = np.zeros((20, w), bool)
    x = 2
    for c in word:
        g = np.array([[ch == "#" for ch in row] for row in GLYPHS[c]])
        face[2:18, x:x + g.shape[1]] |= g
        x += g.shape[1] + SPACING

    def grow(m, diagonal):
        p = np.pad(m, 1)
        out = m | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
        if diagonal:
            out |= p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:]
        return out

    inset = grow(face, False)  # 4-neighbours: the letters' corners stay cut
    edge = grow(inset, True) & ~inset
    out = np.zeros((20, w, 4), np.uint8)
    out[face] = (*FACE, 255)
    out[edge] = (*EDGE, 255)
    return Image.fromarray(out, "RGBA")


# --- Colour schemes -------------------------------------------------------------------------------------------
# Every colour his drawings use (the one palette of game/drawings), grouped by what it paints. A scheme recolours
# whole ramps (light, shadow, line). The chest lamp's blues never change, so its low-life red blink always reads;
# skin, hair, eyes, gloves, boots and the lantern stay too.
RAMPS = {
    "suit": ["f89820", "d85808", "782808"],  # orange coveralls (base form only)
    "stripes": ["e82028", "a81018", "580810"],  # the giant's red (giant only)
    "metal": ["e8e8f0", "b8b8c8", "888898", "404058"],  # hard hat, fin and the giant's silver body
    "body": ["c8d0e0"],  # the giant's main silver, also the reflective bands' shadow
}
SCHEMES = [  # scheme 1 is his current colours; each later scheme lists the ramps it changes
    ("Track orange", {}),
    ("Hi-vis lime", {"suit": ["c8e830", "88b010", "385010"], "stripes": ["30c048", "108830", "084018"]}),
    ("Fire crew", {"suit": ["e84030", "a81818", "500810"], "stripes": ["f8c028", "c07808", "603008"]}),
    ("Midnight", {"suit": ["686878", "404050", "181828"], "metal": ["a0a0b0", "707080", "505060", "202030"],
                  "body": ["8890a0"]}),
    ("Violet", {"suit": ["b868e8", "7830b0", "381060"], "stripes": ["d040d0", "882088", "400840"]}),
    ("Teal", {"suit": ["30c8a0", "108870", "084030"], "stripes": ["f88020", "c04808", "602008"]}),
    ("Rose", {"suit": ["f880b8", "c83880", "601838"], "stripes": ["f860a0", "b82868", "580830"]}),
    ("Black and gold", {"suit": ["484850", "282830", "101018"], "metal": ["f8f0c0", "d8b858", "989080", "584828"],
                        "body": ["f0d870"]}),
]
LAMP = ["68c8f8", "1870d8", "102868"]


def palette_colours():
    """The colours his game drawings use, in palette order (colour 0 is clear)."""
    used, pal = set(), None
    for f in sorted((ART / "game/drawings").glob("*.png")):
        im = Image.open(f)
        pal = im.getpalette()
        used |= {i for _, i in im.getcolors(256)}
    return ["%02x%02x%02x" % tuple(pal[i * 3:i * 3 + 3]) for i in sorted(used - {0})]


def scheme_table():
    rows = {c: [c] * len(SCHEMES) for c in palette_colours()}
    for n, (_, change) in enumerate(SCHEMES):
        for ramp, colours in change.items():
            for old, new in zip(RAMPS[ramp], colours, strict=True):
                rows[old][n] = new
    for c in LAMP:
        assert len(set(rows[c])) == 1, f"the lamp's {c} must not change"
    for row in rows.values():
        assert all(int(h[i:i + 2], 16) % 8 == 0 for h in row for i in (0, 2, 4)), row
    return rows


def recolour(path, rows, n):
    a = np.asarray(Image.open(path).convert("RGBA")).copy()
    key = (a[..., 0].astype(np.int64) << 16) | (a[..., 1].astype(np.int64) << 8) | a[..., 2]
    out = a.copy()
    for old, row in rows.items():
        new = int(row[n], 16)
        hit = key == int(old, 16)
        out[hit, 0], out[hit, 1], out[hit, 2] = new >> 16, (new >> 8) & 255, new & 255
    out[a[..., 3] == 0] = 0
    return Image.fromarray(out, "RGBA")


def schemes():
    rows = scheme_table()
    (UI / "schemes").mkdir(parents=True, exist_ok=True)
    table = {"schemes": [name for name, _ in SCHEMES], "colors": rows}
    (UI / "palettes.json").write_text(json.dumps(table, indent=2) + "\n")
    for n in range(1, len(SCHEMES)):
        for form, key in (("base", "key-master-base"), ("giant", "key-master-powered")):
            recolour(ART / f"round7/{key}.png", rows, n).save(UI / f"schemes/{form}-{n + 1}.png", optimize=True)
    print(f"{len(rows)} colours x {len(SCHEMES)} schemes -> ui/palettes.json, ui/schemes/")


def name():
    UI.mkdir(exist_ok=True)
    im = lettering()
    im.save(UI / "name.png", optimize=True)
    print("ui/name.png", im.size)


# --- Portrait, face tile and HUD face ---------------------------------------------------------------------------
# Each drawing goes through crisp.py like his sprites. The portrait is scaled to the cast's height; a face drawing
# is scaled twice: so his face fills the 60 px tile, and a quarter larger for the 70 px HUD strip across his eyes.
# His sprites' ramps, less the silver's third tone: at these sizes it is the grey's light tone again (136 against
# 144), and the two speckle his gloves and boots.
PIECE_RAMPS = {**crisp.RAMPS, "silver": ([(232, 232, 240), (184, 184, 200)], (64, 64, 88))}
PORTRAIT_H = 450
TILE, HUD = (24, 60), (70, 21)
TILE_BG = (40, 88, 152)  # the drawings' background, snapped to the cast's multiples of 8
# Per face drawing: the skin's height in the tile (brow to neck), the tile's centre as a share of the face's
# width (0 = the face's left edge), the eye line's share of the tile's height, and the HUD's scale against the
# tile's (the cast's HUD eyes are about 12 px tall). Set by eye per drawing; a drawing not listed takes DEFAULT.
DEFAULT = dict(face=50, left=0.42, eyes=0.5, hud=1.25)
FRAMES = {}


def raw(name):
    return np.asarray(Image.open(OUT / f"raw/{name}.png").convert("RGB"))


def skin_and_eyes(rgba):
    """Bounding box of the skin (his face under the brim, down to the neck) and the centres of his two irises."""
    rgb, a = rgba[..., :3].astype(int), rgba[..., 3] > 0
    tones = crisp.RAMPS["skin"][0]
    skin = a & np.any([np.all(rgb == t, -1) for t in tones], 0)
    lab_, n = ndi.label(skin)
    big = np.argmax(ndi.sum(skin, lab_, range(1, n + 1))) + 1
    ys, xs = np.nonzero(lab_ == big)
    box = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    navy = a & np.any([np.all(rgb == t, -1) for t in crisp.RAMPS["navy"][0]], 0)
    navy[: box[1]] = navy[box[3]:] = False
    navy[:, : box[0]] = navy[:, box[2]:] = False
    # The irises: navy pixels on the face, split into two eyes at the widest gap between their columns.
    ys, xs = np.nonzero(navy)
    order = np.sort(np.unique(xs))
    cut = order[np.argmax(np.diff(order))]
    eyes = [(ys[side].mean(), xs[side].mean()) for side in (xs <= cut, xs > cut)]
    return box, eyes


def face_pieces(name):
    f = {**DEFAULT, **FRAMES.get(name, {})}
    rgb = raw(name)
    # A first pass at a fixed scale finds the face, then each piece is drawn at its own scale.
    probe, _, _ = crisp.sprite(rgb, BG, height=240, ramps=PIECE_RAMPS)
    (x0, y0, x1, y1), eyes = skin_and_eyes(probe)
    pieces = {}
    tile = f["face"] / (y1 - y0)
    for piece, scale in (("tile", tile), ("hud", tile * f["hud"])):
        spr, _, _ = crisp.sprite(rgb, BG, height=round(probe.shape[0] * scale), ramps=PIECE_RAMPS)
        k = spr.shape[0] / probe.shape[0]
        if piece == "tile":
            w, h = TILE
            left = round((x0 + (x1 - x0) * f["left"]) * k - w / 2)
            top = round(sum(e[0] for e in eyes) / 2 * k - h * f["eyes"])
            canvas = Image.new("RGBA", spr.shape[1::-1], (*TILE_BG, 255))
            canvas.alpha_composite(Image.fromarray(spr, "RGBA"))
        else:
            w, h = HUD
            left = round(sum(e[1] for e in eyes) / 2 * k - w / 2)
            top = round(sum(e[0] for e in eyes) / 2 * k - h * 0.6)
            canvas = Image.fromarray(spr, "RGBA")
        pieces[piece] = canvas.crop((left, top, left + w, top + h))
    return pieces


def variants():
    (OUT / "ui").mkdir(parents=True, exist_ok=True)
    for f in sorted((OUT / "raw").glob("portrait-*.png")):
        spr, _, _ = crisp.sprite(raw(f.stem), BG, height=PORTRAIT_H, ramps=PIECE_RAMPS)
        Image.fromarray(spr, "RGBA").save(OUT / f"ui/{f.stem}.png")
        print(f"out/ui/{f.stem}.png", spr.shape[1::-1])
    for f in sorted((OUT / "raw").glob("face-*.png")):
        v = f.stem.split("-")[1]
        for piece, im in face_pieces(f.stem).items():
            im.save(OUT / f"ui/{piece}-{v}.png")
            print(f"out/ui/{piece}-{v}.png", im.size)


def pick(portrait, face):
    """Copy the owner's picks into ui/ (the committed pieces)."""
    UI.mkdir(exist_ok=True)
    Image.open(OUT / f"ui/portrait-{portrait}.png").save(UI / "portrait.png", optimize=True)
    for piece, out in (("tile", "tile"), ("hud", "hud-face")):
        Image.open(OUT / f"ui/{piece}-{face}.png").save(UI / f"{out}.png", optimize=True)
    print(f"ui/portrait.png <- {portrait}, ui/tile.png and ui/hud-face.png <- {face}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["pick"]:
        pick(*args[1:3])
    else:
        steps = {"name": name, "schemes": schemes, "variants": variants}
        for arg in args:
            steps[arg]()
