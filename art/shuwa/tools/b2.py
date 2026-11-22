"""Batch 2 builder: SHUWA's normals (punch and kick chains, crouch and air attacks, Chuck, Hit Up).

usage: python3 -I tools/b2.py RAW_DIR REFS_DIR PREV_OUT OUT_DIR RYUKO_JSON RYUKO_PNG_DIR
RAW_DIR holds the batch 2 drawings (<pose>.png, see b2_poses.POSES); REFS_DIR the key drawings (base.png, hero.png).
PREV_OUT is the batch 1 build (its clips and key sprites are kept and reused). RYUKO_JSON holds RYUKO's frame offsets
and the move scripts (image, 10 ms ticks, dx, dy, flip) taken from src/game/generated/assets.json.

Each clip plays RYUKO's script for the move with every RYUKO image swapped for a SHUWA sprite (MAP). A sprite's anchor
height is its own feet plus RYUKO's offset from his feet to his position point in the image it was drawn from (free poses,
drawn without a guide, take the same). Its anchor x is where it stands on its drawing canvas: the guide's position point,
or for a free portrait pose the key drawing's feet (the prompt keeps him in the same place). Feet alone shift the body
whenever one foot is lifted a few pixels, which made lunges and the chop flurry jump 40 px.
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import crisp  # noqa: E402
import posref  # noqa: E402
from b2_poses import POSES  # noqa: E402
from v4 import Frame, Ref, feet, load, pixel, save  # noqa: E402

# RYUKO image -> SHUWA sprite (b2 pose, or b1 key sprite "b1:<pose>", or the idle stance "idle")
MAP = {
    31: "idle", 24: "b1:crouch-24", 12: "b1:jump-12", 13: "b1:jump-13", 14: "b1:jump-14", 15: "b1:jump-16", 16: "b1:jump-16",
    84: "b1:crouch-25", 89: "b1:crouch-25", 94: "b1:crouch-25", 112: "b1:crouch-25", 43: "b1:jump-12",
    32: "p1-32", 33: "p1-33", 34: "p1-34", 74: "p1-32",
    10: "p3-10", 35: "p3-35", 36: "p3-36", 37: "p3-35", 39: "p3-39",  # the chop flurry pumps one arm in and out
    38: "p4-38", 40: "p4-38", 41: "p4-41", 42: "p4-42",
    # air punch: RYUKO's 54 is the wind-up spin and 55 the blow he holds, so the chop is the held pose
    53: "ap-54", 54: "ap-55", 55: "ap-56", 56: "ap-56",
    90: "cp-90", 91: "cp-92", 92: "cp-92", 93: "cp-93",
    71: "k1-71", 72: "k1-72", 73: "k1-71",
    75: "k3-75", 76: "k3-76", 77: "k3-76", 78: "k3-78",
    79: "k4-79", 80: "k4-79", 81: "k4-82", 82: "k4-82", 83: "k4-83",
    85: "ak-86", 86: "ak-86", 87: "ak-87", 88: "ak-87",
    95: "ck-95", 96: "ck-95", 97: "ck-98", 98: "ck-98", 99: "ck-98",
    103: "ch-103", 104: "ch-104", 105: "ch-105", 106: "ch-105",
    107: "ct-107", 108: "ct-108", 110: "ct-110", 111: "ct-111",
    113: "hu-113", 114: "hu-114", 115: "hu-115", 116: "hu-116", 117: "hu-117",
}
# RYUKO image each b1 sprite was drawn from (for its offset)
B1_SRC = {"crouch-24": 24, "jump-12": 12, "jump-13": 13, "jump-14": 14, "jump-16": 16}
CLIPS = {  # clip key -> RYUKO script
    "punch1": "178", "punch2": "179", "punch3": "180", "punch4": "181", "airPunch": "182", "crouchPunch": "185",
    "kick1": "186", "kick2": "187", "kick3": "188", "kick4": "189", "airKick": "191", "crouchKick": "194",
    "chuck": "196", "chuckThrow": "197", "hitUp": "200",
}
HOLD = 300  # ms for a script's final frame of length 0 (held until landing in the game)


def main(raw, ref_dir, prev, out, ryuko_json, ryuko_png):
    raw, ref_dir, prev, out, ryuko_png = map(Path, (raw, ref_dir, prev, out, ryuko_png))
    R = json.loads(Path(ryuko_json).read_text())
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(prev, out)
    meta = json.loads((out / "frames.json").read_text())

    refs = {}
    for form, name, h in (("base", "base", 208.0), ("hero", "hero", 205.0)):
        a, bg = load(ref_dir, name)
        r = Ref(a, bg)
        refs[form] = (r, h / r.fig_h)

    def ryuko_offset(n, flip=False, vertical_only=False):
        """RYUKO's position point minus his feet anchor, in image n (sprite px; same scale as SHUWA's)."""
        dx, dy, w, h = R["frames"][str(n)]
        im = np.asarray(Image.open(ryuko_png / f"{n}.png").convert("RGBA"))
        px, py = w // 2 - dx, h - dy
        if flip:
            im, px = im[:, ::-1], w - 1 - px
        fx, fy = feet(im)
        return (0 if vertical_only else px - fx), py - fy

    spr, off, report, canvas_x = {}, {}, {}, {}
    found = {}
    for name, (n, form, how, _, _) in POSES.items():
        if not (raw / f"{name}.png").exists():
            print("missing", name)
            continue
        a, bg = load(raw, name)
        (f, _, _), score = refs[form][0].find(a, np.arange(0.75, 1.26, 0.01))
        found[name] = a, bg, f, score
    # The model draws a whole batch at about one size (hero heads came out ~0.93 of the master's), so a pose whose
    # head can't be matched (spins, back view, arms over the head) takes its form's median instead of 1.0.
    median = {form: float(np.median([v[2] for k, v in found.items() if POSES[k][1] == form and v[3] >= 0.6] or [1.0]))
              for form in refs}
    for name, (a, bg, f, score) in found.items():
        n, form, how = POSES[name][:3]
        s0 = refs[form][1]
        use = f if score >= 0.6 else median[form]
        spr[name], (x0, _) = pixel(a, bg, s0 / use)
        off[name] = n, how == "free"
        size = POSES[name][3]
        if how == "guide":
            canvas_x[name] = (posref.point(R["frames"][str(n)], form, size)[0] - x0) * s0 / use
        elif (form, size) in posref.POINT and size == "1024x1536":
            canvas_x[name] = (posref.POINT[(form, size)][0] - x0) * s0 / use
        report[name] = dict(head=round(float(f), 3), head_score=round(float(score), 3), used=round(float(use), 3),
                            size=f"{spr[name].shape[1]}x{spr[name].shape[0]}", specks=round(crisp.specks(spr[name]), 1))
    for k, n in B1_SRC.items():
        spr[f"b1:{k}"] = np.asarray(Image.open(prev / f"key-{k}.png").convert("RGBA"))
        off[f"b1:{k}"] = n, False
    spr["b1:crouch-25"] = np.asarray(Image.open(prev / "key-crouch-25.png").convert("RGBA"))
    off["b1:crouch-25"] = None
    idle = meta["idle"]
    spr["idle"] = np.asarray(Image.open(prev / idle["frames"][0]).convert("RGBA"))
    off["idle"] = 31, False

    def frame(n, ms, flip):
        key = MAP[n]
        s = spr[key][:, ::-1] if flip else spr[key]
        if key == "idle":
            ax, ay = idle["anchor"]
            if flip:
                ax = s.shape[1] - 1 - ax
        else:
            ax, ay = feet(s)
        if off[key]:
            src, vert = off[key]
            ox, oy = ryuko_offset(src, flip, vert)
            ax, ay = ax + ox, ay + oy
        if key in canvas_x:
            x = round(canvas_x[key])
            ax = s.shape[1] - 1 - x if flip else x
        return Frame(ms).add(np.ascontiguousarray(s), ax, ay)

    for clip, script in CLIPS.items():
        frames, last = [], None
        for n, t, _, _, flip in R["scripts"][script]:
            if MAP.get(n) not in spr:
                raise SystemExit(f"{clip}: no sprite for RYUKO image {n}")
            this = (MAP[n], flip)
            if last == this:  # same SHUWA drawing in the same place: one longer hold
                frames[-1].dur += t * 10
                continue
            frames.append(frame(n, t * 10, flip))
            last = this
        if frames[-1].dur == 0:
            frames[-1].dur = HOLD
        meta[clip] = save(clip, frames, out, False)

    (out / "frames.json").write_text(json.dumps(meta, indent=1, default=int))
    (out / "report-b2.json").write_text(json.dumps(report, indent=1))
    for n, s in spr.items():
        if ":" not in n and n != "idle":
            Image.fromarray(s).save(out / f"key-{n}.png")
    for n, r in report.items():
        print(f"{n:7s} {r}")


if __name__ == "__main__":
    main(*sys.argv[1:7])
