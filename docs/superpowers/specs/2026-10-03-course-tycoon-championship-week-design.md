# Course Tycoon — Act III: The Championship Week

**Status:** built (2026-10-03). Where this document and the code disagree, the
code is right and this document is the drift; the final review's fixes are
folded in below.
**Amends:** `2026-09-25-course-tycoon-act-three-design.md` — the championship
itself. The ladder, the setup dial, the run-up, the buildings and the contract's
money are unchanged unless this document says otherwise.
**Follow-up:** the run-up (an inspector visit, weather slowing the setup climb)
gets its own smaller spec once this one lands.

---

## 1. Why

The author's playtest of Act III, verbatim: *"Act 3 too easy — money is too
easy to accumulate at that stretch"* and *"Things coming up on tournament day
could be fun. It's very anticlimactic."*

Both have the same cause. Three weeks of preparation resolve on one day the
player does nothing on: the setup is checked against a band, a cheque arrives,
and the playback shows an empty course because the crowd is forced to zero. The
spike in time the act was built around has no peak.

This spec turns the championship into a **week of rounds** the player takes part
in, with one decision each morning, the field visibly playing their course, and
a judge that the player is steering right up to the final round.

## 2. Decisions taken

Settled one at a time with the author before writing:

| # | Question | Answer |
|---|----------|--------|
| 1 | What does the player do during the week? | **One call per round**: set the pin positions each morning, watch the round, read the report. Built so more levers can be added later. |
| 2 | What is judged? | **The winning total landing in the rung's target range.** Replaces the one-off band check as the gate. Pins must not be able to rescue an unconditioned course. |
| 3 | How long is the week? | **County Open 2 rounds, Regional 3, National 4.** The course is closed to normal play on every round day. |
| 4 | How is it built? | **Each round is a game day** in the existing loop — not one combined day, not a separate flow. |
| 5 | Does the course's own design count? | **Yes.** Each rung has a minimum course difficulty, **checked on the first round** so the run-up can be spent redesigning. |

## 3. The week

`bidFor` books the **first round day**, as it booked the single day before. A
rung declares its round count:

| Rung | Rounds | Days closed |
|------|--------|-------------|
| County Open | 2 | 2 |
| Regional Championship | 3 | 3 |
| National Open | 4 | 4 |

- Each round day runs through `runDay` like any other day. Normal play is
  closed (the existing `championshipToday` path), the hotel sells championship
  rooms (`championshipRoomsSold`), and the setup and its bill follow today's
  rules: the crew holds the course at its target (it no longer see-saws a
  day's decay below it), and the conditioning bill and the care diversion are
  charged on every day of the booking with a target set — climbing or
  holding, run-up and rounds alike. Holding firm greens is still the crew's
  job, and a bill that stopped on arrival made a big crew's run-up cheap.
- The contract resolves on the evening of the **final** round. Earlier rounds
  pay nothing and change no prestige.
- A save taken on any evening of the week reloads mid-tournament and carries on.
- No cut, no play suspensions. Every round is played in whatever weather the day
  has.

### State

`state.tournament` grows from `{ rung, day, resolved }` to carry the week:

```js
{
  rung, day, resolved,      // as before; `day` is the first round
  rounds,                   // 2 / 3 / 4, copied from the rung at booking
  roundsPlayed,             // 0 until the first evening
  roundSettings: {          // the next round's calls; later levers become new keys here
    pins,                   // 'fair' | 'easy' | 'tough' | 'brutal'
  },
  field: {                  // null until the first round
    handicaps: [...60],     // drawn once, on the first round, from that day's rng
    totals:    [...60],     // strokes to par, summed across rounds played
  },
  roundLog: [               // one entry per round played, for the report and the card
    { round, weather, pins, setup, leaderToPar, averageToPar, hardestHole,
      underPar, averageRoundMinutes, paceOnTarget, turfAfter },
  ],
  difficulty,               // the course measured on the first morning (null before)
  difficultyMet,            // difficulty >= the rung's minimum, settled with it
}
```

`setup` is the course's setup that round, rounded; `underPar` is how many of
the sixty finished the round under par; `turfAfter` is the turf at the end of
the round, floored so a 77.6 never prints as the 78 a championship expects.

The field is the **same sixty players every round**, so totals add up. They stay
nameless (Act III spec §11): an index and a handicap, nothing else.

## 4. Pins

The one call per round. Set on the championship sheet before opening the day;
it defaults to **fair** and carries over to the next round unless changed, so
ignoring it is a legitimate way to play.

| Setting | Effect on the field |
|---------|---------------------|
| Easy | Field plays slightly better |
| Fair | No change |
| Tough | Field plays slightly worse |
| Brutal | Field plays noticeably worse |

Implemented as a **handicap adjustment added to the setup's own** in
`playField` — the same mechanism the setup dial already uses, so pins and setup
are one scale: easy −0.75, fair 0, tough +0.75, brutal +1.5 handicap points,
against the setup's 0–8.7.

**Measured, 2026-10-03.** The first values tried (−1.5 / 0 / +1.5 / +3) let
brutal pins on an unconditioned County course land almost exactly where a
properly set one did — the free ride, reopened. At the values above, an
unconditioned course with brutal pins every round hit the County range in 13%
of 24 seeds and the Regional and National in none.

**The rule that keeps the free ride closed:** the whole span of the pins (easy
to brutal) must be smaller than the difference between an unconditioned course
and the rung's band. It holds as rates, not absolutes (§8, 120 held-out
seeds): an unconditioned course with brutal pins on every round puts the winner
in range 8% of the time at the County and never at the Regional or National; a
course at setup 100 with easy pins on every round does so 30% of the time at
the County, 24% at the Regional and 62% at the National, where the band leaves
no room to overcook (not judged). `tests/championshipCalibration.test.js`
asserts the criteria. Pins fine-tune; the three-week setup mostly decides —
though a half-conditioned County or Regional course can be rescued by brutal
pins about half the time (§8).

Stored as `roundSettings.pins` inside the tournament so a later lever (green
speed, tee placement) is a new key rather than a new code path. Only pins ship.

## 5. Course difficulty

The field already plays the player's own holes, so a harder design already
scores higher. This makes that a requirement and a lever.

**Three levers on three timescales** now decide where the winning score lands:
the course's design (permanent), the setup (three weeks), and the pins (each
morning).

### The minimum

Each rung declares a minimum **course difficulty** — the existing measure, the
mean of `holeStats(h).difficulty` across the eighteen, 0–100. Starting points:

| Rung | Minimum difficulty |
|------|--------------------|
| County Open | 45 |
| Regional Championship | 55 |
| National Open | 65 |

Checked against what a resort leaving Act II actually measures, so each rung
asks for some redesign without demanding a rebuilt course. The plan records the
measured Act II spread and the final figures.

**Checked on the first round, not at the bid.** A player can bid and then spend
the run-up redesigning, which gives those three weeks a second job beside
waiting for the setup to climb. A course still under the minimum on the first
morning has not staged a championship: the week is played, but it is judged as
a miss — base fee only, minus the full prestige swing, and the bar — exactly
as a winner out of range is. Like any miss, the rung is not hosted and can be
bid for again once the bar lifts (§8).

So nobody walks into that blind, the course's difficulty against the rung's
minimum is shown on the HUD's tournament readout and on the championship sheet
for the whole run-up, next to the setup and its band.

### The cost

This is where the act's money gets harder without a new mechanic. Each crowd
has a favourite difficulty — locals about 30, serious golfers about 72
(`segments.js`) — so toughening the course for a National drives away the locals
who pay for ordinary days, and the course rating's fairness term dips until the
clientele catches up. Climbing the ladder now costs trade between championships,
not only during them.

### Locked during the week

Holes cannot be edited on a round day or between rounds. The design the field
meets on the first morning is the design it plays all week; reworking a hole
overnight to drag Sunday's scores up is not a lever.

## 6. Weather on the field

Each round day already has weather, and the forecast already shows tomorrow's
honestly (`weather.js`: the forecast *is* the weather, read early). Today
`playField` ignores it and plays with `spread: 1`.

It now passes the day's `sky.spread` and `sky.pace`. Wind and rain push the
field's scores up and slow its rounds; clear days play easy and fast.

**Scores at half strength, pace at full.** The field's scores feel half of the
day's wind and rain (`FIELD_WEATHER_EFFECT = 0.5` in `field.js`: a spread `x`
plays as `1 + (x − 1) × 0.5`). The resort's own golfers feel all of it. The
fiction is that tour players flight the ball under the wind; the reason is the
judge. At full strength the weather doubled the spread of the winning total — a
County week set properly landed anywhere from −6 to +6 against −4 to +2 in calm
— and the weeks the target has to tell apart smeared into each other. At the
best centres found on 120 tuning seeds and checked on 120 held-out ones, full
strength let the County's free ride (setup 0, brutal pins) into range 26% of the
time held out (20% tuning) and the Regional's overcooked week (setup 100, easy
pins) 33–43%; at half strength those are 8% and 24%. A third against a half was
a wash held out — better at the County, worse at the Regional — so half was
kept. Raising the County band instead (55–70) did not help: the free-ride and
overcooked weeks do not depend on the band, so it only slid the well-run week
toward the overcooked one.

**Pace is not damped.** The judge needed the scoring spread tightened; nothing
asked for faster rounds. Damping pace too (as the first version did) quietly
made the pace condition far easier: at the Regional, against a 288-minute
target, a blowy round averaged 302 minutes damped and 321 whole, a rainy one 313
against 347. Rain slows a championship as much as a Tuesday.

`playField` applies this to whatever it is handed, so `day.js` and the
calibration both pass the raw sky and cannot disagree.

This is what makes the morning call a decision rather than "fair, every day".
With the forecast showing a blowy Saturday after a calm Friday that left the
leader tracking low, the player has a real question: tough pins to drag the
score back, or ease off because the wind will do it and brutal pins in a gale
will wreck the pace?

## 7. Watching it

`playField` already calls `playHole` for every threeball and runs
`scheduleRounds`, then **throws the shot events away**. It now keeps them, and a
round day returns a timeline built from the field — the same
`buildTimeline(schedule, rawEvents, holeMinutes)` shape the resort's own day
produces. The playback screen shows twenty championship threeballs on the
player's course instead of an empty one. No new screen.

The evening report gets a **round section** (`report.tournamentRound`), read off
the round log rather than recomputed:

- Round N of M, weather, the pins that were set
- the leader's total to par, and where it sits against the target range
- the field's average for the round
- the hardest hole
- pace: the round time against the target
- the turf after the round

The HUD reads **"Regional R2/3 · leads +3 · on pace +5 (target +2…+8)"**
during the week: the rung's short name, the round about to be played, the
leader's total and its whole-week projection once a round has been played, and
the target. In the run-up it reads **"Regional 12d · setup 70 (62–78) · course
57/55"**, coloured as a warning only when the course is under the difficulty
floor — the band is shown as information, not as a gate.

The championship sheet, during the week, shows the pin picker, the target range,
the leader's total so far and today's weather for the round about to be played
(the pins are set that morning) together — everything the call needs in one
place — and a line saying the field tees off at the player's own tee interval,
so a wider interval keeps the rounds on pace (22 minutes holds a National, as
measured by the operator).

## 8. Judging

### The gate

The **winning total to par** — the lowest of the sixty totals after the final
round — must land inside the rung's target range. It takes over every job the
band did:

- it gates every bonus past the base fee,
- it gates prestige (in range: earned share of the swing; out of range: minus
  the full swing),
- it gates the bar (out of range: the rung goes to somebody else for
  `BAR_DAYS`),
- it gates the ladder: only a week that met the target is recorded in
  `tournamentsHosted` and opens the next rung. A missed rung is not hosted;
  it stays the next rung, barred for `BAR_DAYS`, and can be bid for again once
  the bar lifts — the sheet shows it as given to somebody else until that day.
  (Until the final review a miss counted as hosted, so the bar never mattered
  and a missed National ended the ladder with the act unpassable.)
- and a National in range is Act III's pass (`actThreePassed`).

A course under the rung's minimum difficulty on the first round fails the gate
whatever the winning total (§5).

Too soft and the field takes the course apart — the winner is under the range.
Overcooked and nobody can score — the winner is over it. Both are misses, as a
setup outside the band is today.

The contract's first line item becomes **"Winner inside the target"**, keeping
the band's 40% share.

### Target ranges

Calibrated by measurement, the way the setup bands and the field's divisor were,
not guessed. Per rung:

- **Centre:** near the median winning total on a course at the rung's minimum
  difficulty, with the setup at the band's midpoint, fair pins every round,
  and the seeds' own weather — moved by a stroke where that is what meets the
  criteria below.
- **Width:** ±3 strokes either side of the centre.

The winner of a sixty-player field is noisy — the same setup and pins put the
National winner anywhere from +5 to +26 across held-out seeds, +11 to +21 for
the middle eighty per cent — so no fixed pin choice
can be judged fairly on its own. The skill is reacting: reading the leader each
evening and setting tomorrow's pins against where the winning score is heading.
The criteria are written for that:

| Policy, on a course at the rung's minimum difficulty | Lands in range |
|---|---|
| Band midpoint, reacting to the leader each morning | ≥ 80% |
| Band midpoint, fair pins all week | ≥ 60% |
| Unconditioned (setup 0), brutal pins all week | ≤ 15% |
| Setup 100, easy pins all week — County and Regional only | ≤ 25% |

Measured on the real field, 2026-10-03 (`node tools/calibrateWeek.js`): each
seed with its own weather (scoring spread at the field's half strength, §6),
turf 90, the reacting host from `tools/championshipPolicy.js`.

The centres and the host's pin cut-offs were **chosen** on 120 tuning seeds:
centres from two under the median to two over were tried at each rung, and
County 0 and Regional +5 were the only ones meeting every criterion there,
National +17 the best of its five. Rates read on the seeds they were chosen on
flatter, so the table is 120 **held-out** seeds nothing was chosen on. Each
rate there is good to about four points (one standard error of one fixed
configuration on 120 seeds):

| Rung | Course difficulty | Median winner | Centre | Range | Midpoint, reacting | Midpoint, fair | Setup 0, brutal | Setup 100, easy |
|---|---|---|---|---|---|---|---|---|
| County Open | 45.2 | −1 | 0 | −3 to +3 | 92% | 83% | 8% | 30% |
| Regional | 55.2 | +5 | +5 | +2 to +8 | 76% | 68% | 0% | 24% |
| National | 65.0 | +16 | +17 | +14 to +20 | 75% | 53% | 0% | 62% (not judged) |

On the tuning seeds the same centres read County 88/85/13/24, Regional
83/72/1/24, National 78/61/0/70.

Twenty-four seeds were tried first and were a lottery: on a second set of
twenty-four the same configuration's rates moved by twenty to forty points.
An earlier measurement on a simplified field (no weather, no turf effect, 24
seeds) had put the centres at −1, +5 and +15.

**Limits, stated rather than hidden.** Held out, four rates fall short of the
criteria above, and a fifth case is weaker than this spec first claimed. All
accepted:

- **Overcooking at the National cannot be made to fail.** Its band tops out at
  92 and the dial at 100, so there is no room to overcook into — setup 100 with
  easy pins lands in range 62% of the time held out.
- **Reacting falls short at the Regional (76%) and the National (75%).** Across
  72 variants of the host's pin cut-offs the National never reached 80% (best
  79%, on the tuning seeds); pins move a three- or four-round week only so far.
  That search was run at the National; that the Regional's shortfall has the
  same cause is an inference, not a measurement.
- **The National's fair-pins rate is 53%,** short of 60%. Its winner is the
  noisiest of the three (+11 to +21 for the middle eighty per cent of seeds), so
  a week left at fair pins is the one most at the weather's mercy — which is the
  case for reacting.
- **The County's overcooked week lands in range 30% of the time,** against 25%.
  Over two rounds an overcooked course with easy pins finishes only about six
  strokes above a well-set one (median +5 against −1), so its better weeks
  reach the top of the range.
- **A half-conditioned course rescued by brutal pins.** At the County Open
  (setup 22) it lands in range 68% of the time held out; the County band is low
  enough that pins cover half of it, accepted at the bottom rung where the
  stakes are smallest. At the Regional (setup 35) it lands 56% held out — this
  spec first said it did not hold there. It saves no money: the conditioning
  bill and the care diversion are the same at any target above zero. What it
  saves is crew — a crew too small to reach the band in time can still be
  rescued by brutal pins about half the time — plus a little less trade lost
  during the run-up and a little less turf wear on the round days. At the
  National (setup 43) it lands 7% of the time.

Calibrating at the minimum means a course built well past it has to set up
softer, or it overshoots the range. The band is advice for a course at the
minimum, and the sheet says so.

### The band becomes guidance

The setup band stays on the HUD and the sheet as **where the course should
sit** — it is still the best advice the governing body gives — but it is no
longer a contract condition. A course a little outside the band that produced a
winner in range has staged a championship; one inside the band that the weather
and the pins pushed out of range has not.

### The other conditions, across the week

- **Turf** now wears during the rounds and is judged on the final evening, not
  on arrival. Field traffic goes through the existing wear model, scaled up by
  the setup (firm, fast greens bruise). Calibrated so the crew that brought a
  national's turf to the week only just above `TURF_EXPECTED` loses it by the
  final round, and a crew with real margin holds it. *"Greens that die by
  Saturday"* — the Act III spec's promise — becomes something that can happen.
- **Pace** is met only if **every** round finished inside the target. Weather
  and brutal pins both slow the field, so the pin call has a pace cost on a bad
  day.
- **Crowd** is unchanged: decided by the buildings, once.

`scoreTournament` takes the winning total and the target in place of the setup
and band; everything else about its shape stays.

## 9. Money

The closure is the cost: two, three or four days without green fees, food or
the shop, against a hotel selling championship rooms. The plan measures one
complete week per rung — run-up and rounds — against the same days without a
bid, and reports it.

The target was: hosting a rung and landing the winner in range still beats
never bidding, but by noticeably less than it did (+$61k to +$167k across the
ladder). Measured 2026-10-03, it overshot: hosting the whole ladder lost to
never bidding on every seed, near-perfect ladders included.

**The author's decision:** a ladder that hits all three targets should roughly
break even against never bidding, and a ladder with a miss should lose. And
the difficulty minimum is a planning hurdle, not a running cost: narrowing the
fairways at the last minute is allowed, so the measurement's host narrows the
night before the first round (to the floor plus a margin for hole closures),
widens back after the week, and spaces the field out on round mornings. Two
earlier measurements had the host narrowing for the whole run-up, and charged
the ladder for a course the locals avoid on every one of those days.

So the purse was retuned, not the closure: every rung's base fee and ceiling
is the original times 1.6 (County $29k / $160k, Regional $48k / $380k,
National $88k / $800k). One factor, because at 1.6 each rung's own cost and
what a week that hits its target is paid nearly match (County $164k against
$160k, Regional $383k against $380k, National $566k against $707k, the
National's surplus covering costs no single week carries); the reasoning is
above the rung list in `tournaments.js`.

Measured after (`node tools/actThree.js --seeds 8 --samples 4`, 32 ladders,
the table above `playActThree` in `tools/operator.js`): the 13 ladders that
hit all three targets finished at a median of +$21k against never bidding
(quartiles -$42k to +$101k, range -$121k to +$189k); all 19 with a miss lost,
by $144k to $999k (median -$635k) — measured before a missed rung could be
retried after its bar, so a miss followed by a hit on retry is not yet
measured. So Act III is no longer a money-maker: a
championship pays for itself only when it is done well, and its reward is
prestige and the act.

The National's crowd bonus is out of reach for a sensible resort. Its 12,000
gallery needs the short course on top of every other building; the short
course costs about $1.1M over 240 days in golfers it takes off the main course,
against a bonus of $92,560. Every all-hit ladder above went without it. Wider
Act III money pressure belongs to the run-up spec.

## 10. Cards

The **result card** moves to the final evening and is rewritten around the new
judge: the winning total against the target, how the week got there round by
round (in one or two sentences, not a table), then the conditions and the money
as now. The impersonal tone stays — "the field", "the winner", never a name.

The invitation card and the act-passed card are unchanged.

## 11. What must be proven before shipping

Each a test or a recorded measurement, verified by sabotage where it is a test:

1. **Free ride still dead.** Unconditioned, brutal pins every round, on a
   course at the rung's minimum → in range on at most 15% of seeds.
2. **Overcooking still fails** at the County and Regional: setup 100, easy pins
   every round → in range on at most 25% of seeds. Held out, the County lands
   at 30% — accepted as a limit, see §8.
3. **Reachable.** Band midpoint, reacting to the leader → at least 80%; fair
   pins all week → at least 60%. Held out, the Regional's and National's
   reacting rates and the National's fair-pins rate fall short; accepted limits
   (§8).
4. **Pins matter.** Same seed and setup, brutal against easy, moves the field's
   average by more than a stroke a round.
5. **Weather reaches the field.** Same seed, same setup, blowy vs clear → the
   blowy round averages higher.
6. **Mid-week save/load.** A state serialised after round 2 of 4 reloads and
   finishes the week with the same result as an uninterrupted run.
7. **Totals add up.** The final winning total equals the minimum of the summed
   per-round scores for the same player.
8. **Turf can fail during the week**, and holds with a real crew.
9. **Playback has a field.** A round day's timeline contains twenty teeOffs.
10. **The whole ladder re-measured.** `tools/operator.js` learns to host
    multi-round with a simple pin policy (fair; ease to easy when tomorrow is
    windy or wet; tough when the leader is tracking under range) and
    `playActThree` completes the ladder. The plan records before/after money.
11. **Difficulty is a requirement.** A course one point under the rung's
    minimum on the first round is judged a miss even with the winner in range;
    one at the minimum is not. Editing a hole is refused on a round day.
12. **Difficulty is a lever.** Same seed, same setup, a harder eighteen → a
    higher winning total.
13. **The existing suite stays green**, with tests that asserted the band as a
    contract condition rewritten against the new judge rather than deleted.

## 12. Not in this spec

- The run-up: the inspector visit and weather affecting the setup climb (next
  spec).
- Levers beyond pins: green speed, tee placement, weather holds. The state
  shape leaves room for them.
- Named players, a leaderboard of names, careers.
- A cut, play suspensions, playoffs. A tie for the lowest total is simply the
  winning total.
- Any new screen. Everything is the championship sheet, the existing playback,
  the evening report and the cards.
