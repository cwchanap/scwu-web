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
    if op == 0x10:  # stock check (0x413500): with r[5] bit 0, stock <= min jumps to target + r[4] (NO SUPER) and
        # otherwise stock += add; without it (0x4135eb), stock >= min jumps (`atLeast`)
        return dict(op="stock", target=u16(record, 2), offset=record[4], min=record[6], add=s16(record, 7),
                    atLeast=not record[5] & 1)
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
    # evaluates player variables 0 (EX mode), 1 (a double jump or air dash), 2 (a finisher's
    # hit effect, ALEX's reflect), 4 (Kiki's K' follow-up), 6 (an IORI cancel), 7 (DIDO's
    # en300 probe), 12 (EX Fire 2), 13 (ERUS's coins and hounds) and 15 (SEAN's cc hit,
    # which only the Team VS actions set) and global 6 (the freeze); other tests keep
    # their fall-through path.
    # Below 0x40 its variable is the object's own ([esi + 0x131], 0x4137d9), which r[5] & 3 sets (1) or adds
    # to (2) before any check (`pre`): YINAN's Fist S counts its passes in its variable 0 (PCs 6304, 6315–6317,
    # 6327), as p90 does (PCs 5294–5328). With r[5] bit 0x80 the operand comes from r[6] instead
    # (0x413813–0x4138cf): 0xc7 is the round (0x470044), which each 開始時 sets its variable 1 to and tests for 1
    # (Ryuko's PCs 290, 305). ponytail: the others are positions, so Flash Att's (PCs 5785–5786) keep their
    # fall-through.
    if op == 0x1f and record[4] >> 6 == 0 and record[5] & 0x80 and record[6] == 0xc7 and record[5] & 3 == 1 \
            and record[5] & 0xc:
        return dict(test_event(record), pre=dict(value=0, add=False, round=True))
    if op == 0x1f and record[4] >> 6 == 0 and not record[5] & 0x80 and (record[5] & 3) in (1, 2):
        pre = dict(value=s16(record, 7), add=record[5] & 3 == 2)
        return dict(test_event(record), pre=pre) if record[5] & 0xc else dict(op="local", index=record[4], **pre)
    if op == 0x1f and record[4] >> 6 == 0 and not record[5] & 0x80 and record[5] & 0xc and not record[5] & 3:
        return test_event(record)
    if op == 0x1f and record[5] & 0xc and not record[5] & 3 and record[4] in (0x40, 0x41, 0x42, 0x44, 0x46, 0x47,
                                                                              0x4c, 0x4d, 0x4f, 0x83, 0x86):
        return test_event(record)
    if op == 0x1f and record[4] == 0x86 and record[5] in (1, 2):  # global 6 (0x4456bc) = (1) or += (2) r[7:9], the freeze
        return dict(op="freeze", add=s16(record, 7), **({"set": True} if record[5] == 1 else {}))
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


def test_event(record):
    return dict(op="test", selector=record[4], compare=record[5] >> 2 & 3, value=s16(record, 9),
                action=u16(record, 1), offset=record[3])


def loops(p, index):
    """Whether an action ends jumping back into itself."""
    record = p.records[p.action(index).end - 1]
    return record[0] == 0x0a and u16(record, 1) == index


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


def calls_displays(p, record):
    """Whether flatten inlines this op 0x09 or 0x0b call: every op 0x09, and an
    op 0x0b into an action with displays."""
    if record[0] == 0x09:
        return True
    called = p.action(u16(record, 1)) if u16(record, 1) else None
    return called is not None and any(p.records[pc][0] == 0x0c for pc in range(called.start, called.end))


def flatten(p, c, index, played=(), offset=0, reactions=()):
    """Linearize one action for playback by the match.

    Inlines op 0x09 calls with their repeat counts, entering and repeating at
    the action's r[4] (0x4129a9, 0x4126ae), and follows op 0x0a jumps. A
    jump back to an executed PC marks a loop; a jump from a super into a basic
    action (below 250), into an action the match plays as its own clip
    (`played`) or from a move into one of the player's `reactions` ends the
    timeline with `next`. Conditions (0x10, 0x11, 0x16,
    0x1f, 0x20) are exported or skipped, never evaluated: their fall-through
    path is the super's normal path, and the match takes an op 0x16, 0x1f or
    0x20 branch by switching to its target's own timeline. An op 0x0b call
    into an action with displays runs once from its r[3] (0x412a2f) and returns
    after it (0x412625); one into an action without stays an event, whose
    records the match runs at once. `offset` starts at a branch's jump target; one past the action's
    end runs out at once (0x4125ea).
    Like a clip's, each display also carries the op 0x03, 0x04, 0x0e, 0x1f and
    0x25 events run just before it, for reactions drawn from their timelines.
    """
    frames, events, bodies, pending = [], [], {}, []
    # A jump keeps the body boxes (only 0x410cf0 clears them), so a branch into
    # its own action, as Zoma's run loops, starts with those its earlier records set.
    for pc in range(p.action(index).start, min(p.action(index).start + offset, p.action(index).end)):
        if p.records[pc][0] == 0x19:
            bodies = body_boxes(bodies, p.records[pc])
        elif p.records[pc][0] in (0x07, 0x14):
            bodies = {}
    t, pc, stack, seen, seen_events = 0, p.action(index).start + offset, [], {}, {}
    action = index
    # The player variables this path has set (op 0x1f r[5] = 1).
    known = {}
    result = dict(loop=-1, end="end", next=None)
    for _ in range(20000):
        a = p.action(action)
        if pc >= a.end:
            if not stack:
                break
            ret, called, remaining, caller, entry = stack[-1]
            if remaining > 1:
                stack[-1] = (ret, called, remaining - 1, caller, entry)
                # Re-entered from +0x7d (0x4126ae), even after a jump left it.
                action, pc = called, p.action(called).start + entry
            else:
                stack.pop()
                pc, action = ret, caller
            continue
        record = p.records[pc]
        op = record[0]
        if not stack and pc not in seen:
            seen[pc], seen_events[pc] = len(frames), len(events)
        # Ops 0x07 and 0x14 clear the holder's boxes and bodies (0x40e550) as an action change
        # does, until op 0x19 sets them again. ponytail: they run only once a contact has set
        # +0xdef9 and only for a player, which every holder here is.
        if op in (0x07, 0x14):
            bodies = {}
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
        elif op in (0x09, 0x0b) and calls_displays(p, record):
            count, called, entry = (record[1], u16(record, 2), record[4]) if op == 0x09 else (1, u16(record, 1), record[3])
            if count:
                stack.append((pc + 1, called, count, action, entry))
                action, pc = called, p.action(called).start + entry
                continue
        elif op == 0x0a and u16(record, 1):
            target = u16(record, 1)
            dest = p.action(target).start + record[3]
            if not stack and dest in seen:
                # The loop's first frame, and its first record's event.
                result.update(loop=seen[dest], loopEvent=seen_events[dest], end="loop")
                break
            if target < 250 <= index or target in played or target in reactions and index not in reactions:
                result.update(end="jump", next=target, offset=record[3])
                break
            action, pc = target, dest
            continue
        elif op == 0x05 and stack:
            # A player's runs its action out (0x412625), returning from the
            # call: AYA's Rocket Hit2 att1 and att2 (294, 295), which Rocket
            # Hit2 calls 18 times (PCs 4097–4132), end each burst with one
            # (PCs 4194, 4239). ponytail: another object's deletes it, but no
            # exported object's calls reach one.
            pc = a.end
            continue
        elif op == 0x05:
            # It ends a player's action and deletes any other object (0x412617).
            result["end"] = "delete"
            break
        elif op == 0x19:
            bodies = body_boxes(bodies, record)
        elif op == 0x1f and stack and record[4] >> 6 == 1 and not record[5] & 0x83 and record[4] & 0x3f in known \
                and u16(record, 1) not in {action, *(s[1] for s in stack)} and not loops(p, u16(record, 1)):
            # A check in a call of a player variable this path set, jumping out of the call into an
            # action that runs out, takes its jump inside the call, whose end then repeats or returns
            # from it (0x412617): Chung's Change EX sets variable 0 to 100 (PCs 364, 366), so each Demo
            # stand it calls plays Demo stand EX (PC 259). Set-up clears the variables (0x4121cc), so
            # the other paths' fall-through stands. ponytail: it assumes no object sets the variable
            # meanwhile, as REAR's 246 does his 7 (PC 3614) for a skip the match takes (below).
            value, against = known[record[4] & 0x3f], s16(record, 9)
            if (value == against, value > against, value < against)[(record[5] >> 2 & 3) - 1]:
                action, pc = u16(record, 1), p.action(u16(record, 1)).start + record[3]
                continue
        else:
            if op == 0x1f and record[4] >> 6 == 1 and record[5] & 3:
                if record[5] == 1:
                    known[record[4] & 0x3f] = s16(record, 7)
                else:
                    known.pop(record[4] & 0x3f, None)
            event = decode_event(record)
            # A branch can't return to a caller, so a call keeps its checks' fall-through path,
            # but for an op 0x24 in its caller's last call, whose return runs the caller out as
            # the branch's end does (0x4125ea): GIGI's Ranbu start calls Ranbu start Fin (297)
            # last (PC 4603), whose checks (PCs 4693–4697) take ↑ or ↓. ponytail: other checks
            # there keep their fall-through, Zoma's, Yo's, SOU's, HISO's, ERUS's, OS FENG's,
            # REMU's and REAR's freeze waits (op 0x1f on global 6) among them. It also keeps an
            # op 0x1f test of a player variable that jumps out of the call into an action
            # looping back into itself, which never runs out into the call (0x4125ea):
            # KATE's air fire tests variable 8 in each of its 60 hovers (PCs 3179–3180), and its
            # drops loop until landing enters their handler (0x410d50), which ends the call (+0x7c).
            # ponytail: a 0-tick hold never runs out either, but ERUS's Cerb2 (PC 3420) keeps its
            # fall-through; add holds when her hounds need it.
            if stack and op == 0x1f and record[5] & 0xc and not record[5] & 3 and record[4] >> 6 == 1 and loops(
                    p, u16(record, 1)) and u16(record, 1) not in {action, *(s[1] for s in stack)}:
                event = test_event(record)
            # A skip from a called action's last record past its end returns
            # from the call, as running out does (0x4125ea): YINAN's FB M,
            # which FB Loop calls into its freeze wait (PC 8074).
            elif event and stack and event["op"] == "test" and event["action"] == action and (
                    pc == p.action(action).end - 1 <= p.action(action).start + event["offset"]):
                event = None
            # A test that skips forward within the called action rejoins the
            # fall-through, as its rolls do (below): ALPHA's No super rp skips
            # its power while variable 12 is 0 (PC 4475).
            elif event and stack and event["op"] == "test" and event["action"] == action and (
                    p.action(action).start + event["offset"] > pc):
                event = dict(event, called=True)
            elif event and stack and event["op"] in ("input", "test", "command") and not (
                    event["op"] == "command" and len(stack) == 1 and stack[0][2] == 1
                    and stack[0][0] >= p.action(stack[0][3]).end):
                event = None
            # Its rolls jump within the called action, rejoining the
            # fall-through at its next display (flatten_queue checks): Giant's
            # super base ball picks a ball (PC 5358).
            if event and stack and event["op"] == "random":
                event = dict(event, called=True)
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
    # (+0x22–0x28) and ten u16 steps (+0x2a), kept through the last marked 0x2000,
    # then a u16 for each step (+0x3e), which a typed step (bits 14–15) reads:
    # ZIRO's TWIN SHOT turns the stick once (0x41062a).
    count = struct.unpack_from("<I", data, c.common_end)[0]
    if not 0 < count < 64:
        sys.exit("Unexpected command table layout; refusing to export.")
    commands = []
    for i in range(count):
        entry = c.common_end + 4 + 82 * i
        window, air, near, far, crouch, *steps = struct.unpack_from("<15H", data, entry + 0x20)
        params = struct.unpack_from("<10H", data, entry + 0x3e)
        last = max((k for k, step in enumerate(steps) if step & 0x2000), default=-1)
        typed = any(step & 0xc000 for step in steps[:last + 1])
        commands.append(dict(name=data[entry:entry + 0x20].split(b"\0")[0].decode("cp932").strip(),
                             window=window, air=air, near=near, far=far, crouch=crouch, steps=steps[:last + 1],
                             **({"params": params[:last + 1]} if typed else {})))
    # The response table after it (player +0x6daa), as many entries as its count
    # says (0x403b87): 83 in most players, 84 in ANMC P's.
    response_offset = c.common_end + 4 + count * 82 + 4
    response_count = struct.unpack_from("<I", data, response_offset - 4)[0]
    if not 83 <= response_count <= 0x320 // 4:
        sys.exit("Unexpected response table layout; refusing to export.")
    # Op 0x07 replaces a held fighter's display with an entry of this 15 x 6-byte
    # table (image, dx, dy), read by the engine into player offset 0x70ca.
    held_offset = response_offset + response_count * 4 + 4
    if struct.unpack_from("<I", data, held_offset - 4)[0] != 15:
        sys.exit("Unexpected held-pose table layout; refusing to export.")
    held = []
    for i in range(15):
        packed, dx, dy = struct.unpack_from("<Hhh", data, held_offset + i * 6)
        image = c.images[packed & 8191]
        held.append(dict(image=packed & 8191, dx=dx, dy=dy, width=image.width, height=image.height))
        if packed & 8191:
            image_ids.add(packed & 8191)
    # Each response entry: the victim action for that response id, then the
    # hit-effect action 0x40f567 spawns.
    responses = [u16(data, response_offset + 4 * i) for i in range(response_count)]
    response_effects = [u16(data, response_offset + 4 * i + 2) for i in range(response_count)]
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
    # (0x41080e), in source pixels, and the u16 at +0x7caa is the life. Round 1
    # sets the power per stock from its u32 at +0x7cae and the stock cap from
    # +0x7cb2 (0x411f50–0x411f64), which 0x40e6f0 fills to.
    block = cpu_offset - 10 + 0x2b66 - 0x757a
    near = struct.unpack_from("<h", data, block + 0x7ca3)[0]
    life = u16(data, block + 0x7caa)
    per_stock, stocks = struct.unpack_from("<II", data, block + 0x7cae)
    # The select screen runs the default-action table's word 21 (+0x75a4,
    # 0x407a2a) while the player's cell is hovered: キャラセレフェイス. A
    # fighter's set-up enters its word 17 (+0x759c, 0x412180): 開始時.
    return dict(held=held, responses=responses, response_effects=response_effects, cpu=cpu,
                commands=dict(near=near, entries=commands), life=life, perStock=per_stock, stocks=stocks,
                selectFace=u16(data, block + 0x75a4), start=u16(data, block + 0x759c))


def jump_target(record):
    """The (action, offset) an op 0x09, 0x0a, 0x0b, 0x16, 0x1f, 0x20 or 0x24 may enter, decoded or not."""
    event = decode_event(record) or {}
    if record[0] in (0x16, 0x20, 0x24) or event.get("op") == "test":
        return event.get("action"), event.get("offset")
    if record[0] == 0x09:
        return u16(record, 2), record[4]
    return (u16(record, 1), record[3]) if record[0] in (0x0a, 0x0b, 0x1f) else None


def select_program(p, face, image_ids):
    """The raw records the select screen runs for a player (select.ts): its select
    face and every action that spawns, jumps to or tests into, by action, adding the
    images they show."""
    actions, todo = {}, [face]
    while todo:
        index = todo.pop()
        if not index or index in actions:
            continue
        action = p.action(index)
        actions[index] = [list(r) for r in p.records[action.start:action.end]]
        for pc in range(action.start, action.end):
            record = p.records[pc]
            if record[0] == 0x0c:
                image = display_record(p, pc)["image"]
                if image not in (0, 8191):
                    image_ids.add(image)
            elif record[0] == 0x04:
                todo.append(u16(record, 2))
            elif record[0] == 0x0a or record[0] == 0x1f and record[5] & 0xc:
                todo.append(u16(record, 1))
    return dict(face=face, actions={str(i): records for i, records in sorted(actions.items())})


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
        pc = action.start - 1
        while (pc := pc + 1) < action.end:
            # An op 0x0a forward within the action skips the records between:
            # ANMC P's WIN (PC 579) passes the sound its roll plays instead.
            if p.records[pc][0] == 0x0a and u16(p.records[pc], 1) == index and pc < action.start + p.records[pc][3]:
                pc = action.start + p.records[pc][3] - 1
            # One back ends it, unless the action jumps past it: SHIN-Z's 勝ち
            # loops from PC 698 (PC 701) before a display nothing reaches (PC
            # 703), where each Black's test of variable 14 jumps past its loop.
            elif p.records[pc][0] == 0x0a and u16(p.records[pc], 1) == index and not any(
                    target and target[0] == index and action.start + target[1] > pc
                    for target in map(jump_target, p.records[action.start:action.end])):
                break
            elif p.records[pc][0] == 0x19:
                bodies = body_boxes(bodies, p.records[pc])
            elif p.records[pc][0] == 0x23 and pc >= action.start + offset:
                color = {k: v for k, v in color_state(p.records[pc]).items() if k != "op"}
            # The idle also carries its op 0x15, which the match runs at the
            # display's age: TRAINING's (PC 24).
            elif (p.records[pc][0] in (0x03, 0x04, 0x0e, 0x1e, 0x1f, 0x25) or p.records[pc][0] == 0x15
                  and name == "idle") and pc >= action.start + offset:
                event = decode_event(p.records[pc])
                if event and (event["op"] in POSE_EVENTS or event["op"] == "power"):
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


def flatten_queue(p, c, queue, played, image_ids, reactions=(), named=None):
    """Flatten every queued (action, offset) and whatever its events spawn, call or branch into.
    `named`, when given, holds the played actions the match enters by name (its engine states
    and reactions); it enters any other by its timeline."""
    scripts = {}
    while queue:
        index, offset = key = queue.pop()
        if key in scripts:
            continue
        script = scripts[key] = flatten(p, c, index, played, offset, reactions)
        image_ids.update(f["image"] for f in script["frames"] if f["image"] not in (0, 8191))
        # A timeline's last jump enters its target, unless played as a clip
        # from its start (the match enters a reaction at any offset): ZENKA's
        # J cancel jumps into her jump + 22 (PC 3187). LIZARD's Round 1 ends
        # in OP lend (36, PC 392), his Br. intro's clip, which the match
        # can't name.
        if script["end"] == "jump" and (script["next"] not in played or named is not None and script["next"] not in named or
                                        script["offset"] and script["next"] not in reactions):
            queue.append((script["next"], script["offset"]))
        for event in script["events"]:
            if event["op"] == "spawn" and event["action"]:
                queue.append((event["action"], event["offset"]))
            if event["op"] == "spawn" and event["busy"]:
                queue.append((event["busy"], event["busyOffset"]))
            # A landing or wall handler (slot 1 or 4) not played as a clip runs
            # its timeline: Yo's Press Hit enters 239 + 15 (PC 3291).
            if event["op"] == "handler" and event["slot"] in (1, 4) and event["action"] not in played:
                queue.append((event["action"], event["offset"]))
            if event["op"] == "handler" and event["slot"] in (2, 3):
                queue.append((event["action"], event["offset"]))
            if event["op"] in ("random", "input", "test", "command") and event["action"]:
                queue.append((event["action"], event["offset"]))
            if event["op"] == "call":
                queue.append((event["action"], 0))
            if event["op"] in ("stock", "life") and event["target"]:
                queue.append((event["target"], event["offset"]))
    for (index, _), script in scripts.items():
        for event in script["events"]:
            rejoin = next((f["pc"] for f in script["frames"] if f["t"] >= event["t"]), None)
            if event.get("called") and scripts[event["action"], event["offset"]]["frames"][0]["pc"] != rejoin:
                sys.exit(f"Action {index}'s {event['op']} in a call doesn't rejoin its path; refusing to export.")
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
        # One with its own palette (flag 1) keeps it whichever the player draws with.
        images.append(dict(index=index, width=record.width, height=record.height, filename=filename,
                           **({"own": True} if record.flags & 1 else {})))
    for path in (PUBLIC / folder).glob("*.png"):
        if path.stem not in {str(index) for index in image_ids}:
            path.unlink()
    return images


def export_palettes(c, image_ids):
    """The player's eight palettes (+0x11c, 0x420 bytes apart), which its objects draw with by the
    palette the select chose (0x40ccf2), as each palette's 0xRRGGBB for every colour the images without
    their own palette show in palette 0. Black, which draws nothing, is left out."""
    def rgb(palette, i):
        b, g, r = c.palette_bank[palette * 0x420 + i * 4:palette * 0x420 + i * 4 + 3]
        return r << 16 | g << 8 | b
    used = set()
    for index in image_ids:
        record = c.images[index]
        if record.width and record.height and not record.flags & 1:
            used.update(c.decode(index))
    rows = {}
    for i in sorted(used):
        row = [rgb(palette, i) for palette in range(8)]
        if row[0] and rows.setdefault(row[0], row) != row:
            sys.exit(f"Palette 0's {row[0]:06x} stands for two colours; refusing to export.")
    return list(rows.values())


def write_if_changed(path, content):
    # Avoid restarting a running Vite match when checks regenerate identical assets.
    if not path.exists() or path.read_bytes() != content:
        path.write_bytes(content)


def write_json(path, value):
    write_if_changed(path, (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf8"))


def counter_records(p, index):
    """The PCs of the op 0x1f records on variables 2 and 4 that open one of
    Giant's or ERUS's reactions, before its first display (PCs 723, 744,
    ...; ERUS's 787, 789, ...)."""
    action, pcs = p.action(index), []
    for pc in range(action.start + 1, action.end):
        record = p.records[pc]
        if record[0] == 0x0c:
            break
        if record[0] == 0x1f and record[4] in (0x42, 0x44):
            pcs.append(pc)
    return pcs


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


def gameplay(p, index, skip=()):
    """An action's display lengths and gameplay records, without the action
    numbers and record offsets they name, which each container lays out its
    own way (an op 0x1e of type 1 names one), a header's level, an op 0x1e of
    mode 0 (no window), a set's unused compare value or the records at `skip`."""
    action, out = p.action(index), []
    for pc in range(action.start + 1, action.end):
        if pc in skip:
            continue
        record = bytearray(p.records[pc])
        op = record[0]
        if op == 0x0c:
            out.append(("display", display_record(p, pc)["duration"]))
        if op in (0x03, 0x04, 0x0c, 0x0e, 0x19, 0x23, 0x25) or op == 0x1e and not record[1] & 7:
            continue
        if op == 0x1f and record[5] == 1:
            record[9:] = bytes(len(record) - 9)
        if op == 0x1e and record[1] >> 3 & 7 == 1:
            record[3:5] = bytes(2)
        if op in ACTION_REFERENCES:
            start, end, offset = ACTION_REFERENCES[op]
            record[start:end] = bytes(end - start)
            if offset is not None:
                record[offset] = 0
        out.append(record.hex())
    return out


# Twins of Ryuko's victim actions: the response table pairs them (a response
# id selects each one's own), with their landing and follow-up actions.
ZOMA_TWINS = {
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
    # 'ヒット DRAGON Fireball' (125) plays as the uppercut (96) does; Yinan
    # (126) rises straight up.
    "dragonFireball": (125, 126), "liftUp": (126, 127), "tatumakiIn": (99, 100), "tatumakiOut": (100, 101),
    "fireLaunch": (104, 105), "flySide": (91, 92), "flySideWall": (95, 96), "twistSide": (136, 137),
    "twistFly": (93, 94), "twistWall": (94, 95), "gonMiss": (137, 138), "chuckUp": (134, 135),
    # Giant's moves': 'ヒット Fly twis' (92), 'GIANT!! MUSIC ATTACK' (133) and
    # 'Chuck 消える' (143).
    "twistSideHit": (92, 93), "musicAttack": (133, 134), "vanish": (143, 143),
    # G Suneo's EX D Driver's: 'ヒット ERUS INATUMA' (118), its rp (119) and
    # ERUS INATUMA AIR (120).
    "inatuma": (118, 119), "inatumaRp": (119, 120), "airInatuma": (120, 121),
    # 'ヒット ICE Punch' (106) and its air form (107), which play as ERUS
    # INATUMA's do.
    "icePunch": (106, 107), "airIcePunch": (107, 108),
    # SAKUYA's K3 Hit New's: 'ヒット Chain pull back' (105).
    "chainPull": (105, 106),
    # HISO's GUN SHOT's: 'ヒット HISO stop' (113), whose op 0x16 enters its air
    # form (114) off the floor (PC 1455); both play as ICE Punch's do.
    "hisoStop": (113, 114), "airHisoStop": (114, 115),
    # Yo's GIGA PRESS's: 'Chuck Yo' (140).
    "chuckYo": (140, 140),
}
# The other players lay theirs out alike, but for Kiki's KOs and lose action
# (+0x75a0: 58), one later.
KIKI_TWINS = dict(ZOMA_TWINS, ko=(60, 59), koAgain=(61, 60), down=(62, 61), lose=(59, 58))
# Chung's sit three after Zoma's, his twists four (his ★変なＴＥＣＨ, 89,
# comes before them), and his KOs and lose action as Kiki's.
CHUNG_TWINS = {name: (r, z + (4 if name in ("twist", "twisting", "twisting2") else 3))
               for name, (r, z) in ZOMA_TWINS.items()} | {
    name: KIKI_TWINS[name] for name in ("ko", "koAgain", "down", "lose")}
# Amiro's sit four after Zoma's, five for BEAM Air and the twists (her ★変な
# ＴＥＣＨ, 89, comes before them), and her KOs and lose action one after
# Kiki's.
AMIRO_TWINS = {name: (r, z + (5 if name in ("airHitRapid", "twist", "twisting", "twisting2") else 4))
               for name, (r, z) in ZOMA_TWINS.items()} | {
    name: (r, k + 2) for name, (r, k) in KIKI_TWINS.items() if name in ("ko", "koAgain", "down", "lose")}
# ANMC P's sit one after Zoma's, his Twising 2 two (his ★変なＴＥＣＨ, 89, comes
# before it), his KOs and lose action three after Ryuko's, and each guard
# before its CONO and EX forms.
ANMC_TWINS = {name: (r, z + (2 if name == "twisting2" else 1)) for name, (r, z) in ZOMA_TWINS.items()} | {
    name: (r, r + 3) for name, (r, _) in ZOMA_TWINS.items() if name in ("ko", "koAgain", "down", "lose")} | dict(
    guard=(149, 150), crouchGuard=(151, 154), airGuard=(153, 158), blockHeavy=(154, 160), crouchBlockHeavy=(156, 164),
    airBlockHeavy=(158, 168), blockStop=(159, 170), crouchBlockStop=(161, 174), blockRapid=(163, 178),
    crouchBlockRapid=(165, 182), airBlockRapid=(167, 186), timeStopGuard=(168, 188), crouchTimeStopGuard=(170, 190),
    airTimeStopGuard=(172, 192))
# Giant's sit two after Ryuko's KOs and lose action, four after her other
# reactions, five for the twists and the shock (his ★変なＴＥＣＨ, 89, comes
# before them, hers after) and from Clothes off 500 (his clothes obj 2, 107,
# comes before it), seven from Pull Back (his UNCOUNTER reactions, 126 and
# 127, come before it) and six past her Chuck Hiso (139), which he lacks.
GIANT_TWINS = {name: (r, r + next(d for top, d in ((73, 2), (85, 4), (89, 5), (103, 4), (121, 5), (139, 7), (173, 6))
                                  if r < top)) for name, (r, _) in ZOMA_TWINS.items()}
# G Suneo's sit ten after Ryuko's KOs and lose action, twelve after Ryuko's
# other reactions, thirteen from J Att to the shock (G Suneo's ★変なＴＥＣＨ,
# 89, comes before them, Ryuko's after) and eleven past Ryuko's Chuck Hiso
# (139), which G Suneo lacks.
SUNEO_TWINS = {name: (r, r + next(d for top, d in ((73, 10), (77, 12), (89, 13), (139, 12), (173, 11))
                                  if r < top)) for name, (r, _) in ZOMA_TWINS.items()}
# Yo's sit two after Zoma's, three for Twis and Twis 2 (Yo's ★変なＴＥＣＨ, 89,
# comes before them, Zoma's after), so Yo's KOs and lose action are Ryuko's.
YO_TWINS = {name: (r, z + (3 if name in ("twisting", "twisting2") else 2)) for name, (r, z) in ZOMA_TWINS.items()}
# SIN's sit three after Ryuko's KOs and lose action, four after Ryuko's other
# reactions, five for the twists and the shock (SIN's ★変なＴＥＣＨ, 89, comes
# before them, Ryuko's after) and from Clothes off 500 (SIN's clothes obj2,
# 107, comes before it).
SIN_TWINS = {name: (r, r + next(d for top, d in ((73, 3), (85, 4), (89, 5), (103, 4), (173, 5)) if r < top))
             for name, (r, _) in ZOMA_TWINS.items()}
# LIZARD's sit three after Ryuko's, four for the twists and the shock (his
# ★変なＴＥＣＨ, 89, comes before them, Ryuko's after) and two past Ryuko's
# Chuck Hiso (139), which he lacks.
LIZARD_TWINS = {name: (r, r + next(d for top, d in ((86, 3), (89, 4), (139, 3), (173, 2)) if r < top))
                for name, (r, _) in ZOMA_TWINS.items()}
# KAY's sit as Ryuko's KOs and lose action, three after her other reactions,
# four for the twists and the shock (his ★変なＴＥＣＨ, 89, comes before them),
# six from Chain pull back (his own FB, FBB and FBH, 108–110, come before it,
# two before Ryuko's) and five from Pull Back (his UNCOUNTER reactions, 124
# and 125, come before it).
KAY_TWINS = {name: (r, r + next(d for top, d in ((73, 0), (86, 3), (89, 4), (105, 3), (110, 6), (113, -2), (121, 3),
                                                  (173, 5)) if r < top)) for name, (r, _) in ZOMA_TWINS.items()}
# DIDO's sit three after Ryuko's KOs and lose action, six after her other
# reactions and seven from BEAM Stand to SHOCK INFINITY (her ★変なＴＥＣＨ,
# 89, comes before them).
DIDO_TWINS = {name: (r, r + next(d for top, d in ((73, 3), (83, 6), (89, 7), (173, 6)) if r < top))
              for name, (r, _) in ZOMA_TWINS.items()}
# SAKUYA's sit thirteen after Ryuko's KOs and lose action, nineteen after her
# other reactions, eighteen from Shock (her ★変なＴＥＣＨ, 89, comes before
# them, Ryuko's after), but for FB and FBB, which swap places (129, 128);
# twenty from Pull Back (her UNCOUNTER reactions, 139 and 140, come before
# it), nineteen past Ryuko's Chuck Hiso (139), which she lacks, and twenty
# from the guards (her *EFF GUARD, 168, comes before them).
SAKUYA_TWINS = {name: (r, r + next(d for top, d in ((73, 13), (89, 19), (110, 18), (111, 19), (112, 17), (121, 18),
                                                     (139, 20), (148, 19), (173, 20)) if r < top))
                for name, (r, _) in ZOMA_TWINS.items()}
# ALEX's sit two after Ryuko's KOs and lose action, six after her other
# reactions, seven from BEAM Stand to SHOCK INFINITY (his ★変なＴＥＣＨ, 89,
# comes before them), six from Shock, seven from Clothes off 500 (his clothes
# obj2, 109, comes before it), ten from Chain pull back (his own FB, FBB and
# FBH, 112–114, come before it, two after Ryuko's), seven from HISO stop and
# nine from Pull Back (his UNCOUNTER reactions, 128 and 129, come before it).
ALEX_TWINS = {name: (r, r + next(d for top, d in ((73, 2), (83, 6), (89, 7), (103, 6), (105, 7), (110, 10), (113, 2),
                                                   (121, 7), (173, 9)) if r < top))
              for name, (r, _) in ZOMA_TWINS.items()}
# SOU's sit five after Ryuko's KOs and lose action, ten after her other
# reactions, eleven from DOWN to SHOCK INFINITY (his ★変なＴＥＣＨ, 89, comes
# before them, Ryuko's after).
SOU_TWINS = {name: (r, r + next(d for top, d in ((73, 5), (79, 10), (89, 11), (173, 10)) if r < top))
             for name, (r, _) in ZOMA_TWINS.items()}
# HISO's sit as Ryuko's KOs and lose action, six after her other reactions,
# seven from BEAM Stand to SHOCK INFINITY (his ★変なＴＥＣＨ, 89, comes before
# them, Ryuko's after), six from Shock, but for FBB and FBH, which swap places
# (118, 117), and eight from Pull Back (his UNCOUNTER reactions, 127 and 128,
# come before it).
HISO_TWINS = {name: (r, r + next(d for top, d in ((73, 0), (83, 6), (89, 7), (111, 6), (112, 7), (113, 5), (121, 6),
                                                   (173, 8)) if r < top)) for name, (r, _) in ZOMA_TWINS.items()}
# ERUS's sit two after Ryuko's KOs and lose action, seven after her other
# reactions, eight from BEAM Stand to SHOCK INFINITY (her ★変なＴＥＣＨ, 89,
# comes before them, Ryuko's after), seven from Shock, fifteen for FB, FBB and
# FBH, which come after her DRAGON Yinan (125–127), four from HISO stop, nine
# from Pull Back (her FB, FBB and FBH and her UNCOUNTER reactions, 128 and
# 129, come before it) and eight past Ryuko's Chuck Hiso (139), which she lacks.
ERUS_TWINS = {name: (r, r + next(d for top, d in ((73, 2), (83, 7), (89, 8), (110, 7), (113, 15), (121, 4), (139, 9),
                                                   (173, 8)) if r < top)) for name, (r, _) in ZOMA_TWINS.items()}
# OS FENG's sit nine after Ryuko's KOs and lose action, seventeen after her
# other reactions up to SHOCK INFINITY (his ★変なＴＥＣＨ, 89, comes before
# them, Ryuko's after), sixteen from Shock, seventeen from Clothes off 500
# (his second clothes obj, 119, comes before it) and sixteen past Ryuko's
# Chuck Hiso (139), which he lacks.
FENG_TWINS = {name: (r, r + next(d for top, d in ((73, 9), (89, 17), (103, 16), (140, 17), (173, 16)) if r < top))
              for name, (r, _) in ZOMA_TWINS.items()}
# SEAN's sit one after Ryuko's KOs and lose action, five after her other
# reactions up to BEAM Stand, six from BEAM air to SHOCK INFINITY (his
# ★変なＴＥＣＨ, 89, comes between his BEAM Stand and BEAM Air, Ryuko's after
# SHOCK INFIN), five from Shock, seven from Clothes off 500 (his CLOTHES OBJ2
# and OBJ3, 108 and 109, come before it), six past Ryuko's Chuck Hiso (139),
# which he lacks, and seven from the guards (his *gard eff, 155, comes before
# them).
SEAN_TWINS = {name: (r, r + next(d for top, d in ((73, 1), (84, 5), (89, 6), (103, 5), (140, 7), (149, 6), (173, 7))
                                 if r < top)) for name, (r, _) in ZOMA_TWINS.items()}
# GON's sit ten after Ryuko's KOs and lose action, thirteen after her light
# hits and her heavy standing one (his ★変なＴＥＣＨ, 89, comes after them),
# fourteen from the heavy air hit to SHOCK INFINITY (Ryuko's ★ comes after
# it), thirteen from Shock, fifteen from Pull Back (his UNCOUNTER DOWN and Air
# Fire, 134 and 135, come before it) and fourteen past Ryuko's Chuck Hiso
# (139), which he lacks.
GON_TWINS = {name: (r, r + next(d for top, d in ((73, 10), (76, 13), (89, 14), (121, 13), (139, 15), (173, 14))
                                if r < top)) for name, (r, _) in ZOMA_TWINS.items()}
# KATE's sit where Ryuko's do for her KOs and lose action, six after her
# other reactions up to Hit Up Shack (88), seven from BEAM Stand to SHOCK
# INFINITY (her ★変なＴＥＣＨ, 89, comes before them, Ryuko's after), six from
# Shock, fourteen for FB, FBB and FBH, which come after her ERUS INATUMA air
# (123), three from HISO stop, eight from Pull Back (her FB, FBB and FBH and
# her UNCOUNTER reactions, 127 and 128, come before it), seven past Ryuko's
# Chuck Hiso (139), which she lacks, and eight from the guards (her *gard
# eff, 156, comes before them).
KATE_TWINS = {name: (r, r + next(d for top, d in ((73, 0), (83, 6), (89, 7), (110, 6), (113, 14), (121, 3), (139, 8),
                                                   (149, 7), (173, 8)) if r < top)) for name, (r, _) in ZOMA_TWINS.items()}
# REMU's sit two after Ryuko's KOs and lose action, six after his other
# reactions up to Hit Up Shack (88), seven from BEAM Stand to SHOCK INFINITY
# (his ★変なＴＥＣＨ, 89, comes before them, Ryuko's after), six from Shock
# to clothes obj (108), eight from Clothes off500 to rambu stop AIR (his
# clothes obj 2 and 3, 109–110, come before them), sixteen for FB, FBB and
# FBH, which come after his ERUS INATUMA AIR (125), five from HISO stop to
# ERUS INATUMA AIR, and ten from Pull Back (his FB, FBB and FBH and his
# UNCOUNTER reactions, 129 and 130, come before it).
REMU_TWINS = {name: (r, r + next(d for top, d in ((73, 2), (83, 6), (89, 7), (103, 6), (110, 8), (113, 16), (121, 5),
                                                   (173, 10)) if r < top)) for name, (r, _) in ZOMA_TWINS.items()}
# REAR's sit one after Ryuko's KOs and lose action, five after his other
# reactions up to BEAM Stand (88), six from BEAM air to SHOCK INFINITY (his
# ★変なＴＥＣＨ, 89, comes between them), five from Shock to Chuck OGI BALL
# (143), four from Chuck Yo, past Ryuko's Chuck Hiso (139), which he lacks,
# and five from the guards (his *gard eff, 153, comes before them).
REAR_TWINS = {name: (r, r + next(d for top, d in ((73, 1), (84, 5), (89, 6), (139, 5), (149, 4), (173, 5)) if r < top))
              for name, (r, _) in ZOMA_TWINS.items()}
# GIGI's sit two before Ryuko's KOs and lose action, two after his other
# reactions, three for Twis 2 and SHOCK INFINITY (his ★変なＴＥＣＨ, 89, comes
# between Twis and Twis 2), two from Shock, three from Clothes off500 (his
# Clothes obj 2, 105, comes before it), six from Chain pull back (his own FB,
# FBB and FBH, 108–110, come before it, two before Ryuko's), three from HISO
# stop, five from Pull Back (his UNCOUNTER reactions, 124 and 125, come
# before it) and four past Ryuko's Chuck Hiso (139), which he lacks.
GIGI_TWINS = {name: (r, r + next(d for top, d in ((73, -2), (87, 2), (89, 3), (103, 2), (105, 3), (110, 6), (113, -2),
                                                   (121, 3), (139, 5), (173, 4)) if r < top))
              for name, (r, _) in ZOMA_TWINS.items()}
# SWW's sit one before Ryuko's KOs and lose action, two after his other
# reactions, three for Twis 2 and SHOCK INFINITY (his ★変なＴＥＣＨ, 89, comes
# between Twis and Twis 2), two from Shock to ICE Punch air, five for the
# rambu stops (his own FB, FBB and FBH, 110–112, come before them, where
# Ryuko's are), two from HISO stop, four from Pull Back (his UNCOUNTER
# reactions, 123 and 124, come before it) and three past Ryuko's Chuck Hiso
# (139), which he lacks.
SWW_TWINS = {name: (r, r + next(d for top, d in ((73, -1), (87, 2), (89, 3), (108, 2), (110, 5), (113, 0), (121, 2),
                                                  (139, 4), (173, 3)) if r < top))
             for name, (r, _) in ZOMA_TWINS.items()}
# OGI's sit four after Ryuko's KOs and lose action, seven after his other
# reactions up to HIT UP, eight from Hit Up Shack to SHOCK INFINITY (his ★変な
# ＴＥＣＨ, 89, comes before them, Ryuko's after), seven from Shock to Hisa
# side wall (102), eight from Clothes off500 (his CLOTHES OBJ1, 109, comes
# before his clothes obj) and seven past Ryuko's Chuck Hiso (139), which he
# lacks.
OGI_TWINS = {name: (r, r + next(d for top, d in ((73, 4), (82, 7), (89, 8), (102, 7), (139, 8), (173, 7)) if r < top))
             for name, (r, _) in ZOMA_TWINS.items()}
# ZIRO's sit eight after Ryuko's KOs and lose action (his KO down 2 and 3,
# random lose, make hikari and KO Stop, 71–77, come after them), seventeen
# after his other reactions up to SHOCK INFINITY, sixteen from Shock to his
# clothes obj1 (118; his Clother obj 2, 119, comes after it), seventeen from
# Clothes off500 and sixteen past Ryuko's Chuck Hiso (139), which he lacks,
# as he does a ★変なＴＥＣＨ.
ZIRO_TWINS = {name: (r, r + next(d for top, d in ((73, 8), (89, 17), (103, 16), (139, 17), (173, 16)) if r < top))
              for name, (r, _) in ZOMA_TWINS.items()}
# MASA's sit thirty-seven after Ryuko's KOs and lose action, thirty-nine from
# KO DOWN (his KO 2 and KO 2 2nd, 99–100, come before his KO down), forty-
# seven after his other reactions up to SHOCK INFINITY, forty-six from Shock
# (his ★変なＴＥＣＨ, 89, sits among his basic actions) and forty-five past
# Ryuko's Chuck Hiso (139), which he lacks.
MASA_TWINS = {name: (r, r + next(d for top, d in ((62, 37), (73, 39), (89, 47), (139, 46), (173, 45)) if r < top))
              for name, (r, _) in ZOMA_TWINS.items()}
# 3-TIMES's sit thirty-six after Ryuko's KOs and lose action, thirty-eight
# from KO DOWN (his KO 2 and KO 2 2nd, 98–99, come before his KO down),
# forty-four after his other reactions up to SHOCK INFINITY, forty-three from
# Shock (his ★変なＴＥＣＨ, 89, sits among his basic actions) and forty-two
# past Ryuko's Chuck Hiso (139), which he lacks; his guards follow one another
# from 191, without Ryuko's COUNTER NO forms between them.
TIMES_TWINS = {name: (r, r + next(d for top, d in ((62, 36), (73, 38), (89, 44), (139, 43), (149, 42)) if r < top))
               for name, (r, _) in ZOMA_TWINS.items() if r < 149} | {
    name: (r, 191 + i) for i, (r, name) in enumerate(sorted((r, n) for n, (r, _) in ZOMA_TWINS.items() if r >= 149))}
# ZENKA's sit nineteen after Ryuko's KOs and lose action (he has no WIN
# STAND), twenty-two after his other reactions up to SHOCK INFINITY, twenty-one
# from Shock (his ★変なＴＥＣＨ, 89, sits among his basic actions), twenty past
# Ryuko's Chuck Hiso (139), which he lacks, and twenty-one again from her DOWN
# header (144), past his blank 164.
ZENKA_TWINS = {name: (r, r + next(d for top, d in ((73, 19), (89, 22), (139, 21), (144, 20), (173, 21)) if r < top))
               for name, (r, _) in ZOMA_TWINS.items()}
# Z-MEGA's sit eight after Ryuko's KOs and lose action (his Win2, 66, takes
# WIN STAND's place), twelve after her other reactions up to the heavy air hit,
# thirteen from J Att to SHOCK INFINITY (his ★変なＴＥＣＨ, 89, sits before
# them, hers after), twelve from Shock, eleven past her Chuck Hiso (139), which
# he lacks, and twelve again from her DOWN header (144), past his RAMDOM GET UP
# (156); his guards follow one after another from 162, as 3-TIMES's.
ZMEGA_TWINS = {name: (r, r + next(d for top, d in ((63, 8), (77, 12), (89, 13), (139, 12), (144, 11), (149, 12))
                                  if r < top))
               for name, (r, _) in ZOMA_TWINS.items() if r < 149} | {
    name: (r, 162 + i) for i, (r, name) in enumerate(sorted((r, n) for n, (r, _) in ZOMA_TWINS.items() if r >= 149))}
# ALPHA's sit thirty-eight after Ryuko's reactions up to SHOCK INFINITY (his
# ★変なＴＥＣＨ, 89, sits among his KOs), thirty-seven from Shock, thirty-eight
# from Clothes off500 (his clothes obj2, 140, follows his clothes obj) and
# thirty-seven past her Chuck Hiso (139), which he lacks. His lose action is 負け
# (83), which falls through to KO NORMAL (88, PC 1032); his KO Boss forms
# (84–87) come before it, and its 2nd (90) and KO down after his ★.
ALPHA_TWINS = {name: (r, r + next(d for top, d in ((89, 38), (103, 37), (139, 38), (173, 37)) if r < top))
               for name, (r, _) in ZOMA_TWINS.items()} | dict(lose=(59, 83), ko=(60, 88), koAgain=(61, 90), down=(62, 91))
# SHIN-Z's sit nine after Ryuko's KOs and lose action, fourteen after her light
# hits, fifteen from the heavy ones to SHOCK INFINITY (his ★変なＴＥＣＨ, 89,
# sits among them), fourteen from Shock, thirteen past her Chuck Hiso (139),
# which he lacks, and fourteen again from her DOWN header (144), past his
# RAMDOM GET UP (158); his guards follow one after another from 164, as
# Z-MEGA's.
SHINZ_TWINS = {name: (r, r + next(d for top, d in ((73, 9), (75, 14), (89, 15), (139, 14), (144, 13), (149, 14))
                                  if r < top))
               for name, (r, _) in ZOMA_TWINS.items() if r < 149} | {
    name: (r, 164 + i) for i, (r, name) in enumerate(sorted((r, n) for n, (r, _) in ZOMA_TWINS.items() if r >= 149))}
# ZAKU's sit one before Ryuko's KOs and lose action, then as SHIN-Z's to her
# Chuck Hiso (139), which he lacks too, and thirteen on through her DOWN
# section; his guards follow one after another from 162.
ZAKU_TWINS = {name: (r, r + next(d for top, d in ((73, -1), (75, 14), (89, 15), (139, 14), (149, 13)) if r < top))
              for name, (r, _) in ZOMA_TWINS.items() if r < 149} | {
    name: (r, 162 + i) for i, (r, name) in enumerate(sorted((r, n) for n, (r, _) in ZOMA_TWINS.items() if r >= 149))}
# GOLF's sit thirteen before ZAKU's KOs and lose action and twenty-eight before
# his reactions; twenty-nine from the heavy hits to Clothes off500, since the
# ★変なＴＥＣＨ every player keeps at 89 follows them in GOLF's file and sits
# among them in ZAKU's; twenty-eight again from Fire Hisa; and twenty-seven
# from the DOWN header, past an empty action (129).
GOLF_TWINS = {name: (r, z - next((d for top, d in ((73, 13), (89, 28), (118, 29), (157, 28)) if z < top), 27))
              for name, (r, z) in ZAKU_TWINS.items()}
# ASURA's sit as GOLF's to Chuck 消える (128), then one before them from the
# DOWN header, since he lacks GOLF's empty 129.
ASURA_TWINS = {name: (r, g - (g > 129)) for name, (r, g) in GOLF_TWINS.items()}
# TTRO's sit at Ryuko's KOs and lose action, one after her other reactions,
# two for SHOCK INFINITY (his ★変なＴＥＣＨ, 89, sits before it, hers after),
# and level with them past her Chuck Hiso (139), which he lacks; his guards
# follow one after another from 149.
TTRO_TWINS = {name: (r, r + next(d for top, d in ((73, 0), (88, 1), (89, 2), (139, 1), (149, 0)) if r < top))
              for name, (r, _) in ZOMA_TWINS.items() if r < 149} | {
    name: (r, 149 + i) for i, (r, name) in enumerate(sorted((r, n) for n, (r, _) in ZOMA_TWINS.items() if r >= 149))}
# ASTROMAN's sit one before Ryuko's, two for her Shock rp (his Shock, 88,
# since his ★変なＴＥＣＨ follows it at 89) and past her Chuck Hiso (139),
# which he lacks; his guards follow one after another from 147.
ASTROMAN_TWINS = {name: (r, r - 1 - (r == 90 or r >= 140)) for name, (r, _) in ZOMA_TWINS.items() if r < 149} | {
    name: (r, 147 + i) for i, (r, name) in enumerate(sorted((r, n) for n, (r, _) in ZOMA_TWINS.items() if r >= 149))}
# YINAN's sit 33 after Ryuko's, 34 from her light hit to SHOCK INFINITY,
# again from her Chuck Yo, and 35 from her Pull Back to her Chuck GON MISS.
YINAN_TWINS = {name: (r, r + next((d for top, d in ((73, 33), (89, 34), (121, 33), (140, 35)) if r < top), 34))
               for name, (r, _) in ZOMA_TWINS.items()}
# AYA's sit 26 after Ryuko's, 30 from her light hit to SHOCK INFINITY, 29 from
# her Shock rp (AYA lacks her ★変なＴＥＣＨ, 89), 31 from her Pull Back to her
# Chuck OGI BALL, and 30 from her Chuck Yo (AYA lacks her Chuck Hiso, 139).
AYA_TWINS = {name: (r, r + next((d for top, d in ((73, 26), (90, 30), (121, 29), (139, 31)) if r < top), 30))
             for name, (r, _) in ZOMA_TWINS.items()}
# DoraEmon's sit 25 after Ryuko's hits to her J atttack (he lacks her J
# atttack 2, 78), 24 from her DOWN to SHOCK INFINITY, 23 from her Shock rp
# (his ★変なＴＥＣＨ, 89, sits among his basic actions), 22 past her Chuck
# Hiso (139), which he lacks, and 23 again from her guards, past his *gard
# eff (171). His lose action 負け (68) jumps to KO NORMAL (69, PC 771), which
# tests variable 3 for 30 into >KO NORMAL 2nd (71, PC 777) and lands into KO
# down (76, PC 796), past KO NORMAL CPU (70) and his KO RELOAD forms (72–75).
DORA_TWINS = {name: (r, r + next((d for top, d in ((79, 25), (89, 24), (139, 23), (149, 22)) if r < top), 23))
              for name, (r, _) in ZOMA_TWINS.items()} | dict(lose=(59, 68), ko=(60, 69), koAgain=(61, 71), down=(62, 76))
# RARIO's sit eight before Ryuko's KOs and lose action, seven before her
# other reactions up to SHOCK INFINITY, eight from her Shock rp (his ★変な
# ＴＥＣＨ, 89, follows his DRAGON P), seven again from FLY NO HIT, three from
# her Chuck GON MISS (his DOWN section, 130–133, comes before it), four past
# her Chuck Hiso (139), which he lacks, and fourteen before her DOWN section;
# his guards follow one after another from 141.
RARIO_TWINS = {name: (r, r + next(d for top, d in ((63, -8), (89, -7), (97, -8), (137, -7), (139, -3), (144, -4),
                                                   (149, -14)) if r < top))
               for name, (r, _) in ZOMA_TWINS.items() if r < 149} | {
    name: (r, 141 + i) for i, (r, name) in enumerate(sorted((r, n) for n, (r, _) in ZOMA_TWINS.items() if r >= 149))}
# TRAINING's, RARIO's practice copy, sit 24 before Ryuko's KOs and lose
# action, 26 before her other reactions up to SHOCK INFINITY, 27 from her
# Shock rp to ERUS INATUMA, 26 from her INATUMA rp (his ★変なＴＥＣＨ, 92,
# follows his ERUS INATUMA), 22 from her Chuck GON MISS (his DOWN section,
# 111–114, comes before it), 23 past her Chuck Hiso (139), which he lacks,
# and 33 before her DOWN section; his guards follow one after another from
# 122.
TRAINING_TWINS = {name: (r, r + next(d for top, d in ((63, -24), (89, -26), (119, -27), (137, -26), (139, -22),
                                                      (144, -23), (149, -33)) if r < top))
                  for name, (r, _) in ZOMA_TWINS.items() if r < 149} | {
    name: (r, 122 + i) for i, (r, name) in enumerate(sorted((r, n) for n, (r, _) in ZOMA_TWINS.items() if r >= 149))}
# As in Ryuko's export, these play from their timelines (or only open one),
# not as clips, so flattening follows their jumps.
TIMELINES = {"lose", "hitRapid", "airHitRapid", "rushAirHit", "fly", "flySpin", "shock", "shockLoop",
             "fb", "fbb", "fbh", "stun", "airStun"}
# The reactions whose op 0x01 commands, op 0x20 rolls and branches the match
# plays, the lose action that opens every KO and the air guards.
SCRIPTED = ["airHit", "sweep", "hitHeavy", "airHitHeavy", "jumpHit", "launchAway", "hitRapid", "airHitRapid", "shock",
            "uppercut", "liftUp", "tatumakiIn", "tatumakiOut", "flySide", "fly", "stun", "airStun", "rushAirHit", "chuckToss", "airGuard", "airBlockHeavy",
            "airBlockRapid", "airTimeStopGuard", "lose", "musicAttack", "airInatuma", "airIcePunch", "chainPull",
            "airHisoStop"]

# The responses whose reactions only some players' moves reach, which the
# match plays from the victim's own timeline: Clothes off and Clothes off 500
# (46, 47: ZENKA's grabs), Chuck OGI BALL (62: OGI's, REAR's, Amiro's and
# YINAN's throws), RARIO grow, YARA and 1UP (65–67: his mushrooms), and
# Chuck Zmega and Chuck ShinZ (74, 75: the GIGA presses' op 0x14).
OWN_TIMELINES = (46, 47, 62, 65, 66, 67, 74, 75)

GUARDS = ("guard", "crouchGuard", "airGuard", "blockHeavy", "crouchBlockHeavy", "airBlockHeavy", "blockStop",
          "crouchBlockStop", "blockRapid", "crouchBlockRapid", "airBlockRapid", "timeStopGuard",
          "crouchTimeStopGuard", "airTimeStopGuard")

# Each other player: its file and hash; the engine's own states, from its
# default-action table (+0x757a) and its jumps' landing handler (slot 1); its
# twins of Ryuko's victim actions, and those that differ beyond their
# numbering and layout; its result, darkening and intro actions; and the
# images its HUD face (+0x75a6) and *name action show.
FIGHTERS = {
    "zoma": dict(
        source=("02 ZOMA", "bfc7a239fb33782fac6ff6c6ff22a2f50d0d8abc59c2182052e9cc32a422ff0e"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 42
                 "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24},
        twins=ZOMA_TWINS,
        differ={
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
            # Ryuko's also deletes object 7, and rolls rand % 6 > 2 to her rand % 3 > 1.
            "uppercut", "dragonFireball", "liftUp",
            # What the port doesn't play: no landing handler for a flight that
            # only rises, its last waits' lengths, and slot 4 set before the
            # spin, not as it starts.
            "flySide", "flySideWall", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
        },
        # Results: WIN and the draw call DEMO STAND once (PCs 542, 630). Her
        # super darkening panel, image 1009 (action 40). The Vs. intro: 28
        # jumps to 開始時 BR (30) + 3 (PCs 265, 301), which spawns Black and OP
        # super Charge (36, PCs 303–304) and jumps to Start N (31) + 2 (PC
        # 306), as Ryuko's 32 to 33 + 4; it plays flattened.
        actions=dict(win=56, winStand=41, draw=63, black=40, intro=(30, 3)),
        flat={"intro"},
        # 2001: the HUD face action 71 shows; 340: the name *name (64) shows.
        image_ids={2001, 340},
    ),
    "kiki": dict(
        source=("03 KIKI", "257ea3cc05c2a91815074efbb0029b7b0a3770590fc80b058db37e891077152a"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 51
                 "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24},
        twins=KIKI_TWINS,
        differ={
            # Hit Up, as Ryuko's counter, but within 10 ticks, as Zoma's.
            "guard", "crouchGuard",
            # Ryuko's and Zoma's also clear player variable 14 (the darkening),
            # 8 and 6.
            "airHitHeavy", "launchAway", "lose",
            # Zoma's op 0x20 that rolls which displays play.
            "jumpHit",
            # Zoma's order of op 0x1a and op 0x15, and raw vx −800 at PC 1522,
            # not −500.
            "launchDown",
            # Zoma's KO tests and landing wait.
            "ko", "down",
            # Zoma's display lengths.
            "rushAirHit", "shock", "shockLoop", "airStun",
            # No op 0x20.
            "uppercut", "dragonFireball", "liftUp",
            # Zoma's.
            "flySide", "flySideWall", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
        },
        # Results: WIN calls DEMO Stand (28) once, then 'win rp' (57) three
        # times (PCs 534, 536), and the draw calls DEMO Stand once (PC 620).
        # Her darkening panel, image 1009 (action 42). The Vs. intro: 30
        # jumps to 32 for global 3 = 0 (PC 283), past its display for global
        # 14 = 0 (PC 318), spawns Black and OP super Charge (38, PCs 320–321),
        # then jumps to Round 1 (33) + 2 (PC 323); it plays flattened.
        actions=dict(win=56, winStand=28, winRp=57, draw=64, black=42, intro=(32, 3)),
        flat={"intro"},
        # 2001: the HUD face action 71 shows (PC 666); 217: *name (65, PC 627).
        image_ids={2001, 217},
    ),
    "chung": dict(
        source=("04 CHUNG", "cb02ee1f8fa70bc14006d1b19ea1b5dc648601e618c0601be2c07113ad693c5d"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 56
                 "crouchEnter": 17, "crouch": 18, "stand": 19, "turn": 22, "crouchTurn": 23},
        twins=CHUNG_TWINS,
        differ={
            # Kiki's Hit Up within 10 ticks.
            "guard", "crouchGuard",
            # Raw vy −420 (PCs 2158, 2287), not −450.
            "airBlockHeavy", "airBlockRapid",
            # Op 0x20 rolls rand % 3 > 1 to Ryuko's rand % 6 > 2.
            "hitHeavy", "airHitHeavy", "tatumakiIn", "tatumakiOut", "chainPull",
            # Zoma's, rolling rand % 3 > 1.
            "uppercut", "dragonFireball", "liftUp",
            # Clears variable 14 first and doesn't roll.
            "jumpHit",
            # Kiki's raw vx −800 (PC 1582).
            "launchDown",
            # No op 0x20.
            "launchAway", "chuckToss",
            # Zoma's KO tests and landing wait, and her shock.
            "ko", "down", "shock",
            # Two displays (20, 10) after the motion commands, not three.
            "rushAirHit", "airStun",
            # Zoma's, and flySide rolls rand % 3 > 1 as well.
            "flySide", "flySideWall", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
            # A 70-tick display (PC 1812) to Ryuko's 5 before it loops.
            "chuckYo",
        },
        # Results: WIN calls Demo stand (27) once (PC 543), spawns P3 smoke1
        # (188) behind a blank display and holds image 293; the draw calls 27
        # once (PC 628). Her darkening panel, image 1009 (action 43). The Vs.
        # intro, as Kiki's: 30 jumps to 32 (PC 287), past its display (PC
        # 324), spawns Black and OP super Charge (39, PCs 326–327), then jumps
        # to ROUND 1 (33) + 2 (PC 329); it plays flattened, through ROUND 1's
        # call of Demo stand.
        actions=dict(win=57, winStand=27, draw=64, black=43, intro=(32, 3)),
        flat={"intro"},
        # 2000–2002: the HUD faces action 73 shows, cycling in EX mode (PCs
        # 675–692), as Ryuko's; 375: *name (65, PC 635).
        image_ids={2000, 2001, 2002, 375},
    ),
    "amiro": dict(
        source=("05 AMIRO", "786492ec12d3187c62999aa4e8032285e79b7d155f1b25035e17e7aca368bde9"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 59
                 "crouchEnter": 17, "crouch": 18, "stand": 19, "turn": 22, "crouchTurn": 23},
        twins=AMIRO_TWINS,
        differ={
            # Kiki's Hit Up within 10 ticks.
            "guard", "crouchGuard",
            # Her hit reactions and lose action also clear player variable 7,
            # her NT field's (op 0x1f selector 0x47, PCs 658, 817, ...).
            "hit", "airHit", "jumpHit", "drillDown", "dstToss", "twist", "hitPull", "launchUp", "grabbed",
            "lose", "fireLaunch", "gonMiss", "chuckUp", "fly", "airHitHeavy", "hitHeavy", "tatumakiIn",
            "twistSideHit", "musicAttack", "vanish", "icePunch", "airIcePunch",
            # Chung's rand % 3 > 1, beside that.
            "launchAway", "chuckToss", "uppercut", "dragonFireball", "liftUp", "chainPull",
            # Rand % 4 > 2 to Ryuko's rand % 3 > 1, and airStun's two waits
            # as one.
            "hitRapid", "airHitRapid", "stun", "airStun",
            # Rolls rand % 3 > 1 to skip its sound (PC 990).
            "sweep",
            # Kiki's raw vx −800 (PC 1883).
            "launchDown",
            # Raw vx −300 (PC 1398), not −500.
            "tatumakiOut",
            # The same lengths split across more displays; KO DOWN's first
            # wait 12 ticks, not 10, and Zoma's KO tests and landing wait.
            "knockdown", "bounceDown", "ko", "down",
            # Zoma's.
            "rushAirHit", "shock", "flySide", "flySideWall", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
            # Clears variable 7 too, with Chung's 70-tick display (PC 2138).
            "chuckYo",
            # Clears variable 7 first (PC 1644), as G Suneo's does.
            "hisoStop",
        },
        # Results: WIN calls Demo stand (27) once (PC 638) and loops image 197
        # (PC 649); the draw calls 27 once (PC 736). Her darkening panel, image
        # 1009 (action 45). The Vs. intro: 29 jumps to 31 for global 3 = 0 (PC
        # 307), past its display for global 14 = 0 (PC 345), spawns Black and
        # OP super Charge (41, PCs 347–348), then jumps to Round BR (33, PC
        # 350), which drives her in on her car; it plays flattened, through
        # Round BR's call of Demo stand.
        actions=dict(win=59, winStand=27, draw=66, black=45, intro=(31, 3)),
        flat={"intro"},
        # 2000–2002: the HUD faces action 75 shows, cycling in EX mode (PCs
        # 786–803), as Ryuko's; 427: *name (67, PC 746).
        image_ids={2000, 2001, 2002, 427},
    ),
    "anmc": dict(
        source=("06 ANMC P", "0f4d92aaafd0d6bf6e410034ec2af28d1d5d8a337ae05bf1bf2cae49bb3e4b4f"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 52
                 "crouchEnter": 20, "crouch": 21, "stand": 22, "turn": 25, "crouchTurn": 26},
        twins=ANMC_TWINS,
        differ={
            # Each jumps to its EX form while variable 0 is 100 (op 0x1f, PCs
            # 1970, 2015, ...), past its op 0x15; Kiki's Hit Up within 10 ticks.
            "guard", "crouchGuard", "airGuard", "blockHeavy", "crouchBlockHeavy", "airBlockHeavy", "blockStop",
            "crouchBlockStop", "blockRapid", "crouchBlockRapid", "airBlockRapid", "timeStopGuard",
            "crouchTimeStopGuard", "airTimeStopGuard",
            # Zoma's op 0x20 that rolls which displays play.
            "jumpHit",
            # Rolls rand % 6 > 2 to skip its sound (PC 1719).
            "dstToss",
            # Op 0x01 before op 0x02 (PCs 1700–1701).
            "grabbed",
            # Kiki's raw vx −800 (PC 1631).
            "launchDown",
            # Zoma's KO tests, Ryuko's landing wait; Zoma's KO DOWN.
            "ko", "down",
            # Amiro's rand % 4 > 2, and airStun's two waits as one.
            "hitRapid", "airHitRapid", "stun", "airStun",
            # Op 0x15 gives the victim 5 power and the attacker 3 (PC 1229), not
            # Ryuko's 3 and none.
            "tatumakiOut",
            # Kiki's, with no op 0x20.
            "uppercut", "dragonFireball", "liftUp",
            # Zoma's.
            "dstTossSpin2", "rushAirHit", "shock", "flySide", "flySideWall", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
            # Chung's 70-tick display (PC 1869).
            "chuckYo",
        },
        # Results: WIN calls DEMO STAND (30) once (PC 571) and holds image 324
        # (PC 582); the draw calls 30 once (PC 675). ponytail: WIN's rand % 11 > 6
        # into Win 2 (60, PC 572), a jetpack flight up at raw vy −300 (PC 586),
        # isn't played; the clip takes the fall-through. His darkening panel, image
        # 1009 (action 45). The Vs. intro: 32 jumps to 開始時 BR (34) for global
        # 3 = 0 (PC 310), past its display for global 14 = 0 (PC 348), spawns
        # Black and OP SUPER CHARGE (41, PCs 350–351), then jumps to Round 1
        # (35) + 2 (PC 353); it plays flattened.
        actions=dict(win=59, winStand=30, draw=68, black=45, intro=(34, 3)),
        flat={"intro"},
        # 2000–2002: the HUD faces action 72 shows, cycling in EX mode (PCs
        # 717–735), as Ryuko's; 183: *name (69, PC 682).
        image_ids={2000, 2001, 2002, 183},
    ),
    "giant": dict(
        source=("07 GIANT", "0e01c719854071802462cd0dc15c45331349f2d769940fe4cac783e401a4026b"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 41
                 "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24},
        twins=GIANT_TWINS,
        # Beside the op 0x1f on his counter's variable 4 each opens with
        # (counter_records), which the match plays:
        differ={
            # Kiki's Hit Up within 10 ticks (PC 2164), and no op 0x1e window
            # (PC 2160) where Ryuko's opens one for COUNTER HIT (PC 2012).
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # Chung's rand % 3 > 1 to Ryuko's rand % 6 > 2, or no op 0x20.
            "hitHeavy", "airHitHeavy", "tatumakiIn", "tatumakiOut", "launchAway", "chuckToss", "chainPull",
            # Kiki's raw vx −800 (PC 1799).
            "launchDown",
            # Clear player variable 14, not 1 (PCs 2126, 2142).
            "knockdown", "bounceDown",
            # 15 and 5 ticks (PCs 2121–2122) to Ryuko's three tens.
            "getUp",
            # Zoma's KO tests (PC 577), landing wait and KO DOWN; his shock
            # clears variable 1 where Ryuko's sets 6 (PC 1042).
            "ko", "down", "shock",
            # ANMC P's rand % 4 > 2.
            "hitRapid", "stun",
            # Zoma's.
            "rushAirHit", "airStun", "uppercut", "dragonFireball", "liftUp", "flySide", "flySideWall", "twistSide",
            # His own MUSIC ATTACK loops one display, spawning love heart (440)
            # each pass (PC 1944), with no roll.
            "musicAttack",
            # His own copies of hit heavy, BEAM Stand and HISA (79, 87, 84),
            # clearing variable 4, where Ryuko's jump to hers; FB and FBH give
            # the striker 10 power, as hers do (PCs 1464, 1528).
            "fb", "fbb", "fbh",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
        },
        # Responses 69 and 70 (Kiki's En300, ANMC P's jump fire ball) enter his
        # UNCOUNTER DOWN and Air Fire (126, 127), copies of DOWN and J Att
        # that clear variable 4 where those test it. ponytail: Air Fire's op
        # 0x01 sets vx −250 where J Att's adds it (PCs 1720, 828), and it
        # counts no variable 5; it plays as J Att.
        aliases={126: 79, 127: 77},
        # Results: WIN calls Demo Stand (28) once (PC 553) and loops PCs
        # 560–563 (PC 564); the draw calls 28 once (PC 645). His darkening
        # panel, image 1009 (action 43). The Vs. intro, as Kiki's: 30 jumps to
        # 32 for global 3 = 0 (PC 268), past its display for global 14 = 0 (PC
        # 305), spawns Black and OP super Charge (39, PCs 307–308), then jumps
        # to Round 1 (33) + 2 (PC 310); it plays flattened.
        actions=dict(win=60, winStand=28, winLoop=(60, 9), draw=67, black=43, intro=(32, 3)),
        flat={"intro"},
        # 2000–2002: the HUD faces action 74 shows, cycling in EX mode (PCs
        # 690–707), as Ryuko's; 349: *name (68, PC 652).
        image_ids={2000, 2001, 2002, 349},
    ),
    "suneo": dict(
        source=("08 G SUNEO", "6be2def813d42d32253912faaa1bc8f70497bca79b8653ec26662bf870736d33"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 68
                 "crouchEnter": 20, "crouch": 21, "stand": 22, "turn": 25, "crouchTurn": 26},
        twins=SUNEO_TWINS,
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 2112), and no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # Clear player variable 7 first (PCs 877, 896, ...), which only
            # *-*-*-sc super (279) sets (PCs 4186–4196) and nothing tests; most
            # wait 1005 or 1030 ticks for landing, or hold (0), to Ryuko's 1205.
            "hit", "airHit", "dstToss", "twist", "hitPull", "grabbed", "fly", "gonMiss", "twistSideHit", "sweep",
            "fireLaunch", "launchUp", "icePunch", "airIcePunch",
            # With Chung's rand % 3 > 1 to Ryuko's rand % 6 > 2, or no op 0x20;
            # J Att rolls it to skip its sound (PC 971), where hers has none.
            "hitHeavy", "airHitHeavy", "jumpHit", "launchAway", "tatumakiIn", "tatumakiOut", "chuckToss",
            "uppercut", "dragonFireball", "liftUp", "chainPull",
            # With rand % 6 > 2, or > 3 in the air, to Ryuko's rand % 3 > 1, and
            # one 20-tick wait for her two tens.
            "hitRapid", "airHitRapid", "stun", "airStun", "rushAirHit",
            # With variable 14 cleared before the op 0x15, not after.
            "drillDown", "twistSide", "musicAttack", "vanish", "chuckUp",
            # With Zoma's order of op 0x1a and op 0x15, and Kiki's raw vx −800
            # (PC 1756).
            "launchDown",
            # With variable 4 (PC 2064), which only HAMMER NEW Land K10 tests
            # (PC 5119) and nothing sets; the same lengths split across more
            # displays, as the get-up's 5 and 5 ticks to Ryuko's 10.
            "knockdown", "bounceDown", "getUp",
            # 5-tick spins to Ryuko's 7.
            "dstTossSpin2",
            # Zoma's KO tests (PC 727) and KO DOWN, a 1005-tick landing wait;
            # her lose action keeps variable 6, and her shock doesn't set it.
            "ko", "koAgain", "down", "lose", "shock",
            # Zoma's.
            "flySide", "flySideWall",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
            # Clears variable 7 first and 14 before 8 and 5, not after.
            "chuckYo",
            # Clears variable 7 first (PC 1567), as Amiro's does.
            "hisoStop",
        },
        # Results: 勝ち (66) calls Demo stand (49) once (PC 695), then 'win
        # talk' (67) seven times (PC 707), and holds image 416 (PC 709); the
        # draw calls 49 once (PC 798). ponytail: 勝ち's rand % 5 > 3 into
        # Random win (52, PC 696) isn't played, nor its rand % 3 > 1 between
        # sounds 10 and 11 (PC 702), nor Demo stand's DEMO STAND2 (48) for
        # variable 0 = 100 (PC 513); the clip takes the fall-through. Her
        # darkening panel, image 1009 (action 47). The Vs. intro: 開始時 (32)
        # jumps to 開始時 BR (34) for global 3 = 0 (PC 337), past its displays
        # for global 14 = 0 (PC 375) to two 2-tick displays (PCs 382, 384)
        # around its spawn of OP obj (30, PC 383), spawns Black and OP super
        # Charge (43, PCs 386–387), then jumps to Round 1 (35) + 3 (PC 389);
        # it plays flattened. ponytail: in EX mode, BR's last pose (34 + 16, PC
        # 390), which Round 1 enters for variable 0 = 100 (PC 410), isn't
        # played.
        actions=dict(win=66, winStand=49, winRp=67, draw=75, black=47, intro=(34, 7)),
        flat={"intro"},
        # 2000–2002 and 2006: the HUD faces action 81 shows, cycling 2002,
        # 2006, 2000 and 2006 in EX mode (PCs 845–863); 601: *name (76, PC 808).
        image_ids={2000, 2001, 2002, 2006, 601},
    ),
    "yo": dict(
        source=("09 YO", "f235ef166878351309dd48b8ae90c1283d79a42f3311d423d67874d142723383"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 11,  # PC 45
                 "crouchEnter": 19, "crouch": 20, "stand": 21, "turn": 24, "crouchTurn": 25},
        twins=YO_TWINS,
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 1909), and no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # Chung's rand % 3 > 1 to Ryuko's rand % 6 > 2, or no op 0x20; TWIS
            # SIDE FLY rolls it to skip its sound (PC 1072), where Ryuko's has none.
            "hitHeavy", "airHitHeavy", "tatumakiIn", "tatumakiOut", "launchAway", "chuckToss", "twistSideHit",
            "chainPull",
            # Zoma's, rolling rand % 3 > 1 (PC 1133); DRAGON Fireball and Yinan
            # hold their last display (0) where Ryuko's wait 1205 ticks for landing.
            "uppercut", "dragonFireball", "liftUp",
            # Clears variable 8 before 6 (PCs 817–818), not after.
            "jumpHit",
            # Zoma's order of op 0x1a and op 0x15, and Kiki's raw vx −800 (PC 1582).
            "launchDown",
            # Zoma's KO tests (PC 613), landing wait and KO DOWN (PC 661), and
            # Zoma's shock, which doesn't set variable 6.
            "ko", "down", "shock",
            # Zoma's.
            "rushAirHit", "airStun", "twistSide",
            # Chung's: flySide rolls rand % 3 > 1 as well.
            "flySide", "flySideWall",
            # Clears variable 14 before 8 and 5 (PC 1849), not after.
            "vanish",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
        },
        # Results: 勝ち (58) calls Demo Stand (29) once (PC 596) and holds image
        # 350 (PC 602); the draw calls 29 once (PC 681). The darkening panel,
        # image 1009 (action 44). The Vs. intro: 開始時 (32) jumps to 開始時 BR
        # (34) for global 3 = 0 (PC 331), past its display for global 14 = 0
        # (PC 367), spawns Black and OP super Charge (40, PCs 369–370), then
        # jumps to Round 1 (35) + 5 (PC 372), which walks in (PC 378) and calls
        # Demo Stand three times (PC 392); it plays flattened.
        actions=dict(win=58, winStand=29, draw=65, black=44, intro=(34, 3)),
        flat={"intro"},
        # 2001: the HUD face action 73 shows (PC 728); 390: *name (66, PC 688).
        image_ids={2001, 390},
    ),
    "sin": dict(
        source=("10 SIN", "59a429d7b8a621408c89f71314327bd5b87fb219be1a51a8fa3701169d32119f"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 71
                 "crouchEnter": 19, "crouch": 20, "stand": 21, "turn": 24, "crouchTurn": 25},
        twins=SIN_TWINS,
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 1971), and no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # Chung's rand % 3 > 1 to Ryuko's rand % 6 > 2, or no op 0x20; TWIS
            # SIDE FLY and the sweep roll it to skip their sound (PC 913), where
            # Ryuko's have none.
            "hitHeavy", "airHitHeavy", "tatumakiIn", "tatumakiOut", "launchAway", "chuckToss", "twistSideHit",
            "sweep", "chainPull",
            # Zoma's, rolling rand % 3 > 1.
            "uppercut", "dragonFireball", "liftUp",
            # Zoma's order of op 0x1a and op 0x15, and Kiki's raw vx −800 (PC 1638).
            "launchDown",
            # Op 0x01 before op 0x02 (PCs 1707–1708), as ANMC P's.
            "grabbed",
            # 5 and 5 ticks to Ryuko's 10.
            "getUp",
            # Zoma's KO tests (PC 635), landing wait and KO DOWN (PC 683), and
            # Zoma's shock, which doesn't set variable 6.
            "ko", "down", "shock",
            # Zoma's.
            "rushAirHit", "airStun", "twistSide",
            # Chung's: flySide rolls rand % 3 > 1 as well.
            "flySide", "flySideWall",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
            # Its op 0x16 (PC 1458) before clearing the variables, not after.
            "hisoStop",
        },
        # Results: 勝ち (60) calls STAND DEMO 2 (30) once (PC 612), spawns WIN
        # RP (61, PC 616) and loops PCs 617–618 (PC 619); the draw calls 30
        # once (PC 703). ponytail: STAND DEMO 2's STAND DEMO (29) for variable
        # 0 = 10 (PC 324) isn't played; the clip takes the fall-through. The
        # darkening panel, image 1009 (action 46). The Vs. intro: 開始時 (33)
        # jumps to 開始時 BR (35) for global 3 = 0 (PC 349), past its display
        # for global 14 = 0 (PC 388), spawns Black and OP super Charge (42, PCs
        # 390–391), then jumps to Round 1 (36) + 2 (PC 393), which calls STAND
        # DEMO 2 once (PC 404); it plays flattened.
        actions=dict(win=60, winStand=30, winLoop=(60, 7), draw=68, black=46, intro=(35, 3)),
        flat={"intro"},
        # 2000–2002 and 2006: the HUD faces action 73 shows, cycling as G
        # Suneo's in EX mode (PCs 756–774); 368: *name (70, PC 721).
        image_ids={2000, 2001, 2002, 2006, 368},
    ),
    "lizard": dict(
        source=("11 LIZARD", "cf0db727644d3ca90e1bc19ff61b2c6f58cc5fae5bd9c154f0af147757e48e4e"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 52
                 "crouchEnter": 19, "crouch": 20, "stand": 21, "turn": 24, "crouchTurn": 25},
        twins=LIZARD_TWINS,
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 1956), and no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # Zoma's op 0x20 that rolls which displays play (PC 866).
            "jumpHit",
            # Zoma's order of op 0x1a and op 0x15, and Kiki's raw vx −800 (PC 1623).
            "launchDown",
            # Chung's: no op 0x20.
            "launchAway",
            # Op 0x01 before op 0x02 (PCs 1692–1693), as ANMC P's.
            "grabbed",
            # Zoma's KO tests (PC 651) and KO DOWN (PC 699: its op 0x1f's
            # r[6:9], which a test doesn't read, 0x4138d1), and Zoma's shock,
            # which doesn't set variable 6.
            "ko", "down", "shock",
            # Zoma's.
            "rushAirHit", "airStun", "flySide", "twistSide",
            # Chung's.
            "flySideWall",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
        },
        # Results: 勝ち (60) cues its sound (PC 628) and calls 'win RP' (61)
        # ten times (PC 629) before its displays, so it plays flattened with
        # its call of DEMO STAND (29, PC 627); it holds image 409 (PC 638).
        # The draw calls 29 once (PC 719). The darkening panel, image 1009
        # (action 46). The Vs. intro: 開始時 (31) jumps to 開始時 BR (33) for
        # global 3 = 0 (PC 329), past its display for global 14 = 0 (PC 365);
        # it leaps in and lands into OP lend (36, slot 1 at PC 383).
        actions=dict(win=60, winStand=29, draw=68, black=46, intro=(33, 3), introLand=36),
        flat={"win"},
        # 2001: the HUD face action 73 shows (PC 764); 217: *name (69, PC 727).
        image_ids={2001, 217},
    ),
    "kay": dict(
        source=("12 KAY", "03fc1e8d1ca8b145efbeb7dbd50c58c4a1b1fd1e9175d8e9efd0ddb15c29403b"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 47
                 "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24},
        twins=KAY_TWINS,
        # Beside the op 0x1f on his counter's variable 4 each opens with
        # (counter_records), which the match plays:
        differ={
            # Giant's, without his clearing of variable 14 (PC 2157): Kiki's
            # Hit Up within 10 ticks (PC 2146), and no op 0x1e window where
            # Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # Ryuko's, without clearing variable 14, and their last display
            # lasts 3 ticks to her 20 (PC 2195), so each air guard frees him
            # 6 ticks in, which their clips give the match.
            "airGuard", "airBlockHeavy", "airBlockRapid", "airTimeStopGuard",
            # Chung's rand % 3 > 1 to Ryuko's rand % 6 > 2, or no op 0x20.
            "hitHeavy", "airHitHeavy", "tatumakiIn", "tatumakiOut", "launchAway", "flySide", "flySideWall", "chainPull",
            # Variable 5 tests (> 4, not > 7), which the match doesn't read.
            "jumpHit",
            # A roll that skips its sound (PC 1735), which the clip doesn't play.
            "hitPull",
            # Kiki's raw vx −800.
            "launchDown",
            # Op 0x01 before op 0x02, as ANMC P's.
            "grabbed",
            # Zoma's KO tests (PC 613) and KO DOWN (PC 661), but for their
            # op 0x1f's r[6:9], which a test doesn't read (0x4138d1); Zoma's
            # shock, which doesn't set variable 6.
            "ko", "down", "shock",
            # Zoma's.
            "rushAirHit", "airStun", "chuckToss", "uppercut", "dragonFireball", "liftUp", "twistSide", "inatuma",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
            # His own copies of hit heavy, BEAM Stand and HISA, as Giant's.
            # FB's op 0x0a (PC 1363) passes three of its six displays, as
            # Ryuko's hit heavy shows; FBB rolls rand % 3 > 1, as Ryuko's
            # BEAM Stand does; FBH credits the striker HISA's 3 power (PC
            # 1408), not 13, and Fire HISA 13 (PC 1324), not 3, which the
            # match keeps per fighter.
            "fb", "fbb", "fbh", "fireLaunch",
            # Held 33 ticks (PC 1559) to Ryuko's 36, so he slides three earlier.
            "hisoStop",
        },
        # Responses 69 and 70 enter his UNCOUNTER DOWN and Air Fire (124,
        # 125), copies of DOWN and J Att that clear variable 4 where those
        # test it, as Giant's (126, 127). ponytail: Air Fire's op 0x01 sets
        # vx −250 where J Att's adds it, and it counts no variable 5; it
        # plays as J Att.
        aliases={124: 79, 125: 77},
        # Results: 勝ち (57) calls Demo stand (28) once (PC 574), hops (PC
        # 579) and, landing into 57 + 10 (slot 1, PC 578), loops WIN RP (58,
        # PC 602) after a roll that picks its sound (PCs 588–596). The draw
        # calls 28 once (PC 681) and holds image 201 (PC 684). The darkening
        # panel, image 1013 (action 43). The Vs. intro: 開始時 (30) jumps to
        # 開始時 BR (32) for global 3 = 0 (PC 307), past its display for
        # global 14 = 0 (PC 345), spawns OP super Charge (39, PC 348) and
        # jumps to Round 1 (33) + 5 (PC 350), which walks in (PC 356) and
        # calls Demo stand twice (PC 368); both play flattened.
        actions=dict(win=57, winStand=28, winLand=(57, 10), winLoop=(58, 0), draw=65, black=43, intro=(32, 3)),
        flat={"win", "intro"},
        # 2000–2002: the HUD faces action 73 shows, cycling in EX mode (PCs
        # 727–745), as Ryuko's; 464: *name (66, PC 688).
        image_ids={2000, 2001, 2002, 464},
    ),
    "dido": dict(
        source=("13 DIDO", "08129bdd2501e0172c1ee54f389237132e41834ea3efb1954ffc22b24c2bf0d2"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 42
                 "crouchEnter": 19, "crouch": 20, "stand": 21, "turn": 24, "crouchTurn": 25},
        twins=DIDO_TWINS,
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 2183), and no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT. Stop Stand, time
            # stand and time stop stand hold their slide 23 ticks to his 10
            # (PCs 2320, 2381, 2446), which their clips give the match.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # Chung's rand % 3 > 1 to Ryuko's rand % 6 > 2, or no op 0x20.
            "hitHeavy", "airHitHeavy", "tatumakiIn", "tatumakiOut", "launchAway", "flySide", "flySideWall", "chainPull",
            # Kiki's raw vx −800.
            "launchDown",
            # Op 0x01 before op 0x02, as ANMC P's.
            "grabbed",
            # Zoma's KO tests and KO DOWN, but for their op 0x1f's r[6:9],
            # which a test doesn't read (0x4138d1); Zoma's shock, which
            # doesn't set variable 6.
            "ko", "down", "shock",
            # Kiki's: doesn't clear variable 6.
            "lose",
            # Zoma's.
            "rushAirHit", "airStun", "chuckToss", "uppercut", "dragonFireball", "liftUp", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
        },
        # Results: 勝ち (61) calls Demo Stand (29) once (PC 681), cues its
        # sound (PC 685) and holds image 330 (PC 688). The draw calls 29 once
        # (PC 769) and holds image 382 (PC 773). The darkening panel, image
        # 1009 (action 41). The Vs. intro: 開始時 (31) jumps to 開始時 BR (33)
        # for global 3 = 0 (PC 324), which rolls rand % 3 > 1 (PC 360), then
        # skips its display for global 14 = 0 (PC 361), spawns OP super
        # Charge (37, PC 364) and jumps to Round 1 (34) + 3 (PC 366); both
        # play flattened. ponytail: the roll's other third, which hops
        # through op2 (44, PC 372), isn't played.
        actions=dict(win=61, winStand=29, draw=68, black=41, intro=(33, 4)),
        flat={"win", "intro"},
        # 2001: the HUD face action 76 shows (PC 817); 258: *name (69, PC 777).
        image_ids={2001, 258},
    ),
    "sakuya": dict(
        source=("14 SAKUYA", "4474d8d055471c7361513fcd30c522a983972554ea10124fa715b3193596bf17"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 64
                 "crouchEnter": 21, "crouch": 22, "stand": 23, "turn": 26, "crouchTurn": 27},
        twins=SAKUYA_TWINS,
        # Beside the op 0x1f on her counter's variable 4 each opens with
        # (counter_records), which the match plays:
        differ={
            # KAY's: Kiki's Hit Up within 10 ticks (PC 2330), no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT, and no clearing
            # of variable 14.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # Ryuko's, without clearing variable 14.
            "airGuard", "airBlockHeavy", "airBlockRapid", "airTimeStopGuard",
            # Ryuko's, also clearing variable 1 (PC 903); HISA Down Down also
            # clears 6, 3, 1 and 14 (PCs 1941–1944), which their clips play.
            "airHit", "slamBounce",
            # Rand % 4 > 1 (PC 932) to Ryuko's rand % 6 > 2, or no op 0x20.
            "hitHeavy", "airHitHeavy", "jumpHit", "uppercut", "dragonFireball", "liftUp", "chainPull",
            # Chung's rand % 3 > 1.
            "launchAway", "tatumakiIn", "tatumakiOut", "flySideWall",
            # Kiki's raw vx −800 (PC 1938), with Ryuko's order of op 0x15 and
            # op 0x1a.
            "launchDown",
            # Its op 0x1f's r[7:9] (PC 1068), which a test doesn't read
            # (0x4138d1).
            "launchUp",
            # Op 0x01 before op 0x02, as ANMC P's.
            "grabbed",
            # Zoma's KO tests and KO DOWN, but for their op 0x1f's r[6:9];
            # Zoma's shock, which doesn't set variable 6.
            "ko", "down", "shock",
            # Zoma's.
            "rushAirHit", "airStun", "chuckToss", "flySide", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
            # Her own copies of hit heavy, BEAM Stand and HISA (129, 128,
            # 130), clearing variable 4, where Ryuko's jump to hers. FB gives
            # the striker 10 power (PC 1634) and FBH 13 (PC 1671), as Ryuko's
            # 10 and HISA's 3 do. ponytail: FBB has no roll (PCs 1611–1632)
            # and FBH no sound, where the port plays her BEAM Stand's (PC
            # 1105) and HISA's (PC 1054).
            "fb", "fbb", "fbh",
        },
        # Responses 69 and 70 enter her UNCOUNTER DOWN and Air Fire (139,
        # 140), copies of DOWN and J Att that clear variable 4 where those
        # test it, as Giant's (126, 127). ponytail: as his, Air Fire plays as
        # J Att.
        aliases={139: 79, 140: 77},
        # Results: 勝ち (69) calls STAND DEMO (31) once (PC 683) and holds
        # image 436 (PC 692). The draw calls 31 once (PC 796) and holds image
        # 444 (PC 800). The darkening panel, image 1009 (action 55). The Vs.
        # intro: 開始時 (36) jumps to 開始時 BR (39) for global 3 = 0 (PC 338),
        # which rolls rand % 4 > 1 (PC 380), then skips its display for
        # global 14 = 0 (PC 381), spawns Black (55) and OP super Charge (51,
        # PCs 383–384) and jumps to Round 1 (40) + 3 (PC 386); both play
        # flattened. ponytail: the rolls' other paths, to Random OP3 (45, PC
        # 380), RANDOM OP1 (41, PC 403) and random win2 (70, PC 686), aren't
        # played.
        actions=dict(win=69, winStand=31, draw=78, black=55, intro=(39, 4)),
        flat={"win", "intro"},
        # 2000–2002 and 2006: the HUD faces action 87 shows, cycling in EX
        # mode (PCs 847–861), as G Suneo's; 445: *name (79, PC 805).
        image_ids={2000, 2001, 2002, 2006, 445},
    ),
    "alex": dict(
        source=("15 ALEX", "25e528f608bc1d1bfcc735ff4536c21e1fca67473c27d5ef9e3c4642792341ec"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 59
                 "crouchEnter": 17, "crouch": 18, "stand": 19, "turn": 22, "crouchTurn": 23},
        twins=ALEX_TWINS,
        # Beside the op 0x1f on his counter's variable 4 each opens with
        # (counter_records), which the match plays:
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 2223), and no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # Ryuko's, without her op 0x15 adding 2 power (176 and 181 have
            # none), which the match keeps per fighter.
            "airBlockRapid", "airTimeStopGuard",
            # Chung's rand % 3 > 1 (PC 819) to Ryuko's rand % 6 > 2, or no op
            # 0x20; the heavy air hit also clears variable 5 (PC 851).
            "hitHeavy", "airHitHeavy", "tatumakiIn", "tatumakiOut", "launchAway", "flySideWall", "chainPull",
            # Clears variable 14 and 8 before 6, not after, with Chung's
            # variable 5 tests (> 7, then > 4), which the match doesn't read.
            "jumpHit",
            # Kiki's raw vx −800 (PC 1848).
            "launchDown",
            # Op 0x01 before op 0x02, as ANMC P's.
            "grabbed",
            # KAY's: Zoma's KO tests (PC 619) and KO DOWN (PC 667), but for
            # their op 0x1f's r[6:9], which a test doesn't read (0x4138d1);
            # Zoma's shock, which doesn't set variable 6.
            "ko", "down", "shock",
            # Zoma's.
            "rushAirHit", "airStun", "chuckToss", "uppercut", "dragonFireball", "liftUp", "flySide", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
            # His own copies of hit heavy, BEAM Stand and HISA (81, 90, 86),
            # clearing variable 4, where Ryuko's jump to hers. FB gives the
            # striker 10 power (PC 1384) and FBH 13 (PC 1447), as Ryuko's 10
            # and HISA's 3 do; FBB rolls rand % 3 > 1 (PC 1424), as BEAM Stand
            # does. ponytail: FB has no roll and cues sound 33 (PC 1400), FBH
            # 33 to HISA's 30 (PC 1452), and their smoke spawns name the empty
            # ----smoke---- (399, PCs 1404, 1423, 1432), where the port plays
            # hit heavy's, BEAM Stand's and HISA's, with SMOKE >> (400).
            "fb", "fbb", "fbh",
        },
        # Responses 69 and 70 enter his UNCOUNTER DOWN and Air Fire (128,
        # 129), copies of DOWN and J Att that clear variable 4 where those
        # test it, as Giant's (126, 127). ponytail: as his, Air Fire plays as
        # J Att.
        aliases={128: 79, 129: 77},
        # Results: 勝ち (59) calls DEMO stand (27) once (PC 576), rolls rand %
        # 3 > 1 for its sound (PC 589) and holds image 330 (PC 593). The draw
        # calls 27 once (PC 687) and holds image 332 (PC 689). The darkening
        # panel, image 1009 (action 45). The Vs. intro: 開始時 (30) jumps to
        # 開始時 BR (32) for global 3 = 0 (PC 287), which skips its display
        # for global 14 = 0 (PC 325), spawns chicken (37), Black (45) and OP
        # super Charge (41, PCs 334–336) and jumps to Round 1 (33) + 4 (PC
        # 338); both play flattened. ponytail: the win's roll picks a sound,
        # which isn't played.
        actions=dict(win=59, winStand=27, draw=67, black=45, intro=(32, 9)),
        flat={"win", "intro"},
        # 2000–2002 and 2006: the HUD faces action 75 shows, cycling in EX
        # mode (PCs 737–750), as G Suneo's; 362: *name (68, PC 694).
        image_ids={2000, 2001, 2002, 2006, 362},
    ),
    "sou": dict(
        source=("16 SOU", "69f63a7193b0fdb571793ac0e6da9f390261f448f5bda0e50ccfcfd5378ba3c2"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 64
                 "crouchEnter": 19, "crouch": 20, "stand": 21, "turn": 24, "crouchTurn": 25},
        twins=SOU_TWINS,
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 2089), and no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # SAKUYA's rand % 4 > 1 (PC 871) to Ryuko's rand % 6 > 2, or no op
            # 0x20, where J Att rolls too.
            "hitHeavy", "airHitHeavy", "jumpHit", "uppercut", "dragonFireball", "liftUp", "chainPull",
            # Chung's rand % 3 > 1.
            "launchAway", "tatumakiIn", "tatumakiOut", "flySideWall",
            # Kiki's raw vx −800 (PC 1725).
            "launchDown",
            # Its variable 8 test's r[7:9] (PC 998), which a test doesn't read
            # (0x4138d1), then clearing variable 8 (PC 999). ponytail: where
            # Ryuko's test names no target, his enters ヒット HISA (91) while
            # variable 8 is above 99, which only ICE Punch sets (PC 1429); the
            # match doesn't read variable 8.
            "launchUp",
            # Op 0x01 before op 0x02, as ANMC P's.
            "grabbed",
            # KAY's: Zoma's KO tests and KO DOWN, but for their op 0x1f's
            # r[6:9], which a test doesn't read (0x4138d1); Zoma's shock, which
            # doesn't set variable 6.
            "ko", "down", "shock",
            # Kiki's: doesn't clear variable 6.
            "lose",
            # Zoma's.
            "rushAirHit", "airStun", "chuckToss", "flySide", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
        },
        # Results: 勝ち (62) calls DEMO stand (29) once (PC 643) and holds
        # image 310 (PC 650). The draw calls 29 once (PC 734) and holds image
        # 318 (PC 743). The darkening panel, image 1009 (action 47). The Vs.
        # intro: 開始時 (34) jumps to 開始時 BR (36) for global 3 = 0 (PC 354),
        # which for global 14 = 0 (PC 392) rises past its display (PC 401),
        # jumps back to spawn Black (47) and OP super Charge (43, PCs
        # 397–398), then to Round 1 (37) + 5 (PC 400), which falls (PC 410)
        # and lands into 37 + 10 (slot 1, PC 409); all play flattened.
        # ponytail: the win's roll, to RANDOM WIN (48, PC 644), isn't played.
        actions=dict(win=62, winStand=29, draw=70, black=47, intro=(36, 10), introLand=(37, 10)),
        flat={"win", "intro", "introLand"},
        # 2000–2002: the HUD faces action 79 shows, cycling in EX mode (PCs
        # 788–806), as Ryuko's; 329: *name (71, PC 748).
        image_ids={2000, 2001, 2002, 329},
    ),
    "hiso": dict(
        source=("17 HISO", "0f9801b0768ef197bd913b68ffe92ce1b9edfc98ef6a959f3feaae8d0255e885"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 52
                 "crouchEnter": 17, "crouch": 18, "stand": 19, "turn": 22, "crouchTurn": 23},
        twins=HISO_TWINS,
        # Beside the op 0x1f on his counter's variable 4 each opens with
        # (counter_records), which the match plays:
        differ={
            # Giant's, but one 20-tick display (PC 2208) for his two tens, so
            # the last Hit Up check comes at 28 (PC 2209), not 18.
            "guard", "crouchGuard",
            # Giant's: Kiki's Hit Up within 10 ticks, and no op 0x1e window
            # where Ryuko's opens one for COUNTER HIT.
            "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop", "blockRapid", "crouchBlockRapid",
            "timeStopGuard", "crouchTimeStopGuard",
            # SAKUYA's rand % 4 > 1 (PC 804) to Ryuko's rand % 6 > 2, or no op
            # 0x20; J Att clears global 13 where hers clears variable 14 (PC
            # 841), and the Tatumakis roll after their op 0x01 (PCs 1241–1242),
            # which the match's launch doesn't read.
            "hitHeavy", "airHitHeavy", "jumpHit", "uppercut", "dragonFireball", "liftUp", "chainPull",
            "tatumakiIn", "tatumakiOut",
            # Chung's rand % 3 > 1.
            "launchAway", "flySideWall",
            # Kiki's raw vx −800 (PC 1814).
            "launchDown",
            # Its op 0x1f's r[7:9] (PC 934), which a test doesn't read
            # (0x4138d1), as SAKUYA's.
            "launchUp",
            # Op 0x01 before op 0x02 (PCs 1892–1893), as ANMC P's.
            "grabbed",
            # Ryuko's, then clearing variable 0 and global 13 (PCs 2163–2164,
            # 2181–2182), which no script tests.
            "knockdown", "bounceDown",
            # KAY's: Zoma's KO tests and KO DOWN, but for their op 0x1f's
            # r[6:9], which a test doesn't read (0x4138d1); Zoma's shock, which
            # doesn't set variable 6.
            "ko", "down", "shock",
            # Zoma's, but rambu AIR's roll only skips its sound (PC 1781).
            "rushAirHit",
            # Zoma's.
            "airStun", "chuckToss", "flySide", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
            # His own copies of hit heavy, BEAM Stand and HISA (81, 90, 86),
            # clearing variable 4, where Ryuko's jump to hers. FB gives the
            # striker 10 power (PC 1479) and FBH 13 (PC 1515), as Ryuko's 10
            # and HISA's 3 do; FBB rolls rand % 3 > 1 (PC 1544), as BEAM Stand
            # does. ponytail: FB has no roll and its smoke spawns name the
            # empty ----smoke---- (389, PCs 1499, 1502), where the port plays
            # hit heavy's, with SMOKE >> (390), as ALEX's.
            "fb", "fbb", "fbh",
        },
        # Responses 69 and 70 enter his UNCOUNTER DOWN and Air Fire (127,
        # 128), copies of DOWN and J Att that clear variable 4 where those
        # test it, as Giant's (126, 127). ponytail: as his, Air Fire plays as
        # J Att.
        aliases={127: 79, 128: 77},
        # Results: 勝ち (58) holds image 436 (PC 603), spawning *WIN OBJ1 and
        # 2 (43, 44, PCs 597, 602). The draw calls Stand Demo (27) once (PC
        # 686) and holds image 201 (PC 688). Each first enters DEMO air (28)
        # while airborne (op 0x16, PCs 584, 685); the match lands winners
        # first. The darkening panel, image 1009 (action 42). The Vs. intro:
        # 開始時 (30) jumps to 開始時 BR (32) for global 3 = 0 (PC 294), which
        # skips its display for global 14 = 0 (PC 330), spawns Black (42) and
        # OP super Charge (38, PCs 332–333) and jumps to Round 1 (33) + 2 (PC
        # 335); both play flattened.
        actions=dict(win=58, winStand=27, draw=65, black=42, intro=(32, 3)),
        flat={"win", "intro"},
        # 2001: the HUD face action 76 shows (PC 736), as DIDO's; 445: *name
        # (66, PC 693).
        image_ids={2001, 445},
    ),
    "erus": dict(
        source=("18 ERUS", "4f1bbeaa88b1e94504bbeb655ddf06f122959b04fe0da0f59964cf4529d6b071"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 49
                 "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24},
        twins=ERUS_TWINS,
        # Beside the op 0x1f records on her counter's variable 4 and her Book's
        # variable 2 each opens with (counter_records), which the match plays:
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 2169), and no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockRapid", "crouchBlockRapid",
            "timeStopGuard", "crouchTimeStopGuard",
            # Giant's, but with no op 0x15, so they add her no power
            # (OWN_REACTION_POWER).
            "blockStop", "crouchBlockStop",
            # No op 0x20 where Ryuko's rolls rand % 6 > 2: Chung's HISA, Zoma's
            # chuck toss, SIN's Chain pull back, and a hit heavy no one else's
            # lacks it in.
            "hitHeavy", "launchAway", "chuckToss", "chainPull",
            # SAKUYA's rand % 4 > 1 (PCs 860, 882); the sweep's (PC 923) skips
            # its sound and first two displays; the Tatumakis roll after their
            # op 0x01 (PCs 1261, 1284), which the match's launch doesn't read,
            # as HISO's.
            "airHitHeavy", "jumpHit", "sweep", "tatumakiIn", "tatumakiOut",
            # Zoma's rand % 3 > 1 (PCs 1203, 1836, 1860).
            "uppercut", "dragonFireball", "liftUp",
            # Chung's 1002-tick wait (PC 1186).
            "flySideWall",
            # Kiki's raw vx −800 (PC 1804).
            "launchDown",
            # Its op 0x1f's r[7:9] (PC 962), which a test doesn't read
            # (0x4138d1), as SAKUYA's.
            "launchUp",
            # ANMC P's op 0x01 before op 0x02, but clearing variable 14 first
            # (PC 1872).
            "grabbed",
            # Zoma's, but for the KO's op 0x1f adds' r[9:11] (PCs 635, 639),
            # which an add without a compare doesn't read (0x413921).
            "ko",
            # Zoma's.
            "down", "shock", "airStun", "flySide", "twistSide", "inatuma", "airInatuma",
            # Zoma's, but one 25-tick display (PC 1779) where his has 20.
            "rushAirHit",
            # Ryuko's, also clearing variable 7 (PC 618).
            "lose",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
            # HISO's and ALEX's: copies of hit heavy, BEAM Stand and HISA.
            "fb", "fbb", "fbh",
        },
        # Responses 69 and 70 enter her UNCOUNTER DOWN and Air Fire (128,
        # 129), as HISO's. ponytail: as his, Air Fire plays as J Att.
        aliases={128: 79, 129: 77},
        # Results: 勝ち (60) calls stand demo (28) once (PC 603) and holds
        # image 350 (PCs 612–613), spawning SMOKE DASH >> (558, PC 609). The
        # draw calls 28 once (PC 694). Each first enters DEMO air (29) while
        # airborne (op 0x16, PCs 602, 693). The darkening panel, image 1009
        # (action 45). The Vs. intro: 開始時 (31) jumps to 開始時 BR (34) for
        # global 3 = 0 (PC 294), which for global 14 = 0 (PC 336) jumps past
        # its display (PC 344) to spawn Black (45) and OP super Charge (41,
        # PCs 340–341), then to Round 1 (35) + 3 (PC 343); both play
        # flattened. ponytail: the win's roll, to Random WIN (46, PC 604), and
        # the draw's hop (PCs 701–707) aren't played.
        actions=dict(win=60, winStand=28, draw=67, black=45, intro=(34, 9)),
        flat={"win", "intro"},
        # 2000–2002: the HUD faces action 77 shows, cycling in EX mode (PCs
        # 757–773), as SOU's; 366: *name (68, PC 714).
        image_ids={2000, 2001, 2002, 366},
    ),
    "feng": dict(
        source=("19 OS FENG", "04612f2ce70fdfd030c85024cc5aa1946c5e78e5e40b6a41b4bbe57c08f6fc0f"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 66
                 "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24},
        twins=FENG_TWINS,
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 2139) for COUNTER HIT
            # (190), and no op 0x1e window where Ryuko's opens one.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockRapid", "crouchBlockRapid",
            "timeStopGuard", "crouchTimeStopGuard", "crouchBlockStop",
            # Giant's, but no Hit Up check before its last display (PC 2277).
            "blockStop",
            # rand % 6 > 1 (PCs 965, 989, 1048), where Ryuko's rolls rand % 6
            # > 2 or her sweep has no roll; each skips the voice.
            "hitHeavy", "airHitHeavy", "sweep",
            # No op 0x20 where Ryuko's rolls rand % 6 > 2: Chung's HISA,
            # Kiki's uppercut family, SIN's Chain pull back, and Tatumakis no
            # one else's lacks it in.
            "launchAway", "uppercut", "dragonFireball", "liftUp", "chainPull", "tatumakiIn", "tatumakiOut",
            # Chung's 1002-tick wait (PC 1301).
            "flySideWall",
            # Kiki's raw vx −800 (PC 1794).
            "launchDown",
            # Its op 0x1f's r[7:9] (PC 1085), which a test doesn't read
            # (0x4138d1), as SAKUYA's.
            "launchUp",
            # Op 0x01 before op 0x02 (PC 1864), as ANMC P's.
            "grabbed",
            # KAY's: Zoma's KO tests and KO DOWN, but for their op 0x1f's
            # r[6:9], which a test doesn't read (0x4138d1); Zoma's shock.
            "ko", "down", "shock",
            # Kiki's, but its test of global 0 for make hikari (72) reads > 9
            # (PC 740) for Ryuko's == 10.
            "lose",
            # Zoma's.
            "rushAirHit", "airStun", "chuckToss", "flySide", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
        },
        # Results: 勝ち (67) calls Demo stand (28) once (PC 724) and holds
        # image 431 (PC 734), spawning WIn obj (53, PC 728). The draw calls 28
        # once (PC 821) and fades out to the blank 8191 (PCs 831–839). Each
        # first enters DEMO air (30) while airborne (op 0x16, PCs 723, 820).
        # The darkening panel, image 1009 (action 51). The Vs. intro: 開始時
        # (32) jumps to 開始時 BR (34) for global 3 = 0 (PC 322), which rolls
        # rand % 3 > 1 (PC 360), then skips its display for global 14 = 0 (PC
        # 361), spawns Black (51) and OP super Charge (47, PCs 363–364) and
        # jumps to Round 1 (35) + 3 (PC 366); both play flattened. ponytail:
        # the roll's other third, through OP2 (43, PC 372), isn't played.
        actions=dict(win=67, winStand=28, draw=75, black=51, intro=(34, 4)),
        flat={"win", "intro"},
        # 2000–2002 and 2006: the HUD faces action 85 shows, cycling in EX
        # mode (PCs 884–901), as G Suneo's; 449: *name (76, PC 843).
        image_ids={2000, 2001, 2002, 2006, 449},
    ),
    "sean": dict(
        source=("20 SEAN", "6159ec1d8d87f36e2a90443b7ec51c63e26ac30e6effd780704210ce7c8a69da"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 45
                 "crouchEnter": 19, "crouch": 20, "stand": 21, "turn": 24, "crouchTurn": 25},
        twins=SEAN_TWINS,
        differ={
            # KAY's: Kiki's Hit Up within 10 ticks (PC 2215), no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT, and no clearing
            # of variable 14.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # SAKUYA's: Ryuko's, without clearing variable 14.
            "airGuard", "airBlockHeavy", "airBlockRapid", "airTimeStopGuard",
            # OS FENG's rand % 6 > 1 (PCs 830, 858, 927), where Ryuko's rolls
            # rand % 6 > 2 or her sweep has none; each skips the voice.
            "hitHeavy", "airHitHeavy", "sweep",
            # Rand % 6 > 1 (PC 883), where Ryuko's has none, to 82 + 25 (PC
            # 889): past the voice, the first three displays and the smoke;
            # it clears variable 14 before 8, not after.
            "jumpHit",
            # OS FENG's: no op 0x20 where Ryuko's rolls rand % 6 > 2.
            "launchAway", "uppercut", "dragonFireball", "liftUp", "chainPull", "tatumakiIn", "tatumakiOut",
            # Chung's 1002-tick wait (PC 1212).
            "flySideWall",
            # Kiki's raw vx −800 (PC 1811).
            "launchDown",
            # Its op 0x1f's r[7:9] (PC 972), which a test doesn't read
            # (0x4138d1), as SAKUYA's.
            "launchUp",
            # Op 0x01 before op 0x02 (PC 1891), as ANMC P's.
            "grabbed",
            # KAY's: Zoma's KO tests (PC 638) and KO DOWN (PC 686), but for
            # their op 0x1f's r[6:9], which a test doesn't read (0x4138d1);
            # Zoma's shock.
            "ko", "down", "shock",
            # Zoma's.
            "rushAirHit", "airStun", "chuckToss", "flySide", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
            # Sets variable 5, which J Att counts (PCs 874–876), to 10 where
            # Ryuko's clears it (PC 1964); the match doesn't read it.
            "musicAttack",
            # Clears variables 6, 8, 5 and 14 first (PCs 1616–1619), as his
            # ground form does (PCs 1589–1592) and Ryuko's air form doesn't.
            "airHisoStop",
        },
        # Results: 勝ち (59) calls STAND DEMO (29) once (PC 617), then shows
        # image 122 and loops PCs 621–622 (PC 623); the draw calls 29 once
        # (PC 706), spawns *eff SCC hit2 (261, PC 707) and, after image 116,
        # holds the blank 8191 (PCs 709–711). Each first enters DEMO air (30)
        # while airborne (op 0x16, PCs 616, 705). The darkening panel, image
        # 1009 (action 45). The Vs. intro: 開始時 (33) jumps to 開始時 BR (35)
        # for global 3 = 0 (PC 330), which rises (PC 367) and, for global 14
        # = 0, jumps past its display (PCs 369–371) to spawn Black (45) and OP
        # super Charge (41, PCs 372–373), then to Round 1 (36) + 5 (PC 375),
        # which falls (PC 391) and lands into 36 + 15 (slot 1, PC 390); both
        # play flattened.
        actions=dict(win=59, winStand=29, winLoop=(59, 6), draw=66, black=45, intro=(35, 0), introLand=(36, 15)),
        flat={"intro", "introLand"},
        # 2001: the HUD face action 75 shows (PC 756); 247: *name (67, PC 715).
        image_ids={2001, 247},
    ),
    "gon": dict(
        source=("21 GON", "9bf383984a5a242cad631ddabd87bd6afe76590105f3cfa8baa911bf60f20126"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 6, "land": 12,  # PC 80
                 "crouchEnter": 21, "crouch": 22, "stand": 23, "turn": 26, "crouchTurn": 27},
        twins=GON_TWINS,
        # Beside the op 0x1f records on his counters' variable 4 each opens
        # with (counter_records), which the match plays:
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 2275), and no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # SAKUYA's: Ryuko's, without clearing variable 14.
            "airBlockHeavy",
            # SAKUYA's rand % 4 > 1 (PCs 964, 989, 1338, 1958, 1981) to
            # Ryuko's rand % 6 > 2; the sweep's (PC 1054), where Ryuko's has
            # none, as ERUS's.
            "hitHeavy", "airHitHeavy", "uppercut", "dragonFireball", "liftUp", "sweep",
            # Rand % 4 > 1 (PC 1012), where Ryuko's has none, to 91 + 19, past
            # its voice; it clears variable 14 before 8 (PC 1001), not after.
            "jumpHit",
            # No op 0x20 where Ryuko's rolls rand % 6 > 2: Chung's HISA, Zoma's
            # chuck toss, SIN's Chain pull back and OS FENG's Tatumakis.
            "launchAway", "chuckToss", "chainPull", "tatumakiIn", "tatumakiOut",
            # Chung's 1002-tick wait (PC 1320).
            "flySideWall",
            # Kiki's raw vx −800 (PC 1927).
            "launchDown",
            # Its op 0x1f's r[7:9] (PC 1095), which a test doesn't read
            # (0x4138d1), as SAKUYA's.
            "launchUp",
            # Op 0x01 before op 0x02 (PC 1999), as ANMC P's.
            "grabbed",
            # 5, 15 and 10 ticks (PCs 2229–2231) to Ryuko's three tens.
            "getUp",
            # KAY's: Zoma's KO tests (PC 749) and KO DOWN (PC 797), but for
            # their op 0x1f's r[6:9], which a test doesn't read (0x4138d1);
            # Zoma's shock.
            "ko", "down", "shock",
            # Clears variable 6 before 14 (PC 740), not after.
            "lose",
            # Zoma's.
            "rushAirHit", "airStun", "flySide", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
            # HISO's and ALEX's: copies of hit heavy, BEAM Stand and HISA.
            "fb", "fbb", "fbh",
        },
        # Responses 69 and 70 enter his UNCOUNTER DOWN and Air Fire (134,
        # 135), as HISO's. ponytail: as his, Air Fire plays as J Att.
        aliases={134: 79, 135: 77},
        # Results: 勝ち (65) calls Stand DEMO (31) once (PC 694), shows image
        # 619 and loops images 620–623 (PCs 699–707), spawning win word (51,
        # PC 695) and *eff WIN (50, PC 698). The draw calls 31 once (PC 817)
        # and holds image 653 (PCs 837–838). Each first enters DEMO air (33)
        # while airborne (op 0x16, PCs 692, 816). The darkening panel, Black
        # (48). The Vs. intro: 開始時 (36) jumps to 開始時 BR (38) for global
        # 3 = 0 (PC 395), which skips its display for global 14 = 0 (PC 433),
        # spawns Black (48) and OP super Charge (44, PCs 435–436) and jumps
        # to Round 1 (39) + 2 (PC 438), which leaps (PC 452) and lands into
        # 39 + 25 (slot 1, PC 451); both play flattened. ponytail: the win's
        # roll, to RANDOM WIN (68, PC 693), isn't played; the intro's (PC
        # 456) only picks its voice.
        actions=dict(win=65, winStand=31, winLoop=(65, 8), draw=75, black=48, intro=(38, 3),
                     introLand=(39, 25)),
        flat={"intro", "introLand"},
        # 2000–2002 and 2006: the HUD faces action 82 shows, cycling in EX
        # mode (PCs 884–897), as OS FENG's; 654: *name (76, PC 842).
        image_ids={2000, 2001, 2002, 2006, 654},
    ),
    "kate": dict(
        source=("22 KATE", "39aced37d9b563fe66eb505c0c4e52dcaea904b7bc79df320a9ff1879fda956f"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 53
                 "crouchEnter": 17, "crouch": 18, "stand": 19, "turn": 22, "crouchTurn": 23},
        twins=KATE_TWINS,
        # Her hit reactions also clear variable 1 (PCs 772, 794, ...), which
        # her arrows set to 100 for EN slash (PCs 3833, 3994) and the double
        # jumps and air dashes to 10 and 20 (PCs 115, 192). The match plays
        # only a reaction's counter_records; nothing reads 100 outside EN
        # slash start, which clears it first (PC 3870), and landing clears it
        # (0x411810) before her air normals test 10 or 20 again. Beside that
        # and the op 0x1f on her counter's variable 4 each opens with
        # (counter_records), which the match plays:
        differ={
            # Ryuko's.
            "hit", "airHit", "drillDown", "dstToss", "twist", "hitPull", "hitRapid", "airHitRapid", "fly", "stun",
            "fireLaunch", "gonMiss", "chuckUp", "twistSideHit", "icePunch", "airIcePunch", "hisoStop", "chuckYo",
            # KAY's: Kiki's Hit Up within 10 ticks (PC 2256), no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT, and no clearing
            # of variable 14.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # SAKUYA's: Ryuko's, without clearing variable 14.
            "airGuard", "airBlockHeavy", "airBlockRapid", "airTimeStopGuard",
            # No op 0x20 where Ryuko's rolls rand % 6 > 2: ERUS's hit heavy,
            # SIN's heavy air hit, Chung's HISA, Zoma's chuck toss and OS
            # FENG's uppercut family, Tatumakis and Chain pull back.
            "hitHeavy", "airHitHeavy", "launchAway", "chuckToss", "uppercut", "dragonFireball", "liftUp",
            "tatumakiIn", "tatumakiOut", "chainPull",
            # SIN's: rand % 3 > 1 (PC 913), where Ryuko's has none, to skip its
            # sound.
            "sweep",
            # Clears variable 14 before 8 (PC 861), not after.
            "jumpHit",
            # Chung's 1002-tick wait (PC 1190).
            "flySideWall",
            # Kiki's raw vx −800 (PC 1851).
            "launchDown",
            # Its op 0x1f's r[7:9] (PC 956), which a test doesn't read
            # (0x4138d1), as SAKUYA's.
            "launchUp",
            # Op 0x01 before op 0x02 (PC 1928), as ANMC P's.
            "grabbed",
            # KAY's: Zoma's KO tests (PC 636) and KO DOWN (PC 684), but for
            # their op 0x1f's r[6:9], which a test doesn't read (0x4138d1);
            # Zoma's shock.
            "ko", "down", "shock",
            # Zoma's.
            "rushAirHit", "airStun", "flySide", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
            # Sets variable 5, which J Att counts (PCs 863–865), to 10 (PC
            # 2001) where Ryuko's clears it, as SEAN's; the match doesn't read
            # it.
            "musicAttack",
            # ERUS's: Ryuko's, also clearing variable 7 (PC 627).
            "lose",
            # HISO's and ALEX's: copies of hit heavy, BEAM Stand and HISA.
            "fb", "fbb", "fbh",
        },
        # Responses 69 and 70 enter her UNCOUNTER DOWN and Air Fire (127,
        # 128), as HISO's. ponytail: as his, Air Fire plays as J Att.
        aliases={127: 79, 128: 77},
        # Results: 勝ち (58) calls sTAND demo (27) twice (PC 602), shows
        # images 130 and 265 and loops images 265 and 266 (PCs 618–620); the
        # draw calls 27 once (PC 704) and holds image 267 (PC 707). Each first
        # enters DEMO air (28) while airborne (op 0x16, PCs 601, 703). The
        # darkening panel, Black (42). The Vs. intro: 開始時 (30) jumps to
        # 開始時 BR (32) for global 3 = 0 (PC 297), which skips its display
        # for global 14 = 0 (PC 333), spawns Black (42) and OP super Charge
        # (38, PCs 335–336) and jumps to Round 1 (33) + 2 (PC 338), which
        # calls sTAND demo once (PC 353); it plays flattened. ponytail: the
        # win's roll, to RANDOM WIN (44, PC 603), isn't played; its second
        # (PC 613) only picks its voice.
        actions=dict(win=58, winStand=27, winLoop=(58, 18), draw=65, black=42, intro=(32, 3)),
        flat={"intro"},
        # 2001: the HUD face action 76 shows (PC 754), as HISO's; 276: *name
        # (66, PC 711).
        image_ids={2001, 276},
    ),
    "remu": dict(
        source=("23 REMU", "94c8d6d438ccc2219c3c43e62aef6ed707865014a0c73494f0177aa8adc0ba28"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 51
                 "crouchEnter": 20, "crouch": 21, "stand": 22, "turn": 25, "crouchTurn": 26},
        twins=REMU_TWINS,
        # Beside the op 0x1f on MINAMI's variable 4 each opens with
        # (counter_records), which the match plays:
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 2207), and no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # SAKUYA's rand % 4 > 1 (PCs 857, 882) to Ryuko's rand % 6 > 2.
            "hitHeavy", "airHitHeavy",
            # Rand % 5 > 1 (PCs 1224, 1868, 1892) to Ryuko's rand % 6 > 2.
            "uppercut", "dragonFireball", "liftUp",
            # Rand % 4 > 1 (PC 904), where Ryuko's has none, to 83 + 18, past
            # its voice, as SAKUYA's.
            "jumpHit",
            # No op 0x20 where Ryuko's rolls rand % 6 > 2: Chung's HISA, Zoma's
            # chuck toss, SIN's Chain pull back and OS FENG's Tatumakis.
            "launchAway", "chuckToss", "chainPull", "tatumakiIn", "tatumakiOut",
            # Chung's 1002-tick wait (PC 1207).
            "flySideWall",
            # Kiki's raw vx −800 (PC 1836).
            "launchDown",
            # Its op 0x1f's r[7:9] (PC 983), which a test doesn't read
            # (0x4138d1), as SAKUYA's.
            "launchUp",
            # Op 0x01 before op 0x02 (PC 1911), as ANMC P's.
            "grabbed",
            # Clear the supers' variable 14 (PCs 2166, 2184), which keeps
            # Black (46) darkening (PC 510), or tatsumaki's variable 6 and
            # variable 0 (PCs 2154–2155), where Ryuko's don't.
            "knockdown", "bounceDown", "getUp",
            # KAY's: Zoma's KO tests (PC 665), but for their op 0x1f's r[6:9],
            # which a test doesn't read (0x4138d1).
            "ko",
            # Ryuko's, without clearing variable 14.
            "lose",
            # Zoma's: KO DOWN (PC 713), shock, rush air hit, air stun, HISA
            # SIDE FLY and Chuck Twis side.
            "down", "shock", "rushAirHit", "airStun", "flySide", "twistSide",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead (PCs 1541, 1568–1571).
            "inatuma", "airInatuma",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
            # Sets variable 5, which J Att counts (PCs 895–897), to 10 (PC
            # 1980) where Ryuko's clears it, as SEAN's, without clearing
            # variable 14; the match doesn't read it.
            "musicAttack",
            # HISO's and ALEX's: copies of hit heavy, BEAM Stand and HISA; FB
            # also rolls rand % 4 > 1 (PC 1655), as his hit heavy does.
            "fb", "fbb", "fbh",
        },
        # Responses 69 and 70 enter his UNCOUNTER DOWN and Air Fire (129,
        # 130), as HISO's. ponytail: as his, Air Fire plays as J Att.
        aliases={129: 79, 130: 77},
        # Results: 勝ち (60) calls stand demo (30) twice (PC 647), shows image
        # 137, flies up at raw vy −1450 (PC 651) and loops image 138 (PCs
        # 652–653); the draw calls 30 once (PC 743), shows image 145, spawns
        # *eff time up (67, PC 746) and holds image 419 (PCs 747–748). Each
        # first enters DEMO air (31) while airborne (op 0x16, PCs 646, 742).
        # The darkening panel, Black (46). The Vs. intro: 開始時 (33) jumps
        # to 開始時 BR (35) for global 3 = 0 (PC 343), which jumps on to 35 +
        # 10 for global 14 = 0 (PC 379), rises (PC 388), spawns Black (46)
        # and OP super Charge (42, PCs 384–385) and jumps to Round 1 (36) + 5
        # (PC 387), which calls OP movie rp (40) fifteen times (PCs 404–406)
        # and lands into 36 + 44 (slot 1, PC 430); both play flattened.
        # ponytail: the intro's rolls (PCs 396, 399) only pick its voice.
        actions=dict(win=60, winStand=30, winLoop=(60, 7), draw=68, black=46, intro=(35, 10),
                     introLand=(36, 44)),
        flat={"intro", "introLand"},
        # 2001: the HUD face action 76 shows (PC 792), as KATE's; 428: *name
        # (69, PC 752).
        image_ids={2001, 428},
    ),
    "rear": dict(
        source=("24 REAR", "2d3b726fb2c2804b6bcce075bc33de453fe27a8555bcd001bbeab973b33f484f"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 46
                 "crouchEnter": 19, "crouch": 20, "stand": 21, "turn": 24, "crouchTurn": 25},
        twins=REAR_TWINS,
        # KATE's, but none opens with a counter's test: his hit reactions also
        # clear variable 1 (PCs 743, 763, ...), which his clock sets to 100
        # for Evil EN3 (PC 4123) and the double jumps and air dashes to 10
        # and 20 (PCs 123, 216). Nothing reads 100 outside Evil EN3, whose
        # EVIL EN3 start clears it first (PC 4312), and landing clears it
        # (0x411810) before his air normals test 10 or 20 again. Beside that:
        differ={
            # Ryuko's.
            "hit", "airHit", "drillDown", "dstToss", "twist", "hitPull", "hitRapid", "airHitRapid", "fly", "stun",
            "fireLaunch", "gonMiss", "chuckUp", "twistSideHit", "icePunch", "airIcePunch", "hisoStop", "chuckYo",
            "jumpHit", "musicAttack",
            # KAY's: Kiki's Hit Up within 10 ticks (PC 2003) into COUNTER ATT
            # (179), which spends 100 power (PC 2322), no op 0x1e window where
            # Ryuko's opens one for COUNTER HIT, and no clearing of variable
            # 14.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # SAKUYA's: Ryuko's, without clearing variable 14.
            "airGuard", "airBlockHeavy", "airBlockRapid", "airTimeStopGuard",
            # No op 0x20 where Ryuko's rolls rand % 6 > 2: ERUS's hit heavy,
            # SIN's heavy air hit, Chung's HISA, Zoma's chuck toss and OS
            # FENG's uppercut family, Tatumakis and Chain pull back.
            "hitHeavy", "airHitHeavy", "launchAway", "chuckToss", "uppercut", "dragonFireball", "liftUp",
            "tatumakiIn", "tatumakiOut", "chainPull",
            # ERUS's rand % 4 > 1 (PC 873), where Ryuko's has none, past its
            # voice.
            "sweep",
            # Chung's 1002-tick wait (PC 1134).
            "flySideWall",
            # Kiki's raw vx −800 (PC 1633).
            "launchDown",
            # Its op 0x1f's r[7:9] (PC 912), which a test doesn't read
            # (0x4138d1), as SAKUYA's.
            "launchUp",
            # Op 0x01 before op 0x02 (PC 1704), as ANMC P's.
            "grabbed",
            # KAY's: Zoma's KO tests (PC 610) and KO DOWN (PC 658), but for
            # their op 0x1f's r[6:9], which a test doesn't read (0x4138d1);
            # Zoma's shock.
            "ko", "down", "shock",
            # Zoma's.
            "rushAirHit", "airStun", "flySide", "twistSide",
            # Op 0x16 after clearing the variables (PC 1533), which Ryuko's
            # ERUS INATUMA AIR clears instead.
            "inatuma", "airInatuma",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
            # ERUS's: Ryuko's, also clearing variable 7 (PC 602).
            "lose",
            # Clear the supers' variable 14 (PCs 1955, 1972), where Ryuko's
            # don't.
            "knockdown", "bounceDown",
        },
        # Results: 勝ち (59) calls STAND DEMO (29) twice (PC 591), shows image
        # 383 and loops image 384 (PCs 595–596); the draw calls 29 twice (PC
        # 678), shows image 126 and holds image 386 (PCs 680–681). Each first
        # enters DEMO air (30) while airborne (op 0x16, PCs 590, 677). The
        # darkening panel, Black (45). The Vs. intro: 開始時 (31) jumps to
        # 開始時 BR (33) for global 3 = 0 (PC 299), which jumps on to 33 + 10
        # for global 14 = 0 (PC 336), rises unseen (PC 345), spawns Black (45)
        # and OP super Charge (41, PCs 341–342) and jumps to Round BR (36, PC
        # 344), which glides in (PCs 375, 380) and lands into 36 + 9 (slot 1,
        # PC 374), calling STAND DEMO twice (PC 386); both play flattened.
        actions=dict(win=59, winStand=29, winLoop=(59, 6), draw=66, black=45, intro=(33, 10),
                     introLand=(36, 9)),
        flat={"intro", "introLand"},
        # 2001: the HUD face action 75 shows (PC 726); 387: *name (67, PC
        # 685).
        image_ids={2001, 387},
    ),
    "gigi": dict(
        source=("25 GIGI", "32e47f30a981c71639c9b4e0e8590049ccd80ddd95bbf5918763d86904169856"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 70
                 "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24},
        twins=GIGI_TWINS,
        # Giant's, beside the op 0x1f on his counter's variable 4 each opens
        # with (counter_records, PCs 763, 783, ...), which Counter (321)
        # holds at 100 for 100 ticks (PCs 4995–5008) to enter Counter!!
        # (322):
        differ={
            # Kiki's Hit Up within 10 ticks (PC 2156), and no op 0x1e window
            # where Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "blockStop", "crouchBlockStop", "blockRapid", "timeStopGuard",
            "crouchTimeStopGuard",
            # Giant's, but its last check takes J and K together (PC 2222).
            "blockHeavy",
            # Giant's, but sliding at raw −320 unslowed (PC 2251) or −250
            # (PC 2382) to his −650.
            "crouchBlockHeavy", "crouchBlockRapid",
            # Chung's rand % 3 > 1 (PC 812) to Ryuko's rand % 6 > 2, or no op
            # 0x20.
            "hitHeavy", "airHitHeavy", "tatumakiIn", "tatumakiOut", "launchAway", "chuckToss", "chainPull",
            # Kiki's raw vx −800 (PC 1794).
            "launchDown",
            # Zoma's KO tests (PC 591) and landing wait (PC 614).
            "ko",
            # KAY's: Zoma's KO DOWN (PC 639) and shock.
            "down", "shock",
            # Zoma's.
            "rushAirHit", "airStun", "uppercut", "dragonFireball", "liftUp", "flySide", "flySideWall", "twistSide",
            # Op 0x01 before op 0x02 (PC 1869), as ANMC P's.
            "grabbed",
            # Yo's: clears variable 14 before 8 and 5 (PC 2092), not after.
            "vanish",
            # Giant's own copies of hit heavy and HISA, clearing variable 4
            # (PCs 1356, 1406); FBB is KAY's, rolling rand % 3 > 1 (PC
            # 1391), as Ryuko's BEAM Stand does.
            "fb", "fbb", "fbh",
            # Op 0x16 after clearing the variables (PC 1643), which Ryuko's
            # ERUS INATUMA AIR clears instead.
            "inatuma", "airInatuma",
        },
        # Responses 69 and 70 enter his UNCOUNTER DOWN and Air Fire (124,
        # 125), as Giant's. ponytail: as his, Air Fire plays as J Att.
        aliases={124: 79, 125: 77},
        # Results: 勝ち (56) calls Demo stand (28) once (PC 572) and loops
        # image 211 (PC 578); the draw calls 28 twice (PC 659), spawns TIME
        # UP RUN (64, PC 661) and holds image 2000 (PC 663). Each first enters
        # DEMO air (29) while airborne (op 0x16, PCs 571, 658). The darkening
        # panel, Black (42). The Vs. intro: 開始時 (30) jumps to 開始時 BR (32)
        # for global 3 = 0 (PC 308), past its display for global 14 = 0 (PC
        # 348), spawns Black and OP super Charge (38, PCs 350–351), then jumps
        # to Round 1 (33) + 2 (PC 353), which calls Demo stand once (PC 362);
        # it plays flattened.
        actions=dict(win=56, winStand=28, winLoop=(56, 7), draw=63, black=42, intro=(32, 3)),
        flat={"intro"},
        # 2000–2002: the HUD faces action 72 shows, cycling in his Change form
        # (PCs 730–746), as Ryuko's in EX mode; 328: *name (68, PC 694).
        image_ids={2000, 2001, 2002, 328},
    ),
    "sww": dict(
        source=("26 SWW", "3d59b35b087fc4e294d4987dcd944d1f8b1e00ee32d69d62fbdbf57bec0dc881"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 55
                 "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24},
        twins=SWW_TWINS,
        # GIGI's, beside the op 0x1f on his counters' variable 4 each opens
        # with (counter_records): 100 (PCs 856, 1752, ...), which COUNTER
        # CHAIN's counter (319) holds for 70 ticks (PCs 4989–4994), enters
        # CHAIN COOUNTER SUCCESS (325), or Chain Counter Fire (323) from the
        # fire balls (PCs 1396, 1419); 200, which EX Chain (232) holds for 70
        # ticks (PCs 3416–3431), enters EXC Att (233). Beside that:
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 2187), and no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy",
            # DIDO's: Stop Stand, time stand and time stop stand hold their
            # slide 23 ticks; so do his Stop Sit, time sit and time stop sit
            # (PCs 2299, 2358, 2419), where hers hold 10.
            "blockStop", "blockRapid", "timeStopGuard", "crouchBlockStop", "crouchBlockRapid", "crouchTimeStopGuard",
            # Chung's rand % 3 > 1 to Ryuko's rand % 6 > 2, or no op 0x20.
            "hitHeavy", "airHitHeavy", "tatumakiIn", "tatumakiOut", "launchAway", "chuckToss", "chainPull",
            # SIN's: the sweep rolls rand % 3 > 1 to skip its sound (PC 869).
            "sweep",
            # Kiki's raw vx −800 (PC 1770).
            "launchDown",
            # Giant's: clear player variable 14, not 1 (PCs 2093, 2109).
            "knockdown", "bounceDown",
            # Zoma's KO tests (PC 574) and landing wait.
            "ko",
            # KAY's: Zoma's KO DOWN (PC 622).
            "down",
            # Zoma's, but setting variable 5 to 10 (PC 1043), which his J Att
            # tests (PCs 814–815), where Zoma's clears it.
            "shock",
            # Zoma's.
            "rushAirHit", "uppercut", "dragonFireball", "liftUp", "flySide", "twistSide",
            # Chung's 1002-tick wait.
            "flySideWall",
            # Ryuko's, also clearing variable 8 after its test (PC 907).
            "launchUp",
            # Ryuko's and Zoma's, also clearing global 13 (PCs 1470, 1494),
            # which neither the engine nor his program reads.
            "stun", "airStun",
            # Op 0x01 before op 0x02 (PC 1846), as ANMC P's.
            "grabbed",
            # Yo's: clears variable 14 before 8 and 5, not after.
            "vanish",
            # HISO's and ALEX's own copy of hit heavy, Giant's of HISA, and
            # SAKUYA's BEAM Stand, rolling rand % 3 > 1 (PC 1432).
            "fb", "fbb", "fbh",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead.
            "inatuma", "airInatuma",
        },
        # Responses 69 and 70 enter his UNCOUNTER DOWN and Air Fire (123,
        # 124), as Giant's. ponytail: as his, Air Fire plays as J Att.
        aliases={123: 79, 124: 77},
        # Results: 勝ち (57) calls Demo stand (28) once (PC 539) and loops
        # PCs 542–559 (PC 560); the draw calls 28 once (PC 642) and loops
        # images 288–289 (PC 646). Each first enters DEMO air (29) while
        # airborne (op 0x16, PCs 538, 641). The darkening panel, Black (43).
        # The Vs. intro, as GIGI's: 開始時 (30) jumps to 開始時 BR (32) for
        # global 3 = 0 (PC 279), past its display for global 14 = 0 (PC 317),
        # spawns Black and OP super Charge (39, PCs 319–320), then jumps to
        # Round 1 (33) + 2 (PC 322), which calls Demo stand once (PC 334); it
        # plays flattened.
        actions=dict(win=57, winStand=28, winLoop=(57, 5), draw=64, black=43, intro=(32, 3)),
        flat={"intro"},
        # 2000–2002: the HUD faces action 72 shows, cycling in EX mode (PCs
        # 690–705), as GIGI's; 399: *name (65, PC 649).
        image_ids={2000, 2001, 2002, 399},
    ),
    "ogi": dict(
        source=("27 OGI", "7a2fb88da89c82aeb63768958f367746dcaf858af9eab03f173f8f1ead0eae2a"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 58
                 "crouchEnter": 19, "crouch": 20, "stand": 21, "turn": 24, "crouchTurn": 25},
        twins=OGI_TWINS,
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 2028), and no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "blockHeavy", "blockStop", "crouchBlockStop", "blockRapid", "crouchBlockRapid",
            "timeStopGuard", "crouchTimeStopGuard",
            # Giant's, but with no check in its last 13 ticks (PC 2125).
            "crouchBlockHeavy",
            # Chung's rand % 3 > 1 (PCs 851, 875, 1262) to Ryuko's rand % 6 >
            # 2, or no op 0x20.
            "hitHeavy", "airHitHeavy", "tatumakiIn", "tatumakiOut", "launchAway", "chuckToss", "chainPull",
            # SAKUYA's rand % 4 > 1 (PCs 1206, 1709, 1732).
            "uppercut", "dragonFireball", "liftUp",
            # SIN's: the sweep rolls rand % 3 > 1 to skip its sound (PC 935).
            "sweep",
            # Kiki's raw vx −800 (PC 1678).
            "launchDown",
            # Zoma's KO tests (PC 673) and landing wait.
            "ko",
            # KAY's: Zoma's KO DOWN (PC 721).
            "down",
            # GON's, clearing variable 6 before 14, but first clearing
            # variable 7 (PC 664), which his program only ever clears.
            "lose",
            # Zoma's.
            "shock", "rushAirHit", "airStun", "flySide", "twistSide",
            # Chung's 1002-tick wait (PC 1190).
            "flySideWall",
            # Op 0x01 before op 0x02 (PC 1750), as ANMC P's.
            "grabbed",
            # Ryuko's, but clearing variable 14 before 5 (PC 1817), not after.
            "musicAttack",
            # Yo's: clears variable 14 before 8 and 5 (PC 1966), not after.
            "vanish",
            # Op 0x16 after clearing the variables (PC 1580), which Ryuko's
            # ERUS INATUMA AIR clears instead.
            "inatuma", "airInatuma",
        },
        # Results: 勝ち (62) calls demo act (29) once (PC 638) and loops image
        # 642 (PCs 659–660); the draw calls 29 once (PC 741) and holds image
        # 142 (PC 745). Each first enters DEMO air (30) while airborne (op
        # 0x16, PCs 637, 740). The darkening panel, Black (47). The Vs.
        # intro: 開始時 (34) jumps to 開始時 BR (36) for global 3 = 0 (PC 345),
        # which rolls rand % 4 > 1 (PC 381), then skips its display for global
        # 14 = 0 (PC 382), spawns Black and OP super Charge (43, PCs 384–385)
        # and jumps to Round 1 (37) + 4 (PC 387), which spawns *OP obj (33)
        # twice (PCs 401–402) and calls OP motion RP (41) 14 times (PC 403);
        # it plays flattened. ponytail: the roll's other half, which jumps to
        # RANDON OP1 (31) + 2 (PC 393), as long, isn't played.
        actions=dict(win=62, winStand=29, winLoop=(62, 23), draw=69, black=47, intro=(36, 4)),
        flat={"intro"},
        # 2001: the HUD face action 77 shows (PC 789); 648: *name (70, PC
        # 749).
        image_ids={2001, 648},
    ),
    "ziro": dict(
        source=("28 ZIRO", "baa3606df8a5deffcf74ab4df961416f94c5674f5f40aea9be9124dc087f6295"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 72
                 "crouchEnter": 19, "crouch": 20, "stand": 21, "turn": 24, "crouchTurn": 25},
        twins=ZIRO_TWINS,
        differ={
            # Giant's: Kiki's Hit Up within 10 ticks (PC 2242), and no op 0x1e
            # window where Ryuko's opens one for COUNTER HIT.
            "guard", "crouchGuard", "crouchBlockHeavy", "blockStop", "crouchBlockStop", "blockRapid",
            "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # Giant's, but with no check in its last 13 ticks (PC 2308).
            "blockHeavy",
            # SAKUYA's rand % 4 > 1 (PCs 1071, 1095, 1183, 1481, 1503) to
            # Ryuko's rand % 6 > 2.
            "hitHeavy", "airHitHeavy", "launchAway", "tatumakiIn", "tatumakiOut",
            # Rand % 4 > 1 (PC 1116), where Ryuko's has none, to 94 + 18, past
            # its voice and first display, as SAKUYA's.
            "jumpHit",
            # No op 0x20 where Ryuko's rolls rand % 6 > 2: Kiki's uppercut
            # family, Zoma's chuck toss and SIN's Chain pull back.
            "uppercut", "dragonFireball", "liftUp", "chuckToss", "chainPull",
            # Kiki's raw vx −800 (PC 1899).
            "launchDown",
            # Zoma's KO tests (PC 779), but for its op 0x1f's r[6:9], which a
            # test doesn't read (0x4138d1).
            "ko",
            # His own KO down (70): past Zoma's landing wait and life test
            # (PCs 826–827), it rolls rand % 3 > 1 (PC 828) for a sound, gets
            # up and rolls rand % 4 > 2 (PC 834) into Random lose (75), or
            # flashes red into ko DOWN2 (71, PC 851), which bursts and flies.
            "down",
            # ERUS's, also clearing variable 7 (PC 772).
            "lose",
            # Ryuko's, without clearing variable 2.
            "fly",
            # Zoma's, without clearing variable 14.
            "shock",
            # Zoma's.
            "rushAirHit", "airStun", "flySide", "twistSide",
            # Chung's 1002-tick wait (PC 1412).
            "flySideWall",
            # Op 0x01 before op 0x02 (PC 1967), as ANMC P's.
            "grabbed",
            # Ryuko's, but rolling rand % 11 > 1 (PC 2038) to her rand % 31 > 1.
            "musicAttack",
            # Yo's: clears variable 14 before 8 and 5 (PC 2180), not after.
            "vanish",
            # Op 0x16 after clearing the variables (PC 1801), which Ryuko's
            # ERUS INATUMA AIR clears instead.
            "inatuma", "airInatuma",
        },
        # Results: 勝ち (66) calls demo act (30) once (PC 759) and loops image
        # 142 (PCs 765–766); the draw calls 30 once (PC 940) and loops a call
        # of Randon op rp (32, PCs 947–948). Each first enters DEMO air (52)
        # while airborne (op 0x16, PCs 756, 938). The darkening panel, Black
        # (49). The Vs. intro: 開始時 (36) jumps to 開始時 BR (38) for global 3 =
        # 0 (PC 390), which rolls rand % 6 > 3 (PC 428) and, for global 14 = 0,
        # jumps to 38 + 18 (PC 429): it rises (PC 445), spawns Black and OP
        # super Charge (45, PCs 434–435) and enters Round 1 (39) + 6 (PC 438),
        # which falls (PC 459) and lands into 39 + 11 (slot 1, PC 458); both
        # play flattened. His KO down's ko DOWN2, ko down 2 fly and ko DOWN3
        # (71–73) follow it (ZIRO_KO).
        actions=dict(win=66, winStand=30, winLoop=(66, 10), draw=78, drawLoop=32, black=49, intro=(38, 18),
                     introLand=(39, 11), koBurst=71, koFly=72, koRest=73),
        flat={"intro", "introLand"},
        # 2000–2002 and 2006: the HUD faces action 87 shows, cycling in EX mode
        # (PCs 994–1008); 478: *name (79, PC 952).
        image_ids={2000, 2001, 2002, 2006, 478},
    ),
    "masa": dict(
        source=("29 MASA", "7342b136f942f4eaf52e9ac38b7f631b3c2b6d45f5fcd57ecb2af703855b2526"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 36
                 "crouchEnter": 22, "crouch": 23, "stand": 24, "turn": 27, "crouchTurn": 28},
        twins=MASA_TWINS,
        # His darkening is variable 13, which his Black (75) tests (PC 664)
        # and his supers set to 100 (PCs 4105, 4364, 5124, ...), so nearly
        # every reaction clears 13 where Ryuko's clears 14 (PCs 1076, 2264,
        # ...), or clears it where hers clears nothing:
        differ={
            # Giant's, clearing 13 where his clear 14, but their last Hit Up
            # check, into Counter Attack (221), has a 13-tick window (PCs
            # 2277, 2301) to his 10.
            "guard", "crouchGuard",
            # Giant's, clearing 13 where his clear 14: Kiki's Hit Up within 10
            # ticks, and no op 0x1e window where Ryuko's opens one for COUNTER
            # HIT.
            "blockHeavy", "blockStop", "crouchBlockStop", "blockRapid", "crouchBlockRapid", "timeStopGuard",
            "crouchTimeStopGuard",
            # The same, but with a 23-tick display (PC 2374) for his 13.
            "crouchBlockHeavy",
            # Ryuko's, clearing 13 where hers clear 14.
            "airGuard", "airBlockHeavy", "airBlockRapid", "airTimeStopGuard", "hit", "airHit", "jumpHit",
            "drillDown", "dstToss", "twist", "hitPull", "launchUp", "sweep", "hitRapid", "airHitRapid", "fly",
            "stun", "fireLaunch", "gonMiss", "chuckUp", "twistSideHit", "icePunch", "airIcePunch", "hisoStop",
            "chuckYo",
            # Chung's rand % 3 > 1 (PCs 1118, 1141) to Ryuko's rand % 6 > 2,
            # or no op 0x20, clearing 13.
            "hitHeavy", "airHitHeavy", "launchAway", "chuckToss",
            # Kiki's uppercut family, without Ryuko's rand % 6 > 2, clearing 13.
            "uppercut", "dragonFireball", "liftUp",
            # OS FENG's Tatumakis, clearing 13.
            "tatumakiIn", "tatumakiOut",
            # SAKUYA's, clearing 13 (PC 1888).
            "launchDown",
            # Zoma's, clearing 13.
            "shock", "airStun", "flySide", "twistSide", "inatuma",
            # HISO's, clearing 13 (PC 1864).
            "rushAirHit",
            # SIN's Chain pull back, clearing 13 (PC 1607).
            "chainPull",
            # ANMC P's op 0x01 before op 0x02, clearing 13 (PC 1963).
            "grabbed",
            # Yo's: clears 13 before 8 and 5 (PC 2188), not after.
            "vanish",
            # Ryuko's, clearing 13 (PCs 2233, 2249) where hers clear 6.
            "knockdown", "bounceDown",
            # Ryuko's, then a voice from a chain of rolls, rand % 9 > 1 to
            # rand % 3 > 1 (PCs 2205–2225).
            "getUp",
            # Zoma's KO tests (PC 900), after jumping to KO 2 (99, PC 899) for
            # variable 14 = 10, which only his 開始時 D50 and D10 (47–48, PCs
            # 397, 409) set.
            "ko",
            # Ryuko's, after jumping to KO 2 2nd (100, PC 925) for variable
            # 14 = 10.
            "koAgain",
            # Zoma's KO DOWN.
            "down",
            # Ryuko's, clearing only 13 (PC 893) where hers clears 14, 6 and 8.
            "lose",
            # Clears variables 6, 8, 13 and 5 (PCs 2029–2033), then rolls rand %
            # 3 > 1 (PC 2036) past a voice that a chain of rolls picks (PCs
            # 2040–2061) to call its displays ten times (PC 2038), 100 ticks
            # for Ryuko's one; ponytail: the match runs its first roll and
            # the chain's first, and one call per pass.
            "musicAttack",
            # Chung's 1002-tick wait.
            "flySideWall",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead.
            "airInatuma",
        },
        # Results: 勝ち (94) calls DEMO STAND (32) twice (PC 861), rolls a voice
        # (PCs 862–880) and jumps to Win Motion (95, PC 881), which loops
        # images 450–451 from PC 889 (PC 891); the draw (105) calls 32 twice
        # (PC 1006) and holds image 122 (PC 1008). Each first enters DEMO air
        # (33) while airborne (op 0x16, PCs 860, 1005). The darkening panel,
        # Black (75). The Vs. intro: 開始時 (44) jumps to 開始時 BR (52) for
        # global 3 = 0 (PC 348), which, for global 14 = 0, jumps past its
        # display (PC 453), spawns Black and OP super Charge (71, PCs
        # 455–456) and enters OP normal (65) + 3 (PC 458), which calls TVS S
        # 2 (68) 20 times (PC 607) and DEMO STAND twice (PC 609); it plays
        # flattened. ponytail: 開始時's test of global 10 for 10 (PC 347), into
        # 開始時 SELECT (51), isn't played.
        actions=dict(win=95, winStand=32, winLoop=(95, 7), draw=105, black=75, intro=(52, 4)),
        flat={"intro"},
        # 2001: the HUD face action 117 shows (PC 1056); 139: *name (106, PC
        # 1012).
        image_ids={2001, 139},
    ),
    "times": dict(
        source=("30 3-TIMES", "9193936fbd71a05971d7acb6038f0278464ca08fbb3b267f9675771c45cefb59"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 35
                 "crouchEnter": 14, "crouch": 15, "stand": 16, "turn": 19, "crouchTurn": 20},
        twins=TIMES_TWINS,
        # His darkening is variable 13, as MASA's: his Black (75) tests it
        # (PC 573) and his supers set it to 100 (PCs 2926, 3316, 3730), so
        # his reactions clear 13 where Ryuko's clear 14, and never his unused
        # 6, which hers clear too:
        differ={
            # Ryuko's, clearing 14, but gaining more power (op 0x15: 2, 5 and
            # 3 to her 1, 3 and 2, PCs 2176, 2209, ...) without her op 0x10
            # into its COUNTER NO form, op 0x1e or Hit Up checks into COUNTER
            # HIT, so each holds one longer display (PCs 2182, 2218, ...).
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # Ryuko's, gaining more power (PCs 2198, ...).
            "airGuard", "airBlockHeavy", "airBlockRapid", "airTimeStopGuard",
            # Ryuko's, clearing only 13 (PCs 974, ...).
            "hit", "airHit", "jumpHit", "drillDown", "dstToss", "twist", "hitPull", "sweep", "hitRapid",
            "airHitRapid", "stun", "fireLaunch", "gonMiss", "chuckUp", "twistSideHit", "icePunch", "airIcePunch",
            "hisoStop", "chuckYo",
            # Chung's rand % 3 > 1 (PCs 1015, 1038) to Ryuko's rand % 6 > 2,
            # or no op 0x20, clearing only 13.
            "hitHeavy", "airHitHeavy", "launchAway", "chuckToss",
            # Kiki's uppercut family, without Ryuko's rand % 6 > 2, clearing
            # only 13 (PC 1348, ...).
            "uppercut", "dragonFireball", "liftUp",
            # OS FENG's Tatumakis, clearing only 13 (PC 1401, ...).
            "tatumakiIn", "tatumakiOut",
            # SAKUYA's, clearing only 13 (PC 1787).
            "launchDown",
            # Zoma's, clearing only 13 (PCs 1254, 1759, ...).
            "shock", "airStun", "flySide", "twistSide", "inatuma", "rushAirHit",
            # SWW's Hit UP, clearing only 13 (PC 1133).
            "launchUp",
            # ZIRO's FLY NO HIT, clearing only 13 (PC 1368).
            "fly",
            # SIN's Chain pull back, clearing only 13 (PC 1504).
            "chainPull",
            # ANMC P's op 0x01 before op 0x02, clearing only 13 (PC 1862).
            "grabbed",
            # Yo's: clears 13 before 8 and 5 (PC 2096), not after.
            "vanish",
            # MASA's: Ryuko's, clearing 13 (PCs 2142, 2158) where hers clear 6.
            "knockdown", "bounceDown",
            # MASA's: Ryuko's, then a voice from a chain of rolls, rand % 9 >
            # 1 to rand % 3 > 1 (PCs 2114–2134).
            "getUp",
            # Giant's KO tests (PC 801), after jumping to KO 2 (98, PC 800)
            # for variable 14 = 10, which only his 開始時 D50 and D10 (47–48,
            # PCs 316, 325) set.
            "ko",
            # MASA's: Ryuko's, after jumping to KO 2 2nd (99, PC 826) for
            # variable 14 = 10.
            "koAgain",
            # KAY's KO down.
            "down",
            # MASA's: Ryuko's, clearing only 13 (PC 794) where hers clears 14,
            # 6 and 8.
            "lose",
            # MASA's, but clearing variables 8, 5 and 13 (PCs 1930–1932): it
            # rolls rand % 3 > 1 (PC 1936) past a voice that a chain of rolls
            # picks (PCs 1940–1961) to call its displays ten times (PC 1938);
            # ponytail: the match runs its first roll and the chain's first,
            # and one call per pass.
            "musicAttack",
            # Chung's 1002-tick wait.
            "flySideWall",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead.
            "airInatuma",
        },
        # Results: 勝ち (94) calls DEMO STAND (32) twice (PC 769), rolls a voice
        # (PCs 770–788) and loops his stance from PC 789 (PC 792); the draw
        # (104) calls 32 twice (PC 907) and holds image 122 (PC 909). Each
        # first enters DEMO air (33) while airborne (op 0x16, PCs 768, 906).
        # The darkening panel, Black (75). The Vs. intro: 開始時 (44) jumps
        # to 開始時 BR (52) for global 3 = 0 (PC 267), which, for global 14 =
        # 0, jumps past its display (PC 369), spawns Black and OP super Charge
        # (71, PCs 371–372) and enters OP normal (65) + 2 (PC 374), which
        # fades him in and calls DEMO STAND 7 times (PC 525); it plays
        # flattened. ponytail: 開始時's test of global 10 for 10 (PC 266),
        # into 開始時 SELECT (51), isn't played.
        actions=dict(win=94, winStand=32, winLoop=(94, 22), draw=104, black=75, intro=(52, 4)),
        flat={"intro"},
        # 2001: the HUD face action 114 shows (PC 953); 139: *name (105, PC
        # 913).
        image_ids={2001, 139},
    ),
    "zenka": dict(
        source=("31 ZENKA", "477bcfe7d3938cba1bf86cfffc9972345ecfc50af93f4f317af14372244b3b38"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 63
                 "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24},
        twins=ZENKA_TWINS,
        # His darkening is variable 13, as MASA's: his Black (54) tests it
        # (PC 602) and his supers set it to 100 (PCs 3669, 3877, 3916, 4050,
        # 4082, 4183), so his reactions clear 13 where Ryuko's clear 14. Most
        # also test variable 14 for 10 (op 0x1f, PCs 959, 980, ...), which
        # only his 開始時 yowai (33, PC 478) sets, off the Vs. intro's path,
        # to skip their last body box; the match keeps the fall-through, as
        # it does for his moves' tests, which enter their yowai forms (P1 y,
        # 201, PC 2595, ...):
        differ={
            # Giant's guards (Hit Up within 10 ticks into Counter Hit, 195,
            # which spends 100 power, PC 2565), clearing 13.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # Ryuko's, clearing 13, without the test.
            "airGuard", "airBlockHeavy", "airBlockRapid", "airTimeStopGuard", "chuckYo", "musicAttack",
            # Ryuko's, clearing 13, with it.
            "hit", "airHit", "drillDown", "dstToss", "dstTossSpin", "twist", "twisting", "twisting2", "hitPull",
            "slamBounce", "hitRapid", "airHitRapid", "shockLoop", "stun", "twistFly", "twistWall", "twistSideHit",
            "inatumaRp", "icePunch", "airIcePunch", "hisoStop", "airHisoStop",
            # Ryuko's, then losing 40 life again (op 0x15, PC 2111).
            "gonMiss",
            # Ryuko's, then 1030 ticks for her 1205 to land (PC 2062).
            "chuckUp",
            # Ryuko's, clearing 13 where hers clears 14, after a test of
            # variable 0 for 10 (PC 802), which nothing of his sets, into his
            # empty Start KO 3 (46).
            "lose",
            # Zoma's, clearing 13, with the test.
            "dstTossSpin2", "twistSide", "inatuma", "airInatuma", "flySideWall",
            # Zoma's, clearing 13, without it.
            "shock",
            # Zoma's, with 1005 ticks for his 1205 to land (PCs 1859, 2029,
            # 1662) or 1030 (PCs 1386, 1922, 1947).
            "rushAirHit", "chuckToss", "airStun", "uppercut", "dragonFireball", "liftUp",
            # Chung's, with 1005 ticks for his 1205 (PCs 1444, 1562), or a
            # zero-length display, holding to the landing (PC 1120).
            "flySide", "tatumakiIn", "chainPull", "launchAway",
            # G Suneo's, without clearing variable 7, or the roll (tatumakiOut),
            # or rolling rand % 3 > 1 (PC 1085) as Ryuko's does (sweep).
            "launchUp", "fireLaunch", "tatumakiOut", "sweep",
            # ERUS's.
            "hitHeavy",
            # SIN's, stopping (PC 1014) before op 0x15 (PC 1017).
            "airHitHeavy",
            # Yo's: the jump hit, and the Chuck 消える clearing 13 before 8
            # and 5.
            "jumpHit", "vanish",
            # Kiki's HISA Down at raw −800 (PC 1880).
            "launchDown",
            # REAR's.
            "knockdown", "bounceDown",
            # ANMC P's op 0x01 before op 0x02.
            "grabbed",
            # ZIRO's FLY NO HIT.
            "fly",
            # G Suneo's KO NORMAL and KO NORMAL 2nd.
            "ko", "koAgain",
            # Zoma's KO DOWN.
            "down",
        },
        # Results: 勝ち (77) calls DEMO STAND (28) once (PC 787), steps back
        # into his stance (284–287, PCs 789–793), rolls a voice (PC 794),
        # calls demo speak rp (38) eight times (PC 798) and holds image 283
        # (PCs 799–800); it plays flattened. The draw (84) holds 283 after the
        # stance (PC 887). Each first enters DEMO air (29) while airborne (op
        # 0x16, PCs 786, 879). The darkening panel, Black (54). The Vs. intro:
        # 開始時 (30) jumps to 開始時 BR (32) for global 3 = 0 (PC 427), which,
        # for global 14 = 0, jumps past its display (PC 464), spawns Black and
        # OP super Charge (49, PCs 466–467), calls demo speak rp ten times
        # (PC 470) and takes his stance; it plays flattened. ponytail:
        # 開始時's test of global 10 for 10 (PC 428), into 開始時 BR + 2,
        # isn't played.
        actions=dict(win=77, winStand=28, draw=84, black=54, intro=(32, 3)),
        flat={"win", "intro"},
        # 2001: the HUD face action 92 shows (PC 934); 333: *name (85, PC
        # 891).
        image_ids={2001, 333},
    ),
    "zmega": dict(
        source=("32 Z-MEGA", "1c6e25a2e665b7ccee92d417423d0b52abc4fd9ac9a72b3844c671a0306ff98a"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 53
                 "crouchEnter": 20, "crouch": 21, "stand": 22, "turn": 25, "crouchTurn": 26},
        twins=ZMEGA_TWINS,
        # His reactions clear variable 14, as Ryuko's do, but never 6, which
        # nothing of his sets:
        differ={
            # 3-TIMES's: Ryuko's, gaining more power (op 0x15: 2, 5 and 3 to
            # her 1, 3 and 2, PCs 1986, 2016, 2077, ...) without her op 0x10
            # into its COUNTER NO form, op 0x1e or Hit Up checks into COUNTER
            # HIT, so each holds one longer display.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # 3-TIMES's: Ryuko's, gaining more power (PCs 2006, ...).
            "airGuard", "airBlockHeavy", "airBlockRapid", "airTimeStopGuard",
            # Ryuko's, keeping 6 (PCs 786, ...).
            "hit", "airHit", "jumpHit", "drillDown", "dstToss", "twist", "hitPull", "hitRapid", "airHitRapid",
            "fly", "stun", "fireLaunch", "gonMiss", "chuckUp", "twistSideHit", "musicAttack", "icePunch",
            "airIcePunch", "hisoStop", "chuckYo",
            # SAKUYA's rand % 4 > 1 (PCs 830, 853, 1173, 1654, 1676, 1227,
            # 1248) to Ryuko's rand % 6 > 2.
            "hitHeavy", "airHitHeavy", "uppercut", "dragonFireball", "liftUp", "tatumakiIn", "tatumakiOut",
            # Chung's rand % 3 > 1 (PCs 934, 1336) to Ryuko's rand % 6 > 2,
            # or where hers has none (PC 911), or none where hers has one.
            "launchAway", "chainPull", "sweep", "chuckToss",
            # Kiki's HISA Down at raw −800 (PC 1624), with Zoma's order of op
            # 0x1a and op 0x15 (PC 1615).
            "launchDown",
            # SAKUYA's Hit UP: its op 0x1f on variable 8 (PC 947), which a
            # test doesn't read, in place of Ryuko's two.
            "launchUp",
            # MASA's: Ryuko's, clearing 14 (PCs 1951, 1967) where hers clear 6.
            "knockdown", "bounceDown",
            # ANMC P's op 0x01 before op 0x02 (PC 1693).
            "grabbed",
            # Zoma's.
            "shock", "airStun", "rushAirHit", "flySide", "twistSide", "inatuma",
            # Yo's: clears 14 before 8 and 5 (PC 1898), not after.
            "vanish",
            # Chung's 1002-tick wait (PC 1158).
            "flySideWall",
            # Op 0x16 after clearing the variables, which Ryuko's ERUS INATUMA
            # AIR clears instead.
            "airInatuma",
            # Ryuko's, but rolling rand % 6 > 2 (PC 1937) past a one-tick
            # display whose hit and guard handlers name RAMDOM GET UP (156)
            # while its box (kind 2, PC 1940) sits 9869 pixels down, where
            # nothing meets it; either way it takes 30 ticks. ponytail: it
            # plays as a clip through that display, drawing no roll.
            "getUp",
            # ZIRO's: Zoma's KO tests (PC 647).
            "ko",
            # KAY's: Zoma's KO DOWN (PC 695).
            "down",
            # Ryuko's, keeping 6, after a test of variable 0 for 10 (PC 636),
            # which his form change sets only to 0 and 100, into his empty
            # Start KO 3 (46). It deletes his slots 5 and 9 (PCs 637–638),
            # Shin Z's drain among them.
            "lose",
        },
        # Results: 勝ち (65) calls DEMO stand (30) once (PC 619) and loops
        # image 319 from PC 623 (PC 626), shaking the screen each pass; the
        # draw (73) calls 30 once (PC 716) and loops image 201 (PC 719). Each
        # first deletes his slot 5 (PCs 615, 714) and enters DEMO air (32)
        # while airborne (op 0x16, PCs 616, 715). ponytail: 勝ち's test of
        # variable 0 into Win2 (66, PC 617) and rand % 6 > 1 into Random
        # win1 (53, PC 618), and DEMO stand's into DEMO stand sp (31, PC
        # 342), aren't played. The darkening panel, Black (52). The Vs.
        # intro: 開始時 (33) jumps to 開始時 BR (35) for global 3 = 0 (PC
        # 367), which, for global 14 = 0, jumps past its display (PC 402),
        # spawns Black and OP super Charge (48, PCs 404–405) and enters Round
        # 1 (36) + 2 (PC 407); it plays flattened. ponytail: 開始時's test of
        # global 10 for 10 (PC 368), into 開始時 BR + 2, isn't played.
        actions=dict(win=65, winStand=30, winLoop=(65, 9), draw=73, drawLoop=(73, 4), black=52, intro=(35, 3)),
        flat={"intro"},
        # 2001: the HUD face action 82 shows (PC 767); 322: *name (74, PC
        # 723).
        image_ids={2001, 322},
    ),
    "alpha": dict(
        source=("33 ALPHA", "7fd71636ceb7002768fd9573828f8f90f0f8fd827847913edcb2e87c1f1dad2e"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 49
                 "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24},
        twins=ALPHA_TWINS,
        # His darkening is variable 13, as ZENKA's: his Black (59) tests it
        # (PC 816) and his supers set it to 100 (PCs 4545, 5545, 5609, 5645,
        # 6003, 6152), so his reactions clear 13 (PCs 1352, 1373, ...) where
        # Ryuko's clear 14. Most also test variable 14 for 10 (op 0x1f, PCs
        # 1359, 1381, ...), which only his 開始時 yowai (34, PC 479) sets, off
        # the Vs. intro's path; the match keeps the fall-through, as it does
        # for his moves' tests (PCs 3069, 3092, ...):
        differ={
            # ZENKA's: Giant's guards (Hit Up within 10 ticks into Counter hit,
            # 211, which spends 100 power, PC 3020) and Ryuko's reactions,
            # clearing 13, with or without the test.
            "guard", "crouchGuard", "airGuard", "blockHeavy", "crouchBlockHeavy", "airBlockHeavy", "blockStop",
            "crouchBlockStop", "blockRapid", "crouchBlockRapid", "airBlockRapid", "timeStopGuard",
            "crouchTimeStopGuard", "airTimeStopGuard",
            "hit", "airHit", "hitHeavy", "drillDown", "dstToss", "dstTossSpin", "twist", "twisting", "twisting2",
            "hitPull", "slamBounce", "grabbed", "hitRapid", "airHitRapid", "fly", "shock", "shockLoop", "stun",
            "twistSide", "twistFly", "twistWall", "twistSideHit", "vanish", "inatuma", "inatumaRp", "airInatuma",
            "icePunch", "airIcePunch", "hisoStop", "airHisoStop", "chuckYo",
            # ZENKA's, with the test (PC 2570).
            "gonMiss",
            # Ryuko's, with the test, and clearing 13 (fireLaunch, chuckUp).
            "dstTossSpin2", "fireLaunch", "chuckUp",
            # Chung's 1002-tick wait, with the test.
            "flySideWall",
            # SAKUYA's, clearing 13, with the test.
            "airHitHeavy", "jumpHit", "launchDown", "launchUp", "uppercut", "dragonFireball", "liftUp",
            # Zoma's, clearing 13, with the test.
            "rushAirHit", "chuckToss", "airStun", "flySide",
            # Yo's (launchAway), ERUS's (sweep), HISO's (the Tatumakis), SIN's
            # (chainPull) and OGI's (musicAttack), clearing 13, with it.
            "launchAway", "sweep", "tatumakiIn", "tatumakiOut", "chainPull", "musicAttack",
            # G Suneo's, with the test: the same lengths split across more
            # displays.
            "getUp",
            # Zoma's KO NORMAL, but testing variable 15 for 20 into its 2nd
            # (PC 1089) and setting it (PC 1090) where his test and set 3.
            "ko",
            # Zoma's KO DOWN, but testing and setting global 10 (PCs 1129–
            # 1130), which a test doesn't read.
            "down",
            # Ryuko's, clearing 13 and 8 (PCs 1023–1024), then testing variable
            # 0 for 10 into Start KO 3 (51, PC 1019), which only his Start KO 2
            # (50, PC 737) sets, and variable 15 for 10, 20 and 30 into KO Boss
            # N (87), KO NORMAL 2nd (90) and make hikari (96) + 8 (PCs 1026–
            # 1028), which only KO NORMAL sets, to 20.
            "lose",
        },
        # Results: 勝ち (82) calls demo stand (28) once (PC 1002) and loops his
        # stance from PC 1010 (PC 1017); the draw (98) calls 28 once (PC 1282)
        # and holds image 130 (PC 1285). Each first enters DEMO air (29) while
        # airborne (op 0x16, PCs 1001, 1281). The darkening panel, Black (59).
        # The Vs. intro: 開始時 (31) jumps to 開始時 BR (33) for global 3 = 0
        # (PC 426), which, for global 14 = 0, jumps past its display (PC
        # 464), spawns Black and OP super Charge (54, PCs 466–467) and enters
        # OP2 (30) + 2 (PC 469); it plays flattened. ponytail: 開始時's test
        # of global 10 for 10 (PC 427), into 開始時 BR + 14, and 開始時 BR's
        # rand % 3 > 1 (PC 463), into Round 1 (35) + 4 (PC 475), aren't
        # played.
        actions=dict(win=82, winStand=28, winLoop=(82, 10), draw=98, black=59, intro=(33, 4)),
        flat={"intro"},
        # 2001: the HUD face action 108 shows (PC 1333); 576: *name (99, PC
        # 1289).
        image_ids={2001, 576},
    ),
    "shinz": dict(
        source=("34 SHIN-Z", "66c59fbf56c8bc5e8011c8aa57832019e3fd70ca401d8ce4bdd764bf804fc424"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 44
                 "crouchEnter": 19, "crouch": 20, "stand": 21, "turn": 24, "crouchTurn": 25},
        twins=SHINZ_TWINS,
        # His reactions clear variable 14, as Ryuko's do, but never 6, which
        # nothing of his sets:
        differ={
            # Z-MEGA's.
            "guard", "crouchGuard", "airGuard", "blockHeavy", "crouchBlockHeavy", "airBlockHeavy", "blockStop",
            "crouchBlockStop", "blockRapid", "crouchBlockRapid", "airBlockRapid", "timeStopGuard",
            "crouchTimeStopGuard", "airTimeStopGuard",
            "hit", "airHit", "hitHeavy", "airHitHeavy", "twist", "hitPull", "launchDown", "bounceDown", "launchUp",
            "launchAway", "knockdown", "hitRapid", "airHitRapid", "rushAirHit", "shock", "uppercut", "stun",
            "airStun", "dragonFireball", "liftUp", "tatumakiIn", "tatumakiOut", "fireLaunch", "flySide",
            "flySideWall", "twistSideHit", "vanish", "inatuma", "airInatuma", "icePunch", "airIcePunch", "hisoStop",
            # Z-MEGA's, clearing variable 0 first (PCs 1862, 1782, 1765, 1813,
            # 1875, 1894, 1843, 1920), which only his Start KO 2 (44, PC 502)
            # sets.
            "drillDown", "dstToss", "grabbed", "chuckToss", "twistSide", "gonMiss", "chuckUp", "chuckYo",
            # Ryuko's, clearing 0 (PC 1834) where hers clears 6, without her
            # rand % 31 > 1 and its 5-tick display.
            "musicAttack",
            # Ryuko's, keeping 6, and 2 (PC 1275).
            "fly",
            # Ryuko's, keeping 6, without her rand % 6 > 2 (PC 1409).
            "chainPull",
            # Ryuko's, keeping 6, rolling rand % 4 > 1 past the sound (PCs
            # 949, 988).
            "jumpHit", "sweep",
            # Ryuko's, clearing 8, 5 and 14 first (PCs 1542–1544).
            "airHisoStop",
            # Z-MEGA's, rolling rand % 6 > 4 (PC 2013) past its one-tick
            # display whose hit and guard handlers name RAMDOM GET UP (158) and
            # whose box (kind 2, PC 2016) sits 9890 pixels down; either way it
            # takes 30 ticks. ponytail: it plays as a clip through that
            # display, drawing no roll.
            "getUp",
            # Giant's KO NORMAL.
            "ko",
            # Ryuko's, setting variable 3 to 30 (PC 737), which only KO
            # NORMAL's test reads (PC 712).
            "koAgain",
            # Zoma's KO DOWN.
            "down",
            # Ryuko's, clearing 4 and 8 (PCs 707–708), not 14 and 6, after a
            # test of variable 0 for 10 (PC 705) into Start KO 3 (45).
            "lose",
        },
        # Results: 勝ち (67) calls DEMO stand (29) once (PC 696) and loops
        # image 319 from PC 698 (PC 701), shaking the screen each pass; the
        # draw (74) calls 29 once (PC 781) and holds image 236 (PC 783). Each
        # first enters DEMO air (30) while airborne (op 0x16, PCs 695, 780).
        # The darkening panel, Black (50). The Vs. intro: 開始時 (31) jumps to
        # 開始時 BR (33) for global 3 = 0 (PC 300), which, for global 14 = 0,
        # jumps past its display (PC 336), spawns Black and OP super Charge
        # (46, PCs 338–339) and enters Round 1 (34) + 2 (PC 342); it plays
        # flattened. ponytail: 開始時's test of global 10 for 10 (PC 301),
        # into 開始時 BR + 2, isn't played.
        actions=dict(win=67, winStand=29, winLoop=(67, 4), draw=74, black=50, intro=(33, 3)),
        flat={"intro"},
        # 2001: the HUD face action 84 shows (PC 846); 323: *name (75, PC
        # 787).
        image_ids={2001, 323},
    ),
    "zaku": dict(
        source=("35 ZAKU", "a0fb0fb949e8e4d3a5c1f5d1ad789cf2e49995b40180d5e6358aca3186085088"),
        neutral={"idle": 1, "walk": 12, "backwalk": 13, "jump": 14, "land": 20,  # PC 105
                 "crouchEnter": 24, "crouch": 25, "stand": 26, "turn": 29, "crouchTurn": 30},
        twins=ZAKU_TWINS,
        # His reactions clear variable 13, his darkening's, where Ryuko's clear
        # 14, and test global 10 for 10 into his story modes' Hit Mode (177,
        # 178; PCs 751, 920, ...) where hers clear 6, which nothing of his
        # sets; only KGT PCs 542 and 590 write global 10, to 0. With those
        # swaps:
        differ={
            # Ryuko's.
            "hit", "airHit", "jumpHit", "drillDown", "dstToss", "twist", "hitPull", "launchUp", "sweep",
            "hitRapid", "airHitRapid", "stun", "fireLaunch", "gonMiss", "chuckUp", "twistSideHit", "icePunch",
            "airIcePunch", "hisoStop", "chuckYo",
            # Zoma's.
            "rushAirHit", "shock", "chuckToss", "airStun", "flySide", "twistSide", "inatuma",
            # Kiki's.
            "uppercut", "dragonFireball", "liftUp",
            # Chung's, SIN's, ANMC P's, SAKUYA's, ERUS's, OS FENG's, ZIRO's
            # and Yo's.
            "launchAway", "airHitHeavy", "chainPull", "grabbed", "launchDown", "hitHeavy", "tatumakiIn",
            "tatumakiOut", "fly", "vanish",
            # Ryuko's, without clearing 5 (PCs 1659–1662).
            "musicAttack",
            # Ryuko's, testing variable 14 for above 9 into INAI (11, PC 492),
            # which only his story modes' stance sets (PC 28), and global 10
            # into Single KO (78, PC 493).
            "lose",
            # And unswapped: Z-MEGA's, clearing 13 for 14 (PCs 1809, 1825).
            "bounceDown", "knockdown",
            # Zoma's KO NORMAL and ERUS INATUMA AIR, and Chung's fly side wall
            # hit.
            "ko", "airInatuma", "flySideWall",
            # Z-MEGA's, without clearing 14 first.
            "guard", "crouchGuard", "airGuard", "blockHeavy", "crouchBlockHeavy", "airBlockHeavy", "blockStop",
            "crouchBlockStop", "blockRapid", "crouchBlockRapid", "airBlockRapid", "timeStopGuard",
            "crouchTimeStopGuard", "airTimeStopGuard",
            # Ryuko's, its last display 5 ticks (PC 1805), not 10.
            "getUp",
            # Ryuko's KO DOWN, holding his last display 2000 ticks (PC 544),
            # without her test of global 15 and life check (PCs 645–646); his
            # tests of variable 11 (PCs 535, 545) keep their fall-through.
            "down",
        },
        # Results: 勝ち (56) calls DEMO STAND (34) four times (PC 476) and
        # loops the same stance from PC 478 (PC 481), past his sound (PC
        # 477); the draw (67) loops it from its start (PC 605), calling
        # nothing, so the DEMO STAND its clip opens with changes nothing.
        # Each first enters DEMO air (35) while airborne (op 0x16, PCs 475,
        # 601); their tests of global 10 (PCs 474, 600) keep their
        # fall-through. The darkening panel, Black (55). The Vs. intro: 開始時
        # (36) jumps to 開始時 BR (38) for global 3 = 0 (PC 276), which
        # spawns Black and OP super Charge (44, PCs 312–313) and, past its
        # tests of globals 4 and 5 (PCs 316–320), which character select sets
        # to 0 (CHAR SELECT.DEMO, PCs 7–8), enters Round 1 (39, PC 321); it
        # plays flattened. ponytail: 開始時's test of global 10 for 10 (PC
        # 277), into Single Start (75), isn't played.
        actions=dict(win=56, winStand=34, winLoop=(56, 5), draw=67, drawLoop=67, black=55, intro=38),
        flat={"intro"},
        # 2001: the HUD face action 72 shows (PC 645); 139: *name (68, PC
        # 609).
        image_ids={2001, 139},
    ),
    "pachelo": dict(
        source=("36 PAC-HELO", "f88af8d6b57b2f5f4daaceddac2f2cd724aeaff7fbaa5a3ac26384705e3774c8"),
        neutral={"idle": 1, "walk": 12, "backwalk": 13, "jump": 14, "land": 20,  # PC 119
                 "crouchEnter": 24, "crouch": 25, "stand": 26, "turn": 29, "crouchTurn": 30},
        # His reactions sit as ZAKU's do, and play as his but where noted.
        twins=ZAKU_TWINS,
        # As ZAKU's, his reactions clear variable 13 where Ryuko's clear 14,
        # and test global 10 for 10 into his story modes' Hit Mode (177, 178;
        # PCs 758, 935, ...) where hers clear 6. With those swaps:
        differ={
            # Ryuko's.
            "hit", "airHit", "jumpHit", "dstToss", "twist", "hitPull", "sweep", "hitRapid", "airHitRapid", "stun",
            "fireLaunch", "gonMiss", "chuckUp", "twistSideHit", "icePunch", "airIcePunch", "hisoStop", "chuckYo",
            "airInatuma",
            # Ryuko's, its last display 1000 ticks (PC 1753), not 0; either
            # waits for landing.
            "drillDown",
            # Ryuko's, but its op 0x1f's r[7:9] (PC 912), which a test doesn't
            # read (0x4138d1), as SAKUYA's.
            "launchUp",
            # Zoma's.
            "rushAirHit", "shock", "chuckToss", "airStun", "flySide", "twistSide", "inatuma",
            # Kiki's.
            "uppercut", "dragonFireball", "liftUp",
            # Chung's, SIN's, ANMC P's, SAKUYA's, ERUS's, OS FENG's, ZIRO's
            # and Yo's.
            "launchAway", "airHitHeavy", "chainPull", "grabbed", "launchDown", "hitHeavy", "tatumakiIn",
            "tatumakiOut", "fly", "vanish",
            # Ryuko's, without clearing 5 (PCs 1712–1715).
            "musicAttack",
            # Ryuko's, testing variable 14 for above 9 into INAI (11, PC 499)
            # and global 10 into BR KO (78, PC 500).
            "lose",
            # And unswapped: Z-MEGA's, clearing 13 for 14 (PCs 1872, 1888).
            "bounceDown", "knockdown",
            # Zoma's KO NORMAL, and Chung's fly side wall hit.
            "ko", "flySideWall",
            # Z-MEGA's, without clearing 14 first.
            "guard", "crouchGuard", "airGuard", "airBlockHeavy", "airBlockRapid", "airTimeStopGuard",
            # Z-MEGA's, without clearing 14 first, holding their last display
            # 33 ticks (PC 1940, ...), not 23.
            "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop", "blockRapid", "crouchBlockRapid",
            "timeStopGuard", "crouchTimeStopGuard",
            # Ryuko's KO DOWN, holding his last display 2000 ticks (PC 552),
            # without her test of global 15 and life check (PCs 645–646); his
            # tests of variable 11 (PCs 543, 553) keep their fall-through.
            "down",
        },
        # Results as ZAKU's: 勝ち (56) calls Demo stand (34) four times (PC
        # 484) and loops the same stance from PC 486 (PC 488); the draw (67)
        # loops it from its start (PC 613). Each first enters DEMO air (35)
        # while airborne (PCs 483, 610), past a test of global 10 (PCs 482,
        # 609). The darkening panel, Black (55). The Vs. intro: 開始時 (36)
        # jumps to 開始時 BR (38) for global 3 = 0 (PC 286), which spawns
        # Black and OP super Charge (44, PCs 322–323) and, past its tests of
        # globals 4 and 5 (PCs 326–329), enters Round 1 (39, PC 330); it
        # plays flattened. ponytail: 開始時's test of global 10 for 10 (PC
        # 287), into BR Start (75), isn't played.
        actions=dict(win=56, winStand=34, winLoop=(56, 5), draw=67, drawLoop=67, black=55, intro=38),
        flat={"intro"},
        # 2001: the HUD face action 72 shows (PC 652); 149: *name (68, PC
        # 617).
        image_ids={2001, 149},
    ),
    "golf": dict(
        source=("37 GOLF", "95d9b0970ee13808b626f1febd77019baea534fd01222c31a282fcc821e84230"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 38
                 "crouchEnter": 14, "crouch": 15, "stand": 16, "turn": 19, "crouchTurn": 20},
        twins=GOLF_TWINS,
        # His reactions clear variable 14, as Ryuko's do, but never 6, which
        # only his GIANT!! MUSIC ATTACK clears (PC 1390) and nothing reads; most
        # play as Z-MEGA's:
        differ={
            # Z-MEGA's.
            "hit", "airHit", "jumpHit", "drillDown", "dstToss", "twist", "hitPull", "launchDown", "bounceDown",
            "knockdown", "grabbed", "hitRapid", "airHitRapid", "rushAirHit", "chuckToss", "stun", "airStun",
            "fireLaunch", "flySide", "flySideWall", "twistSide", "gonMiss", "chuckUp", "twistSideHit", "vanish",
            "inatuma", "airInatuma", "icePunch", "airIcePunch", "hisoStop", "chuckYo",
            # SHIN-Z's.
            "fly", "chainPull", "ko", "down",
            # ZAKU's: Z-MEGA's, without clearing 14 first.
            "guard", "crouchGuard", "airGuard", "blockHeavy", "crouchBlockHeavy", "airBlockHeavy", "blockStop",
            "crouchBlockStop", "blockRapid", "crouchBlockRapid", "airBlockRapid", "timeStopGuard",
            "crouchTimeStopGuard", "airTimeStopGuard",
            # Ryuko's, keeping 6.
            "launchUp", "sweep", "lose",
            # Ryuko's, keeping 6, without her rand % 6 > 2 (PCs 794, 819, 909,
            # 1159, 1687, 1711, 1215, 1238).
            "hitHeavy", "airHitHeavy", "launchAway", "uppercut", "dragonFireball", "liftUp", "tatumakiIn",
            "tatumakiOut",
            # SWW's: Ryuko's, setting variable 5 to 10 (PC 776), which his J
            # Att tests (PCs 590–591), where hers clears it and sets 6 to 100.
            "shock",
            # Ryuko's, keeping 5 (PCs 1390–1392), but calling its two displays
            # five times (PC 1396) on each pass, which rolls rand % 31 > 1 (PC
            # 1394) to skip its sound; its clip plays flattened, so each pass
            # takes 50 ticks to her 10.
            "musicAttack",
        },
        # Results: 勝ち (44) calls demo act (24) once (PC 391), then plays its
        # sound (PC 392) and loops a single call of it (PCs 393–394); from
        # the sound it plays flattened, then loops demo act. The draw (51)
        # loops the same stance from its start (PC 471), so the demo act its
        # clip opens with changes nothing. Each first enters DEMO air (25)
        # while airborne (op 0x16, PCs 390, 466). The darkening panel, Black
        # (43). The Vs. intro: 開始時 (26) jumps to 開始時 BR (28) for global 3
        # = 0 (PC 205), which spawns Black and OP super Charge (32, PCs
        # 239–240) and enters Round 1 (29, PC 242), which calls demo act
        # three times (PC 262); it plays flattened.
        actions=dict(win=(44, 3), winStand=24, winLoop=24, draw=51, drawLoop=51, black=43, intro=28),
        flat={"intro", "win", "musicAttack"},
        # 2001: the HUD face action 56 shows (PC 511); 155: *name (52, PC
        # 475).
        image_ids={2001, 155},
    ),
    "asura": dict(
        source=("38 ASURA", "7dc93f54ea34f63170983ca61e39b649493b409cea2a3b99eb2b94cd3f41dfb1"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 38
                 "crouchEnter": 14, "crouch": 15, "stand": 16, "turn": 19, "crouchTurn": 20},
        twins=ASURA_TWINS,
        # His reactions play as GOLF's but where noted: they clear variable
        # 14, as Ryuko's do, but never 6, which only his GIANT!! MUSIC ATTACK
        # clears (PC 1398) and nothing reads.
        differ={
            # Z-MEGA's.
            "hit", "airHit", "jumpHit", "drillDown", "dstToss", "twist", "hitPull", "launchDown", "hitRapid",
            "airHitRapid", "rushAirHit", "chuckToss", "stun", "airStun", "fireLaunch", "flySide", "flySideWall",
            "twistSide", "gonMiss", "chuckUp", "twistSideHit", "vanish", "inatuma", "airInatuma", "icePunch",
            "airIcePunch", "hisoStop", "chuckYo",
            # SHIN-Z's.
            "fly", "chainPull", "down",
            # SHIN-Z's, but rolling rand % 3 > 1 (PC 416) for its other voice.
            "ko",
            # ZAKU's: Z-MEGA's, without clearing 14 first.
            "guard", "crouchGuard", "airGuard", "blockHeavy", "crouchBlockHeavy", "airBlockHeavy", "blockStop",
            "crouchBlockStop", "blockRapid", "crouchBlockRapid", "airBlockRapid", "timeStopGuard",
            "crouchTimeStopGuard", "airTimeStopGuard",
            # Ryuko's, keeping 6.
            "launchUp", "sweep", "lose", "knockdown", "bounceDown",
            # Ryuko's, keeping 6, its first display 30 ticks (PC 1344), not 10.
            "grabbed",
            # Ryuko's, keeping 6, without her rand % 6 > 2 (PCs 819, 909, 1159,
            # 1687, 1711, 1215, 1238).
            "airHitHeavy", "launchAway", "uppercut", "dragonFireball", "liftUp", "tatumakiIn", "tatumakiOut",
            # Chung's, keeping 6: Ryuko's, rolling rand % 3 > 1 (PC 571) to her
            # rand % 6 > 2 (PC 794).
            "hitHeavy",
            # Z-MEGA's and SHIN-Z's: Ryuko's, keeping 6, which hers clears and
            # then sets to 100.
            "shock",
            # Ryuko's, keeping 5 (PCs 1398–1400).
            "musicAttack",
        },
        # Results: 勝ち (44) calls demo stand (24) once (PC 392), plays its
        # sound (PC 393) and loops the same stance from PC 394 (PC 398). The
        # draw (51) plays that stance (PCs 474–477), as the demo stand its
        # clip opens with does, then jumps to 勝ち's start (PC 478), from
        # which it plays flattened. Each first enters DEMO air (25) while
        # airborne (op 0x16, PCs 391, 473). The darkening panel, Black (43).
        # The Vs. intro: 開始時 (26) jumps to 開始時 BR (28) for global 3 = 0
        # (PC 207), which spawns Black and OP super Charge (32, PCs 241–242)
        # and enters Round 1 (29, PC 244), which calls demo stand three times
        # (PC 263); it plays flattened.
        actions=dict(win=44, winStand=24, winLoop=(44, 4), draw=44, drawLoop=(44, 4), black=43, intro=28),
        flat={"intro", "draw"},
        # 2001: the HUD face action 56 shows (PC 511); 137: *name (52, PC
        # 479).
        image_ids={2001, 137},
    ),
    "ttro": dict(
        source=("39 TTRO", "ba55b2c293accce8c277be1481a55a5ddb65a61ca645ed8b73b4462db4c2e920"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 16,  # PC 51
                 "crouchEnter": 19, "crouch": 20, "stand": 21, "turn": 24, "crouchTurn": 25},
        twins=TTRO_TWINS,
        # His reactions play as GOLF's but where noted:
        differ={
            # GOLF's.
            "hit", "airHit", "jumpHit", "drillDown", "dstToss", "twist", "hitPull", "launchDown", "bounceDown",
            "knockdown", "grabbed", "hitRapid", "airHitRapid", "rushAirHit", "chuckToss", "stun", "airStun",
            "fireLaunch", "flySide", "flySideWall", "twistSide", "gonMiss", "chuckUp", "twistSideHit", "vanish",
            "inatuma", "airInatuma", "icePunch", "airIcePunch", "hisoStop", "fly", "chainPull", "ko", "down",
            "guard", "crouchGuard", "airGuard", "blockHeavy", "crouchBlockHeavy", "airBlockHeavy", "blockStop",
            "crouchBlockStop", "blockRapid", "crouchBlockRapid", "airBlockRapid", "timeStopGuard",
            "crouchTimeStopGuard", "airTimeStopGuard", "launchUp", "sweep", "lose", "hitHeavy", "airHitHeavy",
            "launchAway", "uppercut", "dragonFireball", "liftUp", "tatumakiIn", "tatumakiOut",
            # GOLF's, but holding its pose 70 ticks (PC 1712), not 5.
            "chuckYo",
            # ASURA's: Ryuko's, keeping 6, which hers clears and then sets to
            # 100.
            "shock",
            # ASURA's: Ryuko's, keeping 5 (PCs 1620–1622).
            "musicAttack",
            # Ryuko's, but falling from its toss on a held pose (PC 1508)
            # without her 20-tick one first.
            "slamBounce",
        },
        # Results: 勝ち (57) calls DEMO ACT (29) once (PC 535) and loops his
        # last pose from PC 544 (PC 545); the draw (65) calls 29 once (PC 628)
        # and loops its pose (PCs 631–632). Each first enters DEMO air (30)
        # while airborne (op 0x16, PCs 534, 627). The darkening panel, Black
        # (43). The Vs. intro: 開始時 (31) jumps to 開始時 BR (33) for global 3
        # = 0 (PC 279), which, for global 14 = 0, jumps past its display (PC
        # 314), spawns Black and OP super Charge (39, PCs 316–317) and enters
        # Round 1 (34) + 2 (PC 319), which calls DEMO ACT twice (PC 333); it
        # plays flattened. ponytail: 勝ち's rand % 3 > 1 (PC 537), into WIN 2
        # (58), isn't played.
        actions=dict(win=57, winStand=29, winLoop=(57, 11), draw=65, drawLoop=(65, 5), black=43, intro=(33, 3)),
        # His jumps (4) leave their takeoff for J RP (7, PC 55), so the jump
        # plays flattened too.
        flat={"intro", "jump"},
        # 2001: the HUD face action 71 shows (PC 674); 170: *name (66, PC
        # 636).
        image_ids={2001, 170},
    ),
    "astroman": dict(
        source=("40 ASTROMAN", "befb82c288d987b36bc1f3a8458f3742834b07da00bff192d1be6e782ac9782d"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 12,  # PC 66
                 "crouchEnter": 19, "crouch": 20, "stand": 21, "turn": 24, "crouchTurn": 25},
        twins=ASTROMAN_TWINS,
        # His reactions play as TTRO's but where noted:
        differ={
            # TTRO's.
            "hit", "airHit", "jumpHit", "drillDown", "dstToss", "twist", "hitPull", "launchDown", "bounceDown",
            "knockdown", "hitRapid", "airHitRapid", "rushAirHit", "chuckToss", "stun", "airStun", "fireLaunch",
            "flySide", "flySideWall", "twistSide", "gonMiss", "chuckUp", "twistSideHit", "vanish", "inatuma",
            "airInatuma", "icePunch", "airIcePunch", "fly", "chainPull", "ko", "guard", "crouchGuard", "airGuard",
            "blockHeavy", "crouchBlockHeavy", "airBlockHeavy", "blockStop", "crouchBlockStop", "blockRapid",
            "crouchBlockRapid", "airBlockRapid", "timeStopGuard", "crouchTimeStopGuard", "airTimeStopGuard",
            "launchUp", "sweep", "lose", "hitHeavy", "airHitHeavy", "launchAway", "uppercut", "dragonFireball",
            "liftUp", "tatumakiIn", "tatumakiOut", "chuckYo", "shock", "musicAttack", "slamBounce",
            # TTRO's, but setting its land handler (PC 1744) before its
            # motion, not after.
            "grabbed",
            # TTRO's, but bursting again on a 20-tick pose (PCs 704–706)
            # before its 50 and fading his colour over five 10-tick ones
            # after (PCs 710–719).
            "down",
            # TTRO's and Ryuko's, but holding their pose 33 ticks (PCs 1499,
            # 1516), not 36.
            "hisoStop", "airHisoStop",
            # Ryuko's, but lying on a 0-tick display (PC 694), not 1205.
            "koAgain",
        },
        # Results: 勝ち (57) calls Demo act (29) once (PC 620), shrinks back
        # into a slight boy (PCs 621–631), plays sound 2 (PC 633) and loops
        # its last pose from PC 636 (PC 637); the draw (64) calls 29 once (PC
        # 740) and loops its last pose from PC 746 (PC 747). Each first enters
        # DEMO air (30) while airborne (op 0x16, PCs 619, 739). The darkening
        # panel, Black (43). The Vs. intro: 開始時 (31) jumps to 開始時 BR (33)
        # for global 3 = 0 (PC 359), which, for global 14 = 0, jumps past its
        # display (PC 394), spawns Black and OP super Charge (39, PCs 396–397)
        # and enters Round 1 (34) + 2 (PC 399); it plays flattened.
        # ponytail: 勝ち's and Round 1's rand % 3 > 1 (PCs 632, 402) only pick
        # their voice, and the port always plays the other (PCs 633, 403).
        actions=dict(win=57, winStand=29, winLoop=(57, 18), draw=64, drawLoop=(64, 8), black=43, intro=(33, 3)),
        flat={"intro"},
        # 2001: the HUD face action 69 shows (PC 769); 170: VS NAME (56, PC
        # 610), since he has no *name.
        image_ids={2001, 170},
    ),
    "yinan": dict(
        source=("41 YINAN", "89741cec882bf25a4957a0a3b1afa464fd7890007be6a054745b059111556caf"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 71
                 "crouchEnter": 26, "crouch": 27, "stand": 28, "turn": 31, "crouchTurn": 32},
        twins=YINAN_TWINS,
        # Her reactions play as Giant's but where noted:
        differ={
            # Giant's.
            "guard", "crouchGuard", "blockHeavy", "hitHeavy", "airHitHeavy", "blockRapid", "timeStopGuard",
            "blockStop", "crouchBlockStop", "launchAway", "down", "hitRapid", "rushAirHit", "fbb", "stun",
            "tatumakiIn", "tatumakiOut", "twistSide", "inatuma", "airInatuma", "chainPull",
            # Giant's, but lying on a 0-tick display (PCs 1113, 1127, 2135,
            # 2542, 2053), not 1205.
            "ko", "koAgain", "fbh", "chuckToss", "airStun",
            # Giant's, but holding a 0-tick display (PCs 1640, 1703), not
            # 1002.
            "flySide", "flySideWall",
            # Kiki's: Giant's without his roll, the last two lying on a
            # 0-tick display (PCs 2442, 2466), not 1205.
            "uppercut", "dragonFireball", "liftUp",
            # Giant's, rolling rand % 3 > 1 (PC 1377).
            "jumpHit",
            # Giant's, but holding its last pose 8 ticks (PC 2877), not 10.
            "crouchBlockHeavy",
            # Giant's, but holding their last pose 23 ticks (PCs 3015, 3079),
            # not 13.
            "crouchBlockRapid", "crouchTimeStopGuard",
            # Giant's, but falling at raw vx −1000 (PC 2593), not −800, on a
            # 1000-tick display, not 0.
            "drillDown",
            # Giant's, but giving the striker no power before the stops (PC
            # 2389), not 3 after, and falling at raw vx −500 (PC 2398), not
            # −800.
            "launchDown",
            # Giant's, clearing variables 6, 5, 8, 4 and 14 first (PCs
            # 2401–2405).
            "slamBounce",
            # REAR's: Giant's, clearing variable 1 too (PCs 2752, 2734).
            "bounceDown", "knockdown",
            # ANMC P's: op 0x01 before op 0x02 (PCs 2479–2480).
            "grabbed",
            # Giant's, testing variable 0 for 10 first (PC 1078), which never
            # holds.
            "lose",
            # Zoma's: Giant's without clearing variable 1.
            "shock",
            # Giant's, but giving the striker 13 power (PC 2068), not 3.
            "fb",
            # Yo's: Giant's, clearing variable 14 before 8 and 5 (PC 2708).
            "vanish",
        },
        # Ryuko's DOWN and J attack responses name her 'ヒット (UNCOUNTER)
        # DOWN' (154) and 'ヒット (UNCOUNTER) Air Fire' (155), as Giant's.
        aliases={154: 79, 155: 77},
        # Results: 勝ち (79) calls Demo Stand (36) once (PC 908) and loops
        # her last two poses from PC 922 (PC 924); the draw (98) calls 36
        # once (PC 1162) and loops from PC 1177 (PC 1193). Each first enters
        # DEMO air (37) while airborne (op 0x16, PCs 905, 1161). The
        # darkening panel, Black (57). The Vs. intro: 開始時 (38) jumps to
        # 開始時 BR (41) for global 3 = 0 (PC 566), which spawns Black and OP
        # super Charge (59, PCs 614–615) and her four friends (PCs 616–620)
        # and, for global 14 = 0, jumps past its display (PC 621) to Round 1
        # (42) + 7 (PC 624); it plays flattened (animations.ts drops the
        # display). ponytail: 勝ち's rand % 6 > 3 rolls into Win 2 (82) and
        # Win 3 (90) (PCs 906–907) aren't played, nor her EX results: Demo
        # Stand's EX stance (35, PC 543), Win 1 EX (81, PC 909) and the draw's
        # Stop (97, PC 1163), each for variable 0 = 100.
        actions=dict(win=79, winStand=36, winLoop=(79, 18), draw=98, drawLoop=(98, 17), black=57, intro=41),
        flat={"intro"},
        # 2001, 2002, 2007 and 2008: the HUD faces action 104 shows (PCs
        # 1240–1254); 349: *name (99, PC 1197).
        image_ids={2001, 2002, 2007, 2008, 349},
    ),
    "aya": dict(
        source=("42 AYA", "3a9c8740b368b0648d9dd44bad7e448602f5c241d52438e95f7a9441f99c39f7"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 53
                 "crouchEnter": 19, "crouch": 20, "stand": 21, "turn": 24, "crouchTurn": 25},
        twins=AYA_TWINS,
        # Her reactions play as YINAN's but where noted:
        differ={
            # YINAN's.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "hitHeavy", "airHitHeavy", "jumpHit",
            "blockRapid", "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard", "blockStop", "crouchBlockStop",
            "launchDown", "slamBounce", "bounceDown", "knockdown", "ko", "koAgain", "down", "lose", "hitRapid",
            "shock", "fbb", "fbh", "chuckToss", "stun", "airStun", "dragonFireball", "liftUp", "flySide",
            "flySideWall", "twistSide", "vanish", "inatuma", "airInatuma",
            # YINAN's, but lying on a 0-tick display (PCs 961, 938, 914, 1763,
            # 1190, 1249, 1272, 1344, 1952, 1367), not 1205.
            "launchUp", "launchAway", "sweep", "rushAirHit", "uppercut", "tatumakiIn", "tatumakiOut", "fireLaunch",
            "chuckUp", "chainPull",
            # YINAN's, but holding a 0-tick display (PC 1967), not 1000.
            "drillDown",
            # Giant's, giving the striker 3 power (PC 1478), not YINAN's 13.
            "fb",
        },
        # Ryuko's DOWN and J attack responses name her 'ヒット (UNCOUNTER)
        # DOWN' (150) and 'ヒット (UNCOUNTER) Air Fire' (151), as Giant's.
        aliases={150: 79, 151: 77},
        # Results: 勝ち (74) calls Demo Stand (29) once (PC 600) and holds
        # her last pose on a 0-tick display (PC 605); the draw (92) calls 29
        # once (PC 698) and loops image 201 from PC 699 (PC 701). Each first
        # enters DEMO air (30) while airborne (op 0x16, PCs 599, 697). The
        # darkening panel, Black (50). The Vs. intro: 開始時 (31) jumps to
        # 開始時 BR (34) for global 3 = 0 (PC 315), which spawns Black and OP
        # super Charge (52, PCs 361–362) and, for global 14 = 0 (PC 363),
        # jumps past its display (PC 364) to its fader, Round 1 (35, PC 366)
        # and 開始時 + 23 (PC 368), which calls Demo Stand once (PC 340); it
        # plays flattened (animations.ts drops the display).
        actions=dict(win=74, winStand=29, draw=92, drawLoop=(92, 3), black=50, intro=34),
        flat={"intro"},
        # 2001: the HUD face action 100 shows (PC 747); 349: *name (93, PC
        # 705).
        image_ids={2001, 349},
    ),
    "dora": dict(
        source=("46 B6", "09b4d37681acc17ab8a9c4370683b44a096a0890dbb18e0265dad2831a9a3e32"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 10,  # PC 47
                 "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24},
        twins=DORA_TWINS,
        # His file is SEAN's reworked (it keeps SEAN's name image, 247, and
        # sprites); his reactions play as SEAN's but where noted:
        differ={
            # SEAN's.
            "launchAway", "launchUp", "shock", "uppercut", "dragonFireball", "liftUp", "tatumakiIn", "tatumakiOut",
            "flySide", "flySideWall", "twistSide", "rushAirHit", "airStun", "chuckToss", "chainPull", "inatuma",
            "airInatuma", "vanish",
            # SEAN's, clearing variable 14 first (PCs 2385, 2441, ...), their
            # counter checks taking B without a direction (0x2021) where his
            # take it with any; the crouching stop guard checks once less.
            "guard", "crouchGuard", "blockHeavy", "crouchBlockHeavy", "blockStop", "crouchBlockStop", "blockRapid",
            "crouchBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            # SEAN's, clearing 14 first (PC 2691), on one 26-tick display for
            # his 6 and 20.
            "airTimeStopGuard",
            # Ryuko's, rolling rand % 3 > 1 before the power (PC 1145, ...)
            # for her rand % 6 > 2 after the motion; the J attack hit without
            # her tests of variable 5 (PCs 828–831).
            "hitHeavy", "airHitHeavy", "jumpHit",
            # Ryuko's launch (raw −500, PC 2045), giving the striker no power
            # (PC 2037); its bounce clears 6, 5 and 14 (PCs 2048–2051).
            "launchDown", "slamBounce",
            # Ryuko's, clearing 13 (PC 2341) and holding 20 ticks first.
            "getUp",
            # SEAN's KO tests, beside an op 0x10 into KO RELOAD (72) with three
            # stocks (PC 775) and a test of global 3 for 10 into KO NORMAL CPU
            # (70, PC 776), which Vs. play leaves at 0; KO down with a 1-tick
            # display before its test (PC 975). ponytail: KO RELOAD, which
            # spends 270 power, darkens and refills his life through Stop (79)
            # after the round is decided, isn't played.
            "ko", "down",
            # SEAN's, testing variable 0 for 10 into Start KO 3 (44, PC 763),
            # which only his Start KO intro sets (PC 544), and 13 into make
            # hikari (77, PC 769), without clearing 14.
            "lose",
            # SEAN's, on 2-tick displays (PCs 2196–2197), not 5.
            "musicAttack",
            # SEAN's, without clearing variables (PCs 2081–2084).
            "chuckYo",
        },
        # Results: 勝ち (67) calls STAND DEMO (28) once (PC 748), shows four
        # poses and loops three from PC 758 (PCs 756, 761), its rand % 3 > 1
        # (PC 754) picking sound 5 or 10. The draw (81) calls 28 once (PC
        # 1029), spawns his flying double (81 + 6, PC 1030) and hides on image
        # 0 (PC 1032). Each first enters air demo (29) while airborne (op 0x16,
        # PCs 747, 1028). The darkening panel, Black (50). The Vs. intro:
        # 開始時 (30) jumps to 開始時 BR (32) for global 3 = 0 (PC 320), whose
        # first record jumps to Start KO (38, PC 363), a scene in which SEAN
        # beats him down and he takes 1000 life himself (PC 547). Authored:
        # the intro plays 開始時 BR past that jump and its global 14 = 0 test
        # (PC 364), from its spawns of Black and OP super Charge (46, PCs
        # 366–367) into Round 1 (34) + 3 (PC 369), which rises (PC 381) and
        # lands into Round 1 + 27 (slot 1, PC 399), calling STAND DEMO once
        # (PC 404); both play flattened.
        actions=dict(win=67, winStand=28, winLoop=(67, 12), draw=81, black=50, intro=(32, 4),
                     introLand=(34, 27)),
        flat={"intro", "introLand"},
        # 2001: the HUD face action 95 shows (PC 1085); 247: *name (83, PC
        # 1047).
        image_ids={2001, 247},
    ),
    "rario": dict(
        source=("47 RARIO", "4b0e8e17d17c7b3778e55925b20d8259fcab5a04179227ec722639c4839ed49f"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 46
                 "crouchEnter": 12, "crouch": 13, "stand": 14, "turn": 17, "crouchTurn": 18},
        twins=RARIO_TWINS,
        # His reactions play as ASTROMAN's but where noted:
        differ={
            # ASTROMAN's.
            "hit", "airHit", "hitHeavy", "airHitHeavy", "jumpHit", "drillDown", "dstToss", "twist", "hitPull",
            "launchDown", "launchAway", "sweep", "grabbed", "lose", "hitRapid", "airHitRapid", "rushAirHit", "fly",
            "shock", "chuckToss", "uppercut", "stun", "airStun", "dragonFireball", "liftUp", "tatumakiIn",
            "tatumakiOut", "fireLaunch", "flySide", "flySideWall", "twistSide", "gonMiss", "chuckUp", "twistSideHit",
            "vanish", "inatuma", "airInatuma", "icePunch", "airIcePunch", "chainPull", "guard", "crouchGuard",
            "airGuard", "blockHeavy", "crouchBlockHeavy", "airBlockHeavy", "blockStop", "crouchBlockStop",
            "blockRapid", "crouchBlockRapid", "airBlockRapid", "timeStopGuard", "crouchTimeStopGuard",
            "airTimeStopGuard",
            # Z-MEGA's: ASTROMAN's, its variable 8 test carrying 100 in r[7:9],
            # which a test doesn't read.
            "launchUp",
            # ASTROMAN's, clearing variable 5 (PCs 1529, 1513) where his clear 1.
            "bounceDown", "knockdown",
            # ASTROMAN's, on 12-, 8- and 10-tick displays, not three 10s.
            "getUp",
            # ASTROMAN's, launching straight up at raw −1820 (PCs 487, 500),
            # not back at −500/−1520.
            "ko", "koAgain",
            # Ryuko's KO DOWN without its slide (PC 641): he sinks through the
            # floor on eight 2-tick displays (PCs 509–516) and hides on a
            # 50-tick one (PC 517); its global 15 test is == 100, not > 99.
            "down",
            # TTRO's, holding 36 ticks (PC 1190), where ASTROMAN's hold 33.
            "hisoStop",
            # Z-MEGA's, without his op 0x20 roll.
            "musicAttack",
            # DoraEmon's, without clearing variables.
            "chuckYo",
        },
        # Results: 勝ち (50) calls Demo stand (22) once (PC 452), plays sound
        # 21 (PC 454) and loops three poses from PC 456 (PC 460); the draw
        # (57) calls 22 once (PC 537) and loops image 227 from PC 541 (PC
        # 542). Each first enters DEMO air (23) while airborne (op 0x16, PCs
        # 451, 536). The darkening panel, Black (36). The Vs. intro: 開始時
        # (24) jumps to 開始時 BR (26) for global 3 = 0 (PC 193), which, for
        # global 14 = 0, jumps past its display (PC 229), spawns Black and OP
        # super Charge (32, PCs 231–232) and enters Round 1 (27) + 3 (PC
        # 234), which hops (PC 246), hangs (PC 248) and hops again (PC 251),
        # landing into Round 1 + 19 (slot 1, PC 250); both play flattened.
        actions=dict(win=50, winStand=22, winLoop=(50, 6), draw=57, drawLoop=(57, 6), black=36, intro=(26, 3),
                     introLand=(27, 19)),
        flat={"intro", "introLand"},
        # 2001: the HUD face action 63 shows (PC 584); 235: *name (58, PC
        # 546).
        image_ids={2001, 235},
    ),
    "training": dict(
        source=("48 TRAINING", "6110badc3abe14d303bb3efd3303e3c7349d4c6819e278956e11263dee8ed6e9"),
        neutral={"idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,  # PC 54
                 "crouchEnter": 12, "crouch": 13, "stand": 14, "turn": 17, "crouchTurn": 18},
        twins=TRAINING_TWINS,
        # His reactions play as RARIO's but where noted: none clears variable
        # 14, which nothing of his sets or reads.
        differ={
            # RARIO's.
            "hit", "airHit", "hitHeavy", "airHitHeavy", "jumpHit", "drillDown", "dstToss", "twist", "hitPull",
            "launchDown", "launchUp", "launchAway", "sweep", "grabbed", "hitRapid", "airHitRapid", "rushAirHit", "fly",
            "shock", "chuckToss", "uppercut", "stun", "airStun", "dragonFireball", "liftUp", "tatumakiIn",
            "tatumakiOut", "fireLaunch", "flySide", "twistSide", "gonMiss", "chuckUp", "twistSideHit", "musicAttack",
            "icePunch", "airIcePunch", "chainPull", "hisoStop",
            # RARIO's, with nothing to clear.
            "getUp", "ko", "flySideWall", "chuckYo", "guard", "crouchGuard", "airGuard", "blockHeavy",
            "crouchBlockHeavy", "airBlockHeavy", "blockStop", "crouchBlockStop", "blockRapid", "crouchBlockRapid",
            "airBlockRapid", "timeStopGuard", "crouchTimeStopGuard", "airTimeStopGuard",
            # ASURA's, clearing variable 1 (PCs 1400, 1415).
            "bounceDown", "knockdown",
            # RARIO's, holding its last pose 1205 ticks (PC 416), not 0.
            "koAgain",
            # RARIO's, without its global 15 test.
            "down",
            # OS FENG's.
            "lose",
            # RARIO's, clearing no variables.
            "vanish",
            # Ryuko's, keeping 6.
            "inatuma",
            # RARIO's, clearing 8 and 5 first (PCs 1157–1158).
            "airInatuma",
        },
        # Results: 勝ち (34) calls Demo stand (22) three times (PC 366), plays
        # sound 19 (PC 368) and loops three poses from PC 370 (PC 374); the
        # draw (40) calls 22 three times (PC 446) and loops image 227 from PC
        # 450 (PC 451). Each first enters DEMO air (23) while airborne (op
        # 0x16, PCs 365, 445). He has no Black, and nothing of his darkens.
        # The Vs. intro: 開始時 (24) has no BR to jump to, as its op 0x1f on
        # global 3 sets nothing and tests nothing (r[5] 0, PC 220); past its
        # VS banners (PC 226) it dashes back and in on blank displays (PCs
        # 229–232), spawns VS CHANGE (30, PC 234), stands 70 ticks (PC 235)
        # and calls Demo stand four times (PC 240). It plays flattened.
        actions=dict(win=34, winStand=22, winLoop=(34, 6), draw=40, drawLoop=(40, 6), intro=24),
        flat={"intro"},
        # 2001: the HUD face action 44 shows (PC 472).
        image_ids={2001},
    ),
}


def export_fighter(ryuko, ryuko_responses, key, source, neutral, twins, differ, actions, image_ids, aliases={},
                   flat=()):
    data, c, p = player(*source)
    image_ids = set(image_ids)
    tables = player_tables(data, c, image_ids)
    # Giant's reactions open by testing his counter's variable 4 (op 0x1f ==
    # 100, PCs 723, 763, ...), which counter start (278) holds at 100 for its
    # window (PCs 4271–4282), to enter counter hit (279); most others clear it
    # (PCs 744, 788, ...). ERUS's also clear her Book's variable 2 or test it
    # at 10 (PCs 787, 1254, ...). GON's test it at 300, 200 and 100 (PCs 914–
    # 916, ...), one value for each of his counters; his BEAM Air adds 0 to it
    # (PC 1146), which changes nothing. SWW's rambu AIR sets it to 0 and then
    # tests it for 100 (PC 1722), which never passes, since the handler sets
    # before it compares (0x4138df–0x413962). YINAN's test it at 100 for BTK
    # S (314, PC 5552) or at 50 for Driver Shield df (412, PC 7488). Each
    # reaction maps to these records in order: [variable, value, the test's
    # target or 0 for a set].
    counters = {}
    for own in set(tables["responses"]) - {0}:
        for pc in counter_records(p, own):
            record = p.records[pc]
            if record[5] == 4 and u16(record, 9) in ((50, 100, 200, 300) if record[4] == 0x44 else (10,)):
                counters.setdefault(own, []).append([record[4] & 0x3f, u16(record, 9), u16(record, 1)])
            elif record[5] in (1, 5) and u16(record, 7) == 0 and (record[5] == 1 or u16(record, 9)):
                counters.setdefault(own, []).append([record[4] & 0x3f, 0, 0])
            elif record[5] == 2 and u16(record, 7) == 0:
                continue
            else:
                sys.exit(f"Unexpected counter record at {source[0]}'s PC {pc}; refusing to export.")
    for name, (r, z) in twins.items():
        if (gameplay(ryuko, r) == gameplay(p, z, counter_records(p, z))) == (name in differ):
            sys.exit(f"{source[0]}'s {name} ({z}) no longer matches the recorded comparison with Ryuko's {r}; "
                     "refusing to export.")
    # Own reactions a response names where Ryuko's names a twin's other half.
    pairs = {r: z for r, z in twins.values()}
    if {own: r for r, own in zip(ryuko_responses, tables["responses"])
            if own and r in pairs and own != pairs[r]} != aliases:
        sys.exit(f"{source[0]}'s response table no longer pairs as recorded; refusing to export.")
    actions = dict(neutral, **{name: z for name, (_, z) in twins.items() if name not in TIMELINES}, **actions)
    # ANMC P's guards jump to their EX forms while variable 0 is 100 (op 0x1f
    # == 100, PCs 1970, 2015, ...): the same records showing his other costume.
    for name in GUARDS:
        action = p.action(twins[name][1])
        test = next((r for r in p.records[action.start:action.end] if r[0] == 0x1f and r[4] == 0x40 and r[5] == 4
                     and u16(r, 9) == 100), None)
        if test:
            actions[name + "Ex"] = u16(test, 1)
    clips = pose_clips(p, c, actions, image_ids)
    # Clips that play their action's flattened timeline, calls inlined.
    for name in flat:
        index, offset = actions[name] if isinstance(actions[name], tuple) else (actions[name], 0)
        clips[name] = flatten(p, c, index, offset=offset)["frames"]
        image_ids.update(f["image"] for f in clips[name] if f["image"] not in (0, 8191))
    # The moves play from their timelines: the actions of the command entries,
    # each with its level (header r[2]), which a cancel window compares.
    entries = tables["commands"]["entries"]
    moves = sorted({e[k] for e in entries for k in ("air", "near", "far", "crouch") if e[k]})
    levels = {i: p.records[p.action(i).start][2] for i in moves}
    # The scripted reactions, every response's hit effect and every object
    # the clips spawn; the moves, the guard reactions whose op 0x24 enters
    # COUNTER HIT, and the 開始時 a VS round plays. DoraEmon's jumps to Start
    # KO (PC 338), whose 38 + 18 spawns itself each tick until the objects
    # fill the engine's 1023 slots (0x406570); the select screen never offers
    # him in VS single (his flag is 0), so his isn't exported.
    guards = [name for name in GUARDS if not name.startswith("air")]
    own_timelines = {tables["responses"][i] for i in OWN_TIMELINES} - {0}
    queue = [(i, 0) for i in [*(twins[name][1] for name in SCRIPTED + guards),
                              *filter(None, tables["response_effects"]), *moves, *(t for ops in counters.values() for _, _, t in ops if t),
                              *sorted(own_timelines), *([tables["start"]] if key != "dora" else [])]]
    # A move that jumps into one of the player's reactions enters it as the
    # match's: Giant's chuck ends in his FLY NO HIT (101, PC 3291). The match
    # skips the reaction's opening records, so a jump may pass only those: his
    # Drop P lend enters TWIS HIT + 12 (PC 5137).
    # ERUS INATUMA AIR, ICE Punch Air and HISO stop air run out into the heavy
    # air hit's launch (PCs 1582, 1390, 1488: 76 + 19, PC 823), which the
    # match enters at its age 6.
    for name in ("airInatuma", "airIcePunch", "airHisoStop"):
        jump = p.records[p.action(twins[name][1]).end - 1]
        launch = p.action(u16(jump, 1)).start + jump[3]
        if jump[0] != 0x0a or u16(jump, 1) != twins["airHitHeavy"][1] or p.records[launch][0] != 0x01 or sum(
                display_record(p, pc)["duration"] for pc in range(p.action(u16(jump, 1)).start, launch)
                if p.records[pc][0] == 0x0c) != 6:
            sys.exit(f"{source[0]}'s {name} no longer enters its heavy air hit's launch; refusing to export.")
    reactions = set(pairs.values()) | set(aliases)
    scripts = flatten_queue(p, c, queue + spawned(clips), set(actions.values()), image_ids, reactions,
                            set(neutral.values()) | reactions)
    # Clothes off and its 500 form run out into FLY NO HIT + 19 (Ryuko's PC
    # 1267), past its displays to its launch at age 6 (PC 1186), which the
    # match enters there.
    for name, script in scripts.items():
        if script["end"] == "jump" and script["next"] in reactions and int(name.split("+")[0]) not in reactions:
            target = p.action(script["next"])
            displays = [pc for pc in range(target.start, target.start + script["offset"]) if p.records[pc][0] == 0x0c]
            if displays and not (int(name.split("+")[0]) in own_timelines and script["next"] == twins["fly"][1]
                                 and p.records[target.start + script["offset"]][0] == 0x01
                                 and sum(display_record(p, pc)["duration"] for pc in displays) == 6):
                sys.exit(f"{source[0]}'s {name} enters a reaction past a display; refusing to export.")
    # The idle program's cues too: GIGI's sound 8 (PC 24).
    idle = p.action(1)
    sounds = export_sounds(c, key, cued(clips, scripts) | {u16(r, 2) for r in p.records[idle.start:idle.end]
                                                         if r[0] == 0x03})
    select = select_program(p, tables["selectFace"], image_ids)
    images = export_images(c, key, image_ids)
    write_json(GENERATED / f"{key}.json", dict(source_sha256=hashlib.sha256(data).hexdigest(), images=images,
        sounds=sounds, clips=clips, **tables, scripts=scripts, twins=pairs, aliases=aliases, counters=counters,
        select=select, palettes=export_palettes(c, image_ids),
        neutral={i: name for name, i in neutral.items()}, levels=levels,
        idle=dict(start=idle.start, end=idle.end, records=[list(r) for r in p.records[:idle.end]])))
    # Its type, so TypeScript needn't infer it from the JSON.
    write_if_changed(GENERATED / f"{key}.d.json.ts",
                     b"declare const data: import('../characters').FighterData;\nexport default data;\n")
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
    # The engine's own states, from her default-action table (+0x757a), and
    # the jumps' landing handler (slot 1 → 9, PC 43).
    neutral = {
        "idle": 1, "walk": 2, "backwalk": 3, "jump": 4, "land": 9,
        "crouchEnter": 18, "crouch": 19, "stand": 20, "turn": 23, "crouchTurn": 24,
    }
    # Pose clips for what the match draws from clips: neutral, victim and
    # result actions.
    actions = {
        **neutral,
        "guard": 149, "crouchGuard": 151, "airGuard": 153,
        "blockHeavy": 154, "crouchBlockHeavy": 156, "airBlockHeavy": 158,
        "hit": 73, "airHit": 74, "hitHeavy": 75, "airHitHeavy": 76, "jumpHit": 77, "drillDown": 135,
        "blockRapid": 163, "crouchBlockRapid": 165, "airBlockRapid": 167,
        "timeStopGuard": 168, "crouchTimeStopGuard": 170, "airTimeStopGuard": 172,
        "dstToss": 129, "dstTossSpin": 130, "dstTossSpin2": 131,
        "twist": 85, "twisting": 86, "twisting2": 87,
        "hitPull": 121, "blockStop": 159, "crouchBlockStop": 161,
        "launchDown": 123, "slamBounce": 124, "bounceDown": 147,
        "launchUp": 81, "launchAway": 80, "sweep": 79, "chuckToss": 132, "uppercut": 96,
        # 'ヒット DRAGON Yinan': the uppercut's rise, straight up (PC 1715);
        # 'ヒット  Tatumaki <<' and '>>', hops in and out (PCs 1217, 1240).
        "liftUp": 126, "tatumakiIn": 99, "tatumakiOut": 100,
        # 'ヒット Fire HISA', HISA burning; 'ヒット hisa fly side' and 'Chuck Twis
        # side', flying flat out (spinning in 93) to the walls their slot 4
        # handlers hit, 95 and 94; 'Chuck GON MISS', a float into HISA.
        "fireLaunch": 104, "flySide": 91, "flySideWall": 95, "twistSide": 136, "twistFly": 93, "twistWall": 94,
        "gonMiss": 137,
        # 'Chuck up', thrown straight up into a knockdown (PCs 1825, 1824).
        "chuckUp": 134,
        # 'GIANT!! MUSIC ATTACK', a looped daze; 'Chuck 消える', vanished into
        # a fight cloud.
        "musicAttack": 133, "vanish": 143,
        # 'ヒット ERUS INATUMA', which calls its rp (119) seven times (PC 1554);
        # 'ヒット ICE Punch' and its air form, the same 42 ticks frozen blue.
        "inatuma": 118, "inatumaRp": 119, "icePunch": 106, "airIcePunch": 107,
        # 'ヒット HISO stop' and its air form, held 36 ticks under HISO HEAD OBJ
        # (408), then sliding or falling as ICE Punch's do.
        "hisoStop": 113, "airHisoStop": 114,
        # 'ヒット Chain pull back', pulled up toward the striker into a
        # knockdown (PCs 1337, 1341).
        "chainPull": 105,
        # 'Chuck Yo', flying flat out to the wall its slot 4 handler hits, 95.
        "chuckYo": 140,
        "grabbed": 128,
        "knockdown": 146, "getUp": 145,
        "ko": 60, "koAgain": 61, "down": 62, "win": 57, "winStand": 58, "draw": 65,
        # Action 43 'Black', the super darkening the round intro spawns.
        "black": 43,
    }
    # 2000–2002: the HUD faces action 70 shows (EX mode cycles them, PCs 712–730).
    image_ids = {419, 464, 2000, 2001, 2002}
    clips = pose_clips(p, c, actions, image_ids)
    # Her Vs. intro: 開始時 (30) jumps to 開始時 BR (32) for global 3 = 0 (PC
    # 286), which jumps past its display for global 14 = 0 (PC 323), spawns
    # Black and OP super Charge (39, PCs 325–326) and jumps to Round 1 (33) +
    # 4 (PC 328), past its blank repositioning displays; it plays flattened.
    clips["intro"] = flatten(p, c, 32, offset=3)["frames"]
    image_ids.update(f["image"] for f in clips["intro"] if f["image"] not in (0, 8191))
    tables = player_tables(data, c, image_ids)
    # Her moves play from their timelines, as Zoma's do: the actions of her
    # command entries, each with its level (header r[2]).
    entries = tables["commands"]["entries"]
    moves = sorted({e[k] for e in entries for k in ("air", "near", "far", "crouch") if e[k]})
    levels = {i: p.records[p.action(i).start][2] for i in moves}
    # The reactions whose op 0x01 commands, op 0x20 rolls and branches the
    # match plays (the shock 88, FLY NO HIT 97, the rush air hit 122, the beam
    # hits 83 and 84, hits 75–77, 79, 80, 91, 96, 99, 100, 105, 126 and 132 and the air reactions), the lose
    # action (59) whose records open every KO, every response's hit effect and
    # every object the clips spawn; her moves, and the guard reactions whose op
    # 0x24 enters COUNTER HIT (174). Each brings what its events spawn, call
    # and branch into, keyed "action+offset" when a branch enters mid-action.
    # Image 0 (a solid marker block) and 8191 are the source's blank displays.
    queue = [(i, 0) for i in [88, 97, 122, 83, 84, 74, 75, 76, 77, 79, 80, 91, 96, 99, 100, 105, 126, 108, 109, 132, 153, 158,
                              167, 172, 59, 133, 120, 107, 114,
                              *filter(None, tables["response_effects"]), *moves,
                              149, 151, 154, 156, 159, 161, 163, 165, 168, 170,
                              *sorted({tables["responses"][i] for i in OWN_TIMELINES}),
                              # 開始時, which a VS round plays from the start.
                              tables["start"]]]
    scripts = flatten_queue(p, c, queue + spawned(clips), set(actions.values()), image_ids,
                            {r for r, _ in ZOMA_TWINS.values()})
    # Ryuko's sounds the exported cues play, as stored: RIFF/WAVE, 8-bit mono.
    sounds = export_sounds(c, "ryuko", cued(clips, scripts))
    select = select_program(p, tables["selectFace"], image_ids)
    images = export_images(c, "ryuko", image_ids)
    idle = p.action(1)
    write_json(GENERATED / "assets.json", dict(source_sha256=digest, images=images, sounds=sounds, clips=clips,
        **tables, scripts=scripts, select=select, palettes=export_palettes(c, image_ids), neutral={i: name for name, i in neutral.items()}, levels=levels, idle=dict(start=idle.start, end=idle.end, records=[list(r) for r in p.records[:idle.end]])))
    counts = {key: export_fighter(p, tables["responses"], key, **fighter) for key, fighter in FIGHTERS.items()}
    export_ui()
    for key in DEMOS:
        export_demo(key)
    write_json(GENERATED / "stages.json", {key: export_stage(key, *stage) for key, stage in STAGES.items()})
    # Python is an independent oracle. Keep fixtures out of the browser bundle.
    cases = []
    for speed, seeds in [(10, range(12)), (0, [0, 1, 42]), (7, [0, 1, 42]), (20, [0, 1, 42])]:
        for seed in seeds:
            cases.append(dict(seed=seed, speed=speed, result=StandingVM(p, seed=seed, speed=speed).run()))
    write_json(FIXTURES / "idle-oracle.json", cases)
    timeline = json.loads((RESEARCH / "ryuko-idle/timeline.json").read_text(encoding="utf8"))
    write_json(FIXTURES / "handoff-timeline.json", timeline)
    print(f"Exported {len(images)} Ryuko, {counts['zoma']} Zoma, {counts['kiki']} Kiki, {counts['chung']} Chung, {counts['amiro']} Amiro, {counts['anmc']} ANMC P, {counts['giant']} Giant, {counts['suneo']} G Suneo, {counts['yo']} Yo, {counts['sin']} SIN, {counts['lizard']} LIZARD, {counts['kay']} KAY, {counts['dido']} DIDO, {counts['sakuya']} SAKUYA, {counts['alex']} ALEX, {counts['sou']} SOU, {counts['hiso']} HISO, {counts['erus']} ERUS, {counts['feng']} OS FENG, {counts['sean']} SEAN, {counts['gon']} GON, {counts['kate']} KATE, {counts['remu']} REMU, {counts['rear']} REAR, {counts['gigi']} GIGI, {counts['sww']} SWW, {counts['ogi']} OGI, {counts['ziro']} ZIRO, {counts['masa']} MASA, {counts['times']} 3-TIMES, {counts['zenka']} ZENKA, {counts['zmega']} Z-MEGA, {counts['alpha']} ALPHA, {counts['shinz']} SHIN-Z, {counts['zaku']} ZAKU, {counts['pachelo']} PAC-HELO, {counts['golf']} GOLF, {counts['asura']} ASURA, {counts['ttro']} TTRO, {counts['astroman']} ASTROMAN, {counts['yinan']} YINAN, {counts['aya']} AYA, {counts['dora']} DoraEmon, {counts['rario']} RARIO and {counts['training']} TRAINING images, "
          f"{len(STAGES)} stages, "
          f"idle programs, and {len(cases)} oracle traces.")


# Each stage: its file, hash, and the looping track (type 0x11) the port's
# Music box plays. After loading a stage, 0x40677c plays the first word of its
# 0x409-byte block, a silent sound in all of these ('235no wav', 'no sound' or 'No');
# two stage actions play the track only after SIN's, KAY's or DIDO's supers.
STAGES = {
    "court": ("Sport Court", "0-SPORT COURT", "dac3aca92f717921fca4cc1c777a5fe91657b1295b4d56eae1acfcd4c7570988", 2),
    "train": ("Train Morning", "1-TRAIN MORNING", "d183b2f684062c63586c241cd867aad7a96dc6b7df4a15a17555314b276468f3", 1),
    "sakuranight": ("Sakura Night", "2-SAKURA NIGHT", "411358a796f19eb3719fc2043ca971ecbcca18b0787b00c3729972724b6132cc", 3),
    "trainnight": ("Train Night", "3-TRAIN NIGHT", "59af004e91dfa6413b79b7210e937f8a37a338440c35b1bea7bb9f9fc2989311", 1),
    "dojin": ("Dojin BKG", "4-DOJIN BKG", "265a5a7a2af246bce2b3c4d855e5aff12b9361de15b937cd5868be97eb53866e", 1),
    "japan": ("Japan Street", "5-JAPAN STREET", "08174c41c6c743485f5cb221ac374cb3d095d0935faba2564758e6ca5654aa21", 1),
    "park": ("Park Morning", "6-PARK MORNING", "bc93dd038159ab36eac1490d18dee1a5c2cedd81ea0bfe06e800bb9f896e7148", 1),
    "parknight": ("Park Night", "7-PARK NIGHT", "949ddb6f871ab35421628ca6a7a20d026c351a14af2c08d9718c59bd18447a3b", 2),
    "sakura": ("Sakura Street", "8-SAKURA STREET", "5cc441325518e4c456d1617fbbdc5b8cbf077ee2070b44c9869e5ed4235c61aa", 1),
    # Greek's 'off' (action 3) plays sound 3; sound 2 is a 71-second track.
    "greek": ("Greek", "9-GREEK", "14bc51c38cf6d9931b9578c80ea6f072a33cb2b7adab47403c29dae1b5fedc18", 3),
    "space": ("Space", "10-SPACE", "45523d1e3e1e19c929af26dd04b199b1b574781acc6c19ef1f6edea47dc1a095", 1),
    "boss": ("Boss Base", "11-BOSS BASE", "837cda375858da2db614f0402d088984a5a13c47b17ae17b4bd5acc35273a54a", 2),
    "office": ("ZM Office", "12-ZM OFFICE", "da3102370d33a92f0afd24f92bf30645f3c1ba9dba3f2931ee730209b91ae50b", 2),
    "office2": ("ZM Office T2", "13-ZM OFFICE T2", "a2e6150db7f6545c6f3a8c9626d0e221381680ad639d8acf4ecb3885a66b4054", 2),
    "brboss": ("BR Boss Base", "14-BR BOSS BASE", "7026e76455e6efa96076f08907be988a3299e80a836435f39ee707e667ee670b", 2),
    "gi": ("GI Stage", "15-GI STAGE", "2695d56c7d9c91a1496049e9a783fa0a7e0e9e37fbcd42abbf8cd411d63f9b4f", 1),
    "spacenight": ("Space Night", "16-SPACE NIGHT", "ce2fb3eec353168a698f7f7c159e8130a9734ee84d4014440cb38f1079ecdc86", 2),
    "streetnight": ("Street Night", "17-STREET NIGHT", "e2227cda8dfa921a3a1eec07e7976dc825af62eb84d8239c9f0ca472f8e1891d", 2),
}


def export_stage(key, name, filename, sha256, track):
    """A stage's objects, their timelines and images, and its track.

    Round setup (0x408c3f) calls 0x406610, which makes an object (type 4, at
    0, 0) of every named action between the first and the last that holds a
    display, at z 0xc, or 0x64 from the first action of kind 3 (+0x23) on. Its
    first step keeps the start record (0x41221d), whose r[1] bits 3 and 4 scroll
    the object by the camera times r[2:4] and r[4:6] percent (0x40da94–0x40db80).
    The objects it spawns are stage objects too (0x412c40), scrolled by theirs.
    """
    data = (RESEARCH / f"extracted/{filename}.STAGE").read_bytes()
    if hashlib.sha256(data).hexdigest() != sha256:
        sys.exit(f"{name} source hash differs from the verified handoff; refusing to export.")
    c = Container(data)
    p = Program(c)
    objects, z = [], 0xc
    for a in p.actions[1:-1]:
        raw = c.data[c.table39_offset + 39 * a.index:][:39]
        if not raw[0]:
            continue
        if struct.unpack_from("<I", raw, 35)[0] == 3:
            z = 0x64
        if any(r[0] == 0x0c for r in p.records[a.start:a.end]):
            objects.append(dict(action=a.index, z=z))
    scripts = flatten_queue(p, c, [(o["action"], 0) for o in objects], set(), set())
    # The match runs a stage object's colour, motion, spawns and op 0x20
    # rolls; its op 0x1f checks (of globals 10, 11 and 14 among them), and the
    # music behind them, keep their fall-through path. So do the four whose
    # global 3 check picks special music in VS (SP BGM 12 and 14) and the
    # round checks (Greek's scenery, PCs 10–198), and the paths only those
    # checks reach go.
    for script in scripts.values():
        kept = [not (e["op"] == "test" and (e["selector"] == 0x83 or e.get("pre", {}).get("round")))
                for e in script["events"]]
        if "loopEvent" in script:
            script["loopEvent"] = sum(kept[:script["loopEvent"]])
        script["events"] = [e for e, keep in zip(script["events"], kept) if keep]
    named = lambda action, offset: f"{action}+{offset}" if offset else str(action)
    reached, todo = set(), [named(o["action"], 0) for o in objects]
    while todo:
        if (k := todo.pop()) not in reached:
            reached.add(k)
            todo += [named(e["action"], e["offset"]) for e in scripts[k]["events"] if e.get("action")]
    scripts = {k: v for k, v in scripts.items() if k in reached}
    events = [e for script in scripts.values() for e in script["events"]]
    if any(e["op"] not in ("color", "motion", "spawn", "random") for e in events):
        sys.exit(f"{name} runs records the match does not; refusing to export.")
    spawned = {(e["action"], e["offset"]) for e in events if e["op"] == "spawn" and e["action"]}
    # A stage object restarts after a display (0x4127b7), and is deleted without one.
    if any(offset or not any(r[0] == 0x0c for r in p.records[p.action(action).start:p.action(action).end])
           for action, offset in spawned):
        sys.exit(f"{name} spawns an object past its start record or without a display; refusing to export.")
    scroll = {}
    for action in {o["action"] for o in objects} | {action for action, _ in spawned}:
        header = p.records[p.action(action).start]
        # Bits 1 and 2 tile the image across the screen (0x40db84); no stage uses them.
        if header[1] & 6 or s16(header, 2) < 0 or s16(header, 4) < 0:
            sys.exit(f"{name} action {action} tiles or scrolls backward; refusing to export.")
        scroll[action] = [s16(header, 2) if header[1] & 8 else 0, s16(header, 4) if header[1] & 0x10 else 0]
    # Image 0 is the background here, not a marker.
    images = export_images(c, f"stages/{key}", {f["image"] for s in scripts.values() for f in s["frames"]})
    return dict(name=name, source_sha256=sha256, objects=objects, scroll=scroll, scripts=scripts, images=images,
                music=export_sounds(c, key, [track])[0])


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
    with the op 0x23 blit mode (and mode 4's fade, r[5]) and colour offsets (r[2:5]) in force and the op 0x03
    sounds just before it, and the
    header's r[1:3], the wait the round manager counts for it (0x4068e0). A jump
    back to a record already run ends it, with `loop` the frame it repeats from."""
    current, pc = action, p.action(action).start
    frames, sounds, mode, fade, tint, seen, loop = [], [], 0, 0, [0, 0, 0], {}, None
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
            mode, fade = record[1], record[5] if record[1] == 4 else 0
            tint = [s8(record, 2), s8(record, 3), s8(record, 4)]
        elif record[0] == 0x0c:
            f = display_record(p, pc)
            frame = dict(pc=pc, image=f["image"], duration=f["duration"], dx=f["dx"], dy=f["dy"], mode=mode,
                         **({"fade": fade} if fade else {}), **({"tint": tint} if any(tint) else {}))
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
    # KGT 13's VS path (global 3 isn't 0, PC 72): in round 1 (PC 73) it spawns VS L, VS R, V and S
    # (118, 119, 122, 123, PCs 82-85), and from round 2 demo black (117, PC 76), the logo for 110
    # ticks and its wipe; each at its spawn record's place (r[8:12]) and z (r[13]). Their op 0x1f
    # loops wait on global 15 = 10, which 13 clears (PC 69). 13's own displays only repeat them: the
    # halves joined (199) is VS L's and VS R's images where they stand, for 50 of their 150 still
    # ticks, and the logo (182) is demo black's first, held 10 of its 50.
    def spawned(pc):
        record = p.records[pc]
        timeline = kgt_timeline(p, u16(record, 2))
        return dict(timeline, z=record[13], frames=[dict(f, dx=f["dx"] + s16(record, 8), dy=f["dy"] + s16(record, 10))
                                                   for f in timeline["frames"]])
    calls["vs"] = dict(first=[spawned(pc) for pc in range(82, 86)], later=[spawned(76)])
    timelines = [ko, calls["logo"], *calls["rounds"], calls["fight"], calls["transition"],
                 *calls["vs"]["first"], *calls["vs"]["later"]]
    # The select screen (object type 10, 0x406fc0) reads the system block the
    # loader copies from the file's tail to 0x435474: the players' names, 256
    # bytes each, the action words from 0x4451c2 (13, 14, 15, ... the round
    # letterings'), its cursors' (0x445250: 1P, 2P and their decided forms),
    # the grid's origin, spacing, columns and rows (0x4452b0–0x4452ba), where
    # each side's hovered player stands (0x4452bc, 0x4452c4) and a flag byte a
    # player (0x4452cc + index: bit 0 story, bit 1 VS).
    tail, base = data[c.common_end:], 0x435474
    at = lambda address, fmt: struct.unpack_from(fmt, tail, address - base)
    if at(0x4451c2, "<3H") != (13, 14, 15):
        sys.exit("The KGT system block no longer maps to 0x435474; refusing to export.")
    cursors = at(0x445250, "<4H")
    x0, y0, dx, dy, cols, rows, x1, y1, _, _, x2, y2, _, _ = at(0x4452b0, "<14h")
    select_images = set()
    select = dict(cursors=cursors, origin=[x0, y0], step=[dx, dy], cols=cols, rows=rows, sides=[[x1, y1], [x2, y2]],
                  flags=list(tail[0x4452cc - base:0x4452cc - base + 50]), named=[bool(tail[256 * i]) for i in range(50)],
                  programs={})
    for cursor in cursors:
        select["programs"].update(select_program(p, cursor, select_images)["actions"])
    # The title (0x4080a0) plays T1 (the demo at 0x4438a1), then T2 (0x44389c),
    # and lists the modes 0x4438a4's bits 4, 8 and 0x10 allow (0x408263): story
    # (0), VS single (1) and VS multi (2). Its cursor (0x445244) stands where
    # each mode's action's first record says (0x445246, 0x445248, 0x445258).
    demo_name = lambda index: tail[0x43d49c - base + 0x100 * (index - 1):].split(b"\0")[0]
    if (demo_name(tail[0x4438a1 - base]), demo_name(tail[0x44389c - base])) != (b"T1", b"T2"):
        sys.exit("The title no longer plays T1 and T2; refusing to export.")
    cursor, story, single = at(0x445244, "<3H")
    multi, = at(0x445258, "<H")
    flags = tail[0x4438a4 - base]
    title = dict(cursor=cursor, flags=flags,
                 items=[[s16(p.records[p.action(a).start], 1), s16(p.records[p.action(a).start], 3)]
                        for a in (story, single, multi)])
    select["programs"].update(select_program(p, cursor, select_images)["actions"])
    cues = {u16(r, 2) for records in select["programs"].values() for r in map(bytes, records) if r[0] == 0x03}
    sounds = export_sounds(c, "kgt", {i for t in timelines for f in t["frames"] for i in f.get("sounds", [])} | cues)
    # 17–23: stock digits EMPTY/100–600 (KGT 45–51, 0x445202); 31–38: gauge
    # shimmer; 135: UNDER PW.
    ids = {17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 39, 40, 41, 135, 146}
    ids.update(range(31, 39))
    ids.update(range(47, 93, 5))
    ids.update(f["image"] for t in timelines for f in t["frames"] if c.images[f["image"]].width > 1)
    ids.update(i for i in select_images if c.images[i].width and c.images[i].height)
    (PUBLIC / "ui").mkdir(exist_ok=True)
    images = []
    for index in sorted(ids):
        record = c.images[index]
        pixels, palette, _ = c.pixels_and_palette(index)
        filename = f"ui/{index}.png"
        write_if_changed(PUBLIC / filename, indexed_png(record.width, record.height, pixels, palette, True))
        images.append(dict(index=index, width=record.width, height=record.height, filename=filename))
    write_json(GENERATED / "ui.json", dict(source_sha256=digest, images=images, sounds=sounds, ko=ko, calls=calls,
                                           select=select, title=title))


DEMOS = {
    "select": ("CHAR SELECT", "b4b3435391a728f77316270909efad69c06c1d8b0c535c2cca63e91ebed2deef"),
    "t1": ("T1", "76c9b0b306f2bd30edfa370df96b667a8ad5dac8fd736f3e114a3978b390ac87"),
    "t2": ("T2", "2ec2d19c80d28957b8e9207b1668791e6c1cb443fdb8e883aee2cd12c828260a"),
}


def export_demo(key):
    """A demo as raw records: the select screen's, CHAR SELECT (demo 10, the byte at
    0x44389e for VS single), and the title's, T1 and T2 (demos 1 and 2, the bytes
    at 0x4438a1 and 0x44389c). 0x403fc0 loads it and 0x406790 makes an object (type
    4, at 0, 0) of every named action between the first and the last that holds a
    display, at z 0xc, or 0x64 from the first action of kind 3 (+0x23) on, as a
    stage's. After the common container the loader reads 0x409 bytes to 0x427c94
    (0x4040d2), of which 0x406790 keeps the flags (0x427c96, bit 0 lets a press
    skip it) and the ticks it lasts (0x427c99, 0 for until a press)."""
    name, sha256 = DEMOS[key]
    data = (RESEARCH / f"extracted/{name}.DEMO").read_bytes()
    if hashlib.sha256(data).hexdigest() != sha256:
        sys.exit(f"{name} source hash differs from the verified handoff; refusing to export.")
    c = Container(data)
    p = Program(c)
    objects, z = [], 0xc
    for a in p.actions[1:-1]:
        raw = c.data[c.table39_offset + 39 * a.index:][:39]
        if not raw[0]:
            continue
        if struct.unpack_from("<I", raw, 35)[0] == 3:
            z = 0x64
        if any(r[0] == 0x0c for r in p.records[a.start:a.end]):
            objects.append(dict(action=a.index, z=z))
    actions = {str(a.index): [list(r) for r in p.records[a.start:a.end]] for a in p.actions[1:-1]}
    image_ids = {display_record(p, pc)["image"] for pc in range(len(p.records)) if p.records[pc][0] == 0x0c}
    # Image 0 shows like any other (0x40ccc4 skips only a missing one): CHAR
    # SELECT's P1 sign opens on it, T1's ALICUU screen and T2's backdrop are it.
    # Sound 0, which the demo's header (0x40684c) and CHAR SELECT's closing
    # panels and T2's backdrop cue, is empty in all three.
    cues = {u16(r, 2) for r in p.records if r[0] == 0x03 and c.sounds[u16(r, 2)]["size"]}
    flags, duration = data[c.common_end + 2], struct.unpack_from("<I", data, c.common_end + 5)[0]
    write_json(GENERATED / f"{key}.json", dict(source_sha256=sha256, objects=objects, actions=actions,
                                               images=export_images(c, key, image_ids - {8191}),
                                               sounds=export_sounds(c, key, cues), flags=flags, duration=duration))


def inputs():
    """What the export reads: this script, and the handoff's files by name, size and time."""
    digest = hashlib.sha256(Path(__file__).read_bytes())
    for path in sorted(RESEARCH.rglob("*")):
        if path.is_file():
            stat = path.stat()
            digest.update(f"{path.relative_to(RESEARCH)}\0{stat.st_size}\0{stat.st_mtime_ns}\0".encode("utf8"))
    return digest.hexdigest()


if __name__ == "__main__":
    # Its outputs stand while nothing it reads has changed since the last export.
    stamp = GENERATED / ".inputs"
    key = inputs()
    if stamp.exists() and stamp.read_text() == key and all(any(d.iterdir()) for d in (PUBLIC, FIXTURES)):
        print("Assets are up to date.")
    else:
        stamp.unlink(missing_ok=True)
        main()
        stamp.write_text(key)
