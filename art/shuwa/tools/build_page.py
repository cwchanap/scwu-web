"""Build SHUWA's animation preview page (one self-contained HTML file) from a build's clips.

usage: python3 -I tools/build_page.py OUT_DIR ASSETS_DIR PAGE_HTML

OUT_DIR holds frames.json and the clip frames (the batch 4 build). ASSETS_DIR is the game's public/assets:
the page's two stages are the middle of the Greek and GI backgrounds, and RYUKO, SOU and KATE stand beside him.
"""
import base64
import io
import json
import sys
from pathlib import Path

from PIL import Image

LABELS = {"idle": "Idle", "walk": "Walk", "henshin": "Transform", "specium": "SPECIUM beam",
          "jump": "Jump", "land": "Land", "crouch": "Crouch", "guard": "Guard", "crouchGuard": "Crouch guard",
          "airGuard": "Air guard", "hit": "Hit", "airHit": "Air hit", "launchAway": "Knocked away",
          "knockdown": "Knockdown", "getUp": "Get up", "launchUp": "Launched up", "ko": "KO",
          "timeOver": "Time over", "dashForward": "Dash forward", "dashBack": "Dash back", "turn": "Turn",
          "punch1": "Punch 1 (G)", "punch2": "Punch 2", "punch3": "Punch 3", "punch4": "Punch 4",
          "kick1": "Kick 1 (H)", "kick2": "Kick 2", "kick3": "Kick 3", "kick4": "Kick 4",
          "crouchPunch": "Crouch punch", "crouchKick": "Crouch kick", "airPunch": "Air punch", "airKick": "Air kick",
          "hitUp": "Hit Up (K)", "chuck": "Chuck: grab (J)", "chuckThrow": "Chuck: throw",
          "ring": "RING (\u2193\u2190G)", "shuwatch": "SHUWATCH (\u2192\u2193\u2198G)", "barrier": "BARRIER (F)",
          "swing": "SWING (\u2190\u2193\u2192H)", "recharge": "RECHARGE (\u2193\u2193G)",
          "specRay": "SPECIUM RAY (\u2193\u2192\u2193\u2192G)", "threeMinutes": "THREE MINUTES (\u2193\u2192\u2193\u2192H)",
          "giantStep": "GIANT STEP (\u2193\u2190\u2193\u2190H)", "ultraSwing": "ULTRA SWING (\u2192\u2193\u2190\u2192\u2193\u2190G)"}
ATTACKS = {"punch1", "punch2", "punch3", "punch4", "kick1", "kick2", "kick3", "kick4", "crouchPunch", "crouchKick",
           "airPunch", "airKick", "hitUp", "chuck", "chuckThrow"}
SPECIALS = {"ring", "shuwatch", "barrier", "swing", "recharge"}
SUPERS = {"specRay", "threeMinutes", "giantStep", "ultraSwing"}


def uri_png(path):
    return "data:image/png;base64," + base64.b64encode(Path(path).read_bytes()).decode()


def load_set(out_dir):
    out_dir = Path(out_dir)
    meta = json.loads((out_dir / "frames.json").read_text())
    return {k: dict(
        label=LABELS.get(k, k), group="Supers" if k in SUPERS else "Specials" if k in SPECIALS else "Attacks" if k in ATTACKS else "Body", w=m["width"], h=m["height"], ax=m["anchor"][0], ay=m["anchor"][1],
        dur=m["durations"], loop=m["loop"], frames=[uri_png(out_dir / f) for f in m["frames"]],
        keys=m.get("keys"),
    ) for k, m in meta.items()}


def uri_stage(path):
    buf = io.BytesIO()
    Image.open(path).convert("RGB").crop((320, 480, 960, 960)).save(buf, "JPEG", quality=90)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def main(out_dir, assets, page):
    assets = Path(assets)
    data = dict(
        anims=load_set(out_dir),
        stages=dict(temple=uri_stage(assets / "stages/greek/0.png"), city=uri_stage(assets / "stages/gi/0.png")),
        cast=dict(ryuko=uri_png(assets / "ryuko/1.png"), sou=uri_png(assets / "sou/115.png"), kate=uri_png(assets / "kate/115.png")),
    )
    tpl = Path(__file__).with_name("page.html").read_text()
    Path(page).write_text(tpl.replace("/*DATA*/ null", json.dumps(data)))
    print(page, round(Path(page).stat().st_size / 1024), "KB")


if __name__ == "__main__":
    main(*sys.argv[1:4])
