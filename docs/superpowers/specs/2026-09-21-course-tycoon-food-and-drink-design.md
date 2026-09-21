# Course Tycoon — Food and Drink Design

**Status:** approved, not yet planned
**Supersedes:** §15a.9 of the main design spec, which recorded this as deferred
**Preceding work:** segments, narration, decision events — all shipped. 417 tests green.

---

## 1. Why this slice, and what it is really for

Two things arrived together and both are load-bearing.

The author asked for menus at the halfway house and restaurant, plus a beverage
cart with its own menu — twice, across two sessions, which is the strongest
signal a feature gets on this project.

The author also said, approving this design: *"Just like a little visual pop
here since everything's getting kinda text heavy."* That is a fair reading of
where the game has drifted. The last three slices — segments, narration,
decision events — were all words on cards. The HUD is numbers, the report is
numbers, the glossary is prose about numbers. A game whose reference point is an
8-bit tycoon has spent three slices becoming a reading app.

So **visual pop is a requirement of this slice, not a finishing touch.** Food is
the right place to pay that debt down: it is the most drawable subject in the
game. A hot dog, a draught beer, a lobster roll are instantly legible at 12×12
in a way that "course rating" never will be. Section 6 makes this concrete and
testable rather than aspirational.

## 2. The decision this adds

The same push-pull the course already has, applied to a second surface.

Locals want a cheap beer and something hot for under ten dollars. Destination
guests want a proper lunch and will pay four times as much for it. Serious
golfers want something fast that does not slow them down. A menu pitched at one
reads as wrong to the others, and **the crowd is decided by the course the
player built** — so the menu has to answer to a decision made hours earlier, on
a different screen, about corridor widths and bunkers.

That is the property worth protecting. Food must not become a second,
independent optimisation problem sitting beside the golf. It is the golf
decision, asked again in a different accent.

## 3. Items

An item is authored data:

```js
{
  id: 'hotDog',
  name: 'Hot dog',
  kind: 'food' | 'drink',
  price: 9,            // what the guest pays
  cost: 3,             // what it costs the resort to serve
  prep: 1,             // kitchen load — see §5
  cartable: true,      // can the beverage cart carry it
  appeal: { locals: 1.0, serious: 0.5, destination: 0.2 },
  satisfaction: 2,
  energy: 12,          // how much of a tiring golfer it gives back - see §7.1
}
```

**Item prices are fixed and not player-tunable.** This is a deliberate
exclusion. The player chooses *what to serve*, not the markup on it. A markup
slider would make food a second green fee, and the interesting question stops
being "who am I feeding" the moment it becomes "what can I get away with
charging". The green fee is already that lever and does not need a twin.

### 3.1 The catalogue

Twenty-one items, first pass. Prices and appeals are starting values; §8 says
how they get tuned.

Three of them - the Transfusion, the breakfast sandwich and the chicken Caesar
wrap - are the author's own additions, asked for by name. They are marked below.

| id | name | kind | price | cost | prep | cartable | locals | serious | guests | sat |
|---|---|---|---|---|---|---|---|---|---|---|
| `domesticCan` | Can of domestic | drink | 5 | 1.50 | 0 | yes | 1.00 | 0.40 | 0.15 | 1 |
| `draught` | Cold draught | drink | 7 | 2 | 0 | yes | 1.00 | 0.60 | 0.40 | 2 |
| `craftAle` | Craft ale | drink | 11 | 4 | 0 | yes | 0.50 | 0.80 | 0.70 | 3 |
| `arnoldPalmer` | Arnold Palmer | drink | 5 | 1 | 0 | yes | 0.80 | 0.70 | 0.60 | 2 |
| `bottledWater` | Bottled water | drink | 3 | 0.50 | 0 | yes | 0.60 | 0.90 | 0.50 | 1 |
| `espresso` | Espresso | drink | 4 | 1 | 1 | no | 0.30 | 0.60 | 0.90 | 2 |
| `wineByGlass` | Wine by the glass | drink | 14 | 5 | 0 | no | 0.10 | 0.30 | 1.00 | 3 |
| `transfusion` * | Transfusion | drink | 12 | 5 | 0 | yes | 0.90 | 0.80 | 0.70 | 4 |
| `candyBar` | Candy bar | food | 3 | 1 | 0 | yes | 0.80 | 0.50 | 0.20 | 1 |
| `trailMix` | Trail mix | food | 5 | 2 | 0 | yes | 0.40 | 0.80 | 0.40 | 2 |
| `turkeyWrap` | Turkey wrap | food | 12 | 4 | 0 | yes | 0.50 | 0.80 | 0.60 | 3 |
| `chickenCaesarWrap` * | Chicken Caesar wrap | food | 14 | 5 | 0 | yes | 0.60 | 0.85 | 0.60 | 3 |
| `breakfastSandwich` * | Breakfast sandwich | food | 8 | 2.50 | 2 | yes | 0.90 | 0.80 | 0.40 | 3 |
| `hotDog` | Hot dog | food | 9 | 3 | 1 | yes | 1.00 | 0.50 | 0.20 | 2 |
| `chiliBowl` | Bowl of chili | food | 10 | 3 | 2 | no | 0.90 | 0.50 | 0.30 | 3 |
| `burgerFries` | Burger and fries | food | 15 | 5 | 2 | no | 0.90 | 0.60 | 0.40 | 4 |
| `clubSandwich` | Club sandwich | food | 16 | 5 | 2 | no | 0.60 | 0.80 | 0.70 | 4 |
| `seasonalSalad` | Seasonal salad | food | 14 | 4 | 2 | no | 0.20 | 0.50 | 0.80 | 3 |
| `oysters` | Half dozen oysters | food | 24 | 9 | 3 | no | 0.05 | 0.25 | 1.00 | 5 |
| `lobsterRoll` | Lobster roll | food | 28 | 11 | 3 | no | 0.10 | 0.40 | 1.00 | 6 |
| `steakFrites` | Steak frites | food | 42 | 16 | 4 | no | 0.05 | 0.30 | 1.00 | 7 |

`*` marks an item the author asked for by name.

Note the shape of the table: **no item is good for everybody**, verified against
all twenty-one. The Transfusion comes closest — it is the drink everyone on a
golf course orders — and is deliberately the broadest thing on the list at
0.90 / 0.80 / 0.70, which still clears the bar in §9. Its $5 serving cost is
what stops it being a free win: the margin is comparable to a draught's, so
leaning on it is a choice rather than an answer.

**What `cartable` means, and what it does not.** An item is cartable if it can
be handed over from a moving cart — held cold in a cooler or hot in a warmer.
A hot dog and a breakfast sandwich qualify; the author was right to say so, and
an earlier draft of this spec had them wrong. What does not qualify is anything
poured or finished to order (espresso, wine by the glass) or anything that needs
a plate and does not survive the trip (chili, burger and fries, salad, oysters,
lobster roll, steak frites). Twelve of the twenty-one are cartable.

**Cartable is not the same as free.** The earlier draft tied `cartable` to
`prep 0`, which made the beverage cart kitchen-free by its nature. It is better
the other way round: a hot dog on the cart still has to be cooked, so it still
loads the kitchen. The cart is kitchen-free only if the player *chooses* an
all-drinks board — which is a decision, where the old rule was a property. Ten
cartable items are `prep 0`, so that choice always remains open.

**Pre-made cold items are `prep 0`.** A wrap assembled in the morning does not
load the line during service; a breakfast sandwich cooked to order does. That is
what the `prep` column is measuring.

## 4. Menus, and what they earn

A menu is a list of item ids on an amenity. Slots by amenity:

| amenity | slots | accepts | menus available |
|---|---|---|---|
| `snackShack` | 3 | anything with `prep ≤ 1` | 286 |
| `halfwayHouse` | 5 | anything | 20,349 |
| `restaurant` | 7 | anything | 116,280 |
| `beverageCart` | 4 | `cartable` only | 495 |

These are the author's numbers, raised from 2/3/5/3 to make mixing and matching
worth doing. Measured before adopting them: **more slots does not need more
food.** Each crowd already has exactly twelve items it wants out of the
twenty-one — a symmetry that was not designed — so even a seven-slot restaurant
leaves 792 distinct ways to please destination guests. Nothing is forced.

The consequence that does need handling is revenue: bigger menus raise both pull
and basket, so `RATE` has to come *down* to hold §4.1's neutrality. Treat the
rates below as pre-slot-increase values that the balance pass must retune.

For each segment `s`, a menu yields two numbers:

**Pull** — how much of this board they actually want. The mean decides it,
lifted halfway toward the best thing on the menu:

```
pull(s) = clamp(mean + 0.5 * (best - mean), 0, 1)
  where best = max  over items of appeal[s]
        mean = mean over items of appeal[s]
  an empty menu has pull 0
```

**This formula was rewritten during the spec's own review, and the reason is
worth keeping.** The first draft read `best + 0.15 * (total - best)` — the best
item sets the score, breadth adds a little. Swept against the catalogue, that
let **87% of five-slot menus please all three crowds at once**: a single burger
on a board of oysters, lobster and steak carried the locals score to 1.00, because
only the best item was being read. The guarantee this entire design rests on did
not hold, and it failed silently — every individual number looked reasonable.

Reading the mean fixes it because it makes a mostly-wrong menu read as wrong. A
golfer looking at a board where one item in five is for them is not being
catered to, and the formula now says so. Measured against the same sweep: **0 of
20,349 five-slot menus** please all three crowds, and 0 of the 2- and 3-slot
combinations either.

**Basket** — the average price of what they would actually buy, weighted by
appetite rather than by menu position:

```
basket(s) = Σ(price × appeal[s]) / Σ(appeal[s])
cogs(s)   = Σ(cost  × appeal[s]) / Σ(appeal[s])
```

Then per guest of that segment, at that amenity:

```
spend(s)    = pull(s) × basket(s) × RATE[amenity] × serviceFactor
foodCost(s) = pull(s) × cogs(s)   × RATE[amenity] × serviceFactor
```

`RATE` is how much custom an amenity generates per guest: `snackShack` 1.0,
`halfwayHouse` 1.6, `restaurant` 1.3, `beverageCart` 1.4. First-pass values.

### 4.1 The calibration rule

**A well-matched menu should earn roughly what today's flat `spendPerGuest`
already earns.** Not more.

This matters more than any individual number. Food currently contributes a flat
`spendPerGuest` per amenity, and the whole economy — build costs, wages, the Act
I gate — is balanced against that. If menus are a revenue *increase*, every cost
in the game is now too cheap and the gate arrives early. So the change is
deliberately neutral for a player who chooses well, and a **penalty** for one
who serves a crowd food they do not want. Menus add a way to be wrong, not a way
to earn more.

The balance harness checks this directly: see §8.

### 4.2 What the named menus measure

Targets for the implementation to reproduce, from the sweep run during this
spec's review:

| menu | pull L / S / G | basket (their own) | prep | kitchen staff |
|---|---|---|---|---|
| locals, 3 (hot dog, draught, candy bar) | 0.97 / 0.57 / 0.33 | $7 | 1 | 0 |
| serious, 3 (water, trail mix, Caesar wrap) | 0.57 / 0.88 / 0.55 | $7 | 0 | 0 |
| destination, 5 (oysters, lobster, steak, wine, salad) | 0.15 / 0.42 / 0.98 | $25 | 12 | 3 ($540/day) |
| generalist, 5 (draught, club, craft ale, wrap, burger) | 0.85 / 0.76 / 0.63 | $12 | 4 | 1 ($180/day) |
| cart, 3 (Transfusion, draught, Caesar wrap) | 0.92 / 0.80 / 0.63 | $11 | 0 | 0 |
| early tee sheet, 3 (breakfast sandwich, espresso, Arnold Palmer) | 0.78 / 0.75 / 0.77 | $6 | 3 | 0 |

The destination menu earns three and a half times the basket of the locals menu
and costs $540 a day in kitchen wages to serve — and is worth nothing at all on
a course that does not draw destination guests. The generalist is good at
nothing and adequate everywhere, for $180 a day. That is the shape this slice is
trying to produce, and these rows are how the implementation knows it did.

Two of these rows were not designed, and both are worth keeping:

**The cart is strong.** With the Transfusion on it, a three-slot cart pulls
0.92 / 0.80 / 0.63 at an $11 basket with no kitchen at all. That is a lot of
revenue for $90 a day of upkeep, and §8 must check it does not simply dominate
the halfway house. It is *meant* to be good — it is the pace-friendly option and
pace is the game's spine — but "good" and "the only correct answer" are
different things.

**The most even menu in the catalogue is the breakfast one.** Breakfast
sandwich, espresso and an Arnold Palmer come out at 0.78 / 0.75 / 0.77 — the
closest any menu gets to pleasing all three crowds — on a $6 basket. The
generalist penalty arrived on its own, from three items chosen for flavour
rather than balance, which is the strongest evidence available that the formula
is shaped right.

### 4.3 Two results of the cartable rule, found by measurement

**The cart cannot serve destination guests, and that is the right answer.**
Sweeping all 495 four-slot cart menus, the best any of them manages for
destination guests is **0.68 pull** — against **0.99 for locals**. Nothing was
declared to make that true; it falls out of the fact that what guests want
(oysters, steak, wine, a proper salad) is exactly what cannot ride on a cart. So
the three food amenities end up with distinct jobs without a single rule saying
so: the restaurant is where destination money is spent, and the cart is for the
people actually out playing golf.

**A hot cart barely beats a dry one on appeal alone.** Transfusion, draught,
Caesar wrap and a hot dog gives 0.94 / 0.77 / 0.59 at `prep 1`. Swapping the hot
dog for an Arnold Palmer gives 0.91 / 0.79 / 0.64 at `prep 0`. The best locals
item in the game adds almost nothing, because a cart is already locals-saturated
before it gets there and `pull` reads the mean.

The author asked for hot food on the cart, so "it is pointless there" was not an
acceptable answer. §7.1 is the fix, and it is a better mechanic than the problem
deserved: hot food gives a tiring golfer more back than a cold drink does, and
energy is already what decides pace. So the value of hot food on the cart is not
that more people buy it — it is that the people who do play faster afterwards.

## 5. The kitchen, and making `kitchenStaff` mean something

`kitchenStaff` already exists in `economy.js` as a $180/day wage and **nothing
in the game reads it.** That is a loose end this slice ties.

Every item has a `prep` cost. They sum across every menu in the resort:

```
load     = Σ prep over all items on all menus
capacity = 3 + (kitchen staff) × 4
```

When `load > capacity`, service slows:

```
serviceFactor = clamp(capacity / load, 0.45, 1)
```

`serviceFactor` scales spend (fewer guests get served) and drives a satisfaction
penalty. Ten of the twelve cartable items are `prep 0`, which is what keeps an
all-drinks beverage cart possible with no kitchen at all — but a cart carrying
hot dogs and breakfast sandwiches loads the line like anything else. See §3.1.

The decision this creates: a wide menu pleases every crowd a little and carries
a wage bill; a narrow one aimed at the crowd you actually have is cheap to run.
Breadth is a purchase, not a free hedge.

### 5.1 The kitchen is not a side-constraint. It is the decision.

Found while building, and it corrects a misreading of this spec's own §4.1
that survived into the first implementation plan.

Measured on the crowd a real forty-day Act I game actually settles at
— 55% locals, 17% serious, 27% destination — a luxury board beats a locals
board on revenue, comfortably:

| board | prep | cooks | wages/day | revenue | food cost | **net** |
|---|---|---|---|---|---|---|
| locals (hot dog, draught, candy, chili, burger) | 5 | 1 | $180 | $840 | $267 | **$393** |
| luxury (oysters, lobster, steak, wine, salad) | 12 | 3 | $540 | $1,295 | $475 | **$280** |

The luxury board takes $455 more across the counter and keeps $113 less,
because three cooks cost $540 where one costs $180. That gap is the whole
decision, and it lives entirely in the wage bill.

**Two consequences, both important.**

First: any comparison of menus that looks at revenue alone measures half a
decision and will report a design failure that is not there. The first
implementation plan contained exactly such a test, asserting that a
mismatched board must earn less revenue on a mixed crowd. It does not, it
should not, and the test was wrong — an upmarket board is *supposed* to be
tempting at the counter. It is the kitchen that makes it a mistake.

Second, and more load-bearing: **without the kitchen, going upmarket would
be the dominant strategy at any destination share above about 12%**, and a
real Act I runs at 27%. The `prep` system was specified in §5 as the cost of
breadth. It turns out to be doing something larger: it is the only thing
standing between this feature and "always stock the expensive food", which
is precisely the autopilot the whole variety layer exists to prevent. Any
future retune of `prep` values or of `PER_COOK` is therefore a balance
change to the central decision, not a tweak to a staffing rule.

## 6. Visual pop — the requirement, stated testably

The author's note is the reason this section exists, and vague intent here would
produce another wall of text with a few icons on it. So:

**6.1 Every item has a 12×12 pixel sprite.** Twenty-one of them, authored as grid
data in a new `src/render/food.js`, in the same style as `sprites.js`. Drawn at
2× on the menu board (24px), which is the size the mockup's "shelf" used and the
author approved.

**6.2 The board reads as a board**, not as a list of rows — a slate field, a
chalk-style heading, items written on it. The player should recognise it as the
thing a golfer reads at the turn.

**6.3 Appeal is shown as three bars per item, never as words.** Locals, serious,
guests. A dark bar means that crowd will not buy it. This is the one piece of
information that decides every choice on the screen, so it is the one thing that
must be readable without a tap.

**6.4 The beverage cart is visible on the course during playback.** She moves
along the holes as the day plays out. This is the highest-value item in this
section: it is the only one that puts new motion on the canvas, where the game
currently shows static holes and moving dots. The timeline machinery to do it
already exists.

**6.5 The refuel event gets a sprite.** `{ type: 'refuel' }` is already emitted
into the timeline by `round.js` and currently renders as nothing.

**6.6 Six palette additions**, named by role like every other entry:
`FOOD_BREAD`, `FOOD_MEAT`, `FOOD_GREEN`, `FOOD_RED`, `FOOD_DRINK`, `FOOD_FOAM`.
Food does not exist in a palette built for grass, sand and water. No raw hex
outside `palette.js`, as ever.

## 7. The beverage cart

A new amenity: build $5,000, upkeep $90/day, satisfaction 3, three slots,
cartable items only.

Its mechanical identity is already sitting in the code and needs no invention.
`round.js` has a refuel stop that restores golfers to 82 energy **and costs 3.5
minutes at the turn**; tired golfers play slower. So:

| | reaches them | energy | time cost |
|---|---|---|---|
| halfway house | once, at the turn | to 82 | 3.5 min |
| beverage cart | every third hole | to 68 | none |

That is a real choice rather than two sizes of the same thing. On a course that
is already backing up, the cart's pace-neutrality is worth more than the bigger
refuel. On a fast course with a generous tee interval, the halfway house wins.
And since pace-of-play is the game's central mechanic, this ties food back into
the spine rather than bolting it on the side.

**The person.** The author asked for a "cart girl". The amenity is
`beverageCart` in code — the equipment — and the person who runs it is a named
character who joins the narration cast alongside Gus, the greenkeeper and the
starter. She is called **Dee** — confirmed by the author. She gets narration lines and
is eligible to speak decision events, which is the cheapest possible
way to make a new amenity feel like part of the world.

### 7.1 What is on the board decides how much of a round it gives back

Approved by the author as the fix for §4.3's flat spot, and it turns out to be
the thing that ties this whole slice to the rest of the game.

Every item carries an `energy` value: how much of a tiring golfer it restores.
Drinks give back a little, a wrap more, hot food most.

| | typical `energy` |
|---|---|
| beer, wine, soft drinks | 3-5 |
| espresso | 6 |
| candy, trail mix, wraps, salad | 6-9 |
| hot dog, chili, burger, breakfast sandwich | 12-15 |

An amenity's refuel is then set by the best thing on its board, not by the fact
that the amenity exists:

```
halfway house:  restoreTo = clamp(60 + bestEnergy * 2, 60, 88)   still costs 3.5 min
beverage cart:  restoreTo = clamp(50 + bestEnergy * 2, 50, 76)   still costs no time
```

An all-drinks cart restores to 60. Put a hot dog on it and that becomes 74. The
cart is capped below the halfway house's ceiling on purpose — it must never be
a sit-down stop you get for free — but the gap between a dry cart and a hot one
is fourteen points of energy, repeated every third hole.

**Why this is the right fix rather than a patch.** `tiredMinutes = strokes x 0.12
x (1 - energy/100)`, so fourteen points of energy is worth roughly 0.35 minutes
per hole for a four-ball, about two minutes over nine holes. Modest on its own —
and then it compounds, because a group that clears a hole sooner releases it to
the group behind sooner, and the flow-shop rule in `schedule.js` is the entire
pace-of-play mechanic. Food stops being a revenue system that happens to sit on
a golf course and becomes another input to the thing the game is actually about.

It also makes the halfway house's own menu matter for pace, which it did not
before: today its refuel is a flat 82 regardless of what it serves. A sensible
menu with a hot item lands at 84, so this is near-neutral for a player who
chooses well — the same calibration rule as §4.1 — and a real penalty for one
who stocks nothing but beer.

## 8. Balance

`tools/balance.js` gains menu policies, the way it gained decision policies:

- **no menu** — amenities built but nothing on the board. Should earn near zero
  from food, and should be visibly worse than today. If it is not, menus do not
  matter.
- **matched** — a menu chosen for the crowd the course actually draws. This is
  the calibration target: within roughly 10% of today's flat-`spendPerGuest`
  numbers (§4.1).
- **mismatched** — a destination menu on a locals course. Must be clearly worse
  than matched, or the segment structure is decorative.
- **everything** — the widest menu the slots allow, with no kitchen staff hired.
  Should lose money to the `serviceFactor` and prove breadth is a purchase.
- **cart against halfway house** — build one, then the other, on the same course.
  Neither may dominate. §4.2 flags that the Transfusion makes the cart strong,
  and the cart is pace-neutral on top of that, so this is the likeliest place
  for a dominant option to hide.
- **hot cart against dry cart** — §4.3's flat spot, now answered by §7.1. Run
  both on the same tight tee interval and confirm the hot cart's round time is
  measurably shorter. If it is not, the energy values are too small.
- **pace neutrality of the halfway house** — its refuel is a flat 82 today. A
  sensible menu must land near that (§7.1 predicts 84) so existing balance is
  not silently disturbed.

Any tuning gets recorded here, in this file, with the numbers that prompted it.

### 8.1 What the cart pass actually found

**The halfway house was worse than building nothing.** Measured over twenty
days with a cook hired, it returned $84,195 against $81,768 for an empty
resort while the cart returned $87,078. Two causes, both fixed:

*A stop costs far more than its own length.* `REFUEL_MINUTES` was 3.5,
chosen as "how long a stop takes". But the group behind cannot start the
hole until this one clears it, so `scheduleRounds` turned 3.5 minutes into
**fourteen** — a round went from 125 to 139 minutes at a nine-minute tee
interval. Now 2.2.

*A seated stop sold no more than a passing cart.* Both were on
`MENU_RATE` 1.3. A group that has sat down buys a burger and a beer where
a cart sells one drink, so the halfway house is now 1.7 and the cart 0.9.
This keeps §4.1's calibration: a matched halfway house board lands at
about $11 a guest, which is what the flat `spendPerGuest` it replaced
earned.

**After the fix, over twenty days, cooks hired only as each board needs:**

| tee interval | nothing | halfway house | cart with hot food | gap |
|---|---|---|---|---|
| 9 min (congested) | $81,768 | $88,268 | $87,078 | 1.4% |
| 11 min | $83,176 | $89,662 | $88,238 | 1.6% |
| 14 min (clear) | $87,752 | $96,255 | $94,594 | 1.8% |

Both clearly beat building nothing, neither runs away, and the gap
narrows as the course congests — which is the cart's identity doing its
job. Both facts are now pinned by tests.

**Where this lands differently from §7's prediction.** The spec expected
the cart to *win* on a congested course and lose on a clear one. She does
not win; she closes the gap. The real distinction turned out to be
staffing: a drinks-only cart is `prep 0`, so she runs on $90 a day and
**no cooks at all**, where a halfway house worth building needs one at
$180. She is the amenity you can afford before you can afford a kitchen.
That is a better distinction than the one that was designed, and it is
recorded rather than tuned away.

**A caution for anyone re-running this.** The first three attempts at this
comparison were all wrong, in ways that each looked like a design failure:
comparing revenue without wages, comparing an overloaded kitchen against a
staffed one, and charging a drinks-only cart for a cook it does not need.
Hire cooks per board, or the number you get back is about staffing and not
about the amenity.

## 9. Tests that must hold

- `src/sim/` stays pure — `tests/purity.test.js` already enforces it, and the
  item catalogue lives in `src/sim/`, not the UI.
- **No item is good for every crowd.** No item may have `appeal ≥ 0.8` for all
  three segments. The Transfusion sits closest to this line at 0.90/0.80/0.70. Same guarantee segments already has, one level down.
- **No menu pleases every crowd.** Sweep every legal slot combination and
  confirm no menu puts `pull` at or above 0.85 for all three segments at once.
  Currently 0 of 20,349 five-slot menus do, and 0 of the 2- and 3-slot ones. This test is the reason §4's formula
  is what it is — it caught the first draft failing at 87%, and it is the single
  most important assertion in this slice.
- **Nothing that needs a plate is cartable**, by test: no item with `prep ≥ 3`
  may be `cartable`. That is the line between grab-and-go and table service, and
  it is what stops the cart quietly becoming a restaurant on wheels.
- **A kitchen-free cart stays possible**, by test: at least as many `cartable`
  items are `prep 0` as the cart has slots. Otherwise the all-drinks board — the
  choice that makes the cart interesting — silently stops existing the next time
  the catalogue is edited.
- **Every item has a sprite**, by test — a catalogue entry with no art is a blank
  square on the board, and that is exactly the failure that shipped once already
  when `SPRITES.tee` was defined but never registered.
- Prices quoted in the UI come from the simulation, never retyped. The recurring
  bug on this project is the interface disagreeing with the simulation, and a
  menu is a screen made entirely of prices.
- The economy is neutral for a matched menu (§4.1), by balance run.

## 10. Deliberately not building

- **Per-item pricing or markup.** See §3.
- **Ingredient supply, spoilage, or stock.** A second resource to manage, with
  no decision in it that menu choice does not already contain.
- **Menu unlocks by act.** The catalogue is open from the start; the constraint
  is slots and kitchen capacity, which are already two constraints.
- **Staff cooking skill.** Morale is a planned slice of its own and would
  collide with it.
- **Dietary or seasonal menus.** Flavour without a decision.

## 11. Suggested build order

Each stage is playable on its own, so this can ship in pieces rather than as one
drop:

**Stages 1-4 are the first implementation plan; stages 5-7 are the second.**
Splitting there is deliberate: stage 4 leaves the game fully playable with menus
on the three existing food amenities, and the beverage cart is a self-contained
addition on top rather than a dependency of it.

1. Item catalogue, pull/basket/spend maths, tests. No UI — the sim can be
   exercised by the balance harness before any screen exists.
2. The kitchen: `prep`, capacity, `serviceFactor`, and `kitchenStaff` finally
   doing something.
3. Sprites and palette additions. Look at them before building the screen
   around them.
4. The menu board, wired to the snack shack, halfway house and restaurant.
5. The beverage cart: amenity, refuel behaviour, Dee joining the cast.
6. The cart on the canvas during playback (§6.4).
7. Balance pass, tuning recorded here.
