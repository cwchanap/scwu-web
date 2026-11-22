"""Make a pose guide (posrefs/<donor>-<n>.png): a donor sprite scaled to SHUWA's drawing size on the drawing canvas.

usage: python3 -I tools/posref.py SPRITE_DIR DONOR N FORM CANVAS
SPRITE_DIR holds the donor's exported sprites (public/assets/<donor>); FORM is base or hero; CANVAS 1024x1536 or 1536x1024.
The donor's position point lands where SHUWA's feet stand in his key drawing; a pose that would run off the right edge
is moved left to fit.
"""
import json
import sys
from pathlib import Path

from PIL import Image

BG = (40, 88, 156)
SCALE = {"base": 5.168, "hero": 4.21}  # SHUWA's drawing size over the donor's sprite size
POINT = {("base", "1024x1536"): (508, 1386), ("hero", "1024x1536"): (502, 1416), ("hero", "1536x1024"): (768, 930)}
MARGIN = 8


def main(sprites, donor, n, form, canvas):
    sprites = Path(sprites)
    dx, dy, w, h = json.loads((Path(__file__).parent / "data" / f"{donor}.json").read_text())["frames"][str(n)]
    im = Image.open(sprites / f"{n}.png").convert("RGBA")
    s = SCALE[form]
    big = im.resize((round(im.width * s), round(im.height * s)), Image.NEAREST)
    cw, ch = map(int, canvas.split("x"))
    cx, cy = POINT[(form, canvas)]
    x0, y0 = round(cx - (w // 2 - dx) * s), round(cy - (h - dy) * s)
    x0 = min(x0, cw - MARGIN - big.width)
    out = Image.new("RGB", (cw, ch), BG)
    out.paste(big, (x0, y0), big)
    out.save(Path(__file__).parent.parent / "posrefs" / f"{donor}-{n}.png")
    return out


if __name__ == "__main__":
    main(*sys.argv[1:6])
