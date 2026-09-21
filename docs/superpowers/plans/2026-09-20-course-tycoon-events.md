# Course Tycoon — Decision Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interrupt the player about once a week with a decision that has no obviously right answer, and make the consequence land on the crowds they have spent the game courting.

**Architecture:** Events are authored data and pure functions in `src/sim/`, selected deterministically from the seeded generator, exactly like narration. Their consequences run through a new per-segment **goodwill** term that decays, so a choice matters for a while without warping the game forever.

**Spec:** `docs/superpowers/specs/2026-09-19-golf-resort-tycoon-design.md` §15a.1 and §15a.4
**Preceding work:** segments and narration, complete. 358 tests green, 89 commits.

**Commits:** End every commit message with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Never `git push`, `git fetch` or `git pull`. **Stage by naming paths.**

---

## What this is for

The author's own verdict on Act I: *"I hit my stride in act one and it was a way to sort of put on autopilot."* Segments fixed half of that — there is no longer a course that pleases everybody. Events fix the other half: a world that only ever responds, and never asks.

Three principles are already agreed and are not up for renegotiation:

**Every choice states its cost explicitly.** A choice whose consequence is unknown is a coin flip, not a decision. The reference the author gave — an MLB lockout simulator — puts "Costs 3 days and 35 points" on every option, and that is exactly why its choices read as decisions.

**A recurring character delivers them.** Gus the marshal already anchors narration. Events should feel like the same world talking.

**No option may be a free pass.** If one choice dominates, it is not a decision, and the event should be cut or rebalanced rather than shipped.

And one rule from the spec worth repeating because it is easy to violate by accident: **a decision event must never be dismissable with a default.** An event that can be waved away becomes a notification, and the player starts clicking through without reading.

---

## Hard rules

- `src/sim/` stays pure: no `Math.random`, no `Date.now`, no DOM, no imports from `render`/`ui`/`audio`. `tests/purity.test.js` enforces it.
- The UI never computes game outcomes.
- No raw hex colours outside `src/render/palette.js`.
- Touch targets ≥44px; works at **375×812 and 390×664**.
- All 358 existing tests stay green. **Never weaken an assertion to make something pass.**
- **Read the failure count** from `node --test`'s summary.

---

## Deliberate scope decisions

**Effects are limited to money, prestige, turf and segment goodwill.** Notably *not* "closes the course for three days" — that needs surgery on the day loop and belongs in a later slice. Where an event wants to express a cost in time, express it as money and turf instead for now, and note it in the event's text.

**Goodwill decays.** A choice should colour the next week or two, not the rest of the game. Without decay, early events dominate a sixty-day run and late ones are noise.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/sim/goodwill.js` | Per-segment goodwill: apply, decay, fold into appeal |
| `src/sim/events.js` | Event library, eligibility, selection, applying an outcome |
| `src/sim/segments.js` | *(modify)* appeal reads goodwill |
| `src/sim/day.js` | *(modify)* decay goodwill, offer an event, carry it on the report |
| `src/sim/state.js` | *(modify)* goodwill and seen-event fields |
| `src/ui/event.js` | The decision card |
| `src/main.js` | *(modify)* show the card, block until answered |
| `tests/goodwill.test.js`, `tests/events.test.js` | New suites |

---

## Task 1: Goodwill — TEST FIRST

**Files:** Create `src/sim/goodwill.js`, `tests/goodwill.test.js`

A per-segment modifier in roughly −25..+25 that shifts how appealing the resort is to that crowd, and fades back toward zero.

- [ ] **Step 1: Tests.** Applying a change moves that segment and leaves the others alone. Values clamp at the bounds. Decay moves every segment toward zero and never overshoots past it. A segment at zero stays at zero. Decay from +25 takes somewhere between one and three weeks to become negligible — assert the shape, not a magic number.

- [ ] **Step 2: Fail, then implement.** Export `emptyGoodwill()`, `applyGoodwill(goodwill, changes)`, `decayGoodwill(goodwill)`, and a `goodwillFactor(goodwill, key)` returning a multiplier for appeal.

- [ ] **Step 3: Commit.**

## Task 2: Appeal reads goodwill — TEST FIRST

**Files:** Modify `src/sim/segments.js`; extend `tests/segments.test.js`

- [ ] **Step 1: Tests.** Positive goodwill raises a segment's appeal, negative lowers it, absent goodwill changes nothing (so every existing caller behaves as before). **The no-universal-course guarantee must still hold** — re-run the grid sweep with goodwill at its maximum for all three segments and confirm no configuration puts every segment above 0.8. Goodwill must not become a way to buy your way out of the central tension.

- [ ] **Step 2: Fail, then implement.** `segmentAppeal` takes an optional `goodwill` and multiplies by `goodwillFactor`.

- [ ] **Step 3: Commit.**

## Task 3: The event library — TEST FIRST

**Files:** Create `src/sim/events.js`, `tests/events.test.js`

The heart of the slice, and mostly writing.

- [ ] **Step 1: Tests.** Every event has an id, a speaker, a prompt and **at least two** choices. Every choice has a label, an explicit cost description, and effects. **No event has a choice whose effects dominate every alternative** — write a test that checks each event has no single option that is at least as good as all others on every axis. That test is the point: a dominated set is not a decision. Selection is deterministic for a state and seed, and an event does not recur while unseen ones remain.

- [ ] **Step 2: Fail, then implement.**

Shape: `{ id, speaker, prompt, when(context), choices: [{ label, cost, effects }] }` where `effects` is `{ money, prestige, turf, goodwill: { locals, serious, destination } }`, all optional.

Write **at least fourteen** events. Reuse the narration cast — Gus, the starter, the greenkeeper, the pro shop, the two publications — plus new voices where an event needs one. Situations worth covering:

- The city's tournament invitation: a fee and prestige, against turf and a week of disruption
- A journalist's interview, where the *answers* shape which crowd hears about you
- Equipment failure: pay a premium today, or wait and let the crew resent it
- A society or corporate outing wanting a block booking at a discount
- A local junior club asking for cheap access
- A neighbour complaining about balls in their garden
- A magazine offering a paid feature
- A member of staff asking for a raise
- A supplier offering cheap sand or seed of uncertain quality
- A visiting professional offering to lend their name

The costs must be **concrete and stated**: "$4,000 and the greens take a beating" reads as a decision; "may affect your reputation" does not.

- [ ] **Step 3: Commit.**

## Task 4: Wire into the day — TEST FIRST

**Files:** Modify `src/sim/day.js`, `src/sim/state.js`; extend `tests/day.test.js`

- [ ] **Step 1: Tests.** Goodwill decays every day. An event is offered roughly weekly and not more than once a day. The report carries the pending event. Determinism holds. Applying an outcome moves money, prestige, turf and goodwill as that choice specified. Ten consecutive days run coherently.

- [ ] **Step 2: Fail, then implement.** Add `goodwill` and `eventsSeen` to `newGame`, defaulting safely for saves that predate them. Decay in `runDay`. Offer an event on the cadence. Export `applyEventChoice(state, eventId, choiceIndex)` returning a new state — pure, like everything else here.

- [ ] **Step 3: Commit.**

## Task 5: The decision card — visual checkpoint

**Files:** Create `src/ui/event.js`; modify `src/main.js`

- [ ] **Step 1: Implement.** A card showing the speaker, the prompt, and the choices — **each with its cost printed on it**. Appears after the evening report, before returning to the overview.

**It must not be dismissable.** No close button, no tapping outside, no Continue that skips it. The only way forward is choosing. That is the one thing separating this from a notification.

- [ ] **Step 2: Look at it** at 375×812 and 390×664, in a fresh tab. Every choice's cost must be readable without scrolling past it. **It is wrong if** a choice's consequence is hidden below the fold, since an unread cost is the same as no cost at all.

- [ ] **Step 3: Commit.**

## Task 6: Balance and play

- [ ] **Step 1: Run `npm run balance`** and report it verbatim. Events move money and prestige, so the economy needs re-checking.

- [ ] **Step 2: Play twenty days** at 375×812. Report **how many events fired, which ones, and whether any choice felt obvious.** An obvious choice is a bug in this slice, and it is the specific thing a test cannot catch.

- [ ] **Step 3: Record any tuning in the spec and commit.**

---

## Definition of done

- [ ] All 358 prior tests green, plus the new suites
- [ ] `tests/purity.test.js` passes — `src/sim/` stayed pure
- [ ] The no-universal-course guarantee still holds with goodwill maxed
- [ ] No event has a dominated choice set, by test
- [ ] Twenty days playable, with a report on whether any choice felt obvious
- [ ] Nothing pushed

## Out of scope

Events that close the course for days; staff morale and slack; weather; amenity tiers; food and drink menus. All are separate slices.
