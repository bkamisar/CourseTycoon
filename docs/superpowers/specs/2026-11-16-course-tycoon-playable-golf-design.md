# Course Tycoon — Playable Golf ("Play this hole")

**Date:** 2026-11-16
**Status:** Designed by Fable with the author away; every decision below was made
without review and is listed in §11 so it can be overruled. The measured core is
built and committed (`9f1a3d3`). The screen, drawing and wiring are not, and are
the subject of `docs/superpowers/plans/2026-11-16-playable-golf.md`.

---

## 1. What this is

You have spent the whole game building golf holes for other people. This lets you
play them.

From the hole editor, **Play** puts a ball on the tee of the hole you are looking
at. You pick a target, time a three-tap swing, and the ball goes where your timing
sent it — onto your fairway, into your bunker, into the pond you paid $2,500 for.
Hole out and the game tells you what you made and whether it is your best on that
hole. **Next hole** carries on round the course.

It is a toy inside the tycoon, and it has one job beyond being fun: it is the
quickest way to find out whether a hole you designed is any good. Move a bunker,
play it, move it back.

## 2. What it is not (v1)

- **Not part of the economy.** Playing costs nothing, earns nothing, passes no time
  and touches no guest, rating or prestige. The only thing it writes to the save is
  your best score per hole. This is deliberate: the economy was re-measured three
  times this month and a new input would mean a fourth.
- **Not a simulation of the guests.** Guests keep their handicaps and their dice.
  The player has no handicap and no dice (§4).
- **Not available during a championship week.** The only way in is the editor, and
  the editor is already locked while the field is on the course.
- No wind direction, no roll-out after landing, no club selection, no multiplayer,
  no tournaments for the player. See §12 for which of these are worth doing next.

## 3. The loop

```
Editor ──Play──▶ AIM ──Swing──▶ METER ──3rd tap──▶ FLIGHT ──▶ result line
                  ▲                                             │
                  └──────────── not holed ──────────────────────┘
                                 holed / picked up ──▶ FINISHED: Next hole · Replay · Done
```

**Aim.** The camera frames the shot. A crosshair marks the target; the caddie has
already put it somewhere sensible (the cup if you can reach it, otherwise as far
down the corridor as a driver goes — round the dogleg, not through it). Tap the
course to move the target there, or drag anywhere to nudge it, so your finger never
has to cover what you are aiming at. A dotted ring shows how far you can reach from
this lie. The dock names the club and the yardage.

**There is no club selection.** The caddie hands you the shortest club that reaches
the target. Moving the target is how you change club. This keeps the mark on the
power bar in the top half of the bar for every shot, so the rhythm of a swing is the
same whether it is a drive or a chip.

**Meter.** One bar, three taps (or three presses of Space):

1. **Start.** The cursor climbs the bar, one second from empty to 100%.
2. **Power.** Tap when the cursor reaches the mark. Short of it is short; past 100%
   (the bar runs to 110%) is extra carry and a wilder strike.
3. **Strike.** The cursor runs back down to the strike line. Tap on the line. Early
   sends the ball right, late sends it left. Miss the line entirely and it is the
   worst hook the lie allows.

**Flight.** The ball flies (or rolls) to where the two timings put it. A line says
what happened: *Fairway. 152y to the pin.* / *In the bunker.* / *In the water.
One-stroke penalty — play it again.*

**Putting** uses the same three taps. On the green the camera closes in until the
green fills the screen, small arrows show which way it falls, and the ball rolls —
it does not fly — breaking down the slope as it slows. The cup only takes a ball
that arrives gently.

**Finished.** *Birdie — 3 on a par 4. New best.* Then **Next hole** (the next built
hole, with a running "Round: +1 thru 3" in the header), **Replay**, or **Done**
(back to the editor for the hole you are on).

## 4. The rules of the ball

The cardinal rule of this codebase is that the interface never disagrees with the
simulation. Playable golf keeps it by using the simulation's own terrain: the lie a
ball finishes in is `lieAt`, the green is `greenRadius`, the cup is `greenCentre`,
par is `holeStats(hole).par`.

**No dice.** A guest's shot is a random draw around an intention, because a guest
has a handicap instead of hands. The player has hands, so a played shot is a pure
function of target, power and accuracy: the same taps always produce the same shot.
What the course does to that shot is exactly what it does to a guest:

| | Guest (`resolveShot`) | Player (`resolveStroke`) |
|---|---|---|
| Lie shortens the shot | `LIE_RANGE` (rough 0.85, sand 0.6, trees 0.45) | the same table, applied to the club |
| Lie makes it wilder | `LIE_SPREAD` (1.35 / 1.6 / 1.9) widens the random draw | the same table widens a mistimed strike |
| Weather | `spread` widens the random draw | the same `spread` widens a mistimed strike |
| A perfectly struck ball | still scatters | goes exactly where it was aimed |

**Numbers** (all in `src/sim/playGolf.js`, `src/sim/putting.js`,
`src/play/swingMeter.js`, each with its reasoning beside it):

- **Bag:** Chip 40 · Pitch 70 · Wedge 105 · 9 iron 135 · 7 iron 165 · 5 iron 195 ·
  3 wood 225 · Driver 250 yards at 100% from a clean lie.
- **Strike:** ±80 ms either side of the line is the full range of error; at the
  limit the ball starts 12° off line (52 yards wide on a full drive). Within ±12 ms
  it is called perfect and flies dead straight. Overswing to 110% multiplies the
  error by up to 1.5.
- **Penalties:** water, or a ball more than 40 yards beyond the rough, costs one
  stroke and is replayed from where it was hit. (Guests get a forward drop; a
  player gets stroke and distance, because a forward drop the player did not choose
  feels like the game playing for them.)
- **Trees** inside the hole and the first 40 yards of woods are playable: the ball
  is in the trees, the club is 45% of itself and the strike 1.9× as wild.
- **Putting:** constant friction; one constant slope per green whose direction
  belongs to the plot (seeded by hole id) and whose strength comes from the green's
  own `GREEN_DIFFICULTY` — a tiered green breaks four times as much as a large one.
  The putter is good to 6° at the limit. The cup is twice real size (a real one
  would be a third of a pixel) and refuses a ball that would have run more than
  about two feet past.
- **Holing a full shot:** a flown ball finishing within 0.35 yards of the cup is in.
- **Pick up at 12 strokes**, the same cap a guest has. A picked-up hole sets no record.

## 5. Is it a game? (measured)

`tools/playGolfBot.js` plays the six hole templates through the real meter, tapping
at the ideal instants plus a normally distributed error. 400 plays per hole,
2026-11-16:

| Tap error | Strokes vs par, per hole | Putts | Fairways | Greens in reg. |
|---|---|---|---|---|
| 0 ms (not a person) | −2.17 | 0.00 | 100% | 100% |
| 20 ms (sharp) | −0.80 | 1.19 | 85% | 89% |
| **35 ms (paying attention)** | **−0.11** | **1.50** | **61%** | **64%** |
| 60 ms (sloppy) | +0.82 | 1.97 | 37% | 31% |

The target was "ordinary timing plays to par", and it does. The first constants
tried (a ±100 ms strike window, 10°, a 3° putter into a 0.2-yard cup) scored −0.74
at 35 ms with 1.12 putts — everything inside eight yards was a gimme — so the
windows were tightened and re-measured. Three tests in `tests/playGolf.test.js` pin
these conclusions on fresh seeds.

Two honest caveats. **The 35 ms figure is an assumption about people**, not a
measurement of one; the first real playtest will say whether it is 35 or 60, and
`METER.ACC_WINDOW` is the one dial to turn. And reading the green is worth little
to the robot (1.50 putts reading perfectly, 1.55 aiming at the cup) because timing
error swamps break at these slopes — fine for a first version, and the first thing
to strengthen if putting feels flat.

## 6. Screens and camera

**A sixth screen.** `SCREEN_NAMES` gains `'play'`. The five-screen contract has been
kept until now by making every new feature a sheet; this one cannot be a sheet,
because it needs the canvas, the frame loop and the whole of the player's attention.
The alternative — making "play" a mode of the editor screen — would put two input
models and two docks behind one screen name, which is the kind of hidden state the
contract exists to prevent. So the contract is amended on purpose, and its test
with it.

**Chrome.** The HUD bar and amenity strip are hidden while playing (nothing in them
changes, and the hole needs the room). In their place:

```
┌──────────────────────────────┐
│ Hole 4 · Par 4 · 390y  Best 3│  header
│ Stroke 2 · 152y · Rough Breezy│
├──────────────────────────────┤
│                              │
│        (the hole,            │
│     camera on the shot)      │  canvas
│                              │
├──────────────────────────────┤
│ 7 iron · 150y                │  dock: caddie / result line
│ ▏▒▒│░░░░░░░░░░░░░░░░▼░░░▓▓▏  │  meter: strike line · mark · overswing
│ [        SWING        ][Exit]│
└──────────────────────────────┘
```

**Camera.** The editor's whole-hole view is right for designing and wrong for
playing: a par 5 fits a phone at half a pixel to the yard. `src/render/playCamera.js`
frames the ball, the target and (if near) the cup, never wider than the editor's
view and never closer than 5 px per yard; on the green it frames the green. It is
the editor's own `computeHoleTransform` followed by a zoom, handed to the canvas as
a transform, so the play screen calls the one and only `drawHole`. A zoomed true
picture is still true. The ball, target, cup and flag are drawn unzoomed on top so
they stay crisp.

**Graphics** are what the game already has: the existing hole renderer, a white
2×2 ball with a shadow, a crosshair, a dotted aim line and reach ring, slope arrows
on the green, an arc for the ball in flight. The existing `tok`, `splash` and
`cheer` sound effects are reused. No new art assets.

## 7. The scorecard

`state.playRecords` maps hole id to `{ strokes, design }`. `design` is a fingerprint
of the hole's corridor, width, green, tee and hazards; a record is only shown, and
only defended, while the fingerprint matches. Redesign the hole and the record
quietly retires — a best score is only a best score on the hole it was made on.
New games start with `{}`; old saves are given `{}` on load.

The round tally ("Round: +1 thru 3") lives in memory only and is gone when you
leave. A saved round scorecard is §12 material.

## 8. Architecture

| File | Status | Responsibility |
|---|---|---|
| `src/play/swingMeter.js` | **built** | Three-tap meter as a pure state machine over a supplied clock. |
| `src/sim/playGolf.js` | **built** | Clubs, caddie target, `planShot`, `resolveStroke`, `applyStroke`, score names, records. |
| `src/sim/putting.js` | **built** | `greenSlope`, `puttSpeedFor`, `rollPutt`. |
| `src/render/playCamera.js` | **built** | `shotFrame`, `makePlayCamera`. |
| `tools/playGolfBot.js` | **built** | The calibration robot and its table. |
| `src/play/flight.js` | to build | Where the ball is, `t` ms after it was struck. Pure. |
| `src/ui/playCopy.js` | to build | The result lines. Pure. |
| `src/render/playView.js` | to build | Draws one frame of the play screen. |
| `src/ui/playHole.js` | to build | The screen: header, dock, meter, input, phases. |
| `src/ui/screens.js`, `src/main.js`, `src/ui/editor.js`, `src/render/holeView.js` | to modify | Sixth screen, wiring, Play button, optional flag. |

Everything built is pure and tested (65 tests) and nothing imports it yet, so the
game as shipped is unchanged by commit `9f1a3d3`.

## 9. Edge cases

- **Ball flies off screen.** The camera does not chase it; it reframes when the ball
  lands. A lost ball is announced, not hunted for.
- **Putt runs off the green.** It stops just past the edge, in whatever is there
  (fringe, bunker, pond), and the next shot is a chip — or a penalty.
- **Target dragged out of reach or off screen.** Clamped back inside both.
- **Player leaves mid-hole.** Nothing is saved; the hole simply was not played.
- **Tab backgrounded mid-swing.** The meter runs on the clock, so the swing will
  have run out as a miss. Acceptable: it costs one stroke on a toy.
- **Editor "Spent" readout** resets when you come back from playing, because the
  editor is remounted. Cosmetic; the money itself is untouched.

## 10. Testing

Pure modules are unit-tested and sabotage-checked (reverse the hook/slice sign,
drop the penalty stroke, let the cup take any speed, remove the slope, widen the
strike window, drop hazards from the fingerprint — each fails the test written for
it). The two modules still to build that are pure (`flight.js`, `playCopy.js`) get
the same treatment in the plan. The screen itself is verified in the browser
against a written checklist, because a swing meter cannot be judged from Node.

## 11. Decisions made without you

Each is cheap to reverse; none touches the economy.

1. **No economic effect at all.** Safest possible first version.
2. **Entry from the hole editor only**, exit back to it. Makes design → play →
   redesign the natural loop, and keeps it out of championship weeks for free.
3. **A sixth screen**, amending the five-screen contract (§6).
4. **No dice for the player** (§4). The alternative, adding random scatter to a
   perfect strike, would make a missed fairway feel like the game's fault.
5. **No club selection.** The target picks the club.
6. **Three-tap meter**, also used for putting, one bar speed everywhere.
7. **Stroke-and-distance** for water and lost balls, not the guests' forward drop.
8. **Records retire when the hole is redesigned.**
9. **I built the pure core myself** rather than only specifying it, because the
   spec's numbers had to be measured to be worth writing down and the measuring
   needed the code. The screen, drawing and wiring — the bulk of the typing — are
   left for the cheaper model as you asked.

## 12. Worth doing next

Roughly in order of value for effort:

1. **Tune to a real person.** One playtest; turn `METER.ACC_WINDOW` if needed.
2. **Roll-out** on fairways and firm greens (a setup-dial tie-in: a championship
   course would really play faster).
3. **Wind with a direction**, shown as an arrow, on breezy days.
4. **A saved round**: play all eighteen, keep the card, show a course record.
5. **A light economic hook** — e.g. the owner breaking par on a hole gives its
   scenery a one-day "the pro shop is talking about it" bump. Needs measuring.
6. **Play the championship setup**: today's pins, the course as the field meets it.
