# Ryuko regression lessons

Reference snapshot: SCWU web training implementation, 2026-09-22, revised 2026-10-02 after the camera, throws, chains, damage, victim responses, effects and colour were recovered from the engine. `README.md` holds the current numbers; where this file disagrees, the README and tests win. Re-check current source and tests before changing behavior. These are concrete examples for the checklist, not defaults to copy into another character. Original Windows-game recording parity remains unverified.

## Failures and the checks they taught us

| Reported problem                                          | Reusable check                                                                                                                                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attack ends too soon to accept a follow-up                | Separate early input buffering, clip recovery, and late acceptance; do not extend the damaging frames.                                                                                    |
| Grab skips or fails to enter the catching attack          | Assert the full two-fighter state sequence from an actual grab press; align release with the catching animation, not the attempt's duration.                                              |
| Dash plays a pose but does not dash                       | Measure world displacement after preparation and through the airborne phase; artwork/frame changes cannot substitute for movement.                                                        |
| Drill Punch hits once rather than six times               | Enumerate strike windows and re-arm contact between them, including block effects and final knockback. Audit sibling multi-hit moves too.                                                 |
| Drill hits six times but feels as fast as a rapid attack  | Trace response-specific hit-stop and assert elapsed contact times; action ages alone omit the contact freezes.                                                                            |
| Adding a pause repeats damage or projectile release       | Gate frame-entry events using whether the fighter was frozen at tick entry, including the final paused tick.                                                                              |
| Drill travel distance is wrong                            | Decode motion opcodes and fixed-point units; include startup lunge, recovery slide, contact pauses, and facing.                                                                           |
| Aerial drill stops after arbitrary cycles                 | Model contact-dependent stages and landing, including missed spins remaining armed.                                                                                                       |
| Jump distance changes when direction is released          | Capture launch direction and carry velocity through the flight and aerial actions; remove accidental walking-speed air steering.                                                          |
| Consecutive left/right on the ground does not dash        | Recognize two fresh same-direction presses through shared keyboard/touch input, with a defined expiry and lifecycle reset.                                                                |
| Hit feels disconnected or has no effect                   | Emit effects per actual contact, anchored before knockback; preserve separate simultaneous and blocked effects.                                                                           |
| HUD/KO looks unlike the source or hides the ending        | Decode KGT assets/timing and compare the rendered scene; let moves, objects and the CPU run on until each fighter returns to neutral and takes its result (`0x410ff1`).                   |
| KO resembles a light hit or drops straight onto the floor | Decode the death action's extra pauses and launch; transition to floor poses on contact, not clip age.                                                                                    |
| Enemy launch or KO pulls the view away from the player    | An authored player lock answered this first; the recovered Vs. camera (`0x40af30`) later replaced it. When evidence replaces an authored rule, update the tests that encoded the old one. |
| A fix resets state on every action change                 | Check what the engine clears: `0x410cf0` keeps the reaction bits, op `0x23` colour and the afterimage slot, and the data clears them (neutral actions, op `0x25` off records).            |
| Authored protected states block grabs and hits            | Replace them with the engine's victim skip by box kind and reaction bits (`0x40f12d–0x40f18e`) and the poses' body boxes.                                                                 |
| Air dash requires an unnecessary second tap               | Separate airborne fresh-press input from the ground double-tap recognizer; test keyboard/touch and holding direction through takeoff.                                                     |
| Upward kick is missing or behaves like an ordinary hit    | Inspect the command/action inventory and victim response mapping; implement the launch and on-hit chase together, including aerial follow-up contact.                                     |
| Fix passes tests but the visible game is unchanged        | Compare the loaded bundles in the exact user tab and test tab; the same URL can have different builds loaded. Rebuild preview output and reload the user's tab.                           |

## Recovered observations used for movement

At source speed 10, timer scale is 100. The recovered opcode-1 conversion uses 16.16 units, with velocity multiplier `floor(65536 / 100) = 655` and acceleration multiplier `floor(0x3c0000 / 100²) = 393`. Web artwork is scaled by 1.5, and the simulation tick is 10 ms. Acceleration is added before position is advanced.

| Ryuko action                        | Raw motion/timing observation                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4: neutral jump                     | 8-tick preparation; horizontal velocity 0, vertical velocity -1450, vertical acceleration 80.                                                                                                     |
| 5–6: forward/backward jump          | Same preparation; horizontal velocity +400/-400 relative to facing, vertical velocity -1400, acceleration 80.                                                                                     |
| 10: neutral double jump             | 3-tick stationary preparation; horizontal velocity 0, vertical velocity -1300, acceleration 80.                                                                                                   |
| 11–12: forward/backward double jump | Same preparation; horizontal velocity +400/-400 relative to facing, vertical velocity -1200, acceleration 80.                                                                                     |
| 13–14: ground forward/back dash     | 5/10-tick preparation; velocity +900/−500 horizontally and −500/−900 vertically, acceleration 90.                                                                                                 |
| 16–17: air forward/back dash        | Retain incoming jump motion until age 3, then horizontal velocity +800/−800 and vertical velocity 0. After 30/20 level ticks, restore gravity 80 and retain horizontal velocity through the fall. |
| 207: ground drill                   | Raw forward velocity 900 during ages 11–58, 100 during ages 59–68, then stopped.                                                                                                                  |
| 208–211: aerial drill family        | 22-tick preparation, then raw forward velocity 800 and downward velocity 1000; later contact stages use downward velocity 1500.                                                                   |

With the web conversion and unobstructed integration, a neutral jump rises about 317.5255 pixels in a 60-tick flight. A directional jump rises about 295.6375 pixels, travels about 347.8088 pixels, and lasts 58 flight ticks. Preparation is separate. Wall/body collision can shorten horizontal travel. These are independently calculated model expectations, not measurements from original-game footage.

Relevant static evidence: Ryuko's `01 RYUKO.PLAYER`; `SCWU.EXE` opcode-1 handler at `0x41282d`, motion-scale setup at `0x406478–0x4064b3`, and integration at `0x40f96a–0x40f98f`. Addresses apply to the supplied executable only. Inspect raw fields/flags before applying the formula to another action.

A near-apex forward air dash travels about 720 arena pixels through landing. The old 960-pixel screen clamp cut it off at 475 pixels from the default starting position. The recovered source stage/viewport widths are 1280/640 pixels (web 1920/960 at 1.5×); source stage limits are at `0x40face–0x40fb96`, camera scroll limits at `0x40b2cc–0x40b2e8`. Camera following, the 185-pixel fighter margin, and the mirrored background extension remain authored. Do not increase speed to compensate for a viewport used as a physical wall.

## Recovered contact timing

The earlier implementation advanced attack and movement clocks through impacts. Ground drill consequently landed its six strikes only 6 ticks apart, like Kick 3. The fix keeps the original active/gap ages but adds a per-fighter contact pause. Do not slow the entire animation: a missed drill must keep its original timing and travel.

At this port's 10 ms simulation tick, these are the recovered successful-hit pauses used by the current Ryuko training implementation:

| Attack                                                     | Attacker / defender pause in ticks             | Source selection                                            |
| ---------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| Punch 1 / Kick 1                                           | 10 / 10                                        | Responses 1–2 → actions 73–74                               |
| Punch 2                                                    | 10 / 10 for hits 1–2; 15 / 15 for hit 3        | Action 180, PCs 2400/2413; responses 8–11                   |
| Punch 3 / Kick 2 / crouching punch / aerial punch and kick | 15 / 15                                        | Strong/launch responses in actions 181/188/185/182/191      |
| Hit Up                                                     | Ground 33 / 10; air 13 / 13                    | Action 200; response 19 → 81, air response 17 → 80          |
| Crouching kick                                             | 13 / 13                                        | Response 7 → action 79                                      |
| Ground Drill Punch                                         | 15 / 15 for hits 1–5; 13 / 13 for hit 6        | Action 207, PCs 2920/2941; responses 10–11 → 75–76, 18 → 80 |
| Kick 3                                                     | 0 / 0                                          | Action 190, PC 2631; responses 20–21 → 83–84                |
| Aerial drill                                               | 8 / 9 on hit; 8 / 3 on block                   | Actions 209–211 contact branches                            |
| Axe projectile                                             | 15 / 15 (FB → 75); 15 / 15 for airborne victim | Action 227, PC 3288; responses 50 → 110 → 75, 4 → 76        |

Guard pauses and victim reactions now come from each attack's op `0x17` responses through the response table, including overheads, launches and the reactions' own op `0x01` motion (README "Victim responses"). Kick 3 uses 0 / 0 (responses 34–36 → actions 163/165/167) and aerial drill the asymmetric values above.

With every active strike contacting immediately, expected elapsed gaps are:

- Ground drill: **21 ticks / 210 ms on hit**, **16 ticks / 160 ms on block**, while action ages remain 23, 29, 35, 41, 47, 53. The last 13-tick hit pause delays recovery, not another strike.
- Punch 2: **16 ticks / 160 ms** between hits; aerial kick: **23 ticks / 230 ms**; Kick 3: **6 ticks / 60 ms**.
- Aerial drill: **8 paused attacker ticks plus 2 moving transition ticks**. Its defender resumes at a different time on hit versus block. Measure each fighter separately and allow later strikes to miss if the target leaves range.

Static trace for the supplied files:

- Ryuko's container tail has 23 command entries of 82 bytes followed by 83 four-byte response mappings at file offset `0x1576d9d`. Each mapping contains the victim action and auxiliary effect action. Use the decoded counts/layout rather than copying this offset to another character.
- Attack opcode `0x17` has six response selectors: standing/crouching/air hit, then standing/crouching/air guard. Its engine handler is `0x412d95`; contact dispatch resolves the mapping at `0x40f48e–0x40f541`.
- Reaction opcode `0x1a` adds byte 1 to self stop and byte 2 to other-player stop at `0x413637`/`0x4136ae`. The entity counter is at `+0x40`; `0x412390` skips animation advancement and `0x40f963` skips motion while it is nonzero. Opcode `0x15` is health/meter adjustment, **not hit-stop**.
- KGT's base hit/guard pause bytes loaded at `0x43a299`/`0x43a29a` are both zero in this source. Check defaults as well as per-response additions. Aerial drill's explicit pause branches are at PCs 2989/3000, 3019–3020, 3040–3041, and 3061–3062.

Regression checks now cover elapsed cadence, both fighters' frozen clocks/motion, no duplicate hits or axe release, buffering during freeze, simultaneous aerial-drill interruption in either fighter order, landing recovery, and final KO freeze. Effects are source objects running their own scripts; supers freeze objects through global 6 (README "Animations"). Original Windows playback parity remains unverified. Check current tests rather than treating a saved passing-test count as proof.

## Recovered Hit Up launch and chase

Ryuko's upward kick is the separate Hit Up command (action 200), not the regular Kick 2 chain. The source command-table entry names it; the H key and touch button are web training bindings.

- Action 200: 15 startup ticks, 10 active ticks, then 50 recovery ticks on whiff/block. PCs 2813–2815 move with raw forward velocity 600 and acceleration 350 for six ticks, then stop; unobstructed travel is about 120.084 arena pixels.
- Ground/crouch response 19 selects action 81. PC 932 pauses victim/attacker for 10/33 ticks. After 25 victim action ticks, PC 937 sets relative horizontal velocity −160, vertical velocity −1700, and gravity 60. Grounded apex is about 589.056 arena pixels.
- Air response 17 selects action 80: 13/13 pause, six impact ticks, then relative horizontal velocity −600, vertical velocity −1220, and gravity 90. Both responses stop incoming motion during preparation and hold their falling pose until actual floor contact, then enter knockdown 146 and the existing get-up.
- A successful nonlethal hit enters recovery action 201, with the chase window at ages 5–24. Action 202 prepares eight ticks, then sets forward velocity 320, vertical velocity −1530, and gravity 42. The training input buffer remembers fresh Jump taps during startup, hit-stop, or the permitted recovery; holding Jump does not repeat it.
- Damage 15, range 165, early buffering, all-height guard, and normal KO selection on lethal contact are training choices. Block/whiff cannot chase. Launch reactions remain hittable for aerial follow-ups; landing restores the air-dash/double-jump limits.

Keep regressions for both facings, ground versus air pauses, exact launch boundaries, early/late Jump presses, whiff/block, interruption/trades, actual aerial follow-up damage, KO, and timeout during preparation or flight. The H → Jump → aerial kick path has been exercised through normal browser controls; this does not establish original Windows-game parity.

## Camera and directional input contracts

- Camera (recovered, README "Stage/camera"): the Vs. camera object (`0x40af30`, state 3) aims 320 source pixels left of and above the fighters' midpoint and moves halfway there each tick, truncating, before the hit test and motion; the scroll clamps to 0–640 and 0–480 source pixels. The players' motion then clamps x to 50–590 source pixels of the scroll, so the fighters stay within 540 source pixels of each other. It keeps moving through KO and round endings. The earlier player-only lock was an authored rule and is gone.
- These input rules are current user-approved web rules, not recovered original-game defaults. Ground dash requires two fresh same-direction presses within 20 ticks. Air dash requires one fresh left/right press while actionable, in the pressed direction relative to current facing. Holding direction from takeoff retains ordinary jump travel; release and press again to air dash. Simultaneous left/right does not select a dash direction, and releasing one of those held keys is not a fresh press. Shift/the Dash button remain alternate controls. All input paths share the one-air-dash-per-flight limit, reset on landing.

Update tests that encoded superseded camera or air-double-tap behavior while preserving travel, contact, and recovery assertions. Keep an actual-input check for both keyboard and touch.

## Recovered KO sequence

The previous `down` clip combined action 60 with action 62 on a fixed timer, skipped KO-specific pauses, and used a small vertical hop. Correct frame images alone made the death look like an ordinary hit and allowed a floor pose before landing.

For the normal path of Ryuko action 60:

- PC 603 stops incoming motion. PC 607 adds ten pause ticks to the other fighter; PC 611, after five action ticks, adds 40 ticks (400 ms) to both fighters.
- Opening displays total 14 action ticks. PC 617 then sets raw horizontal velocity −500 relative to facing, vertical velocity −1520, and gravity 90.
- PC 618 shows image 60 for 25 ticks; PC 620 holds image 61 until landing. Action 62 then sets horizontal velocity −200 for ten ticks (image 62), stops, and holds image 63.
- With the web fixed-point conversion, a grounded unobstructed launch lasts 56 moving ticks, rises about 309 pixels, travels about 420 pixels backward, and slides another 30. Airborne victims remain suspended during the opening hold and have a longer fall.

The port selects this normal path for lethal strikes and keeps the preceding attack's contact pause; those are training choices. Lethal throws keep their separate toss/fall. Alternate KO branches, source screen effects, audio, and live original-game parity remain unverified. The recovered camera follows both fighters through the KO; see the camera/input contracts above.

Regressions cover frozen motion, launch/landing boundaries, both facings, airborne victims, projectile finishers with zero normal hit-stop, simultaneous KO pause ordering, stage walls, and camera behavior. A later “still drops immediately” report was an old bundle in the user's touch-control tab: a different tab at the identical URL had been refreshed and verified. Comparing loaded script URLs exposed the mismatch; reloading and exercising the user's exact tab showed the launch. Verify build identity before retuning a previously demonstrated fix.

## Current training contracts worth preserving

Most of these are now recovered; the README's sections hold the exact figures. Verify the underlying source before treating any remaining authored rule as original behavior.

| Feature             | Current regression expectation                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Standing chains     | Recovered op `0x24` command checks: punch 1 and kick 1 chain only through their hit branches (179/187); punch 2 and kick 2 check at fixed ages with input-history windows (README "Chains"). No automatic repeat.                          |
| Second punch        | Three contacts at action ages 18, 24, 30; damage 5 each.                                                                                                                                                                                   |
| Aerial kick         | Three contacts at ages 15, 23, 31; damage 4 each.                                                                                                                                                                                          |
| Third standing kick | Eight contacts at ages 15, 21, 27, 33, 39, 45, 51, 57; damage 4 each.                                                                                                                                                                      |
| Ground drill        | Six contacts at ages 23, 29, 35, 41, 47, 53; damage 5, 5, 5, 5, 7, 8, chip-capable. The last strike uses response 18 → 80.                                                                                                                 |
| Aerial drill        | Contact-dependent stages continue until landing. Damage 20, 5, 3, 1 by stage. Contact pauses and the two-tick moving transition are detailed above; later contacts depend on relative positions and airtime.                               |
| Dash input          | Ground uses a 20-tick double-tap window; air uses one fresh directional press. One-air-dash/one-double-jump limits reset on landing. These are training rules; see camera/input contracts above.                                           |
| Catching attack     | Recovered: grab box at age 7 (PC 2750, kind `0xa8`), Chuck Hit 197 with response 30, three throw spins (199) with op `0x07` holds, then response 31's toss and 30 life (PCs 2769–2770). README "Throws and recovery".                      |
| Held pair/recovery  | The victim tosses through 129–131 into knockdown 146 and get-up 145, sharing DST Hit's hold. Held and holding poses set no push box. Releasing the victim when the thrower is hit or time runs out is authored.                            |
| Effects             | Recovered: the response table's effect action, placed at the box overlap's centre, playing its own script, op `0x20` rolls and op `0x23` colour (README "Hit effects").                                                                    |
| KO/HUD              | KGT action 26 supplies KO display order/offsets/durations: 166 ticks, followed by an authored 100-tick hold. The source aspect ratio is 640×480, rendered at 1.5×. Ending physics/effects continue; rematch controls stay below the court. |

The stage walls are the recovered 50 source pixels (75 arena) from each end, body push is the recovered `0x40fce9`, and attack reach comes from each pose's recovered attack and body boxes. Another character brings its own boxes; do not tune a margin or range merely to make a test pass.

When physics changes intentionally, adjust old test setup so the intended contact still occurs at the relevant height/time. Keep the original assertion about hit/block recovery or multi-hit gaps; do not weaken it to hide a changed trajectory.
