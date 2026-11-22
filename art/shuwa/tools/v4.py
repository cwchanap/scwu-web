"""Round 5 to 7 builder: SHUWA's idle, walk, transform and SPECIUM from the key drawings (cast proportions).
Its output for the approved round 7 is kept in ../round7/; the batch builders import its helpers
(Frame, Ref, feet, load, pixel, save).

usage: python3 -I tools/v4.py RAW_DIR OUT_DIR
RAW_DIR holds master-base.png, master-powered.png, idle-b.png, idle-c.png, raise.png,
walk.png, p-fistup.png, p-charge.png, p-fire.png (OpenAI image edits, flat cel art).

Rules carried over from the cast study, plus the 21 Nov review:
- one pixel step (crisp.py) at ONE scale for every frame, matched on the head;
- the head stays the same pixels between idle and walk frames (cast: 11 of 12);
- the body, arms and lantern are redrawn between idle frames (cast: 29 to 79% of pixels move);
- effects are separate soft-light layers (fx.py), not fighter drawings;
- fast transform, hold-heavy beam.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import crisp  # noqa: E402
import fx  # noqa: E402

BG = (40, 88, 156)
SPRITE_H = 205  # master guard stance, crest to sole, like the cast's 193 to 212 px idles
SPRITE_H_P = 205  # powered master, crest to sole
# Worker-form action drawings (batches 1 and 2) are matched on the face, but the model draws their hard hat and
# body about 11% smaller than the key drawing's (hat ratio median 0.885), so they popped down from idle. They
# take this extra scale, which brings the hat back to idle's size; the face ends up about 10% larger.
BASE_ACTION = 1.1
SKIN = {(248, 216, 192), (232, 144, 128)}


def load(raw, name):
    a = np.asarray(Image.open(raw / f"{name}.png").convert("RGB"))
    bg = np.median(np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3)]), 0)
    return a, bg


class Ref:
    """The master drawing's head, used to find every other drawing's scale and head position."""

    def __init__(self, a, bg):
        m = crisp.figure_mask(a, bg)
        ys, xs = np.nonzero(m)
        self.fig_h = ys.max() - ys.min() + 1
        self.scale = SPRITE_H / self.fig_h
        y0 = ys.min()
        y1 = y0 + int(self.fig_h * 0.40)
        cols = np.nonzero(m[y0:y1].any(0))[0]
        self.box = (cols.min(), y0, cols.max() + 1, y1)
        x0, _, x1, _ = self.box
        self.tpl = cv2.cvtColor(a[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY)

    def find(self, a, scales, region=None):
        """Best (factor, x, y) of the head in `a` (factor = its size / master's)."""
        g = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY)
        ox = oy = 0
        if region:
            x0, y0, x1, y1 = region
            g = g[y0:y1, x0:x1]
            ox, oy = x0, y0
        best = (-2, None)
        for f in scales:
            t = cv2.resize(self.tpl, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
            if t.shape[0] >= g.shape[0] or t.shape[1] >= g.shape[1]:
                continue
            r = cv2.matchTemplate(g, t, cv2.TM_CCOEFF_NORMED)
            _, v, _, loc = cv2.minMaxLoc(r)
            if v > best[0]:
                best = (v, (f, loc[0] + ox, loc[1] + oy))
        return best[1], best[0]


def pixel(a, bg, scale, keep=None):
    spr, _, (x0, y0) = crisp.sprite(a, bg, scale=scale, keep=keep)
    return spr, (x0, y0)


def feet(spr):
    """Anchor: bottom-centre of the opaque pixels in the lowest 6 rows."""
    al = spr[..., 3] > 0
    rows = np.nonzero(al.any(1))[0]
    bot = rows.max()
    xs = np.nonzero(al[bot - 5:bot + 1].any(0))[0]
    return (xs.min() + xs.max()) // 2, bot + 1


def head_rows(spr):
    """Rows of the head (crest to chin): down to the lowest face-skin pixel in the top half."""
    al = spr[..., 3] > 0
    top = np.nonzero(al.any(1))[0].min()
    half = top + int((spr.shape[0] - top) * 0.45)
    skin = np.zeros(al.shape, bool)
    for c in SKIN:
        skin |= np.all(spr[..., :3] == c, -1)
    sk = np.nonzero(skin[top:half].any(1))[0]
    chin = top + (sk.max() if len(sk) else int((half - top) * 0.85))
    return top, chin


def match_offset(src, dst, rows, search=10):
    """(dx, dy) that best lays src's rows[0]..rows[1] (opaque pixels) onto dst, by equal colours."""
    t, b = rows
    sub = src[t:b + 1]
    ys, xs = np.nonzero(sub[..., 3] > 0)
    cols = sub[ys, xs, :3].astype(int)
    best = (-1, (0, 0))
    for dy in range(-search, search + 1):
        for dx in range(-search, search + 1):
            yy, xx = ys + t + dy, xs + dx
            ok = (yy >= 0) & (yy < dst.shape[0]) & (xx >= 0) & (xx < dst.shape[1])
            same = np.all(dst[yy[ok], xx[ok], :3].astype(int) == cols[ok], -1) & (dst[yy[ok], xx[ok], 3] > 0)
            s = int(same.sum())
            if s > best[0]:
                best = (s, (dx, dy))
    return best[1]


def pin_head(src, dst, dx, dy, rows, pad=3):
    """Replace dst's head with src's head shifted by (dx, dy)."""
    t, b = rows
    out = dst.copy()
    head = src[t:b + 1]
    al = head[..., 3] > 0
    xs = np.nonzero(al.any(0))[0]
    x0, x1 = xs.min() + dx - pad, xs.max() + dx + pad + 1
    out[:b + dy + 1, max(0, x0):x1] = 0  # clear dst's own head (and anything above it)
    ys, xs2 = np.nonzero(al)
    out[ys + t + dy, xs2 + dx] = head[ys, xs2]
    return out


class Frame:
    def __init__(self, dur):
        self.dur = dur
        self.layers = []  # (rgba, left, top) relative to the feet anchor

    def add(self, a, ax, ay, dx=0, dy=0):
        self.layers.append((a, dx - ax, dy - ay))
        return self


def render(frames):
    x0 = min(l for f in frames for _, l, _ in f.layers)
    y0 = min(t for f in frames for _, _, t in f.layers)
    x1 = max(l + a.shape[1] for f in frames for a, l, _ in f.layers)
    y1 = max(t + a.shape[0] for f in frames for a, _, t in f.layers)
    out = []
    for f in frames:
        c = Image.new("RGBA", (x1 - x0, y1 - y0))
        for a, l, t in f.layers:
            c.alpha_composite(Image.fromarray(a), (l - x0, t - y0))
        out.append(c)
    return out, (-x0, -y0)


def save(name, frames, out, loop, keys=None):
    ims, (ax, ay) = render(frames)
    d = out / name
    d.mkdir(parents=True, exist_ok=True)
    files = []
    for n, im in enumerate(ims, 1):
        im.save(d / f"{n}.png")
        files.append(f"{name}/{n}.png")
    w, h = ims[0].size
    big = []
    for im in ims:
        b = Image.new("RGBA", im.size, (*BG, 255))
        b.alpha_composite(im)
        big.append(b.convert("RGB").resize((w * 2, h * 2), Image.NEAREST))
    big[0].save(out / f"shuwa-{name}.gif", save_all=True, append_images=big[1:],
                duration=[f.dur for f in frames], loop=0)
    return dict(width=w, height=h, anchor=[int(ax), int(ay)], durations=[f.dur for f in frames], loop=loop,
                frames=files, keys=keys or list(range(1, len(files) + 1)))


def centroid(spr, colours):
    m = np.zeros(spr.shape[:2], bool)
    for c in colours:
        m |= np.all(spr[..., :3] == c, -1)
    ys, xs = np.nonzero(m)
    return (int(xs.mean()), int(ys.mean())) if len(xs) else None


def bbox(spr, colours):
    m = np.zeros(spr.shape[:2], bool)
    for c in colours:
        m |= np.all(spr[..., :3] == c, -1)
    ys, xs = np.nonzero(m)
    return (xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) else None


YELLOW = [tuple(t) for t in crisp.RAMPS["yellow"][0]]
BLUE = [tuple(t) for t in crisp.RAMPS["blue"][0]]


def main(raw, out, base_h=None):
    raw, out = Path(raw), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    a0, bg0 = load(raw, "master-base")
    ref = Ref(a0, bg0)
    S = (base_h or SPRITE_H) / ref.fig_h
    sprites = {}
    report = {}

    def single(name, r, scales=np.arange(0.88, 1.141, 0.01), S=S):
        a, bg = load(raw, name)
        f = 1.0
        if name not in ("master-base", "master-powered"):
            (f, _, _), score = r.find(a, scales)
            report[name] = dict(head_scale=round(float(f), 3), match=round(float(score), 3))
        spr, _ = pixel(a, bg, S / f)
        sprites[name] = spr
        return spr

    for n in ["master-base", "idle-b", "idle-c", "raise"]:
        single(n, ref)
    # Powered drawings: matched on the powered master's head, at the base scale (same canvas size).
    ap, bgp = load(raw, "master-powered")
    refp = Ref(ap, bgp)
    Sp = SPRITE_H_P / refp.fig_h  # the powered drawings keep their own scale (same body size as round 5)
    for n in ["master-powered", "p-fistup", "p-charge", "p-fire"]:
        single(n, refp, S=Sp)

    # ---------- idle: A (guard), B (sink), C (rise); head = A's pixels ----------
    A = sprites["master-base"]
    rowsA = head_rows(A)
    axA, ayA = feet(A)
    idle_imgs = {"A": (A, axA, ayA)}
    for key, n in (("B", "idle-b"), ("C", "idle-c")):
        s = sprites[n]
        ax, ay = feet(s)
        # place s on A's anchor, then find where A's head sits on it
        canvas = np.zeros((max(A.shape[0], s.shape[0]) + 40, max(A.shape[1], s.shape[1]) + 40, 4), np.uint8)
        ox, oy = 20 + axA - ax, 20 + ayA - ay
        ox, oy = max(0, ox), max(0, oy)
        canvas[oy:oy + s.shape[0], ox:ox + s.shape[1]] = s
        Apad = np.zeros_like(canvas)
        Apad[20:20 + A.shape[0], 20:20 + A.shape[1]] = A
        rows = (rowsA[0] + 20, rowsA[1] + 20)
        dx, dy = match_offset(Apad, canvas, rows, search=12)
        dx, dy = int(np.clip(dx, -4, 4)), int(np.clip(dy, -12, 12))
        pinned = pin_head(Apad, canvas, dx, dy, rows)
        idle_imgs[key] = (pinned, axA + 20, ayA + 20)
        report[f"idle_{key}_head_offset"] = [dx, dy]
    seq = [("C", 220), ("A", 120), ("B", 220), ("A", 120)]
    frames = [Frame(d).add(*idle_imgs[k]) for k, d in seq]
    meta = {"idle": save("idle", frames, out, True, keys=[1, 2, 3])}

    # ---------- walk: 3-frame guard shuffle from the walk sheet; head = A's pixels ----------
    aw, bgw = load(raw, "walk")
    H, W = aw.shape[:2]
    walk_frames = []
    for i in range(3):
        cell = (W // 3 * i, 0, W // 3 * (i + 1), H // 2)
        (f, hx, hy), score = ref.find(aw, np.arange(0.30, 0.62, 0.01), region=cell)
        sub = aw[cell[1]:cell[3], cell[0]:cell[2]]
        spr, (x0, y0) = pixel(sub, bgw, S / f)
        report[f"walk_{i + 1}"] = dict(head_scale=round(float(f), 3), match=round(float(score), 3))
        walk_frames.append(spr)
    # Horizontal anchor = A's head x; vertical = soles.
    wf = []
    for spr in walk_frames:
        _, ay = feet(spr)
        canvas = np.zeros((spr.shape[0] + 40, spr.shape[1] + 40, 4), np.uint8)
        canvas[20:20 + spr.shape[0], 20:20 + spr.shape[1]] = spr
        # find A's head on this frame (search wide)
        best = (-1, (0, 0))
        Ahead = A[rowsA[0]:rowsA[1] + 1]
        hy, hx = np.nonzero(Ahead[..., 3] > 0)
        col = Ahead[hy, hx, :3].astype(int)
        for dy in range(0, canvas.shape[0] - Ahead.shape[0], 1):
            for dx in range(0, canvas.shape[1] - Ahead.shape[1], 2):
                same = np.all(canvas[hy + dy, hx + dx, :3].astype(int) == col, -1).sum()
                if same > best[0]:
                    best = (same, (dx, dy))
        (dx, dy) = best[1]
        # refine at 1 px
        for ddx in (-1, 0, 1):
            same = np.all(canvas[hy + dy, hx + dx + ddx, :3].astype(int) == col, -1).sum()
            if same > best[0]:
                best = (same, (dx + ddx, dy))
        dx, dy = best[1]
        pinned = canvas.copy()
        pinned[dy:dy + Ahead.shape[0], max(0, dx - 3):dx + Ahead.shape[1] + 3] = 0
        pinned[hy + dy, hx + dx] = Ahead[hy, hx]
        # anchor x: where A's anchor would be relative to its head
        ax = dx + axA
        wf.append((pinned, ax, ay + 20))
    frames = [Frame(d).add(*w) for w, d in zip(wf, (150, 120, 150))]
    meta["walk"] = save("walk", frames, out, True)
    meta["walk"]["vx"] = 200

    # ---------- transform: guard -> lantern raised (glow) -> white cut -> fist up -> hero guard ----------
    R = sprites["raise"]
    axR, ayR = feet(R)
    lan = bbox(R, YELLOW)
    lcx, lcy = ((lan[0] + lan[2]) // 2, (lan[1] + lan[3]) // 2) if lan else (axR, 20)
    F = sprites["p-fistup"]
    axF, ayF = feet(F)
    P = sprites["master-powered"]
    axP, ayP = feet(P)
    frames = [Frame(120).add(A, axA, ayA)]
    for r, d in ((14, 90), (22, 90), (30, 70)):
        g = fx.glow(r, rays=4 if r > 20 else 0, seed=r)
        gh = g.shape[0] // 2
        frames.append(Frame(d).add(g, axR - lcx + gh, ayR - lcy + gh).add(R, axR, ayR))
        # glow drawn behind? lantern light sits in front, like the cast's additive objects
        frames[-1].layers.reverse()
    frames.append(Frame(50).add(fx.flash(R), axR, ayR))
    frames.append(Frame(50).add(fx.flash(F), axF, ayF))
    big = fx.glow(60, inner=fx.PALE, outer=fx.BLUE, power=2.2)
    bh = big.shape[0] // 2
    lampF = centroid(F, BLUE) or (axF, ayF - 120)
    frames.append(Frame(80).add(big, axF - lampF[0] + bh, ayF - lampF[1] + bh).add(F, axF, ayF))
    frames.append(Frame(320).add(F, axF, ayF))
    frames.append(Frame(500).add(P, axP, ayP))
    meta["henshin"] = save("henshin", frames, out, False, keys=[1, 3, 5, 6, 8, 9])

    # ---------- SPECIUM: guard -> charge (chest lamp) -> cross -> beam hold -> recover ----------
    C = sprites["p-charge"]
    axC, ayC = feet(C)
    X = sprites["p-fire"]
    axX, ayX = feet(X)
    lamp = centroid(C, BLUE) or (axC, ayC - 120)
    # beam origin: the front edge of the crossed forearms (rightmost opaque pixel at hand height)
    al = X[..., 3] > 0
    top = np.nonzero(al.any(1))[0].min()
    band = slice(top + int((ayX - top) * 0.30), top + int((ayX - top) * 0.55))
    cols = np.nonzero(al[band].any(0))[0]
    hx = cols.max()
    rows_at = np.nonzero(al[band, hx - 6:hx + 1].any(1))[0]
    hy = band.start + int(rows_at.mean())
    frames = [Frame(120).add(P, axP, ayP)]
    for r, d in ((12, 110), (22, 110), (32, 130)):
        g = fx.glow(r, inner=fx.PALE, outer=fx.BLUE)
        gh = g.shape[0] // 2
        frames.append(Frame(d).add(C, axC, ayC).add(g, axC - lamp[0] + gh, ayC - lamp[1] + gh))
    flare = fx.glow(26, inner=fx.PALE, outer=fx.BLUE, rays=4, seed=3)
    fh = flare.shape[0] // 2
    frames.append(Frame(50).add(X, axX, ayX).add(flare, axX - hx + fh - 8, ayX - hy + fh))
    lengths = [140, 320, 520, 700] + [700] * 18
    for i, L in enumerate(lengths):
        b, cy = fx.beam(L, thick=60, phase=i)
        fr = Frame(50 if i < 4 else 60).add(X, axX, ayX)
        fr.add(b, axX - hx - 2, ayX - hy + cy)
        fr.add(flare if i % 2 else fx.glow(22, inner=fx.PALE, outer=fx.BLUE, rays=4, seed=7), axX - hx + fh - 8, ayX - hy + fh)
        frames.append(fr)
    for th in (36, 16):
        b, cy = fx.beam(700, thick=th, phase=9)
        frames.append(Frame(60).add(X, axX, ayX).add(b, axX - hx - 2, ayX - hy + cy))
    frames.append(Frame(160).add(X, axX, ayX))
    frames.append(Frame(300).add(P, axP, ayP))
    meta["specium"] = save("specium", frames, out, False, keys=[1, 3, 5, 8, 15, len(frames) - 1])

    (out / "frames.json").write_text(json.dumps(meta, indent=1, default=int))
    (out / "report.json").write_text(json.dumps(report, indent=1, default=int))
    for n, s in sprites.items():
        Image.fromarray(s).save(out / f"key-{n}.png")
    print(json.dumps(report, indent=1, default=int))
    for n in ("master-base", "idle-b", "idle-c", "raise", "master-powered", "p-fistup", "p-charge", "p-fire"):
        print(n, sprites[n].shape[:2], "specks", round(crisp.specks(sprites[n]), 1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else None)
