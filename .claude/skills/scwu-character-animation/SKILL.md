---
name: scwu-character-animation
description: Reproduce or review SCWU character animations from recovered assets and action data. Use when adding a fighter or fixing animation timing, hit-stop, attack chains, multi-hit attacks, grabs, movement, hit effects, or round endings in the SCWU web port.
---

# SCWU character animation checklist

Treat an animation as poses, timing, movement, contacts, and state transitions working together. A correct sprite sequence alone is insufficient. Keep recovered behavior, authored training rules, and unknown behavior explicitly separate.

Use the relevant sections for the requested actions; mark unrelated checks N/A. Do not expand a core-animation request into every special move. For examples of the failures this checklist prevents, read [Ryuko regression lessons](references/ryuko-regressions.md). Its numbers belong to Ryuko and the current training implementation, not to future characters.

## 1. Establish the evidence and running build

- [ ] Identify the actual checkout, dirty files, and browser server. Determine whether the URL serves Vite development output or `dist/`. A preview server needs a fresh build and reload after changes. Identify the exact tab the user is playing, not just its URL. If several tabs share that URL or the user still sees the old behavior, compare the loaded script bundle names with the current build before changing gameplay again; refreshing a separate test tab is insufficient.
- [ ] Read the character's handoff, action program, and existing exporter before selecting sprites. Reuse the decoder, placement logic, fixed clock, and shared match logic already present.
- [ ] For each affected action, record source action IDs, relevant instruction offsets/branches, frame IDs, durations, motion changes, contact events, and exit conditions. Label each conclusion **recovered**, **authored**, or **unknown**.
- [ ] Use original footage when available for visual comparison. Static decoding, screenshots of the port, and unit tests prove different things; none alone establishes original-game parity. Do not turn an unavailable original runtime into a blocker for authorized training-mode work.

## 2. Decode the action, not just its display records

- [ ] Follow branches, subactions, repeat counts, and contact-dependent transitions. Avoid flattening alternative branches into one clip or displaying a repeated strike only once.
- [ ] Decide whether each section loops, ends after a finite duration, holds until landing/contact, or waits for another gameplay event. Zero or very long source durations can represent waits, not literal playback lengths.
- [ ] Preserve per-frame offsets, costume/form changes, flip flags, and ignore-facing behavior. Check mirroring and odd-width rounding using the existing placement helper.
- [ ] Verify every exported frame loads and is non-empty. Regenerate selected assets after changing extraction; do not hand-edit generated JSON as the permanent fix.
- [ ] For interpreted behavior, fail visibly on unsupported instructions. Keep deterministic traces/oracles independent of the TypeScript implementation; do not silently treat unknown gameplay opcodes as no-ops.
- [ ] Before authoring a rule, check whether the source already supplies it: much of a fighter's and every object's behavior runs from exported source timelines (`scripts` in the export, `runEvent` in the match). The flattened timelines skip opcodes `decode_event` does not decode, so list each skipped behavior in the README's unimplemented notes rather than treating it as handled.

## 2a. Read the engine, not just the data

- [ ] Use `scwu-web-handoff/reference/engine-disassembly.txt` for code. It prints data as code, so read jump tables and constants from `research/extracted/SCWU.EXE` through its PE sections.
- [ ] Script opcodes dispatch at `0x4125fc`: the byte table `0x413c74` (indexed by op − 1) picks a handler from `0x413c08`. Handlers: `0x01` motion `0x41282d`, `0x02` event handler `0x4128e0`, `0x04` spawn `0x412a7b`, `0x05`/`0x29` action end `0x412617`, `0x07` held pose `0x412e93`, `0x09` call `0x4129a9`, `0x0a` jump `0x412968`, `0x0c` display `0x4127e3`, `0x10` stock `0x413500`, `0x11` life `0x413164`, `0x14` apply response `0x413049`, `0x15` life/power `0x413216`, `0x17` responses `0x412d95`, `0x18` attack box `0x412cfa`, `0x19` body box `0x412d63`, `0x1a` stops `0x413637`, `0x1e` cancel eligibility `0x413782`, `0x1f` variables `0x4137a4`, `0x20` random `0x4139a3`, `0x23` colour `0x413a07`, `0x24` command check `0x413a50`, `0x25` afterimage `0x413a9a`. Verify against the current binary before relying on them.
- [ ] Follow state through the engine, not the script alone: action changes (`0x410cf0`) keep fields such as the reaction bits (`+0x15e`), op `0x23` colour and the afterimage slot (`+0x151`) unless a handler or the data clears them. Check what clears a field before resetting it on every action change.
- [ ] Every caller of the shared rand (`0x417a22`) changes later rolls. Objects run in priority buckets (fighters `0x50`, hit effects `0x5d`, KGT objects `0x65`), so keep the port's roll order and test rolls across seeds.

## 3. Build one coherent action timeline

- [ ] Align startup, active strikes, inactive gaps, recovery, and follow-up acceptance with visible poses. Sample the tick immediately before, at, and after each boundary.
- [ ] Preserve early fresh attack presses until the permitted follow-up boundary. Keep a late follow-up grace period separate from active hit windows. Holding a button must not auto-chain.
- [ ] Clear queued attacks when interrupted, reset, or ending the round. Test both queued transitions and the no-follow-up return to idle.
- [ ] Keep aerial pose age continuous when returning from guard/attack where appropriate. Landing ends aerial attacks, but an air hit/block reaction must retain its remaining recovery when switching to its ground pose.
- [ ] Trace all callers of the shared transition/movement helper before changing it. Verify facing, movement, input, contact resolution, and rendering agree on the same state.

## 4. Verify actual travel and input

- [ ] Decode horizontal/vertical velocity, acceleration, signedness, facing application, fixed-point scale, tick rate, and velocity retain/add flags. Sprite offsets and fighter-world movement are different quantities.
- [ ] Reproduce the integration order and motion phases: preparation, launch, travel, deceleration/contact pause, and landing. Extending a clip or changing its pose does not make a stationary dash move.
- [ ] Measure displacement, apex, and airtime in an unobstructed setup, then test walls and body collision separately. Do not tune free-travel speed from a collision-limited result. Distinguish stage walls from viewport edges; verify camera following permits the intended travel while respecting the chosen focus and keeping the HUD fixed.
- [ ] Keep the recovered Vs. camera (`0x40af30`): it aims 320 source pixels left of and above the fighters' midpoint, moves halfway there each tick before motion, and clamps to the stage. The players' motion clamps to 50–590 source pixels of that scroll. Test both fighters moving, the walls, and endings; see README "Stage/camera" and the [camera/input contracts](references/ryuko-regressions.md#camera-and-directional-input-contracts) before changing framing.
- [ ] Check neutral, forward, and backward jumps, release of direction after takeoff, and double-jump direction changes. Preserve intended momentum through aerial attacks/guard; replacing it with dash/drill motion or landing must not leave stale velocity behind.
- [ ] Route keyboard and touch through the same command logic. Distinguish a fresh press from a held control or OS repeat, and preserve brief presses between simulation ticks.
- [ ] Specify ground and air dash gestures separately. In the current port, ground dash uses two fresh taps within 200 ms; air dash uses one fresh directional press. Test both directions/facings, expiry for ground taps, simultaneous left/right, and keyboard/touch. Holding a direction through takeoff must preserve the jump; releasing it must preserve momentum; pressing again in the air may dash. Retain the per-flight limit and reset it on landing. Clear gesture history on pause, focus loss, reset, and incompatible actions. Label these as training input choices, not verified original bindings.
- [ ] Check complete wide poses at both walls without changing the world anchor as the frame changes. Avoid a position snap on dash, throw, landing, or get-up.

## 5. Verify contacts, multi-hit attacks, and effects

- [ ] Derive strike count and active/inactive windows from the action's loops and contact rules. A single move-wide `connected` flag must not suppress later legitimate strikes; leaving it continuously active must not damage every tick.
- [ ] Reset contact eligibility only for the next strike or an explicit contact-stage transition. Test an opponent entering range during an inactive gap and a whiff becoming a later valid hit.
- [ ] Verify hit count, total damage, per-strike effects, guard behavior, and when knockback applies. Early knockback must not accidentally prevent the rest of a move intended to connect multiple times.
- [ ] Keep contact-driven aerial attacks active until their actual exit event. Distinguish a missed spin, a blocked contact, a hit transition, and landing; do not replace these with an arbitrary fixed number of cycles.
- [ ] For launchers, trace ground and airborne victim responses separately: contact pause, pre-launch hold, motion command, falling pose, and actual landing. Keep launched victims hittable where aerial follow-ups require it; reset flight limits on landing. Do not reuse a generic hit pose or KO path for a nonlethal launch.
- [ ] For an on-hit chase or cancel, verify the successful-hit branch and its input window independently from whiff/block recovery. Preserve fresh buffered input through hit-stop, clear it on interruption, and prove a real aerial follow-up can connect. Check trades, lethal hits, and timeout during preparation/flight. See [Hit Up evidence](references/ryuko-regressions.md#recovered-hit-up-launch-and-chase).
- [ ] Resolve simultaneous contacts fairly. A contact queued earlier in the tick must not restore a special move after another strike has interrupted its owner.
- [ ] Spawn the correct hit/guard effect at the contact position before knockback, with attack facing and stance height. Verify layering, lifetime, simultaneous effects, projectile effects, and continued cleanup during KO. No contact means no hit spark. Effects are source objects from the response table (`0x40f567`), placed at the box overlap's centre (`0x40eab0`), with their own scripts, rolls and op `0x23` colour.
- [ ] Release projectiles on the release pose, cancel an interrupted pre-release throw, and keep flight/contact/expiry separate from the owner's recovery.

### Contact pauses and recovery

- [ ] Distinguish **action age**, elapsed simulation time between contacts, **hit-stop** (contact freeze), and **hit/block recovery** after that freeze. A test asserting strike ages or hit count alone cannot prove the cadence is correct.
- [ ] Trace the attack's response selectors through the victim's response table and reaction instructions, including global defaults and contact branches. In the supplied SCWU engine, opcode `0x17` selects a response and `0x1a` adds self/other pause ticks. Verify these against the current binary; do not infer pause or reaction strength from damage or assume only the final hit is strong. Read the [Ryuko timing evidence](references/ryuko-regressions.md#recovered-contact-timing) when working on this character.
- [ ] Record attacker and defender pauses separately for hit, block, and each strike/stage. A finisher can differ from preceding hits, and rapid attacks may add no pause. Apply pauses only on contact; changing the whole clip speed or strike interval also changes whiffs incorrectly.
- [ ] Freeze action/airborne clocks and motion integration together. Body separation must not displace a frozen fighter. Decide separately whether effects, projectiles, the idle interpreter, and the round clock advance; record authored choices instead of assuming the entire scene freezes.
- [ ] Treat a frozen age as a held state, not a newly entered frame. Do not re-arm damage, release another projectile, or repeat a grab event on each paused tick. Preserve whether the fighter was frozen at tick entry so decrementing the counter to zero cannot fire those events on the final paused tick.
- [ ] Continue capturing fresh follow-up presses during contact pause. Resolve simultaneous hits before applying an attack's contact branch, so an interrupted special cannot restart or add its own branch pause depending on fighter iteration order.
- [ ] Test actual contact timestamps, frozen positions/velocities/poses, and resumption on the first unpaused tick with independent expectations. Include hit/block/whiff, both facings, the final hit's recovery delay, and affected landing/KO transitions. For aerial attacks, unequal pauses change relative positions and subsequent contacts; do not preserve an old hit count by forcing out-of-range strikes.

## 6. Verify both fighters in a grab

- [ ] Treat attempt, successful catch, catching attack, release, thrown fall, knockdown, and get-up as distinct states. A successful catch must enter the catching-attack sequence before release.
- [ ] Share the release boundary between animation and match logic. Synchronize the held fighter's pose, position, facing, and front/back draw order with the attacker's timeline.
- [ ] Prevent normal input, gravity, or body separation from breaking the held pair. Suppress overlap correction only while necessary; restore body separation through knockdown/get-up to avoid a wake-up snap.
- [ ] Check range, airborne targets, guard, simultaneous attempts, and a strike on the catch tick. Follow the documented training rules rather than assuming universal throw behavior.
- [ ] Check interruption before release, lethal release, timeout, and reset. Release the victim coherently, award damage once, and avoid getting up after a lethal throw. Who a box can take comes from its kind and the victim's reaction bits (`0x40f12d–0x40f18e`: `0x10` grounded, `0x20` airborne, 8 guarding, `0x80` reeling or held) and from the victim's body boxes; do not add separate protected states.

## 7. Verify HUD and round-ending playback when affected

- [ ] Use source GUI assets, anchors, aspect ratio, and crop behavior as evidence. Do not substitute a generic result overlay when the task is to reproduce the original HUD/KO scene.
- [ ] On KO, stop further combat/input; let the final contact freeze finish before fighter ending playback, then allow falls, throws, effects, and ending animations to finish. Airborne winners land before celebrating; draws and timeouts need their own checks.
- [ ] Decode KO-specific motion and pauses separately from ordinary hit reactions. Keep impact hold, launch, airborne fall, floor contact, slide, and final rest as explicit phases. Hold the falling pose until actual landing; a flattened timed clip must not show the floor pose in midair. Read the [Ryuko KO evidence](references/ryuko-regressions.md#recovered-ko-sequence) for this character.
- [ ] Apply KO pauses before choosing a victory pose, including finishers with no normal hit-stop. Resolve simultaneous ending events without fighter-order dependence or replaying a pause on every frozen tick. Check both facings, grounded/airborne victims, projectile KOs, draws, and the separate lethal-throw path. Verify the camera through the full launch and landing, especially at long range and near walls.
- [ ] Keep KO lettering order, offsets, durations, and final hold explicit. Place rematch controls so they do not obscure the important poses. Label substitutions for blank/missing source sequences as authored.

## 8. Prove the fix and hand it over

- [ ] Add the smallest meaningful regression checks for the observed failure. Assert observable sequences, contact ticks, displacement, recovery, or bounds with independently derived expectations, rather than recomputing expected values using the implementation being tested.
- [ ] Exercise affected transitions in both facings, with hit/block/whiff and interruption/landing as relevant. Include a real-input path from idle; seeding a mid-action fixture alone can miss broken entry transitions.
- [ ] Use the existing test runner. In this repository, run `bun run test -- <test-file>` for focused Vitest checks, then `bun run validate` and `bun run build` for a completed behavior change. `bun test` invokes a different runner. Documentation-only changes need document/skill validation, not a game rebuild.
- [ ] Verify the rebuilt page through normal keyboard/touch controls and inspect rendered poses and travel. Confirm the user's tab loaded the new build, exercise their input path and viewport when relevant, and leave that tab ready to play. Tests passing or a screenshot from another tab is not evidence that the user saw the fix.
- [ ] Keep timing-sensitive gesture inputs together during browser checks: an inspection between taps can exceed the gesture window. Diagnose automation timing separately from product behavior, and do not use hidden-state mutation as proof of real input handling.
- [ ] Delete `.playwright-mcp/` after browser checks.
- [ ] Report the implemented behavior, checks actually completed, and any unverified original-game parity. Update controls/help and the evidence notes when behavior or authored rules changed.

## Repository landmarks

Paths are relative to the SCWU web repository; confirm them in the current checkout.

| Concern                                   | Existing implementation/evidence                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Raw data and decoding                     | `scwu-web-handoff/research/extracted/`, `research/tools/scwu_images.py` and `scwu_animation.py` under the handoff |
| Engine code and tables                    | `scwu-web-handoff/reference/engine-disassembly.txt`, `research/extracted/SCWU.EXE`                                |
| Export, flattened timelines, oracles      | `scripts/export_assets.py` (`decode_event`, `flatten`, the `actions` dict and `scripts` queue)                    |
| Verified idle interpreter and placement   | `src/game/standing.ts`, `standing.test.ts`                                                                        |
| Visual clips and shared throw timing      | `src/game/animations.ts`, `animations.test.ts`                                                                    |
| Movement, commands, contacts, round state | `src/game/match.ts`, `match.test.ts`                                                                              |
| Recovered CPU and practice partners       | `src/game/cpu.ts`, `cpu.test.ts`, `src/game/dummy.ts`                                                             |
| Keyboard lifecycle and Phaser rendering   | `src/game/scene.ts`                                                                                               |
| HUD/KO and touch/help                     | `src/game/hud.ts`, `src/App.svelte`                                                                               |
| Recovered versus authored contract        | `README.md`                                                                                                       |
