"""Batch 1 builder: SHUWA's base-body clips from one drawing per pose (RYUKO as pose and timing donor).

usage: python3 -I tools/b1.py RAW_DIR REFS_DIR PREV_OUT OUT_DIR [BASE_H]
RAW_DIR holds the batch 1 pose drawings (<pose>.png, see POSES); REFS_DIR the key drawings base.png (round 7)
and hero.png. PREV_OUT is the round 7 build (its frames.json clips are kept). BASE_H is the
round 7 base sprite height (208).

Scale: every drawing is pixelled at the master's scale times its own size factor, found on the head
(template match, upright poses); poses whose head can't be matched keep the master's scale.
Timing follows RYUKO's clips (10 ms ticks) in src/game/generated/assets.json.
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).parent))
import crisp  # noqa: E402
from v4 import Frame, Ref, feet, load, pixel, save  # noqa: E402

# pose -> (form, scale method)
POSES = {
    "jump-12": ("base", "head"), "jump-13": ("base", "head"), "jump-14": ("base", "head"),
    "jump-16": ("base", "head"), "land-17": ("base", "head"), "crouch-24": ("base", "head"),
    "crouch-25": ("base", "head"), "guard-57": ("base", "hat"), "guard-58": ("base", "hat"),
    "guard-59": ("base", "hat"), "hit-47": ("base", "hat"), "hit-52": ("base", "hat"),
    "launch-60": ("base", "hat"), "fly-61": ("base", "hat"), "down-62": ("base", "hat"),
    "down-63": ("base", "hat"), "getup-69": ("base", "hat"), "launchup-102": ("base", "hat"),
    "timeover": ("base", "hat"), "dash-44": ("hero", "head"), "dash-45": ("hero", "area"),
    "dash-46": ("hero", "head"),
}


def hat_area(a, bg):
    """Pixels of the silver hard hat: light, unsaturated, inside the figure."""
    m = crisp.figure_mask(a, bg)
    rgb = a.astype(int)
    lum, sat = rgb.mean(-1), rgb.max(-1) - rgb.min(-1)
    hat = m & (lum > 150) & (lum < 236) & (sat < 32)
    lab, n = ndi.label(hat)
    if not n:
        return 0
    sizes = ndi.sum(hat, lab, range(1, n + 1))
    return float(sizes[sizes >= sizes.max() * 0.05].sum())


def fig_area(a, bg):
    return float(crisp.figure_mask(a, bg).sum())


def rotate(spr, deg):
    im = Image.fromarray(spr).rotate(deg, resample=Image.NEAREST, expand=True)
    a = np.asarray(im)
    ys, xs = np.nonzero(a[..., 3] > 0)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()


def bottom(spr):
    """Anchor for lying and flying poses: bottom-centre of the whole sprite."""
    al = spr[..., 3] > 0
    ys, xs = np.nonzero(al)
    return (xs.min() + xs.max()) // 2, ys.max() + 1


def main(raw, ref_dir, prev, out, base_h=208.0):
    raw, ref_dir, prev, out = Path(raw), Path(ref_dir), Path(prev), Path(out)
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(prev, out)
    meta = json.loads((out / "frames.json").read_text())
    report = {}

    a0, bg0 = load(ref_dir, "base")
    ref = Ref(a0, bg0)
    S = base_h / ref.fig_h
    hat0 = hat_area(a0, bg0)
    ap, bgp = load(ref_dir, "hero")
    refp = Ref(ap, bgp)
    Sp = 205 / refp.fig_h
    area_p = fig_area(ap, bgp)

    spr, found = {}, {}
    for name, (form, how) in POSES.items():
        if not (raw / f"{name}.png").exists():
            print("missing", name)
            continue
        a, bg = load(raw, name)
        r = ref if form == "base" else refp
        found[name] = (a, bg) + r.find(a, np.arange(0.75, 1.26, 0.01))
    # A head the template can't match (score under 0.6) takes its form's median scale, as batches 2 and 3 do.
    median = {fm: float(np.median([v[2][0] for k, v in found.items() if POSES[k][0] == fm and v[3] >= 0.6] or [1.0]))
              for fm in ("base", "hero")}
    for name, (a, bg, (f, _, _), score) in found.items():
        form, how = POSES[name]
        s0 = S if form == "base" else Sp
        hat = hat_area(a, bg) if form == "base" else 0
        f_hat = (hat / hat0) ** 0.5 if hat else None
        f_area = (fig_area(a, bg) / area_p) ** 0.5 if form == "hero" else None
        # The pose guide was drawn at his size, and the model keeps it (head matches land at 0.98 to 1.02),
        # so a drawing whose head can't be matched (lying, flying, rotated) keeps the master's scale.
        # Hat and area ratios are reported only: arms and angles throw them off by 10 to 20%.
        use = f if score >= 0.6 else median[form]
        report[name] = dict(head=round(float(f), 3), head_score=round(float(score), 3),
                            hat=round(f_hat, 3) if f_hat else None, area=round(f_area, 3) if f_area else None,
                            used=round(float(use), 3))
        spr[name], _ = pixel(a, bg, s0 / use)

    def F(name, dur, anchor=feet, dx=0, dy=0):
        s = spr[name]
        ax, ay = anchor(s)
        return Frame(dur).add(s, ax, ay, dx, dy)

    def clip(key, frames, loop=False):
        meta[key] = save(key, frames, out, loop)

    ms = lambda t: t * 10  # noqa: E731  RYUKO durations are 10 ms ticks
    idle_a = Image.open(prev / meta["idle"]["frames"][1]).convert("RGBA")
    A = np.asarray(idle_a)
    axA, ayA = meta["idle"]["anchor"]

    clip("jump", [F("jump-12", ms(8)), F("jump-13", ms(13)), F("jump-14", ms(5)), F("jump-14", ms(15), dy=-2),
                  F("jump-16", 400)])
    clip("land", [F("land-17", ms(5)), F("jump-12", ms(3))])
    crouch = [F("crouch-24", ms(5))] + [F("crouch-25", ms(t), dy=d) for t, d in ((6, 0), (8, 1), (8, 0), (9, 1), (10, 0))]
    clip("crouch", crouch, loop=True)
    clip("guard", [F("guard-57", 300)], loop=True)
    clip("crouchGuard", [F("guard-58", 300)], loop=True)
    clip("airGuard", [F("guard-59", 300)], loop=True)
    clip("hit", [F("hit-47", ms(5)), F("hit-47", ms(20), dx=-2), F("hit-47", ms(5))])
    clip("airHit", [F("hit-52", ms(5)), F("hit-52", ms(20))])
    clip("launchAway", [F("hit-52", ms(2)), F("hit-52", ms(2), dx=-6), F("hit-52", ms(2)),
                        F("launch-60", ms(25), bottom), F("fly-61", 500, bottom)])
    clip("knockdown", [F("down-62", ms(10), bottom), F("down-63", ms(50), bottom)])
    clip("getUp", [F("down-63", ms(10), bottom), F("getup-69", ms(10), bottom), F("crouch-25", ms(10))])
    up = spr["launchup-102"]
    spins = [up, rotate(up, -90), rotate(up, 180), rotate(up, 90)]
    clip("launchUp", [F("launch-60", ms(10), bottom)] + [Frame(ms(3)).add(s, *bottom(s)) for s in spins * 2])
    clip("ko", [F("hit-52", ms(5)), F("hit-52", ms(5), dx=-6), F("launch-60", ms(25), bottom), F("fly-61", ms(30), bottom),
                F("down-62", ms(10), bottom), F("down-63", 800, bottom)])
    clip("timeOver", [F("crouch-24", ms(8)), F("timeover", 800)])
    clip("dashForward", [F("dash-44", ms(3)), F("dash-45", ms(30), bottom), F("dash-44", ms(10)), F("jump-16", 200)])
    clip("dashBack", [F("dash-46", ms(3)), F("dash-46", ms(20), dy=-6), F("dash-46", ms(10)), F("jump-16", 200)])
    clip("turn", [Frame(ms(5)).add(A, axA, ayA)])

    (out / "frames.json").write_text(json.dumps(meta, indent=1, default=int))
    (out / "report-b1.json").write_text(json.dumps(report, indent=1, default=int))
    for n, s in spr.items():
        Image.fromarray(s).save(out / f"key-{n}.png")
    for n, r in report.items():
        print(f"{n:14s} {r}  size {spr[n].shape[1]}x{spr[n].shape[0]}  specks {crisp.specks(spr[n]):.1f}")


if __name__ == "__main__":
    main(*sys.argv[1:5], float(sys.argv[5]) if len(sys.argv) > 5 else 208.0)
