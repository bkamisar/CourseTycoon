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

Two steps, in this order, because they escalate properly.

**First the back nine.** Act I's course is the *front* nine. When beds outrun tee
times, the cheapest fix is more golf on land you already own, sharing the
clubhouse you already run. This also makes the turn real — a halfway house at
the 9th is the genuine article rather than the contrivance it is on a
standalone nine.

**Then the far course.** Only once eighteen holes still cannot meet demand does
the player go beyond the near zone, which brings travel time and shuttles with
it. The full capacity chain: golf needs beds, beds need golf, and distant golf
needs transport.

Ordering matters. Expanding what you have before building where you are not is
both the cheaper move and the one a real operator makes, and it means the
shuttle arrives as a solution to a problem the player has actually felt.

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
`(holesOpen / 18) ** 0.7`. Without any such scaling, a three-hole resort drew
exactly the same crowd at the same price as a finished nine — about 132 golfers
a day, some $2.1M a year — which forced every cost in the game to be inflated to
compensate.

**A full round is eighteen holes, not nine.** Dividing by nine capped the whole
game's economy: an eighteen-hole round was worth no more than a nine, so the
back nine in Act III earned nothing and no runway was left for Act IV. The arc
from the end of Act I to a finished eighteen was 46% of value growth where it
should be closer to threefold.

**The curve is sublinear** because a nine is worth rather more than half an
eighteen — some of what a golfer pays for, the place and the clubhouse and the
round being a round at all, does not halve with the hole count. A straight
ratio made the opening three holes worth so little that nobody turned up at any
sane green fee.

The resulting arc, at representative ratings and prestige: **$21 a round at the
opening three holes, $73 at the end of Act I, $102 with a full amenity set, and
$172 for a finished eighteen** — with room above that for Act IV. The Act I
economy is unchanged by the rescale; the balance run after it moved every
measure by less than noise.

*Demand answers to satisfaction.* Word of mouth scales turnout by recent
satisfaction. Before it, guests rated the resort 11 out of 100 and turned up in
growing numbers every day, so the player's worst mistakes never reached their
wallet.

**What did not converge: bankruptcy sits at 0%, against a 15–45% target.** This
looks like a structural limit rather than a tuning failure. With a passive
operator and no random shocks, every seed has near-identical economics — demand
is a smooth function of state with no variance source, so bankruptcy is
effectively deterministic and lands at 0% or 100%, never in between.
Recommend accepting 0% for now and revisiting if weather is ever built.

**Revisited, and the diagnosis was wrong.** Weather is built, it adds real
variance — money fell from $75k to $67k, turf rose as rain watered the
course, gate days moved back by six — and bankruptcy stayed at exactly
0%. It was never a variance problem.

A passive operator never builds anything, so it has almost no costs. Its
income always exceeds them regardless of the weather. It cannot go
bankrupt and it arguably should not: doing nothing is not a way to lose
money in this game, it is just a way not to make much.

The meaningful figure is whether a *competent* operator can go broke, and
it can. Two of the six strategies in the competent-operator sweep bankrupt
in 8 runs out of 8 — "premium" at $95 and "luxury" at $110, both by
overreaching on price until demand collapses. That was already true before
weather and is the number that should have been watched all along.

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

## 15a. The variety layer

The game as built has execution but no strategy. Every golfer plays the same
maximally aggressive line, every configuration has a correct answer, and the
world pushes back at nothing. Confirmed in the first real playthrough: *"I hit
my stride in act one and it was a way to sort of put on autopilot."*

This section designs the answer. Its features are deliberately designed
**together**, because apart they are four unrelated taxes and together they
compound.

### 15a.1 Three principles

**Every choice states its cost explicitly.** A choice whose consequence is
unknown is a coin flip, not a decision.

**A recurring character delivers events.** A named, familiar voice makes
interruptions read as a continuing story rather than dice rolls.

**No configuration pleases everyone.** This is the anti-autopilot mechanic and
everything below serves it.

### 15a.2 Who you are trying to please

Three customer segments, with genuinely opposed wants.

**Locals and regulars.** Volume. Play often, pay little. Want fast rounds,
honest prices and forgiving holes they can score on. First to leave when prices
rise or the course turns punishing. The baseline that keeps the lights on in
Act I.

**Serious golfers.** Few, well-off, travelled a long way to be tested. Want
difficulty, variety and pristine conditioning — the only segment that actually
notices the turf number. Pay a premium for a course that beats them up; bored
by an easy one.

**Destination guests.** Largest spenders, mostly an Act II phenomenon once beds
exist. Here for the experience rather than the test: scenery, amenities,
comfort, memorability. Forgive a hard course if it is beautiful; never forgive
threadbare facilities.

**Where they collide.** *Difficulty* is the sharpest axis and the central
tension of the game — serious golfers want more, locals want less, and no
setting satisfies both. It runs straight through the hole editor, which is
where the player already spends their time. *Price* splits locals from everyone
else. *Scenery and amenities* delight destination guests and raise the upkeep
that locals resent paying for in green fees.

*Pace* is the one axis where locals and serious golfers agree — both hate
waiting. That is deliberate; not every axis needs to be a trap. But see
§15a.5, which gives even this lever a cost.

### 15a.3 Positioning is emergent, and narrated

The player never declares a market. The segments respond to the course that
actually exists: build cheap, short and forgiving and a locals' track emerges;
build long, brutal and beautiful and the serious golfers arrive while beginners
quietly stop booking.

This makes every design decision carry strategic weight without a separate
strategy screen, and it makes act transitions land harder — an Act I locals'
course gets a lodge, destination guests arrive, and they are unimpressed by the
very thing the regulars loved.

**The risk is opacity.** An emergent system the player cannot read feels
arbitrary rather than earned. The answer is narration events (§15a.4): the
world tells the player what it thinks of them, in a voice, rather than through
a statistics panel.

### 15a.4 Events, of two kinds

**Narration events** tell the player about themselves, and exist to make the
emergent simulation legible. A golf magazine reviews the course. A regular
mentions the place has got expensive. A stranger with a plus handicap says he
drove two hours to play here. No decision, or a trivial one.

**Decision events** are tradeoffs with explicit costs and no obviously right
answer. The city wants to host its tournament: prestige and a fee, against
three days closed and a chewed-up course. A journalist wants an interview, and
the answers shape which segment hears about the resort. The main mower dies:
pay a premium to fix it today, or wait a week and let the crew resent it.

**Cadence is tiered.** Narration most days — cheap, keeps the world inhabited,
costs no attention. Decisions roughly once per in-game week, rare enough that
the player leans in when one arrives. Both figures are tunable once they can be
felt.

**A decision event must never be dismissable with a default.** An event that
can be waved away becomes a notification rather than a choice, and the player
starts clicking through without reading.

**Each choice is labelled with a stance** — Populist, Ambitious, Commercial,
Thorough, Pragmatic, Principled, Thrifty, Defiant — plus half a sentence of
gloss. The cost line says what a choice does; the stance says what kind of
answer it is, so the shape of a decision is legible before any number is read.
Nothing in the simulation reads a stance; it is purely a reading aid.

#### 15a.4a What the first balance sweep said

`tools/balance.js` now answers events as well as playing days, under eleven
policies over 60 seeds x 60 days. Three findings, measured, not guessed:

**No stance is a free win.** Among the eight stance policies the spread in
final money is $69.7k (Ambitious) to $77.6k (Pragmatic) — about 11% — and they
separate on different axes: Thorough is the only policy that ends above the
passive turf baseline, Ambitious and always-spend-the-most buy prestige at a
real cost, Thrifty and Defiant hold cash and pay for it in goodwill. That is a
tradeoff surface rather than a right answer.

**Prestige bought at an event mostly evaporates.** A +10 bump is half gone in
8 days and negligible by day 30, because prestige mean-reverts toward a level
set by satisfaction. That is not a bug to tune out — it means prestige-buying
events only pay for an operator who *acts on* the bump by raising the green fee
while it lasts, and are a straight loss for one who does not. It is exactly the
anti-autopilot property this slice wants, but it is currently invisible: a
player reading the glossary would assume a bought +10 is permanent. The
glossary should say prestige reverts.

**The safe middle is the real autopilot risk, not any single event.**
"Pragmatic" is on offer in 11 of the 16 events and is the best-performing money
policy. No individual event has a dominated choice set — that is tested — but
"always take the middle" is a policy that needs no thought and does not lose.
The fix is fewer middles, not a weaker middle: some events should offer only
two real positions. Deferred, with the count recorded here so the next pass has
a number to beat.

### 15a.4b A correction about marshals

An earlier balance note in this project concluded that marshals were a bad
buy at every level: one moved the safe tee interval from 19 to 18 minutes,
about two extra groups and $176 of revenue against a $180 wage, and three
cost $540 a day to earn roughly $352. That was recorded, believed, and
nearly acted on by removing the role.

**It was measured on a three-hole course with eight groups on the sheet**
— a course with nothing whatsoever for a marshal to do. Re-measured on a
finished nine with a real crowd:

| tee interval | 1 marshal | 3 marshals |
|---|---|---|
| 12 min | +$359/day | +$1,923/day |
| 16 min | +$2,858/day | +$3,057/day, satisfaction 48 to 75 |
| 20 min (uncongested) | -$180/day | -$540/day |

Which is exactly what a situational hire should look like: worthless on an
empty course, transformative on a busy one. And since the Act I gate is in
practice a satisfaction wall, and waiting is what hurts satisfaction most,
marshals are close to required for passing it.

No redesign needed. The lesson is about measurement, not about marshals:
**a balance figure taken on the opening three-hole course says nothing
about the game.** That configuration has no congestion, no crowd and no
amenities, so every amenity and every hire measures as worthless on it.

### 15a.5 Staff morale

Not a constituency to please for its own sake — the **hidden multiplier**.
Ground-down crews let turf decay faster and bunkers go unraked, and the serious
golfers notice first. Morale falls with workload (holes per groundskeeper,
rounds pushed through a day), poor pay, and things left broken.

Three levers raise it by spending: **staffing levels**, **pay above the going
rate**, and **equipment and prompt repairs**.

The fourth is the one the system is built around. **Slack.** Run the course
flat out every day and the crew burns out regardless of headcount or wages; a
wider tee interval, a lighter day, or closing for maintenance lets them
recover. It matters because it is **not money — it is revenue deliberately not
earned.** A system fixed entirely by spending is a cost to budget for, not a
decision.

It also gives the pace lever a price. Locals and serious golfers both want fast
rounds, pushing the player toward tight intervals — and that pressure is now
paid for by the people maintaining the place.

**Morale must be visible.** An invisible multiplier silently degrading turf
would read as the game cheating.

### 15a.6 Weather

**Forecast two to three days ahead.** This is what makes weather a mechanic
rather than a tax: the player schedules around it, runs maintenance on the
quiet day, decides whether the outing still goes. Unforecastable weather is
noise that punishes at random.

Touches **play** (wind scatters shots and lengthens rounds, rain slows
everything), **demand** (fewer golfers turn out in bad weather), and **turf**
(rain helps, heat and heavy play hurt).

Weather is also the fix for the balance result §8.3 could not tune out.
Bankruptcy sits at 0% because, with no shocks, every seed plays out nearly
identically. A bad run of weather is the variance the economy has never had.

### 15a.7 Amenity tiers and condition

Each amenity gains **levels**. A tier-1 clubhouse serves locals perfectly well
and quietly fails destination guests — it works until it doesn't, and *who is
showing up* determines when that is.

Everything also carries **condition** that degrades with use. Repairs cost
money, and a demoralised crew repairs slower, which is where morale,
degradation and the segments all meet.

### 15a.8 Build order

Shipped in playable slices rather than one long disappearance.

1. **Segments and narration events.** The smallest slice that fixes autopilot
   on its own: three crowds with opposed wants, arriving based on the course,
   telling the player about themselves in their own voices.
2. **Decision events.**
3. **Staff morale, including slack.**
4. **Weather.**
5. **Amenity tiers and condition.**

### 15a.9 Food and drink, deferred

Not designed yet, but worth recording because it fits the segment structure
rather than sitting beside it.

**Menus at the halfway house and restaurant.** Choosing what to serve becomes
another axis where the crowds disagree, exactly like difficulty and price:
locals want a cheap beer and a hot dog, destination guests want a proper lunch,
and a menu pitched at one reads as wrong to the other. The machinery already
exists - each amenity has a per-guest spend and a satisfaction contribution, so
a menu is those two numbers made choosable.

**A beverage cart** as an amenity, with its own menu. Mechanically distinct from
the halfway house in a way that matters: she reaches golfers *without them
stopping*, so she earns revenue without costing pace, where the halfway house
trades a fixed time cost for its refuel. That makes them a real choice against
each other rather than two sizes of the same thing.

### 15a.10 Presentation ideas, from the reference game

The author plays an MLB lockout simulator that solves several of the same
problems, and sent screenshots. Four things worth taking, in rough order of
value per unit of work.

**Choices carry a stance as well as a cost.** Its options are labelled
"Diplomatic - unite all parties", "Aggressive - set a deadline". A stance says
what kind of operator the player is being, which reads faster than a number and
gives the choice character. Ours would be "Populist - keeps the locals onside"
against "Ambitious - chases the serious players". Pure data, no machinery.

**The constituencies are always on screen.** Three labelled bars - Players,
Owners, Public - sit permanently in its header, so the impossibility of
pleasing everyone is present at every moment rather than discovered at the end
of the day. Our three segments currently appear only in the evening report.
Moving them into the HUD as bars is probably the highest-value idea here.

**Information arrives in varied media.** A rendered tweet, a scrolling news
ticker, a press clipping - not only "a person says a thing". For golf: a
magazine review as a clipping, a local paper headline, a scorecard with a note
on it, a text from a regular. This is a rendering variation over the event and
narration data that already exists, not new machinery.

**Speakers have faces.** Its portraits are illustrated and would clash with our
pixel art, but a small pixel portrait per character - Gus, the greenkeeper, the
starter - would give the cast presence at a bounded art cost.

**Deliberately not taken: free-text answers.** It offers "write your own opening
statement", which requires a model to read and judge the player's prose at
runtime. That means the page calling Claude on every custom answer, billed to
whoever is playing, with a pause while it thinks. It suits a game built around
rhetoric; it does not suit one whose interesting decisions are spatial and
economic.

## 15b. How to measure anything in this game

Six confident, wrong conclusions were reached on this project, and every
one has the same shape: **a thing measured where it cannot work, and the
result reported as a property of the thing.**

| the conclusion | why it was wrong |
|---|---|
| "Marshals are a bad buy at every level" | three holes, eight groups — nothing to marshal |
| "A cook costs its wage and returns nothing" | no kitchen on the resort |
| "A shop hire does nothing" | no counter — and a real bug hid behind the bad measurement |
| "The halfway house is worse than nothing" | compared revenue with the wages left out |
| "A mismatched menu earns more than a matched one" | overloaded kitchen on one side only |
| "The cart beats the halfway house" | charged a drinks-only cart for a cook it does not need |

Each looked authoritative. Each came from a script that invented a
baseline inline, in a hurry, choosing one that was easy rather than one
that was representative. Four of the six used the opening three-hole
course, which has no congestion, no clientele and no amenities — so
**every** purchase measures as worthless on it.

Three rules, and `tools/scenarios.js` is where they are enforced:

**Name the scenario.** Baselines live in `tools/scenarios.js` with their
limits written beside them: what each can measure and what it cannot. A
measurement that names its scenario is one somebody else can check.

**Measure a thing where it can work.** A marshal needs congestion, a cook
needs a kitchen, a shop hire needs a counter. `tools/effects.js` declares
each hire's prerequisite in `STAFF_CONTEXT` and measures it there.

**Measure combinations, not only items.** Amenities raise perceived value,
which raises demand, which congests the course — they interact hard. The
halfway house is worth +$140 a day as a first purchase and **-$1,437 as a
last one**, and nothing that measured items alone could ever have seen it.

The cost of getting this wrong is not a bad number. It is a design change
made to fix a problem that was not there: the marshal was nearly deleted,
and a revenue spread was invented to rescue a halfway house that did not
need rescuing.

### 15c. Shape tests and calibration tests

A second family of hollow test, found the same way as §15b — by looking at
output rather than at a green suite.

Act II's investor thresholds had four tests. All four passed while the
numbers were so soft a 180-room hotel held maximum confidence for twelve
weeks. They checked **shape**: a small hotel is asked for more occupancy
than a big one, the first review is gentler than the fifth. Every one of
those would pass with a prestige target of 5, or of 500.

**A shape test says the numbers are ordered. A calibration test says they
are the right size.** The difference only shows when a number is wrong in
a way that preserves the ordering, which is most of how numbers go wrong.

The pattern that works, taken from `MENU_RATE` — the one figure in this
game that has never drifted, because §4.1 of the food spec pinned it to
"within 25% of the flat rate it replaced":

1. Measure what the game actually produces when played properly.
2. Assert the number against **that**, not against its neighbours.
3. Then break it on purpose and check the test fails.

Step 3 is not optional. The first calibration test written for the
investors used a bound of `actual * 0.5` and **passed against the exact
ladder it was written to catch** — a prestige target of 53 against a real
80 is free, and 53 is comfortably above 40. A calibration test with a
loose bound is a shape test wearing a calibration test's clothes. Tightened
to 0.72, it fails with "an early target of 53 is free against a real 80".

**The audit was done.** `tests/calibration.test.js` now pins thirteen
figures across both acts: what the player builds against what they dial,
waiting staying the biggest single lever, the shop and kitchen queues
costing something, the weather's demand spread, kitchen and counter
capacity binding at a real resort size, a plausible hotel being fillable
and an implausible one not, a room's upkeep as a share of its rate, the
three refreshment stops staying distinct by a real margin, and the Act I
gate being demanding without being out of reach.

Each was verified the only way that counts {D} by breaking the constant on
purpose. Four sabotages, each leaving the **ordering intact** so that every
existing shape test still passed:

| what was broken | what the calibration test said |
|---|---|
| scenery/turf/amenity weights back to their Act I values | "everything the player builds is worth only 8.4 points; if it cannot compete with a tee-interval change there is only one strategy" |
| storm demand 0.10 to 0.75 | "the best day is only 1.6x the worst; that is not a variance source" |
| shop capacity 20 to 500 | "a busy day with nobody behind the counter must turn real money away" |
| room upkeep $40 to $8 | "$8 a night against a $95 rate is too cheap to stand empty" |

Still uncalibrated and worth doing if these ever move: hole difficulty
coefficients, goodwill decay, marshal effect size, and the amenity prices
{D} the last of which are checked by `tools/effects.js` but **not by any
test**, so a price regression would not fail the suite.

## 16. Deferred decisions

Recorded so they are not silently forgotten, and deliberately excluded from Act
I:

- Freehand corridor drawing (the editor upgrade — same data, new tool)
- Runtime-generated guest complaints instead of authored text. Authored is
  funnier and costs the player nothing, so this stays deferred unless the
  written set feels repetitive in play.
- Weather, seasons, tournaments, caddies, membership tiers
