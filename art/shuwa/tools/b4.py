"""Batch 4 builder: effect layers on the specials and SHUWA's four supers.

usage: python3 -I tools/b4.py PREV_OUT OUT_DIR RAW_B4
PREV_OUT is the batch 3 build. RAW_B4 holds giant-foot.png (GIANT STEP's foot, a gpt-image-2.6 edit).

Effects are soft-light layers drawn in code (fx.py), like round 7's SPECIUM beam, never fighter drawings.
- ring: a slow saw ring that leaves the hand on the release frame and flies forward low;
- barrier: a wall of light in front of his palms while he holds the push;
- recharge: the chest lamp glows brighter with each arm pump, sparks rise, and it flashes full at the end.
Supers reuse the drawn poses; their timings follow the donor moves loosely (an authored preview, not the game):
- specRay (RYUKO's Getter Beam, 264): crouch, charge 450 ms, a thick screen-long beam held 2.7 s;
- threeMinutes (RYUKO's Mega Getter Beam, 292 + 294): charge, he flies off the top, a beam falls from the sky ahead;
- giantStep (REMU's GOLD HAND): he jumps off the top and a giant foot stamps the spot ahead;
- ultraSwing (RYUKO's Getter Change Attack): SWING's grab with twice the spin, then a beam after the toss.
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import fx  # noqa: E402
from v4 import BLUE, Frame, feet, load, pixel, save  # noqa: E402

EMPTY = np.zeros((1, 1, 4), np.uint8)


def lamp_of(s):
    """Chest lamp centre: the blue pixels' centroid in the sprite's top two thirds."""
    m = np.zeros(s.shape[:2], bool)
    for c in BLUE:
        m |= np.all(s[..., :3] == c, -1)
    m[int(s.shape[0] * 0.7):] = False
    ys, xs = np.nonzero(m)
    return (int(np.median(xs)), int(np.median(ys))) if len(xs) else (s.shape[1] // 2, s.shape[0] // 2)


def front(s, lo=0.30, hi=0.55):
    """Front edge (rightmost pixel) of the arms in a band of the sprite's height, and the row it sits on."""
    al = s[..., 3] > 0
    rows = np.nonzero(al.any(1))[0]
    top, bot = rows.min(), rows.max()
    band = slice(top + int((bot - top) * lo), top + int((bot - top) * hi))
    hx = np.nonzero(al[band].any(0))[0].max()
    hy = band.start + int(np.nonzero(al[band, max(0, hx - 6):hx + 1].any(1))[0].mean())
    return hx, hy


def saw_ring(phase, r=32, squash=0.5):
    """A thin spinning disc seen nearly edge-on, with a toothed rim (rgba, centred)."""
    n = r + 6
    y, x = np.mgrid[-n:n + 1, -n:n + 1].astype(float)
    d = np.hypot(x, y / squash) / r
    ang = np.arctan2(y / squash, x)
    teeth = 1 + 0.12 * np.sign(np.sin(10 * ang + phase))
    rim = np.clip(1 - np.abs(d - 0.82 * teeth) / 0.3, 0, 1) ** 0.6
    core = np.clip(1 - d / 0.95, 0, 1) ** 0.5 * 0.8
    return fx._rgba(np.maximum(rim, core), fx.PALE, fx.BLUE)


def wall(h, phase, w=48):
    """A vertical wall of light with tapered ends and a shimmer (rgba, centred)."""
    y, x = np.mgrid[0:h, 0:w].astype(float)
    cy, cx = (h - 1) / 2, (w - 1) / 2
    taper = np.clip(1 - (np.abs(y - cy) / (h / 2)) ** 4, 0, 1)
    half = (w / 2 - 2) * taper * (1 + 0.12 * np.sin(y / 6 + phase * 1.9))
    v = np.clip(1 - np.abs(x - cx) / np.maximum(half, 0.5), 0, 1) ** 0.45 * (0.8 + 0.2 * np.sin(y / 4 - phase * 2.3))
    return fx._rgba(v * (taper > 0.05), fx.PALE, fx.BLUE)


def sky_beam(length, thick, phase):
    """fx.beam turned to fall from the top: origin at the top centre, rounded tip at the bottom."""
    b, _ = fx.beam(length, thick=thick, phase=phase)
    return np.ascontiguousarray(np.rot90(b, k=-1))


def main(prev, out, raw4):
    prev, out, raw4 = map(Path, (prev, out, raw4))
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(prev, out)
    meta = json.loads((out / "frames.json").read_text())
    key = lambda n: np.asarray(Image.open(prev / f"key-{n}.png").convert("RGBA"))

    def clip_frames(name):
        m = meta[name]
        ax, ay = m["anchor"]
        return [(np.asarray(Image.open(prev / f).convert("RGBA")), ax, ay, d) for f, d in zip(m["frames"], m["durations"])]

    def pose(n, ms, dx=0, dy=0, flip=False):
        s = key(n)
        if flip:
            s = np.ascontiguousarray(s[:, ::-1])
        ax, ay = feet(s)
        return Frame(ms).add(s, ax, ay, dx=dx, dy=dy), s, ax, ay

    def glow_at(fr, g, cx, cy):  # centre a square glow on (cx, cy) relative to the feet anchor
        gh = g.shape[0] // 2
        return fr.add(g, gh - cx, gh - cy)

    # ---------------- RING: the saw ring leaves on the release frame (r-325) and flies forward low ----------------
    fr = clip_frames("ring")
    release = 4  # 10, 320, 321, 322, [325], 321, idle
    a, ax, ay, _ = fr[release]
    hx, _ = front(a, 0.45, 0.75)
    x0, y0, step = hx - ax - 6, -64, 12  # starts at the hand, about knee-to-waist height; 12 px per 30 ms
    frames, t = [], 0
    for i, (a, ax, ay, d) in enumerate(fr):
        if i < release:
            frames.append(Frame(d).add(a, ax, ay))
            continue
        if i == len(fr) - 1:
            d += 900  # keep standing while the ring flies on
        for k in range(max(1, d // 30)):
            g = saw_ring(t)
            frames.append(glow_at(Frame(30).add(a, ax, ay), g, x0 + step * t, y0))
            t += 1
    meta["ring"] = save("ring", frames, out, False)

    # ---------------- BARRIER: a wall of light in front of the palms during the push ----------------
    fr = clip_frames("barrier")  # b-235, b-236 (730), b-235, idle
    frames = [Frame(fr[0][3]).add(*fr[0][:3])]
    a, ax, ay, d = fr[1]
    hx, hy = front(a, 0.35, 0.6)
    heights = [50, 100, 150] + [160] * ((d - 150) // 80)
    for i, h in enumerate(heights):
        g = wall(h, i)
        frames.append(Frame(50 if i < 3 else 80).add(a, ax, ay).add(g, -(hx - ax + 10), g.shape[0] // 2 - (hy - ay)))
    g = wall(160, 9, w=20)
    frames.append(Frame(fr[2][3]).add(*fr[2][:3]).add(g, -(hx - ax + 10), g.shape[0] // 2 - (hy - ay)))
    frames.append(Frame(fr[3][3]).add(*fr[3][:3]))
    meta["barrier"] = save("barrier", frames, out, False)

    # ---------------- RECHARGE: lamp glow grows with each pump, sparks rise, full flash at the end ----------------
    fr = clip_frames("recharge")  # rc-117, rc-261, 262, 263, 262, 263, 262, rc-261 (280), rc-117
    rng = np.random.default_rng(5)
    frames = []
    for i, (a, ax, ay, d) in enumerate(fr):
        lx, ly = lamp_of(a)
        if i == 0 or i == len(fr) - 1:
            frames.append(Frame(d).add(a, ax, ay))
            continue
        if i == len(fr) - 2:  # full flash, then fading
            for r, ms in ((44, 60), (30, 90), (16, 130)):
                frames.append(glow_at(Frame(ms).add(a, ax, ay), fx.glow(r, inner=fx.PALE, outer=fx.BLUE, rays=4, seed=r),
                                      lx - ax, ly - ay))
            continue
        f = Frame(d).add(a, ax, ay)
        glow_at(f, fx.glow(8 + 4 * i, inner=fx.PALE, outer=fx.BLUE), lx - ax, ly - ay)
        for _ in range(3):
            sx, sy = rng.integers(-60, 61), rng.integers(-200, -20) - 10 * i
            glow_at(f, fx.glow(5, inner=fx.PALE, outer=fx.BLUE, power=1.2), int(sx), int(sy))
        frames.append(f)
    meta["recharge"] = save("recharge", frames, out, False)

    # shared pieces for the supers
    P = key("master-powered")
    Pax, Pay = feet(P)
    C = key("p-charge")
    Cax, Cay = feet(C)
    clx, cly = lamp_of(C)
    X = key("p-fire")
    Xax, Xay = feet(X)
    hx, hy = front(X)
    flare = fx.glow(26, inner=fx.PALE, outer=fx.BLUE, rays=4, seed=3)

    def charge(ms_list, radii, rays=0):
        out_ = []
        for ms, r in zip(ms_list, radii):
            f = Frame(ms).add(C, Cax, Cay)
            out_.append(glow_at(f, fx.glow(r, inner=fx.PALE, outer=fx.BLUE, rays=rays, seed=r), clx - Cax, cly - Cay))
        return out_

    def beam_frames(length, thick, hold_ms, grow=(0.2, 0.45, 0.7, 1.0), step=80, fade=(0.6, 0.27)):
        out_ = [glow_at(Frame(50).add(X, Xax, Xay), flare, hx - Xax + 8, hy - Xay)]
        for i, k in enumerate(grow):
            b, cy = fx.beam(int(length * k), thick=thick, phase=i)
            f = Frame(40).add(X, Xax, Xay).add(b, Xax - hx - 2, Xay - hy + cy)
            out_.append(glow_at(f, flare, hx - Xax + 8, hy - Xay))
        for i in range(hold_ms // step):
            b, cy = fx.beam(length, thick=thick, phase=i + 4)
            f = Frame(step).add(X, Xax, Xay).add(b, Xax - hx - 2, Xay - hy + cy)
            g = flare if i % 2 else fx.glow(22, inner=fx.PALE, outer=fx.BLUE, rays=4, seed=7)
            out_.append(glow_at(f, g, hx - Xax + 8, hy - Xay))
        for k in fade:
            b, cy = fx.beam(length, thick=int(thick * k), phase=9)
            out_.append(Frame(60).add(X, Xax, Xay).add(b, Xax - hx - 2, Xay - hy + cy))
        return out_

    def leave_up(n_pose="sw-328"):
        return [pose(n_pose, 60, dy=dy)[0] for dy in (-60, -170, -320, -520)]

    def drop_in():
        return [pose("sw-125", 60, dy=dy)[0] for dy in (-420, -220, -80)] + [
            pose("sw-125", 120)[0], pose("crouch-24", 150)[0], Frame(300).add(P, Pax, Pay)]

    # ---------------- SPECIUM RAY ----------------
    frames = [pose("crouch-24", 300)[0]] + charge((150, 150, 150), (14, 26, 38))
    frames += beam_frames(980, 96, 2500)
    frames += [Frame(150).add(X, Xax, Xay), pose("crouch-24", 150)[0], Frame(300).add(P, Pax, Pay)]
    meta["specRay"] = save("specRay", frames, out, False)

    # ---------------- THREE MINUTES: up and away, then a beam falls from the sky ahead ----------------
    frames = [pose("crouch-24", 100)[0]] + charge((150,) * 5, (14, 26, 38, 50, 62), rays=4)
    f, s, ax, ay = pose("p-fistup", 300)
    frames += [f, Frame(60).add(fx.flash(s), ax, ay)] + leave_up() + [Frame(600).add(EMPTY, 0, 0)]
    bx, top = 260, 760  # impact point ahead of where he stood; the beam starts well above the stage
    for i, (k, th) in enumerate([(0.35, 40), (0.7, 80), (1.0, 120)] + [(1.0, 120)] * 20 + [(1.0, 60), (1.0, 24)]):
        b = sky_beam(int(top * k), th, i)
        fr_ = Frame(50 if i < 3 or i > 22 else 80).add(b, b.shape[1] // 2 - bx, top)
        if k == 1.0 and th > 30:
            glow_at(fr_, fx.glow(70 if i % 2 else 60, inner=fx.WARM, outer=fx.AMBER, rays=6, seed=i), bx, -10)
        frames.append(fr_)
    frames += [Frame(500).add(EMPTY, 0, 0)] + drop_in()
    meta["threeMinutes"] = save("threeMinutes", frames, out, False)

    # ---------------- GIANT STEP: he jumps off the top, a giant foot stamps ahead ----------------
    foot = raw4 / "giant-foot.png"
    if foot.exists():
        a, bg = load(raw4, "giant-foot")
        F, _ = pixel(a, bg, 330 / a.shape[0])  # the leg fills the canvas height; about 330 px in the game
        Fax, Fay = feet(F)
        fx_ = 230
        frames = [pose("sw-293", 300)[0], pose("sw-321", 150)[0]] + leave_up() + [Frame(400).add(EMPTY, 0, 0)]
        frames += [Frame(50).add(F, Fax, Fay, dx=fx_, dy=dy) for dy in (-480, -300, -130)]
        dust = lambda r, s: fx.glow(r, inner=fx.WARM, outer=fx.AMBER, rays=6, seed=s)
        frames.append(glow_at(Frame(80).add(F, Fax, Fay, dx=fx_), dust(80, 1), fx_ + 60, -6))
        frames.append(glow_at(Frame(120).add(F, Fax, Fay, dx=fx_), dust(56, 2), fx_ + 60, -6))
        frames.append(Frame(500).add(F, Fax, Fay, dx=fx_))
        frames += [Frame(60).add(F, Fax, Fay, dx=fx_, dy=dy) for dy in (-160, -420)]
        frames += [Frame(300).add(EMPTY, 0, 0)] + drop_in()
        meta["giantStep"] = save("giantStep", frames, out, False)
    else:
        print("no giant-foot.png yet: giantStep skipped")

    # ---------------- ULTRA SWING: SWING's grab, twice the spin, the toss, then a beam ----------------
    fr = clip_frames("swing")  # the grab, 13 spin cycles of 4 frames, the toss (ct-111), 3 recovery frames
    g = len(fr) - 56
    grab, spin, toss = fr[:g], fr[g:g + 52], fr[g + 52]
    frames = [Frame(d).add(a, ax, ay) for a, ax, ay, d in grab + spin + spin + [toss]]
    frames += beam_frames(620, 72, 900)
    frames += [Frame(150).add(X, Xax, Xay), Frame(300).add(P, Pax, Pay)]
    meta["ultraSwing"] = save("ultraSwing", frames, out, False)

    (out / "frames.json").write_text(json.dumps(meta, indent=1, default=int))
    for k in ("ring", "barrier", "recharge", "specRay", "threeMinutes", "giantStep", "ultraSwing"):
        if k in meta:
            m = meta[k]
            print(f"{k:13s} {m['width']}x{m['height']} anchor {m['anchor']} frames {len(m['frames'])} "
                  f"{sum(m['durations'])} ms")


if __name__ == "__main__":
    main(*sys.argv[1:4])
