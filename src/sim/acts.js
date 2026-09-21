/** Act I gate thresholds. Tuned later by tools/balance.js. */
export const GATE_THRESHOLDS = {
  holesOpen: 9,
  money: 50000,
  prestige: 40,
  satisfaction: 60,
  satisfactionDays: 7,
};

/**
 * Evaluates the Act I gate and reports what is still outstanding, so the
 * UI can show progress rather than a locked door.
 */
export function actOneGate({ holesOpen, money, prestige, satisfactionHistory }) {
  const recent = satisfactionHistory.slice(-GATE_THRESHOLDS.satisfactionDays);
  const hasEnoughHistory = recent.length >= GATE_THRESHOLDS.satisfactionDays;
  const averageRecent = hasEnoughHistory
    ? recent.reduce((s, v) => s + v, 0) / recent.length
    : 0;

  /**
   * Each condition carries where the player is now and what moves it.
   *
   * The checklist used to show only a target and a tick, which is enough
   * when a condition is a matter of time and useless when it is a matter
   * of strategy. Measured, three of these four are met comfortably by any
   * competent operator by about day 60 — this gate is really the
   * satisfaction line, and a player optimising for profit will never
   * cross it. At a tight tee interval a finished nine runs at about 35
   * satisfaction and makes more money per day than one at 69; without
   * being told, the natural read is that the door is broken rather than
   * that the strategy is wrong.
   *
   * So `now` says how close you are, and `hint` says what to do about it.
   */
  const conditions = [
    {
      key: 'holesOpen',
      met: holesOpen >= GATE_THRESHOLDS.holesOpen,
      label: `Open all ${GATE_THRESHOLDS.holesOpen} holes`,
      now: `${holesOpen} of ${GATE_THRESHOLDS.holesOpen}`,
      hint: 'Build the rest of the course, hole by hole.',
    },
    {
      key: 'money',
      met: money >= GATE_THRESHOLDS.money,
      label: `Bank $${GATE_THRESHOLDS.money.toLocaleString()}`,
      now: `$${Math.round(money).toLocaleString()}`,
      hint: 'Green fees, the pro shop and what you serve. Holding this while the course is also pleasant is the squeeze.',
    },
    {
      key: 'prestige',
      met: prestige >= GATE_THRESHOLDS.prestige,
      label: `Reach prestige ${GATE_THRESHOLDS.prestige}`,
      now: `${Math.round(prestige)}`,
      hint: 'Rises slowly from a good course and happy guests, and drifts back down toward whatever your satisfaction can hold.',
    },
    {
      key: 'satisfaction',
      met: hasEnoughHistory && averageRecent >= GATE_THRESHOLDS.satisfaction,
      label: `Hold satisfaction ${GATE_THRESHOLDS.satisfaction} for ${GATE_THRESHOLDS.satisfactionDays} days`,
      now: hasEnoughHistory
        ? `${Math.round(averageRecent)} over the last ${GATE_THRESHOLDS.satisfactionDays}`
        : `${recent.length} of ${GATE_THRESHOLDS.satisfactionDays} days recorded`,
      hint: 'The hard one. Waiting hurts it more than anything else — widen the tee interval, hire marshals, keep the turf up. A packed course earns more every day and will never pass this.',
    },
  ];

  const outstanding = conditions.filter((c) => !c.met);

  return {
    passed: outstanding.length === 0,
    // One condition short means the complaint log starts hinting at Act II.
    nearGate: outstanding.length === 1,
    outstanding: outstanding.map((c) => c.label),
    conditions,
  };
}
