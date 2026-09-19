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

  const conditions = [
    { key: 'holesOpen', met: holesOpen >= GATE_THRESHOLDS.holesOpen,
      label: `Open all ${GATE_THRESHOLDS.holesOpen} holes` },
    { key: 'money', met: money >= GATE_THRESHOLDS.money,
      label: `Bank $${GATE_THRESHOLDS.money.toLocaleString()}` },
    { key: 'prestige', met: prestige >= GATE_THRESHOLDS.prestige,
      label: `Reach prestige ${GATE_THRESHOLDS.prestige}` },
    { key: 'satisfaction',
      met: hasEnoughHistory && averageRecent >= GATE_THRESHOLDS.satisfaction,
      label: `Hold satisfaction ${GATE_THRESHOLDS.satisfaction} for ${GATE_THRESHOLDS.satisfactionDays} days` },
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
