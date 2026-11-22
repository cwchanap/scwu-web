"""Pull the donor data the builders need out of the game's export into out/data/ (never committed).

usage: python3 -I tools/donor_data.py GENERATED_DIR OUT_DIR
GENERATED_DIR is the game's src/game/generated (assets.json holds RYUKO; dora.json, alex.json, zoma.json the others).
Writes <donor>.json for each donor: "frames" maps an image to its offset and size (dx, dy, w, h) and "scripts" holds the
moves SHUWA follows as rows (image, 10 ms ticks, dx, dy, flip). donors.json keeps each donor's idle frame and scripts for
the specials (b3).
"""
import json
import sys
from pathlib import Path

RYUKO = ["178", "179", "180", "181", "182", "185", "186", "187", "188", "189", "191", "194", "196", "197", "200", "202"]
SPECIALS = {"assets": ["214", "215", "226", "227"], "dora": ["277", "278"], "alex": ["261"], "zoma": ["229"]}


def rows(script):
    return [[f["image"], f["duration"], f["dx"], f["dy"], f["flip_x"]] for f in script["frames"]]


def frames(export, first):
    """Image -> (dx, dy, w, h) where it first appears: the moves SHUWA follows, then the other scripts, then clips."""
    S = export["scripts"]
    order = [S[k] for k in first] + [s for k, s in S.items() if k not in first]
    order += [c if isinstance(c, dict) else {"frames": c} for c in export["clips"].values()]
    out = {}
    for s in order:
        for f in s["frames"]:
            out.setdefault(str(f["image"]), [f["dx"], f["dy"], f["width"], f["height"]])
    return out


def main(gen, out):
    gen, out = Path(gen), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    donors = {}
    for key, ids in SPECIALS.items():
        export = json.loads((gen / f"{key}.json").read_text())
        name = "ryuko" if key == "assets" else key
        first = RYUKO if key == "assets" else ids
        scripts = {k: rows(export["scripts"][k]) for k in first}
        (out / f"{name}.json").write_text(json.dumps({"frames": frames(export, first), "scripts": scripts}))
        f = export["clips"]["idle"][0]
        donors[key] = {"idle": [f["image"], f["width"], f["height"], f["dx"], f["dy"]],
                       "scripts": {k: rows(export["scripts"][k]) for k in ids}}
    (out / "donors.json").write_text(json.dumps(donors))


if __name__ == "__main__":
    main(*sys.argv[1:3])
