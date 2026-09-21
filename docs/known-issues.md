# Known issues

Things found by playing that are not yet fixed. Each one is written from
what the player saw, not from a guess about the cause — the cause is for
whoever picks it up.

---

## Act II

### The day recap never says what the hotel earned

**Found:** first Act II playthrough, 2026-09-21.

The report screen shows occupancy ("9 of 17 filled — 53%") and the
investor line, but no money. There is no way to tell from the recap
whether the rooms made anything, which means there is no way to tell
whether the nightly rate is set anywhere near right — the one decision
Act II asks the player to make every day.

`roomRevenue` is computed in `src/sim/rooms.js` and folded into the day's
revenue, and `costs.rooms` is `nightlyUpkeep(rooms) + hotelUpkeep(amenities)`
in `src/sim/day.js`. Both numbers exist; neither reaches
`src/ui/report.js`. Worth showing the pair, not just the total, because
the interesting fact is the margin: a hotel can take real money across the
desk and still lose on the night.

### Act II still shows Act I's goals

**Found:** first Act II playthrough, 2026-09-21.

After the gate passes and the investors arrive, the goal display still
lists the Act I gate conditions (money, prestige, holes, satisfaction held
for N days). Those are finished and cannot be un-met; the standing
investor target is what the player is now playing to.

`GATE_THRESHOLDS` and the gate readout in the HUD/overview do not check
`state.act`. The investor target is already rendered on the report
(`formatTarget` in `src/ui/report.js`) — the goals surface needs to switch
to it rather than showing both.

### Hotel amenities not visible

**Found:** first Act II playthrough, 2026-09-21. **Probably not a bug.**

Reported as "I don't see the hotel amenities as something you can buy".
The build UI landed in `adad7f1`, which was unpushed at the time, so the
deployed build did not have it. Confirm against a pushed build before
investigating further.
