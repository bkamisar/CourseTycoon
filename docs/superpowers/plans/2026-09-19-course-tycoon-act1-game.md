# Course Tycoon — Act I Game Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the completed headless simulation into a playable 8-bit game on a phone.

**Architecture:** The simulation is finished and must not be touched. This plan builds only what sits on top of it: a pixel canvas, a hole and resort renderer, a touch-first UI of bottom sheets, playback of the day's timeline, an evening report, saving, and audio. Rendering reads state and draws; it never computes game outcomes.

**Tech Stack:** Plain ES modules, canvas 2D, WebAudio. No build step, no dependencies, no framework. Published as an artifact on claude.ai so it opens on a phone.

**Spec:** `docs/superpowers/specs/2026-09-19-golf-resort-tycoon-design.md`
**Preceding plan:** `docs/superpowers/plans/2026-09-19-course-tycoon-act1-simulation.md` (complete, 136 tests green)

**Commits:** End every commit message with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Never run `git push`, `git fetch` or `git pull` — the user pushes via GitHub Desktop.

---

## How this plan differs from the last one

The simulation plan was strict TDD because simulation outputs are numbers you can assert on. **Most of this plan cannot be tested that way.** A test that asserts a fairway is green tells you nothing about whether the game looks good, and writing such tests produces false confidence and dead weight.

So the discipline here is different:

- **Things with real logic get real tests**: the save adapter, the playback clock, the editor's derived-stat wiring, screen routing. These are listed explicitly and are test-first.
- **Things that are visual get a look-at-it checkpoint**: each renderer task ends with a specific description of what should appear on screen and what would indicate it is wrong. Implementers must actually open the page and confirm, and say in their report what they saw.
- **The 136 existing tests must stay green throughout.** Nothing in this plan changes `src/sim/`. If an implementer believes a simulation change is required, that is a finding to report, not a change to make.

---

## Hard rules

- **Never edit `src/sim/`.** The simulation is complete, tuned and guarded by a purity test. If something seems missing, report it.
- Rendering and UI must not compute game outcomes. If a number appears on screen, it came from `runDay`, `holeStats` or another simulation function.
- Touch targets at least 44px. No hover states, no right-click, no keyboard-only affordances.
- Wrap every `localStorage` read and write in try/catch; the page must render correctly when storage is unavailable.
- The page must work at 375×812 (iPhone portrait) with no horizontal scrolling.

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | Page shell, canvas element, mobile viewport meta, root UI containers |
| `src/render/pixel.js` | Canvas setup: low internal resolution, integer upscale, smoothing off, resize handling |
| `src/render/palette.js` | The fixed 8-bit palette, as named colour constants |
| `src/render/sprites.js` | Sprite definitions as pixel grids in code, plus a draw helper |
| `src/render/holeView.js` | Draws one hole: corridor, fairway, rough, features, green, tee |
| `src/render/resortView.js` | Draws the overview: nine plots, amenities, paths |
| `src/render/tokens.js` | Draws group tokens and shot effects during playback |
| `src/ui/screens.js` | Screen routing: overview, editor, playback, report |
| `src/ui/sheet.js` | Bottom-sheet component — open, dismiss, stack |
| `src/ui/hud.js` | Money, day, ratings bar |
| `src/ui/editor.js` | Hole editor: template picking, feature dragging, live derived stats |
| `src/ui/panels.js` | Build, hire and pricing sheets |
| `src/ui/report.js` | Evening report screen |
| `src/play/clock.js` | Playback clock: maps wall time to simulated minutes, speed and skip |
| `src/play/interpolate.js` | Turns timeline events into positions at a given minute |
| `src/save/adapter.js` | `load()` / `save(state)` over swappable backends |
| `src/save/local.js` | localStorage backend |
| `src/save/code.js` | Exportable save-code backend |
| `src/save/cloud.js` | Artifact per-viewer store backend |
| `src/audio/chiptune.js` | Music loop and sound effects |
| `src/main.js` | Wiring: boot, new game / continue, the frame loop |

---

## Task 1: Pixel canvas shell

**Files:** Create `index.html`, `src/render/pixel.js`, `src/render/palette.js`

- [ ] **Step 1: Write `src/render/palette.js`**

A fixed 8-bit palette, defined once and used everywhere. Roughly sixteen colours covering: two fairway greens, two rough greens, a deep green for trees, sand, two water blues, a pale green for putting surfaces, brown for paths and tee boxes, white, two greys for UI, and a warm accent for money and highlights. Export as a frozen object of named constants — `FAIRWAY`, `ROUGH`, `SAND`, `WATER`, `GREEN_SURFACE` and so on. Never write a raw hex value anywhere else in the codebase.

- [ ] **Step 2: Write `src/render/pixel.js`**

Exports `createSurface(canvas, { width, height })` which sets the canvas backing store to the given low internal resolution (start at 180×320 — phone portrait aspect), scales it up by the largest whole-number factor that fits the viewport, sets `imageSmoothingEnabled = false`, and returns a context plus the current scale factor. Must expose a `resize()` that recomputes the integer scale on orientation change, and `toCanvasCoords(clientX, clientY)` converting a touch point into internal pixel coordinates, since every input handler will need it.

Integer scaling is the point: fractional scaling produces blurred, uneven pixels and ruins the look.

- [ ] **Step 3: Write `index.html`**

Page shell with `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">`, a full-bleed canvas, a root div for sheet UI above it, and a `<title>` of `Course Tycoon`. Dark page background so letterboxing around the integer-scaled canvas looks deliberate. Load `src/main.js` as a module.

- [ ] **Step 4: Temporary boot check**

Have `src/main.js` fill the surface with `FAIRWAY` and draw a few test rectangles in other palette colours.

- [ ] **Step 5: Look at it**

Open the page at phone width. **You should see:** crisp, hard-edged colour blocks with no blurring, filling the viewport, letterboxed evenly. **Wrong if:** edges look soft or smeared (smoothing still on, or fractional scaling), the canvas overflows horizontally, or rotating the device leaves it the wrong size.

Report the internal resolution and the scale factor you observed.

- [ ] **Step 6: Commit**

---

## Task 2: Sprites

**Files:** Create `src/render/sprites.js`

- [ ] **Step 1: Define sprites as pixel grids in code**

Each sprite is a small array of strings, one character per pixel, mapping to palette keys — readable and editable directly in source. Needed for Act I: a golfer (two walk frames), a flag, a tree, a bunker rake, a golf ball, a cart, and small building icons for the clubhouse, pro shop, snack shack, halfway house, restaurant, restrooms, driving range, practice green and cart barn.

Keep them tiny — 8×8 for objects, 8×12 for the golfer. At this size they read at a glance and cost almost nothing to draw.

- [ ] **Step 2: Write the draw helper**

`drawSprite(ctx, sprite, x, y, { flip })` — blits a sprite at integer coordinates. Must round coordinates; drawing at fractional positions defeats the pixel grid.

- [ ] **Step 3: Look at it**

Draw every sprite in a grid on screen. **You should see:** each one distinguishable at actual size on a phone, not just when zoomed. **Wrong if:** you cannot tell the pro shop from the snack shack, or the golfer reads as a blob. That means they need redesigning at this size, not scaling up.

Report which sprites were hardest to read; those are the ones to iterate on.

- [ ] **Step 4: Commit**

---

## Task 3: Hole renderer

**Files:** Create `src/render/holeView.js`

- [ ] **Step 1: Implement `drawHole(ctx, hole, { width, height })`**

Draws a single hole to fill a portrait area: tee at the bottom, green at the top. Must compute a transform from hole yards to screen pixels that fits the whole corridor with a margin, then draw in **`lieAt`'s own priority order**, back to front: rough, fairway band, the green, then ponds, bunkers and tree clumps on top, then the tee box and the flag.

**The green goes down before the hazards, not after.** `lieAt` tests water, sand and trees *before* it tests the green, so a bunker overlapping the green edge — which happens on `straightPar4` and `doglegPar4` — plays as sand. Painting the green last covers it, and the player sees putting surface where the ball will find a bunker. Any draw order that disagrees with `lieAt`'s priority is a bug, however natural it reads as prose.

The corridor and its width come from the hole data; fairway is generated from the centreline exactly as `terrain.js` classifies it, so what is drawn matches what the simulation resolves shots against. **A hole that looks different from how it plays is the worst bug this file can have.**

- [ ] **Step 2: Look at all six templates**

Render each of the six templates from `src/sim/templates.js` in turn. **You should see:** doglegs that bend the right way, the par 3 over water with its pond clearly between tee and green, bunkers sitting where the data says. **Wrong if:** any hole reads as straight when its corridor bends, or a hazard appears off the playing area.

Cross-check one hole by sampling: pick ten points, ask `lieAt` what they are, and confirm the pixel colour matches. Report the result — this is the check that the drawing and the simulation agree.

- [ ] **Step 3: Commit**

---

## Task 4: Resort overview

**Files:** Create `src/render/resortView.js`

- [ ] **Step 1: Implement `drawResort(ctx, state, { width, height })`**

The map the player spends most time on: nine hole plots laid out to fit portrait, built holes drawn as small versions of their shape, empty plots as dashed outlines with a plus. Amenities drawn as their building sprites near the clubhouse. A tappable region list returned alongside, so the UI layer knows what was hit without duplicating layout maths.

- [ ] **Step 2: Look at it**

**You should see:** at a glance, which holes are built and which are empty, and where the buildings are. **Wrong if:** you cannot tell built from empty without squinting, or plots overflow the screen.

- [ ] **Step 3: Commit**

---

## Task 5: Screens, sheets and HUD

**Files:** Create `src/ui/screens.js`, `src/ui/sheet.js`, `src/ui/hud.js`

This task has real logic and is **test-first**.

- [ ] **Step 1: Write tests** for screen routing — that the active screen changes on request, that an unknown screen is rejected rather than silently blanking, and that sheets stack and dismiss in order (opening two and dismissing one returns to the first, not to none).

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**

Screens: `overview`, `editor`, `playback`, `report`. Sheets are DOM overlaid on the canvas — text in sheets should be real DOM text, not canvas-drawn, so it scales with accessibility settings and can be selected. HUD shows money, day number, and the three ratings in a top bar.

- [ ] **Step 4: Verify tests pass, then look at it on a phone-width viewport**

**You should see:** a sheet sliding up from the bottom, dismissible by dragging down or tapping outside, with 44px-plus touch targets. **Wrong if:** the sheet covers the whole screen with no way back, or buttons are too small to hit with a thumb.

- [ ] **Step 5: Commit**

---

## Task 6: Hole editor

**Files:** Create `src/ui/editor.js`

The heart of the build phase. Real logic, so the stat wiring is **test-first**.

- [ ] **Step 1: Write tests** confirming that editing a hole produces the derived stats the simulation reports for it — build a hole, move a bunker, and assert the editor's displayed values equal `holeStats()` and `expectedMinutes()` for the edited hole. The editor must never compute its own numbers.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**

On an empty plot: choose from the six templates, showing each one's par, length and cost. On a built hole: drag bunkers, ponds and trees to move them; tap to add or remove; move the tee; cycle the green preset; widen or narrow the corridor.

A live readout shows **Par · Length · Difficulty · Scenery · Minutes · Upkeep/day**, updating as the player drags — this is the mechanic that makes the cost of an idea visible while having it. `expectedMinutes` simulates twelve groups, so throttle it to fire on drag-end rather than every frame.

- [ ] **Step 4: Verify tests, then look at it**

**You should see:** stats changing as you drag a pond around, with "minutes" and "upkeep" rising as the hole gets harder. **Wrong if:** dragging is laggy (the throttle is not working), or the numbers disagree with what the hole does during a day.

- [ ] **Step 5: Commit**

---

## Task 7: Build, hire and pricing sheets

**Files:** Create `src/ui/panels.js`

- [ ] **Step 1: Implement**

Three sheets, all reading their costs from `AMENITIES` and `WAGES` in `src/sim/economy.js` — never re-listing prices.

**Build**: amenities with build cost, daily upkeep, and what each does in plain words. Disable what the player cannot afford, showing the shortfall rather than just greying out.
**Staff**: hire and fire groundskeepers and marshals, showing current count and daily payroll.
**Pricing**: green fee and tee interval, each as a slider with a live consequence line — for the fee, what the course is currently worth per `perceivedValue`; for the interval, how many groups a day it allows per `maxGroupsForDay`.

The tee interval slider matters: it is the player's clearest lever against a course they have made too slow, and showing the capacity consequence as they drag is what teaches the pace-of-play mechanic.

- [ ] **Step 2: Look at it, then commit**

---

## Task 8: Day playback

**Files:** Create `src/play/clock.js`, `src/play/interpolate.js`, `src/render/tokens.js`

The clock and interpolation are real logic and are **test-first**. Token drawing is visual.

- [ ] **Step 1: Write tests** for the clock — that it maps elapsed wall time to simulated minutes at a given speed, that changing speed mid-playback does not jump the simulated time, that it clamps at the end of the day, and that skipping moves straight to the final minute. And for interpolation — that a group's position at a minute between two events falls between those events' positions, and that a minute before its tee time yields no position at all.

- [ ] **Step 2: Run to verify they fail, then implement**

**Scope decision, deliberate:** playback animates **group tokens moving between holes**, not every individual ball. Shot events fire small effects — a splash on water, a puff on sand, a flag flash on a holed putt. Individual ball flight is only drawn when the player has tapped into a single hole. Animating forty groups of four balls each would be unreadable at this pixel size and far more work for less clarity.

Controls: play, pause, speed (1× / 4× / 16×), and skip to report. Skipping is jumping to the end of a recording — the day is already computed.

- [ ] **Step 3: Verify tests, then look at it**

**You should see:** tokens progressing up the course through the day, bunching visibly where groups are waiting. **Wrong if:** everything moves in lockstep with no bunching — that would mean the waits in the timeline are not reaching the screen, which is the whole point of watching.

- [ ] **Step 4: Commit**

---

## Task 9: Evening report

**Files:** Create `src/ui/report.js`

- [ ] **Step 1: Implement**

A full screen, scrollable, showing: profit as the headline with revenue and cost breakdown beneath, the three ratings with their movement since yesterday, average round time with the bottleneck hole named, and the complaints as a list in the guests' own words.

Gate progress shows the outstanding conditions from `actOneGate` as a checklist, so the player can see what they are working toward rather than facing a locked door.

Complaints are the emotional core of this screen — give them room and a voice, not a cramped bullet list.

- [ ] **Step 2: Look at it, then commit**

---

## Task 10: Saving

**Files:** Create `src/save/adapter.js`, `src/save/local.js`, `src/save/code.js`

**Test-first** — this is pure logic and losing a save is the worst bug the game can have.

- [ ] **Step 1: Write tests** — that the adapter picks the first available backend, that a failing backend falls through to the next rather than throwing, that a round trip through the save code reproduces the state exactly, that a corrupt save code is rejected with a clear error rather than producing a broken game, and that everything still works when `localStorage` throws on access (private browsing).

- [ ] **Step 2: Run to verify they fail, then implement**

`adapter.js` exposes `load()` and `save(state)` and knows nothing about where data goes. `local.js` wraps localStorage in try/catch throughout. `code.js` produces a compressed, copyable string.

Saving happens once per day at the evening report, not continuously.

- [ ] **Step 3: Verify tests, then commit**

---

## Task 11: Audio

**Files:** Create `src/audio/chiptune.js`

- [ ] **Step 1: Implement**

WebAudio oscillators, no audio files. A short looping chiptune for the build phase and a slightly busier one for playback. Effects: the *tok* of a struck drive, a splash, a cheer for a birdie, a cash register at the evening report.

**Muted by default**, with a clear toggle. A game that makes noise unprompted on a phone is a game that gets closed. Audio must also initialise lazily on first user interaction — mobile browsers refuse to start audio before a gesture.

- [ ] **Step 2: Listen to it, then commit**

---

## Task 12: Wiring

**Files:** Create `src/main.js` (replacing the Task 1 boot check)

- [ ] **Step 1: Implement**

Boot: attempt to load a save, otherwise start a new game. The frame loop draws the active screen. "Open the day" calls `runDay`, stores the result, and switches to playback; finishing playback switches to the report; dismissing the report saves and returns to overview.

Mode switching lives here and nowhere else.

- [ ] **Step 2: Play a full week on a phone-width viewport**

**You should see:** a complete loop — build, open, watch, read, repeat — seven times without a crash, with the save surviving a page reload. Report anything that felt confusing, not just anything that broke. **Confusion is a finding.**

- [ ] **Step 3: Commit**

---

## Task 13: Publish

- [ ] **Step 1: Publish as an artifact** with all supporting files, so it opens on a phone from a private link.

- [ ] **Step 2: Add the cloud save backend** (`src/save/cloud.js`) using the artifact's per-viewer store, registered ahead of localStorage in the adapter so progress syncs across devices. On boot, if the cloud save is newer than the local one, ask before choosing — never silently discard a day's work.

- [ ] **Step 3: Test on an actual phone**, then commit.

---

## Definition of done

- [ ] All 136 simulation tests still green, and `src/sim/` unmodified
- [ ] New tests for screens, editor stats, clock, interpolation and saving all pass
- [ ] A full week is playable at 375×812 without crash or horizontal scroll
- [ ] The save survives a reload, and a save code round-trips
- [ ] Published, and confirmed opening on a real phone
- [ ] Nothing pushed — the user pushes via GitHub Desktop

## Deliberately out of scope

Freehand corridor drawing, hotel rooms, the back nine, second courses, zones and shuttles, weather, tournaments. All are later acts. This plan ends when Act I is playable.
