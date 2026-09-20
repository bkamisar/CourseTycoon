# Course Tycoon — Design Spec

**Date:** 2026-09-19
**Status:** Approved design, pre-implementation

An 8-bit golf resort management game for the browser, mobile-first. You design
the holes, run the resort, and live with the consequences of both.

---

## 1. Premise

You have taken over **Pinehollow**, a run-down nine-hole resort. Three scrappy
holes are already open and there is land for six more. You have income from day
one and something to watch immediately — no staring at an empty field.

The game is built and played in **acts**. Each act ships as a complete game with
a win condition, and that win condition is the gate into the next act. No act is
ever an unfinished game; it is the current horizon.

---

## 2. Design principles

These four rules govern every decision below. When something in this spec seems
arbitrary, it is probably downstream of one of these.

**Narrow implementation, wide data model.** Build only what the current act
needs, but shape the data for the acts we know are coming. A guest carries a
`stayNights` field in Act I even though it is always `1`. The resort holds an
array of courses and an array of zones, each with exactly one entry. Costs
nothing now; makes later acts additions rather than surgery.

**The simulation never touches the screen.** The sim is pure functions over
plain data. No canvas, no DOM, no timers. This is what makes it testable and
fast.

**Deterministic by seed.** Every random draw comes from one seeded generator.
The same state plus the same seed produces the identical day, every time. This
is what makes balance tuning evidence-based rather than vibes-based.

**Design decisions are business decisions.** Every mechanic that makes a hole
more beautiful or more brutal must also cost something measurable — time,
money, or goodwill. If a feature has no downside, it is not a decision.

---

## 3. The acts

### Act I — The Course *(this build)*

Nine holes, the day cycle, the hole editor, golfers, pace of play, green fees,
staff, the halfway house and clubhouse restaurant, ratings.

**Gate:** all nine holes open, cash on hand at or above $50,000, prestige at or
above 40 (of 100), and average guest satisfaction at or above 60 (of 100) across
the last seven consecutive days. These thresholds are initial values, tuned by
the balance tool (§13) against the "graduation, not grind" standard below. →
Guests begin asking where they can sleep.

### Act II — The Lodge

Rooms, multi-day guests, stay packages, dinner revenue. Guests stop being
"arrive, play, leave" and become "check in for three nights, play each day, eat
every evening." Revenue per guest rises sharply; the binding constraint moves
from tee times to beds.

**Gate:** rooms full most nights and the dining room paying for itself. →
Guests begin complaining they could not get a tee time.

### Act III — The Resort

Far land, a second course, zones and shuttles. The full capacity chain: golf
needs beds, beds need golf, and distant golf needs transport.

**Gate:** both courses profitable with the shuttle keeping up.

### Act IV — The horizon

A second property, sharing brand prestige. **Deliberately not planned in
detail**, and it should stay that way until Act III has been played. What
belongs in a fourth act depends on how managing multiple courses actually feels
— if Act III proves tedious, then a second property is that same tedium doubled
and something else (tournaments, a career mode) is the better fourth act.
Planning it now would mean designing for a world we have not seen and then
feeling committed to a plan we should abandon.

The commitment here is narrower: Act IV is not *ruled out*. The data model holds
`properties` as an array so the shape will not fight us later.

**Gates read as graduation, not grind.** A gate fires when the player has
demonstrated competence — profitable, well-rated, nine holes standing — not when
they have ground out a large number. If a gate takes forty repetitive days of
shaving upkeep, it is a wall and must be retuned.

---

## 4. The day cycle

Time does not pass in real time. The game moves in discrete days with three
phases.

**Morning — build.** Spend money. Edit or build holes, place amenities, hire or
fire staff, set the green fee, set the tee interval. Nothing is simulated; the
clock is stopped.

**Open — watch.** The whole day is simulated at once, then played back as
animation. The player can follow a single hole, sit on the resort overview,
change playback speed, or skip straight to the report. Skipping is jumping to
the end of a movie, not cancelling a simulation.

**Evening — report.** Revenue, costs, profit. Rating movement. And complaints in
plain language: *"The 4th takes forever." "Bunkers were unraked." "No restroom
past the 6th."*

The complaint log is also how the game foreshadows the next act. Before the
Act I gate opens, guests start saying things like *"I'd play again tomorrow but
the nearest motel is 40 minutes out."* The player learns what the game wants
next through a mechanism they already read every evening.

The loop the player should feel: **change one thing, run the day, see if it
worked.**

---

## 5. Holes

### 5.1 Data model

A hole is stored the way the eventual free-form editor will store it, even
though Act I populates it from templates:

```
Hole {
  id
  corridor:     [{x, y}, ...]   // centreline, tee to green
  corridorWidth: number          // fairway generosity
  teePos:       {x, y}
  greenPreset:  'small' | 'large' | 'tiered' | 'elevated' | 'island'
  features:     [{type, x, y, size}]   // bunker | pond | trees | mound
}
```

Fairway, rough and treeline are **generated** from the corridor rather than
stored. Par, length, difficulty, scenery, expected minutes and daily upkeep are
all **derived** from the above — never stored, never hand-set.

### 5.2 The editor (Act I behaviour)

The player picks a template for an empty plot — par 3, 4 and 5 archetypes — which
populates the corridor and a starting feature set. From there they can:

- Drag bunkers, ponds, trees and mounds; add and remove them
- Move the tee box, which changes length and therefore par
- Swap the green preset
- Widen or narrow the corridor

**Live readout while editing:** Par · Length · Difficulty · Scenery · Expected
minutes to play · Upkeep per day. The cost of every idea is visible as the
player has it. Dig the pond, watch expected minutes climb and daily upkeep with
it.

The deferred editor (drawing the corridor freehand) is purely an additional tool
over the same data. It is not in Act I and requires no rework when added.

### 5.3 Derived statistics

- **Length** — corridor arc length from tee to green centre.
- **Par** — length bands, adjusted upward for severe hazard placement.
- **Difficulty** — hazard proximity to the likely landing zones, corridor width,
  green preset, forced-carry distance.
- **Scenery** — count and variety of water and trees, with diminishing returns.
- **Expected minutes** — see §7.
- **Upkeep** — base per hole, plus per-bunker and per-pond amounts.

---

## 6. Golfers and shots

### 6.1 Guest model

```
Guest {
  id, name
  handicap:      number      // 0–30, drives distance and dispersion
  wallet:        number      // what they will tolerate paying
  patience:      number      // depletes with waiting and disasters
  energy:        number      // depletes over the round; low energy adds time
                             // per shot. Restored by the halfway house.
  satisfaction:  number
  stayNights:    1           // always 1 in Act I; Act II varies it
  nightsRemaining
  zonePreference             // unused in Act I; one zone exists
}
```

### 6.2 Shot resolution

Groups of four play each hole shot by shot. A shot resolves from the golfer's
lie and handicap:

- **Intended distance** is chosen from distance remaining, capped by the
  golfer's range and reduced by a lie penalty (rough, sand, trees).
- **Actual distance** applies a normal deviation whose spread scales with
  handicap and lie.
- **Lateral error** likewise, so weak players miss corridors sideways.
- The landing point is tested against the hole's generated terrain and feature
  list to determine the next lie.
- **Water** costs a penalty stroke and a drop. **Trees** usually force a punch
  out. **Sand** raises the next shot's lie penalty sharply.
- **On the green**, putts to hole out are a function of distance to the pin,
  handicap, and green preset.

Strokes accumulate into a score against the derived par. That score against the
golfer's handicap expectation is a major input to satisfaction — a bogey golfer
who shoots bogey golf is content; one who loses three balls is not.

---

## 7. Pace of play

This is the mechanic that welds hole design to the business. It is the most
important system in the game.

**Time accrues per shot**: a base cost including walking time proportional to
shot distance, plus penalties — searching in trees, taking a drop from water,
recovering from sand, and per-putt time on the green.

**Expected minutes for a hole** is the simulated average for a representative
group. It is shown live in the editor.

**Groups queue.** The player sets a **tee interval** (minutes between groups
going off the first tee). If the interval is shorter than the time a group
occupies a hole, groups back up. Waiting on a tee box drains patience, and
patience losses land in satisfaction and in the complaint log by hole number —
so the report names the hole that is choking the course.

The core tension, stated plainly: **a beautiful, brutal course plays slowly, and
a slow course sells fewer rounds.** Gorgeous means low volume and high prestige;
easy means high volume and low prestige. Hazards also raise daily upkeep, so
difficulty costs money twice.

**Levers against a slow course:** carts (from the cart barn) cut walking time
directly; marshals push slow groups along; the halfway house refuels hungry
golfers who would otherwise slow down; and widening corridors or removing
hazards fixes the cause rather than the symptom.

---

## 8. The economy

### 8.1 Revenue

- **Green fees** — the primary dial. A higher fee draws fewer, wealthier guests
  with higher expectations. Prestige sets the ceiling on what can be charged
  before demand collapses.
- **Pro shop** — per-guest merchandise spend, scaled by satisfaction.
- **Snack shack and halfway house** — per-guest food spend during the round.
- **Clubhouse restaurant** — per-guest spend after the round.

### 8.2 Costs

- **Hole upkeep**, scaling with hazards.
- **Payroll**, per staff member per day.
- **Amenity upkeep**, per building per day.
- **Construction**, one-off at build time.

### 8.3 Starting values

Tuned against the balance harness on 2026-09-19. The headline result: a passive
operator who never builds, prices or hires ends 60 days with roughly $48–83k
against the $72,000 it costs to finish the course — so money is scarce relative
to ambition without being punishing. A properly built and staffed nine runs
profitably at $2,810/day and reaches the Act I gate with satisfaction, not cash,
as its binding constraint.

| Item | Value | Note |
|---|---|---|
| Starting cash | $25,000 | |
| Green fee | **$22** | Matched to what three holes are actually worth; raising it is the reward for building more |
| Tee interval | **16 minutes** | At the queueing crossover, so the player creates their own congestion rather than inheriting it |
| Playing day | 7:00am – 6:00pm | |
| Hole upkeep, base | **$200/day** | $40 implied $14.6k a year to maintain a hole; real figures are $50–80k |
| Per bunker | **$25/day** | |
| Per pond | **$45/day** | |
| Clubhouse upkeep | **$400/day** | Fixed overhead — utilities, insurance, front desk |
| Groundskeeper | **$240/day** | One holds about three holes; a nine needs two to three |
| Marshal | **$180/day** | |
| Build a bunker | $800 | |
| Build a pond | $2,500 | |
| Plant trees | $300 | |
| Upgrade a green | $1,500 | |
| Build a new hole | $12,000 | |

**Two model changes came out of the balance pass, not just constants.**

*Value scales with holes offered.* Perceived value is multiplied by
`holesOpen / 9`. Without it, a three-hole resort drew exactly the same crowd at
the same price as a finished nine — about 132 golfers a day, some $2.1M a year —
which forced every cost in the game to be inflated to compensate. Three holes
are now worth about a third of nine, which is why the starting green fee is $22
and why building holes is what lets the player charge more.

*Demand answers to satisfaction.* Word of mouth scales turnout by recent
satisfaction. Before it, guests rated the resort 11 out of 100 and turned up in
growing numbers every day, so the player's worst mistakes never reached their
wallet.

**What did not converge: bankruptcy sits at 0%, against a 15–45% target.** This
looks like a structural limit rather than a tuning failure. With a passive
operator and no random shocks, every seed has near-identical economics — demand
is a smooth function of state with no variance source — so bankruptcy is
effectively deterministic and lands at 0% or 100%, never in between. Reaching
the target band needs either random events (weather, equipment failure — both
deferred in §16) or a starting position balanced on a knife edge, which would
make the opening feel arbitrary. Recommend accepting 0% for now and revisiting
if weather is ever built.

---

## 9. Amenities and staff

**Amenities** are placed on the resort overview map.

| Building | Effect |
|---|---|
| Clubhouse | Given at start; hub for the restaurant |
| Pro shop | Merchandise revenue |
| Snack shack | Food revenue, small patience recovery |
| Halfway house | Placed at a chosen hole; food revenue, restores patience for a fixed time cost, prevents the hunger slowdown |
| Restaurant | Post-round revenue, satisfaction |
| Restrooms | Satisfaction; absence generates complaints by hole number |
| Driving range | Warms golfers up — measurably better early-hole scoring, so happier guests |
| Practice green | Same, for putting |
| Cart barn | Carts cut walking time; the most direct pace lever |

**Staff.** Groundskeepers hold back turf decay — poor turf worsens scoring and
generates complaints. Marshals enforce pace on slow groups. Shop and kitchen
staff are required to run their buildings at full revenue.

---

## 10. Ratings

**Course Rating** — design quality: variety across the nine, scenery, fairness
to mid handicaps, and turf condition.

**Prestige** — a slow-moving average of course rating and guest satisfaction. It
gates the green fee ceiling and determines which calibre of golfer shows up. It
is deliberately slow so that the player cannot buy their way out of a bad
course.

**Pace** — average round time. The villain stat, surfaced prominently.

---

## 11. Act I scope

**In scope.** Nine holes on one course; the three-phase day cycle; the
template-based hole editor with live derived stats; shot-by-shot golfer
simulation; pace of play with tee queues; green fee and tee interval as dials;
all amenities listed in §9; groundskeepers and marshals; the three ratings; the
complaint log with next-act foreshadowing; the Act I gate; save and load;
chiptune audio.

**Explicitly out of scope.** Freehand corridor drawing; hotel rooms and
multi-day guests; second courses; zones and shuttles; second properties;
weather; seasons; tournaments; caddies; membership tiers. Each of these is
either a later act or a candidate that has not earned its place.

---

## 12. Architecture

### 12.1 The central decision

`runDay(state, seed)` is a pure function returning three things:

1. **The next state** — the resort as it stands the following morning.
2. **The report** — money, ratings, complaints.
3. **The timeline** — a timestamped list of everything that happened. *8:14,
   group 3 tees off on 4. 8:16, Dana's drive finds the pond. 8:31, group 4 has
   waited six minutes on the 4th tee.*

Rendering plays the timeline back as animation. The simulation has already
finished before the first frame draws.

This is why the day computes in milliseconds in a plain Node script with no
browser, why the player can scrub and skip without breaking anything, and why
the whole sim is testable. Simulating in lockstep with animation would weld the
two together and make all of this impossible.

### 12.2 Layout

```
index.html
src/sim/      state, rng, hole, golfer, shot, round, day, economy, ratings, acts
src/render/   palette, sprites, holeView, resortView, golferAnimation
src/ui/       sheets, editor, report, hud
src/audio/    chiptune, sfx
src/save/     adapter, cloud, local, code
tests/        node --test
tools/        balance.js
```

Plain ES modules. **No build step and no dependencies** — the same files run
under Node for tests and load directly in a browser or a published artifact.

### 12.3 State shape

```
GameState {
  seed, day, act, money, prestige
  resort: {
    zones:     [{id: 'near', travelMinutes: 0}]    // Act III adds 'far'
    courses:   [Course]                             // Act III adds more
    amenities: [Amenity]
    staff:     [Staff]
    rooms:     {count: 0, quality: 0}               // Act II
    shuttles:  []                                   // Act III
    pricing:   {greenFee, teeInterval, foodMultiplier, roomRate: 0}
  }
  properties: [Property]                            // Act IV
  history: [DailyReport]
}
```

The single-entry arrays and zeroed fields are the narrow-on-wide principle in
practice, not dead code.

---

## 13. Testing and balance

**The simulation is developed test-first.** Covered: shot outcome
distributions, pace accumulation, tee-queue waiting, economy arithmetic, rating
formulas, satisfaction inputs, and gate conditions. Run with `node --test` and
no dependencies.

**Rendering is verified by eye** in the browser. Pretending otherwise would
produce tests that assert nothing useful.

**`tools/balance.js`** runs many seeds across many days headless and reports
rounds per day, the revenue curve, how often a reasonable player goes bankrupt,
and how many days the Act I gate actually takes to reach. This is how the
starting values in §8.3 get replaced with good ones. When the player says "money
feels too easy," the answer takes ten seconds instead of an afternoon of
replaying.

**Who tunes what.** The balance tool tunes for *soundness* and runs before the
game is ever played by a human: money exploding until cost stops mattering,
bankruptcy being unavoidable regardless of play, the Act I gate arriving in four
days or four hundred, a tee interval so generous that groups never queue and
pace of play never bites. These are failures a script can catch, and spending a
play session discovering them is waste.

Playtesting tunes for *feel*, which no script can judge: whether raising the
green fee is an interesting decision or an obvious one, whether reaching the
gate lands as an achievement or a chore. The starting values in §8.3 and the
gate thresholds in §3 are therefore expected to move twice — once from the tool,
once from play.

---

## 14. Saving

Mobile-first means the **published artifact is the delivery mechanism**, not a
nicety: a local file on a desktop cannot be opened from a phone.

**One interface, three backends.** The game calls `load()` and `save(state)` and
does not care where the data goes.

- **Cloud** — the artifact's per-viewer private store, tied to the player's
  account. Default when playing the published link; syncs across devices.
- **Local** — `localStorage`, always written as an offline mirror and backup.
- **Save code** — a copyable text string holding the whole resort, pasteable
  anywhere. Cheap insurance against platform decisions.

Every read and write is wrapped in `try`/`catch` and the game renders correctly
when storage is unavailable or empty.

**Why not `localStorage` alone:** iOS Safari clears script-written storage after
roughly seven days without a visit, and storage is per-browser, so phone and
desktop progress would never meet.

**Writes happen once per day**, at the evening report. On boot, if the cloud save
is newer than the local one, the game asks — *"Your phone has a more recent day.
Continue from there?"* — rather than silently choosing and discarding work.

The cloud store exists only when running as the published artifact. Opened
locally, the game falls back to `localStorage` automatically.

---

## 15. Look and sound

**Top-down pixel art.** A hole reads cleanly tee-at-the-bottom,
green-at-the-top in portrait — which is the shape of a phone. Isometric
screenshots better but wastes horizontal space we do not have and muddies at
small sizes.

**Canvas at low internal resolution, integer-scaled up with smoothing
disabled.** This is what produces genuine 8-bit chunk rather than blurry
upscaling, and it is cheap enough to stay smooth on a phone.

**Sprites are defined in code** as small pixel grids over a fixed palette. No
external art assets.

**Mobile UI rules:** touch targets at least 44px; information lives in bottom
sheets that slide up and dismiss rather than permanent side panels; no hover
states and no right-click; features snap to a grid rather than being nudged
pixel by pixel.

**Audio:** a chiptune loop plus WebAudio effects — the *tok* of a struck drive,
a splash, a cheer for a birdie, a cash register. Muted by default on load, since
a game that makes noise unprompted on a phone is a game that gets closed.

---

## 16. Deferred decisions

Recorded so they are not silently forgotten, and deliberately excluded from Act
I:

- Freehand corridor drawing (the editor upgrade — same data, new tool)
- Runtime-generated guest complaints instead of authored text. Authored is
  funnier and costs the player nothing, so this stays deferred unless the
  written set feels repetitive in play.
- Weather, seasons, tournaments, caddies, membership tiers
