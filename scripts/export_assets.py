"""Export the MVP's selected art and idle bytecode. Standard library only.

The idle program is executed by the browser VM. Other actions supply visual
poses ONLY: the prototype defines their playback and gameplay separately.
Original containers and executables never enter the public directory.
"""
import hashlib
import json
from pathlib import Path
import struct
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


def s8(record, offset):
    return struct.unpack_from("<b", record, offset)[0]


def s16(record, offset):
    return struct.unpack_from("<h", record, offset)[0]


def u16(record, offset):
    return struct.unpack_from("<H", record, offset)[0]


def decode_event(record):
    """Decode the gameplay-relevant opcodes a super timeline needs; None skips one."""
    op = record[0]
    if op == 0x01:  # velocity/acceleration; r[9] bit 0 adds, bits 1-4 keep vx, vy, ax, ay
        return dict(op="motion", ax=s16(record, 1), vx=s16(record, 3), vy=s16(record, 5),
                    ay=s16(record, 7), flags=record[9])
    if op == 0x02:  # event handler: slot 1 landing, 2 hit, 3 guard
        return dict(op="handler", slot=record[1], action=u16(record, 2), offset=record[4])
    if op == 0x04:  # spawn an object; r[12] is the owner's object slot, r[13] explicit z
        return dict(op="spawn", flags=record[1], action=u16(record, 2), x=s16(record, 8),
                    y=s16(record, 10), slot=record[12], z=record[13])
    if op == 0x07:  # place the held opponent in a pose from the held-pose table
        return dict(op="hold", flags=record[1], pose=u16(record, 2), x=s16(record, 4), y=s16(record, 6))
    if op == 0x10:  # stock check: stock <= min enters target (NO SUPER); otherwise stock += add
        return dict(op="stock", target=u16(record, 2), min=record[6], add=s16(record, 7))
    if op == 0x11:  # life check: bit 0 of r[5] jumps at or below the value, otherwise at or above
        return dict(op="life", target=u16(record, 2), below=bool(record[5] & 1), value=u16(record, 6))
    if op == 0x14:  # apply a response to the held opponent at an offset
        return dict(op="apply", flags=record[1], response=u16(record, 2), x=s16(record, 4), y=s16(record, 6))
    if op == 0x15:  # life and power changes, in the source's 510-life units
        return dict(op="power", selfLife=s16(record, 2), selfPower=s16(record, 4),
                    otherLife=s16(record, 6), otherPower=s16(record, 8))
    if op == 0x17:  # six responses: stand, crouch, air, guard stand, guard crouch, guard air
        return dict(op="responses", ids=[u16(record, 1 + 2 * i) for i in range(6)])
    if op == 0x18:  # attack box: centre and half extents; r[12] damage
        return dict(op="box", slot=record[9], x=s16(record, 1), y=s16(record, 3), w=s16(record, 5),
                    h=s16(record, 7), kind=record[10], damage=record[12])
    if op == 0x20:  # branch to r[6] at offset r[8] when rand() % (r[1] + 1) > r[3]
        return dict(op="random", divisor=u16(record, 1) + 1, above=u16(record, 3),
                    action=u16(record, 6), offset=record[8])
    if op == 0x1f and record[4] == 0x86 and record[5] == 2:  # global 6 (0x4456bc) += r[7:9], the freeze timer
        return dict(op="freeze", add=s16(record, 7))
    if op == 0x1a:  # hit-stop ticks for the object itself and the opponent
        return dict(op="stop", self=record[1], other=record[2])
    if op == 0x23:  # colour (0x413a07): blit mode, signed r, g, b palette offsets, r[5] fade in mode 4
        return color_state(record)
    return None


def color_state(record):
    return dict(op="color", mode=record[1], r=s8(record, 2), g=s8(record, 3), b=s8(record, 4),
                fade=s8(record, 5) if record[1] == 4 else 0)


def body_boxes(bodies, record):
    """Apply op 0x19 (0x412d63): slot r[9] holds the box until a zero size clears it.

    The hit test (0x40f1b8) reads every slot whose kind r[10] has bit 1 or 2 set;
    r[11] is the percentage of a hit's damage the body takes (0x40f010).
    Only an action change through 0x410cf0 clears the slots; calls and jumps keep
    them. `bodies` is None until the walk sets a slot, so a called action's
    frames can inherit its caller's boxes.
    """
    bodies = dict(bodies or {})
    if s16(record, 5) and s16(record, 7):
        bodies[record[9]] = dict(x=s16(record, 1), y=s16(record, 3), w=s16(record, 5),
                                 h=s16(record, 7), kind=record[10], taken=record[11])
    else:
        bodies.pop(record[9], None)
    return bodies


def with_body(frame, bodies):
    return frame if bodies is None else dict(frame, body=[bodies[k] for k in sorted(bodies)])


def flatten(p, c, index, played=(), offset=0):
    """Linearize one action for playback by the match.

    Inlines op 0x09 calls with their repeat counts and follows op 0x0a jumps. A
    jump back to an executed PC marks a loop; a jump from a super into a basic
    action (below 250), or into an action the match plays as its own clip
    (`played`), ends the timeline with `next`. Conditions (0x10, 0x11, 0x16,
    0x1f, 0x20) are exported or skipped, never evaluated: their fall-through
    path is the super's normal path. `offset` starts at an op 0x20 jump target.
    """
    frames, events, bodies = [], [], {}
    t, pc, stack, seen = 0, p.action(index).start + offset, [], {}
    action = index
    result = dict(loop=-1, end="end", next=None)
    for _ in range(20000):
        a = p.action(action)
        if pc >= a.end:
            if not stack:
                break
            ret, called, remaining, caller = stack[-1]
            if remaining > 1:
                stack[-1] = (ret, called, remaining - 1, caller)
                pc = p.action(called).start
            else:
                stack.pop()
                pc, action = ret, caller
            continue
        record = p.records[pc]
        op = record[0]
        if not stack and pc not in seen:
            seen[pc] = len(frames)
        if op == 0x0c:
            frame = display_record(p, pc)
            image = c.images[frame["image"]]
            frames.append(with_body(dict(frame, width=image.width, height=image.height, t=t), bodies))
            if frame["duration"] == 0:
                result["end"] = "hold"
                break
            t += frame["duration"]
        elif op == 0x09:
            count, called = record[1], u16(record, 2)
            if count:
                stack.append((pc + 1, called, count, action))
                action, pc = called, p.action(called).start
                continue
        elif op == 0x0a and u16(record, 1):
            target = u16(record, 1)
            dest = p.action(target).start + record[3]
            if not stack and dest in seen:
                result.update(loop=seen[dest], end="loop")
                break
            if target < 250 <= index or target in played:
                result.update(end="jump", next=target, offset=record[3])
                break
            action, pc = target, dest
            continue
        elif op == 0x05:
            break
        elif op == 0x19:
            bodies = body_boxes(bodies, record)
        else:
            event = decode_event(record)
            if event:
                events.append(dict(event, t=t))
        pc += 1
    else:
        sys.exit(f"Action {index} did not finish flattening; refusing to export.")
    return dict(result, frames=frames, events=events)


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
        "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24,
        "intro": 33,
        "guard": 149, "crouchGuard": 151, "airGuard": 153,
        "blockHeavy": 154, "crouchBlockHeavy": 156, "airBlockHeavy": 158,
        "hit": 73, "airHit": 74, "hitHeavy": 75, "airHitHeavy": 76, "jumpHit": 77, "drillDown": 135,
        "blockRapid": 163, "crouchBlockRapid": 165, "airBlockRapid": 167,
        "timeStopGuard": 168, "crouchTimeStopGuard": 170, "airTimeStopGuard": 172,
        "punch": 178, "kick": 186, "crouchPunch": 185, "crouchKick": 194,
        "airPunch": 182, "airKick": 191,
        "punch2": 180, "punch3": 181, "kick2": 188, "kick3": 189, "kick3Repeat": 190,
        "punchHit": 179, "kickHit": 187,
        "drill": 207, "airDrill": 208, "airDrillSpin": 209, "drillLand": 212,
        "axeThrow": 226, "axeFlight": 227, "axeHit": 230,
        "grab": 196, "throw": 197, "throwSpin": 199,
        "hitUp": 200, "hitUpRecover": 201, "hitUpJump": 202,
        "iori": 246, "iori2": 247, "iori3": 248,
        # CPU IORI's recovery: op 0x20 at PC 5887 jumps to action 411 + 31.
        "cpuIoriRecover": (411, 31),
        "dst": 214, "dstHit": 215, "dstSpin": 217, "dstMissile": 218, "dstMissileSmoke": 219,
        "evilDst": 221,
        "dstFire": 385, "dstToss": 129, "dstTossSpin": 130, "dstTossSpin2": 131,
        "twist": 85, "twisting": 86, "twisting2": 87,
        "smokeRight": 394, "smokeLeft": 395, "dashSmoke": 396, "hisaSmoke": 398, "hisaSmokeBack": 399,
        "landingSmoke": 400,
        "hitPull": 121, "blockStop": 159, "crouchBlockStop": 161,
        "launchDown": 123, "slamBounce": 124, "bounceDown": 147,
        "launchUp": 81, "launchAway": 80, "sweep": 79,
        "grabbed": 128,
        "knockdown": 146, "getUp": 145,
        "ko": 60, "down": 62, "win": 57, "winStand": 58, "draw": 65,
    }
    clips = {}
    image_ids = {419, 464, 2001}
    for name, index in actions.items():
        index, offset = index if isinstance(index, tuple) else (index, 0)
        action = p.action(index)
        # A display after an op 0x23 carries the colour state it sets.
        frames, bodies, color = [], None, None
        for pc in range(action.start, action.end):
            if p.records[pc][0] == 0x19:
                bodies = body_boxes(bodies, p.records[pc])
            elif p.records[pc][0] == 0x23 and pc >= action.start + offset:
                color = {k: v for k, v in color_state(p.records[pc]).items() if k != "op"}
            elif p.records[pc][0] == 12 and pc >= action.start + offset:
                frame = display_record(p, pc)
                image = c.images[frame["image"]]
                frame = with_body(dict(frame, width=image.width, height=image.height), bodies)
                frames.append(dict(frame, color=color) if color else frame)
                image_ids.add(frame["image"])
        clips[name] = frames
    # Op 0x07 replaces a held fighter's display with an entry of this 15 x 6-byte
    # table (image, dx, dy), read by the engine into player offset 0x70ca.
    held_offset = c.common_end + 4 + 23 * 82 + 4 + 83 * 4 + 4
    if struct.unpack_from("<I", data, held_offset - 4)[0] != 15:
        sys.exit("Unexpected held-pose table layout; refusing to export.")
    held = []
    for i in range(15):
        packed, dx, dy = struct.unpack_from("<Hhh", data, held_offset + i * 6)
        image = c.images[packed & 8191]
        held.append(dict(image=packed & 8191, dx=dx, dy=dy, width=image.width, height=image.height))
        if packed & 8191:
            image_ids.add(packed & 8191)
    # The 83-entry response table before it (player +0x6daa): the victim action
    # for each response id, then the hit-effect action 0x40f567 spawns.
    response_offset = held_offset - 4 - 83 * 4
    responses = [u16(data, response_offset + 4 * i) for i in range(83)]
    response_effects = [u16(data, response_offset + 4 * i + 2) for i in range(83)]
    # The CPU table 10 bytes after the held-pose table: 100 entries of 111 bytes
    # (name, +0x20 flags, +0x21 probability, +0x22/+0x24 distance, ten 7-byte
    # steps at +0x2a), played by the CPU routine at 0x411270. Keep entries up to
    # the last used one; the engine still rolls for every slot.
    cpu_offset = held_offset + 15 * 6 + 10
    if data[cpu_offset:cpu_offset + 6] != "登録1\0".encode("cp932"):
        sys.exit("Unexpected CPU table layout; refusing to export.")
    cpu = []
    for i in range(100):
        entry = cpu_offset + 111 * i
        steps = []
        for k in range(10):
            direction, command, duration = struct.unpack_from("<HHH", data, entry + 0x2a + 7 * k)
            if not direction & 0x2000:
                break
            steps.append(dict(direction=direction & 15, command=command, duration=duration))
        cpu.append(dict(flags=data[entry + 0x20], probability=data[entry + 0x21],
                        min=u16(data, entry + 0x22), max=u16(data, entry + 0x24), steps=steps))
    while cpu and not cpu[-1]["probability"]:
        cpu.pop()
    # Super timelines, their hit branches (handler slot 2) and every spawned object,
    # plus EVIL DST's hit branch (222), which jumps into DST Hit (215), the guard
    # counter COUNTER HIT (174), and the super-cancel versions entered from IORI
    # (260, 265, 279, 318) with the GENGAI! lettering of action 254 (253), and CPU
    # IORI (410, which jumps through 411 into iori3), the rush air hit (122), the
    # beam hits (83, 84), hits 75 and 80 for their op 0x20 rolls, air reactions
    # whose op 0x01 commands the match plays, and every response's hit effect,
    # each with its op 0x20 branches, keyed
    # "action+offset" when a branch enters mid-action.
    # Image 0 (a solid marker block) and 8191 are the source's blank displays.
    scripts, queue = {}, [(i, 0) for i in [88, 97, 174, 222, 250, 251, 253, 256, 260, 263, 264,
                          265, 278, 279, 280, 286, 292, 318, 319, 410, 122, 83, 84,
                          74, 75, 76, 80, 153, 158, 167, 172, *filter(None, response_effects)]]
    played = set(actions.values())
    while queue:
        index, offset = key = queue.pop()
        if key in scripts:
            continue
        script = scripts[key] = flatten(p, c, index, played, offset)
        image_ids.update(f["image"] for f in script["frames"] if f["image"] not in (0, 8191))
        for event in script["events"]:
            if (event["op"] == "spawn" and event["action"]) or (event["op"] == "handler" and event["slot"] == 2):
                queue.append((event["action"], 0))
            if event["op"] == "random" and event["action"]:
                queue.append((event["action"], event["offset"]))
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
    write_json(GENERATED / "assets.json", dict(source_sha256=digest, images=images, clips=clips, held=held,
        responses=responses, response_effects=response_effects, cpu=cpu, scripts={f"{i}+{o}" if o else str(i): s for (i, o), s in sorted(scripts.items())},
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
    # 17–20: stock digits EMPTY/100/200/300; 31–38: gauge shimmer; 135: UNDER PW.
    ids = {17, 18, 19, 20, 24, 25, 26, 27, 28, 29, 30, 39, 40, 41, 135, 146}
    ids.update(range(31, 39))
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
