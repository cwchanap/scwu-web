# SHUWA's select and HUD art

His own select-screen, Menu and HUD art (HPA-1306), drawn for him so nothing here is cut from the game. Since
HPA-1308 the game's files live in `../game/ui/`, inside the assets fingerprint; only the scheme previews stay here.

| File                       | Size    | What it is                                                                       |
| -------------------------- | ------- | -------------------------------------------------------------------------------- |
| `../game/ui/portrait.png`  | 166×450 | Select portrait, beside the grid while his cell is hovered, and his guide's hero |
| `../game/ui/tile.png`      | 24×60   | Grid face tile, filled edge to edge (his cell on the select sheet)               |
| `../game/ui/hud-face.png`  | 70×21   | HUD face beside his life bar, see-through outside his head                       |
| `../game/ui/name.png`      | 91×20   | "SHUWA" name lettering                                                           |
| `../game/ui/palettes.json` |         | His eight colour schemes: each colour his drawings use, in all eight             |
| `schemes/base-<n>.png`     | 144×208 | Schemes 2 to 8 on his base key drawing (`../round7/key-master-base.png`)         |
| `schemes/giant-<n>.png`    | 161×205 | Schemes 2 to 8 on his giant key drawing (`../round7/key-master-powered.png`)     |

All of it is made by `../tools/ui.py` (python3 with numpy, scipy and pillow):

```sh
bash art/shuwa/draw.sh ui                  # the drawings, into out/raw/ (OpenAI Images API, as for his sprites)
python3 art/shuwa/tools/ui.py variants     # every drawing cleaned up, into out/ui/ (not committed)
python3 art/shuwa/tools/ui.py pick b b     # the picked portrait and face, into game/ui/
python3 art/shuwa/tools/ui.py name schemes # the lettering and the colour schemes, drawn in code
```

## Portrait

Drawn as `portrait-b` of three takes (`../prompts/portrait-{a,b,c}.txt`), one image edit each with his base key
drawing (`../refs/base.png`) as image 1, model `gpt-image-2.6-sunburst`, 1024×1536. The prompt keeps his design and
asks for a full-body select portrait facing right, as a flat cel illustration on the reference's flat blue. Its pose
line: "ready to fight: an upright guard, front fist raised at chin height, the lantern held low and back in his other
hand, knees slightly bent, chest lamp shining, a focused face with brows down and a small confident grin."

Cleanup: `crisp.py` at 450 px high, the same pixel step as his sprites (fills snapped to his colour ramps, area-vote
downscale, 1 px coloured lines and outline), with one change: the silver ramp drops its third tone (136,136,152),
which at this size fights the grey's light tone (144,144,152) and speckles his gloves and boots. The model drew him
about 5 heads tall, taller than the cast's portraits (about 3), so he is narrower than their usual 200 px.

## Face tile and HUD face

Both come from `face-b` of three head close-ups (`../prompts/face-{a,b,c}.txt`; same reference, model and canvas):
his head filling the canvas, the hat brim near the top, eyes halfway down, chin near the bottom. Face line: "a
confident half smile, one corner of his mouth up, bright eyes."

Cleanup: `crisp.py` twice at two scales, framed from the face it finds (his skin, and his irises split into two
eyes):

- Tile: his skin, brow to neck, 50 px tall; cut 24×60 around his near eye with the eyes halfway down, on the
  drawings' blue (40,88,152), so the brim sits at the top with the fin cut off and the collar at the bottom.
- HUD: 1.25× the tile's scale, so the eyes are about 12 px tall like the cast's; cut 70×21 across both eyes with the
  brows above, see-through outside his head.

`FRAMES` in `ui.py` overrides that framing for one drawing if a redraw needs it.

## Name lettering

Drawn in code, no image model: the cast's nameplate lettering (ZOMA's, SEAN's, ALEX's), not DoraEmon's shaded one.
Squared capitals 16 px tall with 4 px upright strokes and 2 px bars, white (255,255,255) faces, a 1 px clear inset (the
dark edge, wherever the plate is shown), and a 1 px light grey (199,206,209) outline, 4 px from letter to letter.

## Colour schemes

`palettes.json` is the table the exporter's palettes need (`export_palettes` in `scripts/export_assets.py`): `colors`
maps each of the 31 colours his drawings use (the one palette of `../game/drawings/`, as `rrggbb`) to its colour in
schemes 1 to 8, and `schemes` names them. Scheme 1 is his current colours. The portrait and HUD face use only those
colours, so the table recolours them too; the tile adds only its background.

| Scheme            | Suit (base form) | Giant's stripes | Metal (hat, giant's body) |
| ----------------- | ---------------- | --------------- | ------------------------- |
| 1. Track orange   | orange           | red             | silver                    |
| 2. Hi-vis lime    | lime             | green           | silver                    |
| 3. Fire crew      | red              | gold            | silver                    |
| 4. Midnight       | charcoal         | red             | dark gunmetal             |
| 5. Violet         | violet           | magenta         | silver                    |
| 6. Teal           | teal             | orange          | silver                    |
| 7. Rose           | pink             | pink            | silver                    |
| 8. Black and gold | black            | red             | gold                      |

A scheme recolours whole ramps (light, shadow, line; `SCHEMES` in `ui.py`). The metal ramp also shades his gloves a
little, and the giant's main silver (200,208,224) is also the reflective bands' shadow. His chest lamp's blues never
change, nor do his skin, hair, eyes, gloves, boots or lantern.

The lamp's low-life blink turns its blues into (248,128,136), (232,32,40) and (168,16,24), and the last two are the
giant's stripe colours, which schemes 2, 3, 5, 6 and 7 recolour. So the scene applies the blink after the palette
(`recolored` in `src/game/scene.ts`), or the lamp would blink the scheme's stripe colour.
