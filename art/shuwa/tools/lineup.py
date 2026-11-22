"""RYUKO's donor pose next to SHUWA's, same scale, feet on one line: a pose and reach check.

usage: python3 -I tools/lineup.py OUT_DIR RYUKO_DIR DEST_PNG pose[:ryuko_png] ...
Each pose's sprite is OUT_DIR/key-<pose>.png; the RYUKO image number defaults to the pose's suffix.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

BG = (40, 88, 156, 255)


def trim(im):
    return im.crop(im.getbbox())


def main(out, ryuko, dest, *poses):
    out, ryuko = Path(out), Path(ryuko)
    pairs = []
    for p in poses:
        name, _, n = p.partition(":")
        n = n or name.rsplit("-", 1)[-1]
        r = ryuko / f"{n}.png"
        pairs.append((name, trim(Image.open(r).convert("RGBA")) if r.exists() else None,
                      trim(Image.open(out / f"key-{name}.png").convert("RGBA"))))
    gap, cols = 18, 6
    cw = max((r.width if r else 0) + s.width + gap * 3 for _, r, s in pairs)
    ch = max(max(r.height if r else 0, s.height) for _, r, s in pairs) + 30
    rows = (len(pairs) + cols - 1) // cols
    c = Image.new("RGBA", (cw * min(cols, len(pairs)), ch * rows), BG)
    d = ImageDraw.Draw(c)
    for i, (name, r, s) in enumerate(pairs):
        x0, y0 = (i % cols) * cw, (i // cols) * ch
        base = y0 + ch - 20
        x = x0 + gap
        if r:
            c.alpha_composite(r, (x, base - r.height))
            x += r.width + gap
        c.alpha_composite(s, (x, base - s.height))
        d.line([(x0, base), (x0 + cw - 4, base)], fill=(255, 255, 255, 70))
        d.text((x0 + gap, base + 4), name, fill=(255, 255, 255, 255))
    c.convert("RGB").resize((c.width * 2, c.height * 2), Image.NEAREST).save(dest)
    print(dest, c.size)


if __name__ == "__main__":
    main(*sys.argv[1:])
