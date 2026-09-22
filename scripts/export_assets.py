"""Export the MVP's selected art and idle bytecode. Standard library only.

The idle program is executed by the browser VM. Other actions supply visual
poses ONLY: the prototype defines their playback and gameplay separately.
Original containers and executables never enter the public directory.
"""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "scwu-web-handoff/research"
sys.path.insert(0, str(RESEARCH / "tools"))
sys.dont_write_bytecode = True
from scwu_images import Container, indexed_png
from scwu_animation import Program, StandingVM, display_record

PUBLIC = ROOT / "public/assets"
GENERATED = ROOT / "src/game/generated"
FIXTURES = ROOT / "src/game/__fixtures__"


def write_if_changed(path, content):
    # Avoid restarting a running Vite match when checks regenerate identical assets.
    if not path.exists() or path.read_bytes() != content:
        path.write_bytes(content)


def write_json(path, value):
    write_if_changed(path, (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf8"))


def main():
    source = RESEARCH / "extracted/01 RYUKO.PLAYER"
    if not source.exists():
        sys.exit("Missing handoff. Place scwu-web-handoff/ beside package.json, then run bun run assets.")
    data = source.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != "eebe0b11418c9576da84541a155d99ab6897c6bf3ababa0980b3ec2f5cd54640":
        sys.exit("Ryuko source hash differs from the verified handoff; refusing to export.")
    c = Container(data)
    p = Program(c)
    for folder in (PUBLIC / "ryuko", GENERATED, FIXTURES):
        folder.mkdir(parents=True, exist_ok=True)
    # Authored pose clips are not a reconstruction of these actions' bytecode.
    actions = {
        "idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,
        "doubleJump": 10, "dash": 13, "backdash": 14,
        "airDash": 16, "airBackdash": 17,
        "crouchEnter": 18, "crouch": 19, "stand": 20,
        "guard": 149, "crouchGuard": 151, "airGuard": 153,
        "blockHeavy": 154, "crouchBlockHeavy": 156, "airBlockHeavy": 158,
        "hit": 73, "airHit": 74, "hitHeavy": 75, "airHitHeavy": 76,
        "hitRapid": 83, "airHitRapid": 84,
        "blockRapid": 163, "crouchBlockRapid": 165, "airBlockRapid": 167,
        "punch": 178, "kick": 186, "crouchPunch": 185, "crouchKick": 194,
        "airPunch": 182, "airKick": 191,
        "punch2": 180, "punch3": 181, "kick2": 188, "kick3": 189, "kick3Repeat": 190,
        "drill": 207, "airDrill": 208, "airDrillSpin": 209, "drillLand": 212,
        "axeThrow": 226, "axeFlight": 227, "axeHit": 230,
        "grab": 196, "throw": 197, "throwSpin": 199,
        "hitUp": 200, "hitUpRecover": 201, "hitUpJump": 202,
        "launchUp": 81, "launchAway": 80,
        "grabbed": 128, "grabbedSpin": 130, "thrown": 132,
        "knockdown": 146, "getUp": 145,
        "hitSpark": 345, "hitStreak": 348, "guardSpark": 370,
        "ko": 60, "down": 62, "win": 57, "draw": 65,
    }
    clips = {}
    image_ids = {419, 464, 2001}
    for name, index in actions.items():
        action = p.action(index)
        frames = []
        for pc in range(action.start, action.end):
            if p.records[pc][0] == 12:
                frame = display_record(p, pc)
                image = c.images[frame["image"]]
                frames.append(dict(frame, width=image.width, height=image.height))
                image_ids.add(frame["image"])
        clips[name] = frames
    images = []
    for index in sorted(image_ids):
        record = c.images[index]
        pixels, palette, _ = c.pixels_and_palette(index)
        filename = f"ryuko/{index}.png"
        write_if_changed(PUBLIC / filename, indexed_png(record.width, record.height, pixels, palette, True))
        images.append(dict(index=index, width=record.width, height=record.height, filename=filename))
    stage = Container((RESEARCH / "extracted/0-SPORT COURT.STAGE").read_bytes())
    pixels, palette, _ = stage.pixels_and_palette(0)
    record = stage.images[0]
    write_if_changed(PUBLIC / "sport-court.png", indexed_png(record.width, record.height, pixels, palette))
    for path in (PUBLIC / "ryuko").glob("*.png"):
        if path.stem not in {str(index) for index in image_ids}:
            path.unlink()
    idle = p.action(1)
    write_json(GENERATED / "assets.json", dict(source_sha256=digest, images=images, clips=clips,
        idle=dict(start=idle.start, end=idle.end, records=[list(r) for r in p.records[:idle.end]])))
    export_ui()
    # Python is an independent oracle. Keep fixtures out of the browser bundle.
    cases = []
    for speed, seeds in [(10, range(12)), (0, [0, 1, 42]), (7, [0, 1, 42]), (20, [0, 1, 42])]:
        for seed in seeds:
            cases.append(dict(seed=seed, speed=speed, result=StandingVM(p, seed=seed, speed=speed).run()))
    write_json(FIXTURES / "idle-oracle.json", cases)
    timeline = json.loads((RESEARCH / "ryuko-idle/timeline.json").read_text(encoding="utf8"))
    write_json(FIXTURES / "handoff-timeline.json", timeline)
    print(f"Exported {len(images)} Ryuko images, Sport Court, idle program, and {len(cases)} oracle traces.")


def export_ui():
    data = (RESEARCH / "extracted/SCWU.KGT").read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != "2d49a4702cd3775f063a83dbfda94a950e7d7f1dca201522756960f31080b772":
        sys.exit("SCWU UI source hash differs from the handoff; refusing to export.")
    c = Container(data)
    p = Program(c)
    action = p.action(26)
    ko = [display_record(p, pc) for pc in range(action.start, action.end) if p.records[pc][0] == 12]
    ids = {17, 24, 25, 26, 27, 28, 29, 30, 39, 40, 41, 146}
    ids.update(range(47, 93, 5))
    ids.update(frame["image"] for frame in ko)
    (PUBLIC / "ui").mkdir(exist_ok=True)
    images = []
    for index in sorted(ids):
        record = c.images[index]
        pixels, palette, _ = c.pixels_and_palette(index)
        filename = f"ui/{index}.png"
        write_if_changed(PUBLIC / filename, indexed_png(record.width, record.height, pixels, palette, True))
        images.append(dict(index=index, width=record.width, height=record.height, filename=filename))
    write_json(GENERATED / "ui.json", dict(source_sha256=digest, images=images, ko=ko))


if __name__ == "__main__":
    main()
