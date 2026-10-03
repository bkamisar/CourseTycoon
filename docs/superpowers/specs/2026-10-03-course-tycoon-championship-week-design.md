# Course Tycoon — Act III: The Championship Week

**Status:** design agreed, not yet planned or built.
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
  rules: the crew holds the course at its target, and the conditioning bill is
  charged only on a day the crew is still climbing toward it.
- The contract resolves on the evening of the **final** round. Earlier rounds
  pay nothing and change no prestige.
- A save taken on any evening of the week reloads mid-tournament and carries on.
- No cut, no play suspensions. Every round is played in whatever weather the day
  has.

### State

`state.tournament` grows from `{ rung, day, resolved }` to carry the week:

```js
{
  rung, day, resolved,      // as today; `day` is the first round
  rounds,                   // 2 / 3 / 4, copied from the rung at booking
  roundsPlayed,             // 0 until the first evening
  roundSettings: {          // tomorrow's calls; later levers become new keys here
    pins,                   // 'fair' | 'easy' | 'tough' | 'brutal'
  },
  field: {
    handicaps: [...60],     // drawn once, on the first round, from that day's rng
    totals:    [...60],     // strokes to par, summed across rounds played
  },
  roundLog: [               // one entry per round played, for the report and the card
    { round, weather, pins, leaderToPar, averageToPar, hardestHole,
      averageRoundMinutes, paceOnTarget, turfAfter },
  ],
}
```

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
are one scale. Starting values: easy −1.5, fair 0, tough +1.5, brutal +3
handicap points, against the setup's 0–8.7. Calibrated in the plan.

**The rule that keeps the free ride closed:** the whole span of the pins (easy
to brutal) must be smaller than the difference between an unconditioned course
and the rung's band. A test asserts it directly: an unconditioned course with
brutal pins on every round **cannot** put the winner in range, and a course set
well past the band with easy pins on every round cannot either. Pins fine-tune;
the three-week setup decides.

Stored as `roundSettings.pins` inside the tournament so a later lever (green
speed, tee placement) is a new key rather than a new code path. Only pins ship.

## 5. Weather on the field

Each round day already has weather, and the forecast already shows tomorrow's
honestly (`weather.js`: the forecast *is* the weather, read early). Today
`playField` ignores it and plays with `spread: 1`.

It now passes the day's `sky.spread` and `sky.pace`. Wind and rain push the
field's scores up and slow its rounds; clear days play easy and fast.

This is what makes the morning call a decision rather than "fair, every day".
With the forecast showing a blowy Saturday after a calm Friday that left the
leader tracking low, the player has a real question: tough pins to drag the
score back, or ease off because the wind will do it and brutal pins in a gale
will wreck the pace?

## 6. Watching it

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

The HUD reads **"Regional · Round 2 of 3"** during the week.

The championship sheet, during the week, shows the pin picker, the target range,
the leader's total so far and tomorrow's forecast together — everything the call
needs in one place.

## 7. Judging

### The gate

The **winning total to par** — the lowest of the sixty totals after the final
round — must land inside the rung's target range. It takes over every job the
band did:

- it gates every bonus past the base fee,
- it gates prestige (in range: earned share of the swing; out of range: minus
  the full swing),
- it gates the bar (out of range: the rung goes to somebody else for
  `BAR_DAYS`),
- and a National in range is Act III's pass (`actThreePassed`).

Too soft and the field takes the course apart — the winner is under the range.
Overcooked and nobody can score — the winner is over it. Both are misses, as a
setup outside the band is today.

The contract's first line item becomes **"Winner inside the target"**, keeping
the band's 40% share.

### Target ranges

Calibrated by measurement, the way the setup bands and the field's divisor were,
not guessed. Per rung:

- **Centre:** the median winning total across at least sixteen seeds with the
  setup at the band's midpoint, fair pins every round, and the seeds' own
  weather.
- **Width:** chosen so that the centre's own setup with fair pins lands in range
  at least 75% of the time, and a setup fifteen points below the band's low edge
  lands in range no more than 20% of the time even with the best pin choices.

The plan records the measured ranges and the seeds they came from.

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

## 8. Money

The closure is the cost: two, three or four days without green fees, food or
the shop, against a hotel selling championship rooms. The plan measures one
complete week per rung — run-up and rounds — against the same days without a
bid, and reports it.

The target: hosting a rung and landing the winner in range still beats never
bidding (otherwise the act penalises playing it), but by noticeably less than
it does today. If a passed National earns less than not bidding, the purse is
retuned, not the closure. Wider Act III money pressure belongs to the run-up
spec.

## 9. Cards

The **result card** moves to the final evening and is rewritten around the new
judge: the winning total against the target, how the week got there round by
round (in one or two sentences, not a table), then the conditions and the money
as now. The impersonal tone stays — "the field", "the winner", never a name.

The invitation card and the act-passed card are unchanged.

## 10. What must be proven before shipping

Each a test or a recorded measurement, verified by sabotage where it is a test:

1. **Free ride still dead.** Bid, never condition, brutal pins every round →
   winner out of range at every rung, across seeds.
2. **Overcooking still fails.** Setup well past the band, easy pins every
   round → out of range.
3. **Reachable.** Band midpoint, fair pins → in range at the calibrated rate.
4. **Pins matter but cannot rescue.** The pin span moves the winning total by a
   stroke or two per round, and is smaller than the gap tested in 1.
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
11. **The existing suite stays green**, with tests that asserted the band as a
    contract condition rewritten against the new judge rather than deleted.

## 11. Not in this spec

- The run-up: the inspector visit and weather affecting the setup climb (next
  spec).
- Levers beyond pins: green speed, tee placement, weather holds. The state
  shape leaves room for them.
- Named players, a leaderboard of names, careers.
- A cut, play suspensions, playoffs. A tie for the lowest total is simply the
  winning total.
- Any new screen. Everything is the championship sheet, the existing playback,
  the evening report and the cards.
