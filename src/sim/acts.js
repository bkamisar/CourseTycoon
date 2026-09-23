/** Act I gate thresholds. Tuned later by tools/balance.js. */
/**
 * Act I gate thresholds.
 *
 * Set against a measured frontier rather than picked, and re-set once the
 * catchment ceiling and turf wear landed, because those moved every
 * number underneath them. On a finished nine with four groundskeepers,
 * thirty days, two seeds:
 *
 *                 fee $40      $60        $80       $100
 *     20 min    78/  $246  73/$2,146  69/$3,766  69/$2,057
 *     24 min    81/  $174  76/$2,046  71/$3,430  70/$1,037
 *     28 min    81/ -$263  76/$1,438  71/$2,571  70/  $303
 *
 * The money optimum sits at satisfaction 69. Everything above that costs
 * profit, and roughly half of it by satisfaction 76. So the satisfaction
 * line is set **above the money optimum on purpose**: clearing it means
 * deliberately leaving money on the table, which is the decision this act
 * is supposed to be about and which it did not previously ask for at all.
 *
 * The old thresholds asked for nothing the money optimum did not already
 * hand over -- satisfaction 60 against an optimum that produced 70 -- so
 * all four conditions fell out of playing greedily, and the gate opened on
 * day 13.
 */
export const GATE_THRESHOLDS = {
  holesOpen: 9,
  money: 75000,
  prestige: 50,
  satisfaction: 72,
  satisfactionDays: 10,
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
   * competent operator by about day 60, so this gate is really the
   * satisfaction line.
   *
   * It used to say here that a packed course out-earns a pleasant one, so
   * a player optimising for profit would never cross this line. **That is
   * no longer true, and it is not clear it ever was.** The figure behind
   * it ("about 35 satisfaction") was taken on a fixture that claimed to
   * be a nine and built eighteen, and it predates the word-of-mouth
   * change that made a good reputation compound. Re-measured on a real
   * nine, fifteen days, one seed:
   *
   *     tee every  6 min -> satisfaction 30, profit   $918/day
   *     tee every  8 min -> satisfaction 34, profit   $470/day
   *     tee every 13 min -> satisfaction 42, profit   $598/day
   *     tee every 20 min -> satisfaction 69, profit $4,097/day
   *
   * The pleasant course is now both the happiest and comfortably the
   * richest, which means the tension this gate was built around may have
   * gone. One seed on one fixture with no operator is a signal and not a
   * conclusion -- `tools/balance.js` is what settles it -- but nothing
   * here should be read as established until it does.
   *
   * `now` says how close you are and `hint` says what to do about it,
   * which is worth having either way.
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
