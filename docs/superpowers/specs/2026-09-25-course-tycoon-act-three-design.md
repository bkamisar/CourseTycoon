# Course Tycoon — Act III: The Championship

**Status:** design agreed, not yet planned or built.
**Supersedes:** the Act III sketch in `2026-09-19-golf-resort-tycoon-design.md`,
which proposed a back nine followed by a far course in a distant zone.

---

## 1. Why this instead of the far course

The original plan for Act III was a capacity chain: golf needs beds, beds need
more golf, distant golf needs transport. Two things have changed since it was
written.

**The capacity chain already resolves itself.** `src/sim/catchment.js` caps how
many golfers exist to be had, and `roomLimit` caps how many rooms planning
permission allows. A resort now tops out because it has run out of reputation,
not because it has run out of land. The problem the far course was the answer to
no longer presents itself.

**And the far course is mostly more of what the player has already done.** Twice
the hole editing, twice the staffing, with a travel-time modifier. The original
spec was honest about this risk for Act IV — *"if Act III proves tedious, then a
second property is that same tedium doubled"* — and the risk applies to Act III
itself.

What the game actually lacks is **shape in time**. Every day in Acts I and II is
the same shape: open, play, read the report, decide. A championship is a spike
the player can see coming, prepare for at a cost, and then either survive or not.
That is a different kind of day, and it is the thing three acts of identical days
most need.

The far course is not discarded. It becomes a candidate for Act IV, alongside
converting to a private club.

---

## 2. How the act opens

Act II ends with the investors settled — bought out, or having pulled out and
sold rooms to do it. Act III opens with a letter from a governing body.

**Entry requires eighteen holes and a real reputation**, which is what finishing
Act II leaves behind. This matters for a practical reason: the back nine is
currently unlocked in Act II, and re-gating it would take something away from
players who already have it. Making it the *prerequisite* for Act III rather than
its content resolves that without anybody losing access to anything.

A resort that was liquidated in Act II still enters Act III. It is poorer and has
fewer rooms, which makes the act harder, but the course is still a course and the
governing body does not read balance sheets.

---

## 3. The ladder

Three rungs, climbed in order. A rung may be re-attempted; a rung may not be
skipped.

| Rung | Requires | Base fee | Ceiling with bonuses |
|---|---|---|---|
| **County Open** | 18 holes, prestige ≥ 55 | $18,000 | $48,000 |
| **Regional Championship** | grandstands, overflow parking, prestige ≥ 70 | $45,000 | $120,000 |
| **National Open** | media centre, hospitality pavilion, prestige ≥ 82 | $110,000 | $290,000 |

**Bidding is not a dice roll.** The player applies; the body accepts if the
requirements are met. A management game should not hinge on luck for its central
progression. The uncertainty belongs in how the week goes, not in whether the
player is allowed to try.

Awarded tournaments are scheduled **21 days out**, which starts the run-up. Three
weeks rather than the eight first proposed: a long run-up is a grind rather than a
sprint, and the pain should be visible and sharp rather than a two-month drag.

**Prestige is a floor, not the gate.** A resort leaving Act II measures 78–85, so
the numbers above are met almost automatically and the real constraint is the
infrastructure. That is deliberate — the decision being asked for is whether to
sink money into buildings that do nothing most of the year — but it should not be
mistaken for prestige doing the gating. If measurement shows the rungs arriving
too close together, the lever to reach for is the build cost, not the prestige
floor.

---

## 4. Championship setup

A new value on the resort, 0–100, raised by the grounds staff and decaying when
they stop working on it.

**It climbs at a rate set by the grounds crew.** Groundskeepers have had one job
since Act I — holding the turf steady against wear. They now have a second, and a
thin crew physically cannot get a course ready in three weeks. This gives an
existing lever a new reason to matter rather than introducing a parallel one.

**The cost is the everyday business.** Firm greens and thick rough are what a
championship wants and what a Tuesday fourball hates. Locals especially: they
have spent two acts establishing that they want a course they can enjoy, and
`SEGMENTS.locals.idealDifficulty` is 30. Rising setup pushes effective difficulty
up, satisfaction down, and takings with it — paid in full before anything is paid
back.

**Overcooking is as bad as undercooking.** Each rung has a target band. Turn up at
a national with the course set for a county open and the field embarrasses you;
push past the band and the greens go, the scores are absurd, and the write-up is
worse than never having bid. The dial therefore has an interior optimum, which is
how every real decision in this game already works — the tee interval, the green
fee, the nightly rate.

Setup is **reversible**. After the event the player lets it fall back, and the
regulars return.

### Target bands

| Rung | Band |
|---|---|
| County Open | 45–60 |
| Regional Championship | 62–78 |
| National Open | 80–92 |

---

## 5. Infrastructure

Four new buildings, gated by rung, following the shape of `hotelAmenities.js`:
a build cost, a daily upkeep, and effects declared as data.

| Building | Rung | Between events |
|---|---|---|
| Grandstands | Regional | nothing |
| Overflow parking | Regional | nothing |
| Media centre | National | nothing |
| Hospitality pavilion | National | doubles as function space |

**Mostly dead capital, deliberately.** Bidding for a rung means committing money
that does nothing until the week arrives. It is the same shape as the hotel's
empty-room bill: the player pays to be *capable*, not to be busy. The hospitality
pavilion is the one exception, because a building that can host a wedding between
championships is a building a real resort would put up.

---

## 6. The week itself

**The course closes to normal play.** Every green fee for the week is lost.

**The hotel sells out.** Tournament week is the one time a room is worth whatever
is asked. This is the intended connection between the acts: the thing built in
Act II is what makes Act III survivable, and a player who skipped rooms will feel
the difference.

**Judged on four named conditions**, each mapping to something the player did:

1. **Setup within the band** on the final day.
2. **Turf still standing** when the field leaves — a course conditioned hard and
   then hammered by four days of play can fail here even if the setup was right.
3. **Pace inside the officials' target** — the existing flow-shop scheduling,
   pointed at a new audience.
4. **Crowd handled** — infrastructure adequate for the gallery the rung draws.

Weather applies as it does everywhere else, and cannot be controlled — but it can
have been prepared for. A course whose drainage was patched cheaply two acts ago
is a course that floods on television. This is the first time an Act I decision
reaches this far forward, and it is worth having.

---

## 7. The contract

The central economic idea, and the author's.

**A base fee that is not enough on its own, plus bonuses that are.** Each of the
four conditions above carries a stated payment. The contract lists all of them
when it is offered, because every cost line in this game tells the player what
they are getting into if they read it, and the tournament is not an exception.
The player signs knowing exactly what is being asked; what they do not yet know
is whether they can deliver it.

```
COUNTY OPEN — hosting contract
  Base fee                                    $18,000

  Course set between 45 and 60 on the day     +$12,000
  Turf still above 80 when they leave          +$8,000
  Rounds inside the officials' pace target     +$6,000
  Crowd handled without complaint              +$4,000
                                    ceiling    $48,000
```

Against that sits roughly three weeks of depressed takings and a closed week.

- **Base alone loses money** against not bidding at all.
- **About half the bonuses breaks even.**
- **All of them is a significant gain**, with the prestige on top.

Two properties fall out of this that a flat fee would not give:

**It scales the ladder without retuning the tension.** A national's base is bigger
and so is the week it costs, so the ratio stays honest all the way up. The player
never outgrows the decision.

**It gives the result somewhere to point.** Instead of one opaque score, four
named conditions that were each met or missed, every one traceable to something
the player did. The evening report already has the vocabulary for exactly this.

---

## 8. Stakes and the gate

A poor tournament costs prestige and bars the resort from that rung for a season
or two — the body gives it to somebody else. **The resort itself is never at
risk.** Act II already has an ending where the player loses what they built;
repeating that beat would make the game a sequence of near-death experiences
rather than an escalation.

The friction is time and standing, not survival.

**Act III's gate: host a National Open successfully.** At which point Act IV's
question — the far course, or converting to a private members' club — is open.

---

## 9. What this reuses, and what is new

**Reused, unchanged:** per-hole difficulty and the segment model; turf quality and
wear; the flow-shop scheduler and pace; weather; the evening report; the amenity
build/upkeep pattern; the decision-card system for offers and results; conditions
(`src/sim/conditions.js`) for anything that lasts past the week.

**New:**
- `src/sim/tournaments.js` — the ladder, the bands, the contracts, and scoring.
- A `setup` value on the resort, with its own climb-and-decay rules.
- Four infrastructure buildings, as data in the existing amenity shape.
- A tournament week that closes the course, which is the first time the
  simulation has a day that is not an ordinary day.

**The riskiest new part** is the closed week. Nothing in the simulation has ever
skipped normal play, and `runDay` assumes golfers. That wants care in the plan
rather than optimism.

---

## 10. What to measure before believing any of it

Act I shipped broken because spot measurements on hand-built fixtures said it was
fine. Act II was never measured at all until after it was feature-complete, and
the first sweep found a money printer with a decorative threat. The same
discipline applies here, and the operator must learn Act III before the numbers
are trusted:

- **Is the contract a real decision?** A tournament taken by a competent operator
  should be clearly worth it, and one taken by a careless operator clearly not. If
  both win, the bonuses are too easy; if both lose, the base is too small.
- **Does the run-up actually hurt?** If takings barely move while the course
  hardens, the sacrifice is theatre.
- **Is the target band findable?** The player must be able to tell where they are
  relative to it, or the central decision is a guess.
- **Can a rung be failed and re-attempted without the act stalling?** Barred for a
  season should read as a setback, not as a dead end.

---

## 11. Explicitly out of scope

- **Individual golfers in the field, scores, or a leaderboard.** The player runs
  the venue; who wins is flavour. Simulating a field is a different game.
- **The far course and shuttles.** Deferred to Act IV, where they are one
  candidate among others.
- **A second property.** Act IV at the earliest, and the original spec's caution
  stands: do not plan it until Act III has been played.
- **Multi-year calendars and seasons.** Tempting alongside an annual championship,
  and a large enough idea to deserve its own act rather than riding along inside
  this one.
