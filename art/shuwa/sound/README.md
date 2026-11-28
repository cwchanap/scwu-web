# SHUWA's voice and sounds

His own voice and sound effects (HPA-1307): 24 one-shot clips made with ElevenLabs, so nothing here is cut from the
game. The WAVs live in `../game/sound/`, inside the assets fingerprint, so the exporter can read them (the ticket named
`art/shuwa/sound/`, which only holds this README, outside the fingerprint, so a doc edit never forces an upload).

They are **not wired in yet**: `../game/spec.json` `sounds` is still empty, so the game plays the donor's sounds until a
follow-up maps a donor sound index to each clip (`{donor sound index: clip}`, published as `sounds/shuwa-<index>.wav`).

Each clip is 22050 Hz, mono, 16-bit PCM, like the game's own sounds, with a peak at or under -1 dBFS (the soft limiter
below keeps the loudest clips there). RYUKO's 46 sounds have a median RMS of -13.4 dBFS, so these sit at about -14 to
-17 dBFS RMS and play at the same level beside hers.

## The voice

One voice for every shout and grunt: **`z2hYA8a6EspcB5AmD2Zg`** ("SHUWA (SCWU fighter)"), picked by the owner from
four designed candidates (the first two, a deep calm man and a mid-pitched heroic man, were turned down for a young
anime style). It was made with ElevenLabs voice design from this description, then saved:

> Young anime-style male, early twenties. Cool, calm and quiet, a stoic anime hero who says little. Soft and smooth
> normally, but his shouts come out sharp, focused and youthful.

Each line is spoken by model `eleven_v4`, whose audio tags set how it is said; two takes per prompt, one kept.

| Clip                  | Used for            | Prompt                                       | Length | RMS / peak (dBFS) |
| --------------------- | ------------------- | -------------------------------------------- | ------ | ----------------- |
| `voice-light.wav`     | Light attack shout  | `[shouting] Hah!`                            | 0.62 s | -14.0 / -2.0      |
| `voice-medium.wav`    | Medium attack shout | `[shouting] Hyah!`                           | 0.71 s | -14.0 / -2.2      |
| `voice-heavy.wav`     | Heavy attack shout  | `[shouting] [intense] Haaaah!`               | 1.24 s | -13.5 / -1.6      |
| `voice-shuwa.wav`     | His call, "Shuwa!"  | `[shouting] Shuwa!`                          | 0.87 s | -14.0 / -2.4      |
| `voice-super.wav`     | Long "Shuwaaa!"     | `[shouting] [intense] Shuwaaaaa!`            | 1.41 s | -13.6 / -1.7      |
| `voice-throw.wav`     | Throw grunt         | `[grunting with effort] Hnngh!` (two grunts) | 1.35 s | -14.1 / -1.6      |
| `voice-hit.wav`       | Hit grunt           | `[pained grunt] Ugh!`                        | 0.75 s | -15.0 / -2.1      |
| `voice-knockdown.wav` | Knockdown cry       | `[pained cry] Aaagh!`                        | 0.93 s | -14.5 / -2.9      |
| `voice-ko.wav`        | KO cry              | `[defeated] [long pained cry] Aaaaaaagh...`  | 1.47 s | -15.0 / -2.0      |
| `voice-win.wav`       | Win line, "Shuwa."  | `[calm] [satisfied] Shuwa.`                  | 0.91 s | -17.0 / -4.8      |

The model gives the throw prompt two separate grunts with a pause between. The pause (digital silence, 0.38 s) is
shortened to 0.1 s, which is the only edit besides the conversion below; the first throw prompt
(`[grunting with effort] Nngh... [shouting] Hah!`) ran three bursts over 2.9 s and was dropped.

## The effects

Made with `eleven_text_to_sound_v3`, `loop` off, `prompt_influence` 0.5 (the length asked is in the prompt column), two
takes per prompt, one kept. Lengths below are after the silence is trimmed, so they run a little short of what was asked.

| Clip                     | Used for                            | Prompt (length asked)                                                                              | Length | RMS / peak (dBFS) |
| ------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------- | ------ | ----------------- |
| `specium-shot.wav`       | SPECIUM's shot                      | Short energy beam shot, bright electric zap with a quick rising whine and a crackling tail (1 s)   | 0.64 s | -14.5 / -1.0      |
| `specium-ray.wav`        | SPECIUM RAY                         | Long sustained energy beam, deep humming roar rising in pitch with steady electric crackle (2.5 s) | 2.20 s | -15.0 / -2.6      |
| `ring-spin.wav`          | RING's saw ring in flight           | See below (1 s)                                                                                    | 1.00 s | -15.0 / -1.7      |
| `barrier-rise.wav`       | BARRIER going up                    | Wall of energy rising from the ground, shimmering upward sweep over a low hum (1.2 s)              | 1.20 s | -15.0 / -3.0      |
| `barrier-reflect.wav`    | BARRIER deflecting a hit            | Short bright metallic ping, a hit deflected off an energy shield (0.5 s)                           | 0.44 s | -15.0 / -2.7      |
| `shuwatch-takeoff.wav`   | SHUWATCH taking off                 | Fast take-off whoosh, air rushing upward as something launches into the sky (1 s)                  | 1.00 s | -15.2 / -1.0      |
| `transform.wav`          | Changing into the giant             | Shimmering sparkle sweep, glittering chimes rising with a soft energy swell (1.5 s)                | 1.07 s | -16.0 / -1.1      |
| `giant-fall.wav`         | GIANT STEP's dive                   | Falling whistle, descending pitch, something dropping from a great height (1 s)                    | 1.00 s | -15.0 / -1.9      |
| `giant-stomp.wav`        | GIANT STEP's landing                | Giant stomp, deep heavy boom with a low rumble and scattering gravel (1.5 s)                       | 1.05 s | -13.9 / -1.0      |
| `three-minutes-beam.wav` | THREE MINUTES                       | Long powerful beam, loud roaring energy stream with electric crackle and deep sub bass (3 s)       | 2.52 s | -14.0 / -2.6      |
| `recharge-hum.wav`       | RECHARGE's charge-up                | Rising electric recharge hum, power building up in pitch, steady and smooth (1 s)                  | 0.98 s | -15.0 / -1.7      |
| `lamp-beep.wav`          | Chest lamp, one short two-tone beep | See below (0.5 s)                                                                                  | 0.34 s | -15.0 / -9.5      |
| `chuck-whoosh.wav`       | CHUCK's lift and throw              | Lift and throw whoosh, quick air swish of a heavy body swung forward (0.7 s)                       | 0.37 s | -16.6 / -1.0      |
| `spin-whoosh.wav`        | SWING's spin                        | Fast spinning whoosh, a body swung round in a circle, repeating air swish (1 s)                    | 0.76 s | -16.2 / -1.0      |

Two prompts had to be redone, because the first takes did not do what the name says (checked by pitch and envelope):

- `ring-spin`: the first takes died away in about 0.2 s, like an impact. The kept take is the steadiest of three from
  "Steady spinning buzz-saw whir, a metal blade rotating fast at constant volume and pitch, continuous mechanical whine, no impact"
  (1 s, `prompt_influence` 0.7). The first prompt was "Spinning saw ring flying through the air, fast metallic whirring
  buzz at a steady pitch".
- `lamp-beep`: the model gave one repeated pitch, never two notes. It is two ElevenLabs takes of "Retro electronic
  alert, two notes in a row: a short high beep immediately followed by a short lower beep, then silence" (0.5 s,
  `prompt_influence` 0.8), joined: the first 150 ms of the take with the high tone (about 880 Hz), a 20 ms gap, then the
  first 170 ms of the take with the low tone (about 554 Hz), each with 8 ms fades. Its peak is low (-9.5 dBFS) because a
  short pure tone has no peaks above its own level; its RMS matches the others.

## How a take becomes a clip

Every ElevenLabs take (an mp3) was converted the same way, with a short numpy and ffmpeg script that is not committed:

1. Decode to mono at 22050 Hz.
2. Trim to the first and last sample above -48 dBFS, keeping 4 ms before and 25 ms after.
3. Fade in over 3 ms and out over 25 ms.
4. Gain to the target RMS in the tables (-13.5 to -17 dBFS; the softer lines, the win line and the KO cry, sit lower).
5. A soft knee above 40% of full scale (`0.4 + 0.6 * tanh((|x| - 0.4) / 0.6)`), then scale so the peak is at most
   -1 dBFS. Without it the whooshes, which are mostly spikes, came out 6 to 8 dB under the others.
6. Write 16-bit PCM.

## Choosing the takes

Nobody listened to these clips before the PR: the picks were made by measurement. Voice takes were kept for a clean
single burst (no pause, no stray noise at the end), the fastest attack (so the shout lands on the strike frame) and the
better-voiced pitch track; effects by the checks above. **Listen to all 24 before wiring them in.** Everything was
generated in two ElevenLabs flows, "SHUWA sound effects (HPA-1307)" (`GQqoA00LHnVgssl5WRSQ`) and "SHUWA voice
(HPA-1307)" (`bMTYJ0DNcUdwOrhMGt0d`), where the other takes are still on the canvas.

## After this lands

- Adding the WAVs changes the assets fingerprint, so `bun run upload:r2` has to run once after the merge (README,
  "Deploy to Cloudflare"), or Workers Builds on main refuses the old R2 bundle.
- Wiring is a `spec.json` `sounds` entry per clip: the donor sound index it replaces (RYUKO's, or a graft's renumbered
  sound for SHUWATCH, BARRIER, RECHARGE and GIANT STEP) and the file name under `sound/`.
