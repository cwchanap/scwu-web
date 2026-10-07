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
    if op == 0x03:  # play sound r[2:4] of the running container's table (0x4132c8)
        return dict(op="sound", index=u16(record, 2))
    if op == 0x04:  # spawn an object at r[4] records in; r[12] is the owner's object slot, r[13] explicit z.
        # While that slot's object lives, a player's spawn jumps to r[5:7] + r[7] instead, if set (0x412ac0).
        return dict(op="spawn", flags=record[1], action=u16(record, 2), offset=record[4], x=s16(record, 8),
                    y=s16(record, 10), slot=record[12], z=record[13], busy=u16(record, 5), busyOffset=record[7])
    if op == 0x07:  # place the held opponent in a pose from the held-pose table
        return dict(op="hold", flags=record[1], pose=u16(record, 2), x=s16(record, 4), y=s16(record, 6))
    if op == 0x10:  # stock check (0x413500): stock <= min jumps to target + r[4] (NO SUPER); otherwise stock += add
        return dict(op="stock", target=u16(record, 2), offset=record[4], min=record[6], add=s16(record, 7))
    if op == 0x11:  # life check (0x413164): bit 0 of r[5] jumps at or below the value, otherwise at or above
        return dict(op="life", target=u16(record, 2), offset=record[4], below=bool(record[5] & 1),
                    value=u16(record, 6))
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
    if op == 0x0b:  # call r[1:3] once; running out returns after the call (+0x85, 0x412625)
        return dict(op="call", action=u16(record, 1))
    if op == 0x16:  # input check (0x412da7): jump to r[2:4] + r[4] if condition r[7] holds (fails with r[1] bit 0)
        return dict(op="input", condition=record[7], negate=bool(record[1] & 1), action=u16(record, 2),
                    offset=record[4])
    if op == 0x1e:  # cancel window (0x413782, read at 0x41193a): r[1] bits 0-2 the mode (1 once the
        # box has connected, 2 always), bits 3-5 the type (0 levels r[2] to r[5], 1 only action r[3:5])
        return dict(op="window", mode=record[1] & 7, type=record[1] >> 3 & 7, min=record[2], max=record[5],
                    action=u16(record, 3))
    if op == 0x24:  # command check (0x413a50, 0x410a50): jump to r[1:3] + r[3] if the steps at r[5:15],
        # through the last marked 0x2000, matched within the last r[4] ticks
        steps = [u16(record, 5 + 2 * k) for k in range(5)]
        last = max((k for k, step in enumerate(steps) if step & 0x2000), default=-1)
        return dict(op="command", action=u16(record, 1), offset=record[3], window=record[4], steps=steps[:last + 1])
    # Op 0x1f jumps to r[1:3] + r[3] if its variable is ==, > or < r[9:11]. The match
    # evaluates player variables 0 (EX mode), 1 (a double jump or air dash), 6 (an IORI
    # cancel) and 12 (EX Fire 2) and global 6 (the freeze); other tests keep their
    # fall-through path.
    if op == 0x1f and record[5] & 0xc and not record[5] & 3 and record[4] in (0x40, 0x41, 0x46, 0x4c, 0x86):
        return dict(op="test", selector=record[4], compare=record[5] >> 2 & 3, value=s16(record, 9),
                    action=u16(record, 1), offset=record[3])
    if op == 0x1f and record[4] == 0x86 and record[5] == 2:  # global 6 (0x4456bc) += r[7:9], the freeze timer
        return dict(op="freeze", add=s16(record, 7))
    if op == 0x1f and record[4] >> 6 == 1 and record[5] == 1:  # player variable r[4] & 0x3f = r[7:9]
        return dict(op="variable", index=record[4] & 0x3f, value=s16(record, 7))
    if op == 0x1f and record[4] >> 6 == 1 and record[5] == 2:  # player variable r[4] & 0x3f += r[7:9]
        return dict(op="add", index=record[4] & 0x3f, value=s16(record, 7))
    if op == 0x1a:  # hit-stop ticks for the object itself and the opponent
        return dict(op="stop", self=record[1], other=record[2])
    if op == 0x23:  # colour (0x413a07): blit mode, signed r, g, b palette offsets, r[5] fade in mode 4
        return color_state(record)
    if op == 0x25:  # afterimage (0x413a9a): r[3] images every r[4] + 1 ticks; zero in either turns it off
        return trail_state(record)
    if op == 0x0e:  # screen effects (0x4132fa): a colour fader, then the x and y shake
        def axis(i):  # r[9:12], r[12:15]: type, amplitude, frames
            return dict(type=record[i], amplitude=record[i + 1], frames=record[i + 2]) if record[i] else None
        # r[1] type, r[2:6] target r, g, b, fade, r[6:8] ticks; r[8] picks the faders.
        fader = dict(type=record[1], r=s8(record, 2), g=s8(record, 3), b=s8(record, 4), fade=s8(record, 5),
                     ticks=u16(record, 6), flags=record[8]) if record[1] and record[8] else None
        x, y = axis(9), axis(12)
        return dict(op="screen", fader=fader, x=x, y=y) if fader or x or y else None
    return None


# The events a display carries: those its clip or timeline runs just before it.
POSE_EVENTS = ("sound", "spawn", "screen", "trail", "variable", "window")


def color_state(record):
    return dict(op="color", mode=record[1], r=s8(record, 2), g=s8(record, 3), b=s8(record, 4),
                fade=s8(record, 5) if record[1] == 4 else 0)


def trail_state(record):
    """r[5] blit mode; r[6] picks each image's colour (0x40ce8e): 0 the object's, 1 r[7:11], 2 a blend."""
    return dict(op="trail", count=record[3], interval=record[4], mode=record[5], tint=record[6],
                r=s8(record, 7), g=s8(record, 8), b=s8(record, 9), fade=s8(record, 10))


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
    path is the super's normal path, and the match takes an op 0x16, 0x1f or
    0x20 branch by switching to its target's own timeline. Op 0x0b calls stay
    events. `offset` starts at a branch's jump target.
    Like a clip's, each display also carries the op 0x03, 0x04, 0x0e, 0x1f and
    0x25 events run just before it, for reactions drawn from their timelines.
    """
    frames, events, bodies, pending = [], [], {}, []
    # A jump keeps the body boxes (only 0x410cf0 clears them), so a branch into
    # its own action, as Zoma's run loops, starts with those its earlier records set.
    for pc in range(p.action(index).start, p.action(index).start + offset):
        if p.records[pc][0] == 0x19:
            bodies = body_boxes(bodies, p.records[pc])
    t, pc, stack, seen, seen_events = 0, p.action(index).start + offset, [], {}, {}
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
            seen[pc], seen_events[pc] = len(frames), len(events)
        if op == 0x0c:
            frame = display_record(p, pc)
            image = c.images[frame["image"]]
            frame = with_body(dict(frame, width=image.width, height=image.height, t=t), bodies)
            frames.append(dict(frame, events=pending) if pending else frame)
            pending = []
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
                # The loop's first frame, and its first record's event.
                result.update(loop=seen[dest], loopEvent=seen_events[dest], end="loop")
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
            # A branch can't return to a caller, so a call keeps its checks' fall-through path.
            if event and stack and event["op"] in ("input", "test", "command"):
                event = None
            if event:
                events.append(dict(event, t=t))
            if event and event["op"] in POSE_EVENTS:
                pending.append(event)
        pc += 1
    else:
        sys.exit(f"Action {index} did not finish flattening; refusing to export.")
    return dict(result, frames=frames, events=events)


def player_tables(data, c, image_ids):
    """The tables the loader reads after a player's images (0x403b64), adding the images they show."""
    # The command table it reads into player +0x4da2: the entry count, then
    # entries of 82 bytes, each a name, the window of input-history ticks
    # (+0x20), the actions entered airborne, near, far and crouching
    # (+0x22–0x28) and ten u16 steps (+0x2a), kept through the last marked 0x2000.
    count = struct.unpack_from("<I", data, c.common_end)[0]
    if not 0 < count < 64:
        sys.exit("Unexpected command table layout; refusing to export.")
    commands = []
    for i in range(count):
        entry = c.common_end + 4 + 82 * i
        window, air, near, far, crouch, *steps = struct.unpack_from("<15H", data, entry + 0x20)
        last = max((k for k, step in enumerate(steps) if step & 0x2000), default=-1)
        commands.append(dict(name=data[entry:entry + 0x20].split(b"\0")[0].decode("cp932").strip(),
                             window=window, air=air, near=near, far=far, crouch=crouch, steps=steps[:last + 1]))
    # Op 0x07 replaces a held fighter's display with an entry of this 15 x 6-byte
    # table (image, dx, dy), read by the engine into player offset 0x70ca.
    held_offset = c.common_end + 4 + count * 82 + 4 + 83 * 4 + 4
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
    if struct.unpack_from("<I", data, response_offset - 4)[0] != 83:
        sys.exit("Unexpected response table layout; refusing to export.")
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
    # The loader reads the CPU block, then 0x74b bytes into player +0x757a
    # (0x403c0b). Its s16 at +0x7ca3 splits a command's near and far actions
    # (0x41080e), in source pixels, and the u16 at +0x7caa is the life.
    block = cpu_offset - 10 + 0x2b66 - 0x757a
    near = struct.unpack_from("<h", data, block + 0x7ca3)[0]
    life = u16(data, block + 0x7caa)
    return dict(held=held, responses=responses, response_effects=response_effects, cpu=cpu,
                commands=dict(near=near, entries=commands), life=life)


def pose_clips(p, c, actions, image_ids):
    """Each named action's displays, with their body boxes, colour and events.

    `actions` maps a name to a source action, or to (action, offset) to start
    mid-action. A display after an op 0x23 carries the colour state it sets,
    and the op 0x03, 0x04, 0x0e, 0x1f and 0x25 events of the records just before it.
    """
    clips = {}
    for name, index in actions.items():
        index, offset = index if isinstance(index, tuple) else (index, 0)
        action = p.action(index)
        frames, bodies, color, events = [], None, None, []
        for pc in range(action.start, action.end):
            if p.records[pc][0] == 0x19:
                bodies = body_boxes(bodies, p.records[pc])
            elif p.records[pc][0] == 0x23 and pc >= action.start + offset:
                color = {k: v for k, v in color_state(p.records[pc]).items() if k != "op"}
            elif p.records[pc][0] in (0x03, 0x04, 0x0e, 0x1e, 0x1f, 0x25) and pc >= action.start + offset:
                event = decode_event(p.records[pc])
                if event and event["op"] in POSE_EVENTS:
                    events.append(event)
            elif p.records[pc][0] == 12 and pc >= action.start + offset:
                frame = display_record(p, pc)
                image = c.images[frame["image"]]
                frame = with_body(dict(frame, width=image.width, height=image.height), bodies)
                frame = dict(frame, color=color) if color else frame
                frames.append(dict(frame, events=events) if events else frame)
                events = []
                image_ids.add(frame["image"])
        clips[name] = frames
    return clips


def flatten_queue(p, c, queue, played, image_ids):
    """Flatten every queued (action, offset) and whatever its events spawn, call or branch into."""
    scripts = {}
    while queue:
        index, offset = key = queue.pop()
        if key in scripts:
            continue
        script = scripts[key] = flatten(p, c, index, played, offset)
        image_ids.update(f["image"] for f in script["frames"] if f["image"] not in (0, 8191))
        for event in script["events"]:
            if event["op"] == "spawn" and event["action"]:
                queue.append((event["action"], event["offset"]))
            if event["op"] == "spawn" and event["busy"]:
                queue.append((event["busy"], event["busyOffset"]))
            # A landing handler (slot 1) not played as a clip runs its timeline.
            if event["op"] == "handler" and event["slot"] == 1 and event["action"] not in played:
                queue.append((event["action"], event["offset"]))
            if event["op"] == "handler" and event["slot"] in (2, 3):
                queue.append((event["action"], event["offset"]))
            if event["op"] in ("random", "input", "test", "command") and event["action"]:
                queue.append((event["action"], event["offset"]))
            if event["op"] == "call":
                queue.append((event["action"], 0))
            if event["op"] in ("stock", "life") and event["target"]:
                queue.append((event["target"], event["offset"]))
    return {f"{i}+{o}" if o else str(i): s for (i, o), s in sorted(scripts.items())}


def spawned(clips):
    """The (action, offset) of every object a clip's displays spawn."""
    return sorted({(e["action"], e["offset"]) for frames in clips.values() for f in frames
                   for e in f.get("events", []) if e["op"] == "spawn" and e["action"]})


def cued(clips, scripts):
    """The sounds the exported clips' and timelines' op 0x03 cues play."""
    ids = {e["index"] for frames in clips.values() for f in frames for e in f.get("events", []) if e["op"] == "sound"}
    return ids | {e["index"] for s in scripts.values() for e in s["events"] if e["op"] == "sound"}


def export_images(c, folder, image_ids):
    """Write a player's selected images to public/assets/<folder>/, dropping stale ones."""
    (PUBLIC / folder).mkdir(parents=True, exist_ok=True)
    # An empty image (Zoma's 2000, which dragon 2 shows as he vanishes) draws nothing.
    image_ids = {index for index in image_ids if c.images[index].width and c.images[index].height}
    images = []
    for index in sorted(image_ids):
        record = c.images[index]
        pixels, palette, _ = c.pixels_and_palette(index)
        filename = f"{folder}/{index}.png"
        write_if_changed(PUBLIC / filename, indexed_png(record.width, record.height, pixels, palette, True))
        images.append(dict(index=index, width=record.width, height=record.height, filename=filename))
    for path in (PUBLIC / folder).glob("*.png"):
        if path.stem not in {str(index) for index in image_ids}:
            path.unlink()
    return images


def write_if_changed(path, content):
    # Avoid restarting a running Vite match when checks regenerate identical assets.
    if not path.exists() or path.read_bytes() != content:
        path.write_bytes(content)


def write_json(path, value):
    write_if_changed(path, (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf8"))


def player(name, sha256):
    source = RESEARCH / f"extracted/{name}.PLAYER"
    if not source.exists():
        sys.exit("Missing handoff. Place scwu-web-handoff/ beside package.json, then run bun run assets.")
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != sha256:
        sys.exit(f"{name} source hash differs from the verified handoff; refusing to export.")
    c = Container(data)
    return data, c, Program(c)


# Records that name another action: its u16's range, then the offset byte.
ACTION_REFERENCES = {0x02: (2, 4, 4), 0x09: (2, 4, None), 0x0a: (1, 3, 3), 0x10: (2, 4, None),
                     0x11: (2, 4, None), 0x16: (2, 4, 4), 0x1f: (1, 3, 3), 0x20: (6, 8, 8), 0x24: (1, 3, None)}


def gameplay(p, index):
    """An action's display lengths and gameplay records, without the action
    numbers and record offsets they name, which each container lays out its
    own way, a header's level, an op 0x1e of mode 0 (no window) or a set's
    unused compare value."""
    action, out = p.action(index), []
    for pc in range(action.start + 1, action.end):
        record = bytearray(p.records[pc])
        op = record[0]
        if op == 0x0c:
            out.append(("display", display_record(p, pc)["duration"]))
        if op in (0x03, 0x04, 0x0c, 0x0e, 0x19, 0x23, 0x25) or op == 0x1e and not record[1] & 7:
            continue
        if op == 0x1f and record[5] == 1:
            record[9:] = bytes(len(record) - 9)
        if op in ACTION_REFERENCES:
            start, end, offset = ACTION_REFERENCES[op]
            record[start:end] = bytes(end - start)
            if offset is not None:
                record[offset] = 0
        out.append(record.hex())
    return out


def export_zoma(ryuko):
    data, c, p = player("02 ZOMA", "bfc7a239fb33782fac6ff6c6ff22a2f50d0d8abc59c2182052e9cc32a422ff0e")
    # The engine's own states, from his default-action table (+0x757a: 1–5, 7,
    # 8, 18–27) and his jumps' landing handler (slot 1 → 10, PC 42).
    neutral = {
        "idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,
        "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24,
    }
    # Twins of Ryuko's victim actions: the response table pairs them (a response
    # id selects each one's own), with their landing and follow-up actions.
    twins = {
        "guard": (149, 149), "crouchGuard": (151, 151), "airGuard": (153, 153),
        "blockHeavy": (154, 154), "crouchBlockHeavy": (156, 156), "airBlockHeavy": (158, 158),
        "hit": (73, 74), "airHit": (74, 75), "hitHeavy": (75, 76), "airHitHeavy": (76, 77),
        "jumpHit": (77, 78), "drillDown": (135, 136),
        "blockRapid": (163, 163), "crouchBlockRapid": (165, 165), "airBlockRapid": (167, 167),
        "timeStopGuard": (168, 168), "crouchTimeStopGuard": (170, 170), "airTimeStopGuard": (172, 172),
        "dstToss": (129, 130), "dstTossSpin": (130, 131), "dstTossSpin2": (131, 132),
        "twist": (85, 86), "twisting": (86, 87), "twisting2": (87, 88),
        "hitPull": (121, 122), "blockStop": (159, 159), "crouchBlockStop": (161, 161),
        "launchDown": (123, 124), "slamBounce": (124, 125), "bounceDown": (147, 147),
        "launchUp": (81, 82), "launchAway": (80, 81), "sweep": (79, 80),
        "grabbed": (128, 129), "knockdown": (146, 146), "getUp": (145, 145),
        "ko": (60, 58), "koAgain": (61, 59), "down": (62, 60), "lose": (59, 57),
        "hitRapid": (83, 84), "airHitRapid": (84, 85), "rushAirHit": (122, 123),
        "fly": (97, 98), "flySpin": (98, 99), "shock": (88, 90), "shockLoop": (90, 91),
        "fb": (110, 111), "fbb": (111, 112), "fbh": (112, 113), "chuckToss": (132, 133),
        "uppercut": (96, 97), "stun": (108, 109), "airStun": (109, 110),
    }
    # Twins that differ, beyond their numbering and layout:
    differ = {
        # P+K (0x2090) where Ryuko's counter checks Hit Up, and 10 ticks for
        # Ryuko's 8; the crouching guard adds 2 power to Zoma (op 0x15).
        "guard", "crouchGuard",
        # An op 0x20 that rolls which displays play.
        "jumpHit",
        # Op 0x1a after op 0x15, both before the first display.
        "launchDown",
        # Ryuko's clear player variable 3 (knockdowns) and set 6 (the shock);
        # the KOs test and set variable 3 at 30, not 40 and 50, and KO DOWN
        # global 15 equal to 100, not above 99. The KO's last display waits
        # for landing (1205 ticks, not 0).
        "knockdown", "bounceDown", "shock", "ko", "down",
        # Display lengths after the reaction's motion commands.
        "dstTossSpin2", "airHitRapid", "rushAirHit", "shockLoop", "airStun",
        # Ryuko's deletes objects 7-9 and rolls whether to skip its sound.
        "chuckToss",
        # Ryuko's also deletes object 7, and rolls rand % 6 > 2 to his rand % 3 > 1.
        "uppercut",
    }
    for name, (r, z) in twins.items():
        if (gameplay(ryuko, r) == gameplay(p, z)) == (name in differ):
            sys.exit(f"Zoma's {name} ({z}) no longer matches the recorded comparison with Ryuko's {r}; refusing to export.")
    # As in Ryuko's export, these play from their timelines (or only open
    # one), not as clips, so flattening follows their jumps.
    timelines = {"lose", "hitRapid", "airHitRapid", "rushAirHit", "fly", "flySpin", "shock", "shockLoop",
                 "fb", "fbb", "fbh", "stun", "airStun"}
    actions = dict(neutral, **{name: z for name, (_, z) in twins.items() if name not in timelines},
                   # Results: WIN and the draw call DEMO STAND once (PCs 542, 630).
                   win=56, winStand=41, draw=63,
                   # His super darkening panel, image 1009 (action 40).
                   black=40,
                   # The Vs. intro: 28 jumps to 30 + 3 (PCs 265, 301), which
                   # jumps to Start N (31) + 2 (PC 306), as Ryuko's 30 to 33 + 4.
                   intro=(31, 2))
    # 2001: the HUD face action 71 shows; 340: the name *name (64) shows.
    image_ids = {2001, 340}
    clips = pose_clips(p, c, actions, image_ids)
    tables = player_tables(data, c, image_ids)
    # His moves play from their timelines: the actions of his command entries
    # (DST to K, and the CPU's dashes 22-24), each with its level (header
    # r[2]), which a cancel window compares.
    entries = tables["commands"]["entries"]
    moves = sorted({e[k] for e in entries for k in ("air", "near", "far", "crouch") if e[k]})
    levels = {i: p.records[p.action(i).start][2] for i in moves}
    # The reactions whose op 0x01 commands, op 0x20 rolls and branches the
    # match plays, the lose action (57) that opens every KO, every response's
    # hit effect and every object the clips spawn; his moves, COUNTER HIT
    # (174) and the guard reactions whose op 0x24 enters it.
    queue = [(i, 0) for i in [75, 76, 77, 78, 81, 84, 85, 90, 97, 98, 109, 110, 123, 153, 158, 167, 172, 57,
                              *filter(None, tables["response_effects"]), *moves, 174,
                              149, 151, 154, 156, 159, 161, 163, 165, 168, 170]]
    scripts = flatten_queue(p, c, queue + spawned(clips), set(actions.values()), image_ids)
    sounds = export_sounds(c, "zoma", cued(clips, scripts))
    images = export_images(c, "zoma", image_ids)
    idle = p.action(1)
    write_json(GENERATED / "zoma.json", dict(source_sha256=hashlib.sha256(data).hexdigest(), images=images,
        sounds=sounds, clips=clips, **tables, scripts=scripts, twins={r: z for r, z in twins.values()},
        neutral={i: name for name, i in neutral.items()}, levels=levels,
        idle=dict(start=idle.start, end=idle.end, records=[list(r) for r in p.records[:idle.end]])))
    return len(images)


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
        "axeBusy": 225, "axeThrow": 226, "axeFlight": 227, "axeHit": 230,
        "grab": 196, "throw": 197, "throwSpin": 199,
        "hitUp": 200, "hitUpRecover": 201, "hitUpJump": 202,
        "iori": 246, "iori2": 247, "iori3": 248,
        "exChange": 204, "norChange": 205,
        # CPU IORI's recovery: op 0x20 at PC 5887 jumps to action 411 + 31.
        "cpuIoriRecover": (411, 31),
        "dst": 214, "dstHit": 215, "dstSpin": 217, "dstMissile": 218,
        "evilDst": 221, "dstFar": 220, "evilDstFar": 224,
        "dstToss": 129, "dstTossSpin": 130, "dstTossSpin2": 131,
        "twist": 85, "twisting": 86, "twisting2": 87,
        "hitPull": 121, "blockStop": 159, "crouchBlockStop": 161,
        "launchDown": 123, "slamBounce": 124, "bounceDown": 147,
        "launchUp": 81, "launchAway": 80, "sweep": 79, "chuckToss": 132, "uppercut": 96,
        "grabbed": 128,
        "knockdown": 146, "getUp": 145,
        "ko": 60, "koAgain": 61, "down": 62, "win": 57, "winStand": 58, "draw": 65,
        # Action 43 'Black', the super darkening the round intro spawns.
        "black": 43,
    }
    # 2000–2002: the HUD faces action 70 shows (EX mode cycles them, PCs 712–730).
    image_ids = {419, 464, 2000, 2001, 2002}
    clips = pose_clips(p, c, actions, image_ids)
    tables = player_tables(data, c, image_ids)
    # Super timelines, their hit branches (handler slot 2) and every spawned object,
    # plus EVIL DST's hit branch (222), which jumps into DST Hit (215), the guard
    # counter COUNTER HIT (174), and the super-cancel versions entered from IORI
    # (260, 265, 279, 318) with the GENGAI! lettering of action 254 (253), EX Fire
    # (231) and every charge and freeze branch its checks take, and CPU
    # IORI (410, which jumps through 411 into iori3), the rush air hit (122), the
    # beam hits (83, 84), hits 75, 80, 96 and 132 for their op 0x20 rolls, air reactions
    # whose op 0x01 commands the match plays, the lose action (59) whose records
    # open every KO, every response's hit effect and every object the clips
    # spawn, each with its op 0x20 branches, keyed
    # "action+offset" when a branch enters mid-action.
    # Image 0 (a solid marker block) and 8191 are the source's blank displays.
    queue = [(i, 0) for i in [88, 97, 174, 222, 231, 250, 251, 253, 256, 260, 263, 264,
             265, 278, 279, 280, 286, 292, 318, 319, 410, 122, 83, 84,
             74, 75, 76, 80, 96, 108, 109, 132, 153, 158, 167, 172, 59, *filter(None, tables["response_effects"])]]
    scripts = flatten_queue(p, c, queue + spawned(clips), set(actions.values()), image_ids)
    # Ryuko's sounds the exported cues play, as stored: RIFF/WAVE, 8-bit mono.
    sounds = export_sounds(c, "ryuko", cued(clips, scripts))
    images = export_images(c, "ryuko", image_ids)
    stage = Container((RESEARCH / "extracted/0-SPORT COURT.STAGE").read_bytes())
    pixels, palette, _ = stage.pixels_and_palette(0)
    record = stage.images[0]
    write_if_changed(PUBLIC / "sport-court.png", indexed_png(record.width, record.height, pixels, palette))
    # Sport Court's 75-second track ('Sprotmorning.WAV', type 0x11, so it loops), which
    # stage actions 2 and 3 play only after SIN's, KAY's or DIDO's supers: the port's
    # optional music.
    music = export_sounds(stage, "stage", [2])[0]
    idle = p.action(1)
    write_json(GENERATED / "assets.json", dict(source_sha256=digest, images=images, sounds=sounds, music=music, clips=clips,
        **tables, scripts=scripts, idle=dict(start=idle.start, end=idle.end, records=[list(r) for r in p.records[:idle.end]])))
    zoma = export_zoma(p)
    export_ui()
    # Python is an independent oracle. Keep fixtures out of the browser bundle.
    cases = []
    for speed, seeds in [(10, range(12)), (0, [0, 1, 42]), (7, [0, 1, 42]), (20, [0, 1, 42])]:
        for seed in seeds:
            cases.append(dict(seed=seed, speed=speed, result=StandingVM(p, seed=seed, speed=speed).run()))
    write_json(FIXTURES / "idle-oracle.json", cases)
    timeline = json.loads((RESEARCH / "ryuko-idle/timeline.json").read_text(encoding="utf8"))
    write_json(FIXTURES / "handoff-timeline.json", timeline)
    print(f"Exported {len(images)} Ryuko and {zoma} Zoma images, Sport Court, idle programs, and {len(cases)} oracle traces.")


def export_sounds(c, prefix, indices):
    """Write sounds `indices` of container `c`, dropping stale ones; return their files."""
    folder = PUBLIC / "sounds"
    folder.mkdir(exist_ok=True)
    sounds = []
    for index in sorted(indices):
        entry = c.sounds[index]
        wav = c.data[entry["data_offset"]:entry["data_offset"] + entry["size"]]
        if wav[:4] != b"RIFF" or wav[8:12] != b"WAVE":
            sys.exit(f"{prefix} sound {index} is not RIFF/WAVE; refusing to export.")
        filename = f"sounds/{prefix}-{index}.wav"
        write_if_changed(PUBLIC / filename, wav)
        sounds.append(dict(index=index, filename=filename))
    for path in folder.glob(f"{prefix}-*.wav"):
        if path.name not in {Path(s["filename"]).name for s in sounds}:
            path.unlink()
    return sounds


def kgt_timeline(p, action):
    """A KGT lettering's displays, following op 0x0a jumps until op 0x05 or its end: each
    with the op 0x23 blit mode in force and the op 0x03 sounds just before it, and the
    header's r[1:3], the wait the round manager counts for it (0x4068e0). A jump
    back to a record already run ends it, with `loop` the frame it repeats from."""
    current, pc = action, p.action(action).start
    frames, sounds, mode, seen, loop = [], [], 0, {}, None
    for _ in range(1000):
        if pc >= p.action(current).end or p.records[pc][0] == 0x05:
            break
        seen.setdefault(pc, len(frames))
        record = p.records[pc]
        if record[0] == 0x0a and u16(record, 1):
            current = u16(record, 1)
            pc = p.action(current).start + record[3]
            if pc in seen:
                loop = seen[pc]
                break
            continue
        if record[0] == 0x03:
            sounds.append(u16(record, 2))
        elif record[0] == 0x23:
            mode = record[1]
        elif record[0] == 0x0c:
            f = display_record(p, pc)
            frame = dict(pc=pc, image=f["image"], duration=f["duration"], dx=f["dx"], dy=f["dy"], mode=mode)
            frames.append(dict(frame, sounds=sounds) if sounds else frame)
            sounds = []
        pc += 1
    timeline = dict(wait=u16(p.records[p.action(action).start], 1), frames=frames)
    return timeline if loop is None else dict(timeline, loop=loop)


def export_ui():
    data = (RESEARCH / "extracted/SCWU.KGT").read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != "2d49a4702cd3775f063a83dbfda94a950e7d7f1dca201522756960f31080b772":
        sys.exit("SCWU UI source hash differs from the handoff; refusing to export.")
    c = Container(data)
    p = Program(c)
    # The letterings the round manager spawns (0x408c80-0x408e03, 0x409444): the
    # round-start animation's logo wipe (13 spawns 115 on Vs. CPU's path, PC 94),
    # rounds 1-5's 'DRESS 1'-'DRESS 5' (the word at 0x4451c4 + round x 2,
    # 0x408d70: 15-19), 'SHOW TIME' (25) and the KO lettering (26), which YOU
    # WIN, YOU LOSE, DRAW and DOUBLE KO (28, 29, 32, 33) repeat. Between rounds
    # (state 900, 0x4096c0) KGT 14 counts its 50 ticks while its 116 (PC 103)
    # wipes the logo back in and holds it. The result states wait out 1P/2P WIN
    # (30, 31), PERFECT (27) and DRAW/DOUBLE KO (32, 33), which show nothing
    # or jump to 26.
    wait = lambda action: u16(p.records[p.action(action).start], 1)
    ko = kgt_timeline(p, 26)
    calls = dict(start=wait(13), logo=kgt_timeline(p, 115), rounds=[kgt_timeline(p, 15 + i) for i in range(5)],
                 fight=kgt_timeline(p, 25), transition=dict(kgt_timeline(p, 116), wait=wait(14)),
                 results=dict(win=wait(30), perfect=wait(27), draw=wait(32)))
    timelines = [ko, calls["logo"], *calls["rounds"], calls["fight"], calls["transition"]]
    sounds = export_sounds(c, "kgt", {i for t in timelines for f in t["frames"] for i in f.get("sounds", [])})
    # 17–20: stock digits EMPTY/100/200/300; 31–38: gauge shimmer; 135: UNDER PW.
    ids = {17, 18, 19, 20, 24, 25, 26, 27, 28, 29, 30, 39, 40, 41, 135, 146}
    ids.update(range(31, 39))
    ids.update(range(47, 93, 5))
    ids.update(f["image"] for t in timelines for f in t["frames"] if c.images[f["image"]].width > 1)
    (PUBLIC / "ui").mkdir(exist_ok=True)
    images = []
    for index in sorted(ids):
        record = c.images[index]
        pixels, palette, _ = c.pixels_and_palette(index)
        filename = f"ui/{index}.png"
        write_if_changed(PUBLIC / filename, indexed_png(record.width, record.height, pixels, palette, True))
        images.append(dict(index=index, width=record.width, height=record.height, filename=filename))
    write_json(GENERATED / "ui.json", dict(source_sha256=digest, images=images, sounds=sounds, ko=ko, calls=calls))


if __name__ == "__main__":
    main()
