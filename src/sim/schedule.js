/**
 * Flow-shop scheduling across nine holes.
 *
 * A group cannot begin hole h until BOTH it has finished hole h-1 AND the
 * group ahead has cleared hole h. That single rule is the whole pace-of-play
 * mechanic: shorten the tee interval below a hole's playing time and the
 * queue grows without bound down the field.
 *
 * All times are minutes from midnight. 420 is 7:00am; 1080 is 6:00pm.
 */
export function scheduleRounds({
  groupCount,
  teeInterval,
  holeMinutes,
  dayStart = 420,
  dayEnd = 1080,
}) {
  const holeCount = holeMinutes.length;
  /** When each hole was last vacated. */
  const holeFree = new Array(holeCount).fill(-Infinity);
  const rounds = [];
  const waitTotalsByHole = new Array(holeCount).fill(0);

  for (let g = 0; g < groupCount; g++) {
    const teeTime = dayStart + g * teeInterval;
    const waitByHole = new Array(holeCount).fill(0);
    let clock = teeTime;
    let waited = 0;

    for (let h = 0; h < holeCount; h++) {
      const readyAt = clock;
      const startAt = Math.max(readyAt, holeFree[h]);
      const wait = startAt - readyAt;
      waitByHole[h] = wait;
      waited += wait;
      waitTotalsByHole[h] += wait;

      clock = startAt + holeMinutes[h];
      holeFree[h] = clock;
    }

    rounds.push({
      groupIndex: g,
      teeTime,
      startMinute: teeTime,
      finishMinute: clock,
      waitMinutes: waited,
      waitByHole,
      roundMinutes: clock - teeTime,
    });
  }

  const totalWait = waitTotalsByHole.reduce((s, v) => s + v, 0);
  const bottleneckHoleIndex =
    totalWait === 0
      ? null
      : waitTotalsByHole.indexOf(Math.max(...waitTotalsByHole));

  return {
    rounds,
    waitTotalsByHole,
    bottleneckHoleIndex,
    overrunGroups: rounds.filter((r) => r.finishMinute > dayEnd).length,
    averageRoundMinutes:
      rounds.reduce((s, r) => s + r.roundMinutes, 0) / (rounds.length || 1),
  };
}

/** How many groups fit in a playing day at a given interval. */
export function maxGroupsForDay(teeInterval, dayStart = 420, dayEnd = 1080) {
  return Math.max(1, Math.floor((dayEnd - dayStart) / teeInterval));
}
