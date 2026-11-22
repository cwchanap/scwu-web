"""Batch 3 builder: SHUWA's specials (RING, SHUWATCH, BARRIER, SWING, RECHARGE).

usage: python3 -I tools/b3.py RAW_DIR REFS_DIR PREV_OUT OUT_DIR DONORS_JSON RYUKO_JSON ASSETS_DIR
RAW_DIR holds the batch 3 drawings (<pose>.png, see b3_poses.POSES); REFS_DIR the key drawings (base.png, hero.png). PREV_OUT is the batch 2 build
(its clips and key sprites are kept and reused). DONORS_JSON holds the donor scripts (image, 10 ms ticks, dx, dy, flip)
and idle sizes from src/game/generated (RYUKO = assets, dora, alex, zoma); RYUKO_JSON is batch 2's frame table.

Each clip plays its donor's script with every donor image swapped for a SHUWA sprite (CLIPS). As in batch 2, a sprite's
anchor is its own feet plus the donor's offset from feet to position point in the image the pose was drawn from, scaled
from the donor's size to RYUKO's (idle heights). Free poses and ZOMA's tank frames keep no offset.
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import crisp  # noqa: E402
from b2_poses import POSES as B2  # noqa: E402
from b3_poses import POSES  # noqa: E402
from v4 import Frame, Ref, feet, load, pixel, save  # noqa: E402

FOLDER = {"assets": "ryuko", "dora": "dora", "alex": "alex", "zoma": "zoma"}
# clip -> (donor, [script ids], {donor image: SHUWA sprite}, donor images to drop)
SWING = {103: "b2:ch-103", 104: "b2:ch-104", 105: "b2:ch-105", 106: "b2:ch-105", 107: "b2:ct-107", 108: "b2:ct-108",
         110: "b2:ct-110", 111: "b2:ct-111", 94: "b1:crouch-25", 24: "b1:crouch-24"}
CLIPS = {
    "ring": ("assets", ["226"], {10: "b2:p3-10", 320: "r-320", 321: "r-321", 322: "r-322", 323: "r-322", 324: "r-325",
                                 325: "r-325", 31: "idle"}, ()),
    "shuwatch": ("dora", ["278"], {293: "sw-293", 321: "sw-321", 328: "sw-328", 125: "sw-125"}, ()),
    "barrier": ("alex", ["261"], {235: "b-235", 236: "b-236", 141: "idle"}, ()),
    # RYUKO's Daisetsuzan: grab (214), then the catch (215) without the missile volley he fires after the toss
    "swing": ("assets", ["214", "215"], SWING, (235, 236, 237, 238)),
    "recharge": ("zoma", ["229"], {117: "rc-117", 261: "rc-261", 262: "rc-262", 263: "rc-263"}, ()),
}
HOLD = 300


def main(raw, ref_dir, prev, out, donors_json, ryuko_json, assets):
    raw, ref_dir, prev, out, assets = map(Path, (raw, ref_dir, prev, out, assets))
    D = json.loads(Path(donors_json).read_text())
    R = json.loads(Path(ryuko_json).read_text())["frames"]
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(prev, out)
    meta = json.loads((out / "frames.json").read_text())
    scale = {d: 203 / v["idle"][2] for d, v in D.items()}  # donor sprite px -> RYUKO/SHUWA sprite px
    first = {}  # (donor, image) -> (dx, dy) of its first script entry
    for d, v in D.items():
        for s in v["scripts"].values():
            for n, _, dx, dy, _ in s:
                first.setdefault((d, n), (dx, dy))
    for n, (dx, dy, _, _) in R.items():
        first.setdefault(("assets", int(n)), (dx, dy))

    def offset(d, n, flip=False, vertical_only=False):
        """Donor's position point minus its feet anchor in image n, in SHUWA sprite px."""
        dx, dy = first[(d, n)]
        im = np.asarray(Image.open(assets / FOLDER[d] / f"{n}.png").convert("RGBA"))
        h, w = im.shape[:2]
        px, py = w // 2 - dx, h - dy
        if flip:
            im, px = im[:, ::-1], w - 1 - px
        fx, fy = feet(im)
        k = scale[d]
        return (0 if vertical_only else round((px - fx) * k)), round((py - fy) * k)

    refs = {}
    for form, name, h in (("base", "base", 208.0), ("hero", "hero", 205.0)):
        a, bg = load(ref_dir, name)
        r = Ref(a, bg)
        refs[form] = (r, h / r.fig_h)

    spr, off, report, found = {}, {}, {}, {}
    for name, (d, n, form, how, _, _) in POSES.items():
        if not (raw / f"{name}.png").exists():
            print("missing", name)
            continue
        a, bg = load(raw, name)
        (f, _, _), score = refs[form][0].find(a, np.arange(0.75, 1.26, 0.01))
        found[name] = a, bg, f, score
    median = {form: float(np.median([v[2] for k, v in found.items() if POSES[k][2] == form and v[3] >= 0.6] or [1.0]))
              for form in refs}
    for name, (a, bg, f, score) in found.items():
        d, n, form, how = POSES[name][:4]
        use = f if score >= 0.6 else median[form]
        spr[name], _ = pixel(a, bg, refs[form][1] / use)
        d = {"ryuko": "assets"}.get(d, d)
        off[name] = None if (how == "free" and d == "zoma") else (d, n, how == "free")
        report[name] = dict(head=round(float(f), 3), head_score=round(float(score), 3), used=round(float(use), 3),
                            size=f"{spr[name].shape[1]}x{spr[name].shape[0]}", specks=round(crisp.specks(spr[name]), 1))
    for k, (n, _, how, _, _) in B2.items():  # batch 2 sprites (drawn from RYUKO images)
        spr[f"b2:{k}"] = np.asarray(Image.open(prev / f"key-{k}.png").convert("RGBA"))
        off[f"b2:{k}"] = ("assets", n, how == "free")
    for k, n in {"crouch-24": 24}.items():
        spr[f"b1:{k}"] = np.asarray(Image.open(prev / f"key-{k}.png").convert("RGBA"))
        off[f"b1:{k}"] = ("assets", n, False)
    spr["b1:crouch-25"] = np.asarray(Image.open(prev / "key-crouch-25.png").convert("RGBA"))
    off["b1:crouch-25"] = None
    idle = meta["idle"]
    spr["idle"] = np.asarray(Image.open(prev / idle["frames"][0]).convert("RGBA"))

    def frame(key, ms, flip, d):
        s = spr[key][:, ::-1] if flip else spr[key]
        if key == "idle":
            ax, ay = idle["anchor"]
            if flip:
                ax = s.shape[1] - 1 - ax
            if d == "assets":  # RYUKO's stance frame 31, as batch 2 does
                ox, oy = offset("assets", 31, flip)
                ax, ay = ax + ox, ay + oy
        else:
            ax, ay = feet(s)
            if off[key]:
                src, n, vert = off[key]
                ox, oy = offset(src, n, flip, vert)
                ax, ay = ax + ox, ay + oy
        return Frame(ms).add(np.ascontiguousarray(s), ax, ay)

    for clip, (d, scripts, MAP, drop) in CLIPS.items():
        frames, last = [], None
        for sid in scripts:
            for n, t, _, _, flip in D[d]["scripts"][sid]:
                if n in drop:
                    continue
                key = MAP[n]
                if key not in spr:
                    raise SystemExit(f"{clip}: no sprite {key} for {d} image {n}")
                if last == (key, flip):
                    frames[-1].dur += t * 10
                    continue
                frames.append(frame(key, t * 10, flip, d))
                last = key, flip
        if frames[-1].dur == 0:
            frames[-1].dur = HOLD
        meta[clip] = save(clip, frames, out, False)

    (out / "frames.json").write_text(json.dumps(meta, indent=1, default=int))
    (out / "report-b3.json").write_text(json.dumps(report, indent=1))
    for n, s in spr.items():
        if ":" not in n and n != "idle":
            Image.fromarray(s).save(out / f"key-{n}.png")
    for n, r in report.items():
        print(f"{n:7s} {r}")


if __name__ == "__main__":
    main(*sys.argv[1:8])
