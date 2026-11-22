"""Make a pose guide (out/posrefs/<donor>-<n>.png): a donor sprite scaled to SHUWA's drawing size on the drawing canvas.

usage: python3 -I tools/posref.py SPRITE_DIR DONOR N FORM CANVAS
SPRITE_DIR holds the donor's exported sprites (public/assets/<donor>); FORM is base or hero; CANVAS 1024x1536 or 1536x1024.
Guides are cut from the game's sprites, so they stay in out/ and are never committed; draw.sh makes the ones it needs.
The donor's frame offsets come from out/data/<donor>.json (tools/donor_data.py).
The donor's position point lands where SHUWA's feet stand in his key drawing; a pose that would run off the right edge
is moved left to fit.
"""
import json
import sys
from pathlib import Path

from PIL import Image

BG = (40, 88, 156)
SCALE = {"base": 5.168, "hero": 4.21}  # SHUWA's drawing size over RYUKO's sprite size
POINT = {("base", "1024x1536"): (508, 1386), ("hero", "1024x1536"): (502, 1416), ("hero", "1536x1024"): (768, 930),
         ("base", "1536x1024"): (768, 878)}
MARGIN = 8
OUT = Path(__file__).parent.parent / "out"


def corner(frame, form, canvas, s=None):
    """Top-left corner of the scaled donor sprite on the canvas. frame: the donor's [dx, dy, w, h]."""
    dx, dy, w, h = frame
    s = s or SCALE[form]
    cx, cy = POINT[(form, canvas)]
    x0, y0 = round(cx - (w // 2 - dx) * s), round(cy - (h - dy) * s)
    return min(x0, int(canvas.split("x")[0]) - MARGIN - round(w * s)), y0


def point(frame, form, canvas, s=None):
    """Where the donor's position point sits on the guide's canvas (SHUWA is drawn over it)."""
    dx, dy, w, h = frame
    s = s or SCALE[form]
    x0, y0 = corner(frame, form, canvas, s)
    return x0 + (w // 2 - dx) * s, y0 + (h - dy) * s


def main(sprites, donor, n, form, canvas):
    sprites = Path(sprites)
    frame = json.loads((OUT / "data" / f"{donor}.json").read_text())["frames"][str(n)]
    idle = json.loads((OUT / "data" / "donors.json").read_text())["assets" if donor == "ryuko" else donor]["idle"]
    s = SCALE[form] * 203 / idle[2]  # other donors are drawn to RYUKO's idle height, as b3 does
    im = Image.open(sprites / f"{n}.png").convert("RGBA")
    big = im.resize((round(im.width * s), round(im.height * s)), Image.NEAREST)
    cw, ch = map(int, canvas.split("x"))
    out = Image.new("RGB", (cw, ch), BG)
    out.paste(big, corner(frame, form, canvas, s), big)
    (OUT / "posrefs").mkdir(parents=True, exist_ok=True)
    out.save(OUT / "posrefs" / f"{donor}-{n}.png")


if __name__ == "__main__":
    main(*sys.argv[1:6])
