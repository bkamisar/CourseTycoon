# Course Tycoon — high-resolution graphics pass (design)

**Status:** designed on Fable 2026-11-16, not built. Written to be built by a
cheaper model. The author asked for the graphics to be "as much better as
possible", explicitly **not bound to the 8-bit look**, and can roll it back.

**Goal:** the course stops being pixel art. Same game, same layout, same
simulation — drawn smooth, at the phone's real resolution, with gradients,
soft shadows and painted trees.

## 1. The one idea that makes this cheap

Today the canvas backing store is 180×320 and CSS scales it up by a whole
number. Every draw call works in those 180×320 units.

**Keep the units. Raise the backing store.** Set
`canvas.width = 180 × res`, `canvas.height = 320 × res` and
`ctx.setTransform(res, 0, 0, res, 0, 0)`, where
`res = min(cssScale × devicePixelRatio, 1440 / 180)`. Every existing draw
call, hit test and layout number keeps working unchanged, in what are now
*logical* units, and every arc and stroke comes out anti-aliased at native
resolution for free.

Nothing outside `src/render/` may learn about `res`. `surface.width`,
`surface.height`, `surface.scale` and `toCanvasCoords` keep their meanings
(verified: every caller uses those, none reads `canvas.width`).

## 2. Rules that still hold

- **The interface never disagrees with the simulation.** Every terrain shape
  is still the exact region `lieAt` tests. Decoration goes *inside* a region:
  a darker rim on the fairway is drawn inside the fairway band, a pond's
  shoreline inside its circle. Stop rounding points to whole logical pixels
  (`roundPoint`, rounded `lineWidth`) — exact geometry is now both smoother
  and more honest.
- **Trees stay where `plantForest` puts them.** Do not change
  `plantForest`, `fits` or `exposedTrunks`; `tests/depth.test.js` must pass
  untouched. A painted tree must stay inside its sprite's box (the checked
  footprint includes one logical pixel of margin all round, so a round crown
  inscribed in the box is safe).
- **No raw hex outside `palette.js`.** Gradients need in-between colours:
  add pure helpers to `palette.js` — `mix(a, b, t)` returning `#RRGGBB`, and
  `withAlpha(colour, a)` returning `rgba(...)` — and derive everything from
  existing palette roles.
- **Nothing random at draw time.** Textures are built once with a seeded
  generator and cached. The only things that move are driven by
  `animClock.js` or the playback clock.
- `src/sim/` is not touched. No number in the game changes.
- `ctx.filter` (blur) is **not** available on older iOS Safari. Do not use it.
  Soft edges come from anti-aliasing, gradients and alpha.

## 3. What to build, in this order

Each stage is shippable alone. **Run `node --test`, capture, and commit after
each one**, so a session that runs out leaves working software.

### Stage 1 — resolution (small, unlocks everything)

- `src/render/pixel.js`: backing store and transform as in §1, re-applied in
  `resize()` (assigning `canvas.width` resets context state). Turn
  `imageSmoothingEnabled` **on** (`imageSmoothingQuality = 'high'`). Expose
  the factor: a tiny module-level `setResolution`/`resolution()` (new
  `src/render/paint.js`), default 1 so Node tests are unaffected.
- `index.html`: remove `image-rendering: pixelated/crisp-edges` from
  `#game-canvas`.
- Update the file comments: the "never fractional, 8-bit" reasoning is now
  history.

After this stage alone the fairways, greens, bunkers and ponds are smooth
and the sprites are crisp blocks. Capture it and look before going on.

### Stage 2 — terrain (`src/render/holeView.js`)

Replace everything from the texture section down; keep `computeBounds`,
`computeHoleTransform`, the exports and `drawHole`'s options. Textures are
`CanvasPattern`s built at device resolution (tile = N logical px × `res`)
with `pattern.setTransform(new DOMMatrix().scale(1 / res))` so a tile pixel
is a device pixel; rebuild if `res` changes.

- **Forest floor** (`fillWoods`): `TREE_SHADOW` with soft darker/lighter
  blobs (radial gradients, low alpha).
- **Rough:** band in a darker rim colour, then the same path ~1.2 px
  narrower in `ROUGH`, then a soft mottle texture and a fine grain texture
  stroked along the same path.
- **Fairway:** band in a slightly darker cut-edge colour, then ~0.8 px
  narrower in a diagonal mowing-stripe pattern (two close greens, stripe
  ≈3 logical px, 45°), then grain.
- **Green:** radial gradient (paler toward the top-left), a faint fine
  stripe, and a collar ring drawn just inside the radius.
- **Bunker:** clipped to its circle — shaded lip, then an offset lit floor
  with a radial gradient, two faint rake arcs.
- **Pond:** clipped to its circle — radial gradient deep→shallow, a pale
  shoreline ring just inside the edge, and two or three glints that drift
  and fade continuously on `animationTime()`.
- **Tree clump:** floor texture in the disc with a dark inner ring.
- **Tee:** a small rounded mown pad with two markers.
- **Flag:** vector pole and a triangular flag that flutters slightly; a dark
  cup at its foot. Export it (`paintFlag(ctx, x, y, size)`) so the play
  screen draws the same flag larger.
- Export `drawPondGlints(ctx, hole, rect)` and give `drawHole` a
  `glints: false` option, for stage 4's cache.

### Stage 3 — trees and shadows (`src/render/forest.js`, `light.js`)

- **Tree art:** paint each kind once into its own bitmap at
  `res × 3` px per logical px, sized to its sprite box, and `drawImage` it
  scaled. Broadleaf: a shadowed under-disc offset down-right, a crown of one
  main circle plus four or five lobes sharing one radial gradient
  (`TREE_HIGHLIGHT` → `TREE_LIGHT` → `TREE` → `TREE_SHADOW`, lit from the
  top-left), a few lighter leaf dabs top-left and darker ones bottom-right.
  Conifer: three stacked tiers, each lighter on the left. Three tone
  variants per kind (plain, slightly yellower, slightly darker), chosen by a
  hash of the tree's position, so the forest is not uniform. Two bitmaps per
  variant: trunk showing / trunk in shade, chosen by `exposedTrunks` exactly
  as now.
- **Layers at device resolution:** the tree and shadow layers become
  `area × res` pixels, painted under `scale(res)`, blitted with an explicit
  destination size. Put `res` in the cache key.
- **Zoomed play view must not use a layer** (it would be enormous or blurry).
  Give `drawForest` a `visible` rectangle; when present, draw trees directly
  each frame, culled to it. `playView.js` already computes that rectangle for
  `fillWoods` — pass it through `drawHole`.
- **Tree shadows:** one path of capsules (a round-capped line from the foot
  of the trunk to where the top lands, width ≈ ¾ of the crown), stroked once
  per width so overlaps do not double-darken; in a layer, painted opaque and
  blitted at `SHADOW_ALPHA`.
- **`drawCastShadow`:** the same capsule, replacing the pixel slab. Keep
  `castShadowPixels` and its tests as they are.
- **`applyLight`:** keep the multiply tint; add a gentle corner vignette
  (radial gradient, max alpha ≈ 0.25) whenever it is called.

### Stage 4 — the map cache (`src/render/resortView.js`)

Nine holes of textured strokes every frame at 1080×1920 is the performance
risk. Cache the static ground — floor plus every built hole's terrain,
without glints, tees or flags — in one off-screen layer at device
resolution, keyed like the forest layer (export and reuse `plotKey`) plus
`res`. Per frame the map is then: ground blit, forest (shadow + tree
layers), pond glints, tees and flags, labels, empty plots.

Labels: a rounded dark chip with real text
(`700 5.5px system-ui`) instead of the bitmap font.

### Stage 5 — people and overlays

- **Golfers** (new `src/render/figures.js`, used by `tokens.js` and
  `playView.js`): a small vector figure — legs that swing on the animation
  clock, a rounded torso in the group's shirt colour (same `SHIRT_KEYS`
  order), a head and cap, a thin dark outline so it reads on any ground.
  The play screen's golfer is the same figure ~1.6× with a club drawn for
  each of the three poses.
- **Play overlays** (`playView.js`): aim line as a dashed stroke, target as
  a ring and cross, reach ring as a dashed circle, slope arrows as stroked
  arrows, ball as a circle with a soft ground shadow, trail and impact
  particles as circles. Keep every exported pure function and its tests.
- **Weather** (`weatherFx.js`): rain and wind as thin strokes from the same
  `rainDrops` / `windStreaks` data.
- Beverage cart and halfway house: redraw as simple vector shapes if there
  is budget; leaving them as sprites is acceptable.

## 4. Verifying

The preview pane is usually hidden: see the memory note
`hidden-preview-pane-testing.md` for the scratch server, the timer shim and
the canvas-capture route. With the bigger canvas, capture at scale 1.

Look at, after each stage: the resort map; the map during playback early and
late in the day; the hole editor; the play screen on the tee and zoomed in on
a green; one wet day.

`node --test` must stay green throughout (1,091 tests at the start). Add
tests only for new pure functions (`mix`, `withAlpha`, anything else
extracted). Bump `BUILD` in `src/ui/changes.js` and `version.json` together,
with a player-facing note, in the final commit.

## 5. Known risks to report honestly

- **Frame rate on a real phone** cannot be measured from here. Stage 4 and
  the `1440 / 180` cap are the mitigations; say plainly that it is untested.
- **The DOM chrome** (HUD, sheets, buttons) is still styled as pixel art and
  will now sit beside a smooth course. Restyling it is out of scope; note it.
- **Mixed styles mid-way:** between stages 1 and 5 some things are smooth and
  some are blocks. That is expected; do not stop there by choice.
