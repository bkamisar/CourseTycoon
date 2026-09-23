/**
 * The investors, on the decision card.
 *
 * Act II's whole pressure came through as small grey lines on the evening
 * report: the investors arrived in a sentence, judged you in a sentence,
 * and called their money in in a sentence. The act is about a
 * relationship with people who can take the hotel away, and it read like
 * a bank statement. Reported from play as wanting "a more grand decision
 * card style thing for the investors".
 *
 * So the moments that are actually moments borrow the card the decision
 * events use. Four of them:
 *
 *   - **arrival** — they turn up the day Act I is passed, with the first
 *     target already named. An announcement: the design says this
 *     mechanic is not declinable, because one you can refuse is one half
 *     the players never meet.
 *   - **review** — every fortnight, the verdict. An announcement.
 *   - **settlement** — they offer to sell, or demand their money back.
 *     The only genuine decision here, and the only card with two buttons.
 *   - **the end** — bought out, or liquidated.
 *
 * Everything on these cards is read off the report the day actually
 * produced. Nothing is recomputed, so a card cannot describe a review
 * that did not happen or a figure the report disagrees with — the bug
 * this project produces more than any other, and one that would be
 * especially ugly here, since these cards are the act's voice.
 */
import { MEASURE_LABEL } from '../sim/investors.js';

/** A target in the units the measure is really in, matching the report's
 * own formatting. An occupancy of 0.62 shown as "0.62" hands the player a
 * ratio when it means a percentage. */
function fmt(measure, value) {
  if (measure === 'occupancy') return `${Math.round(value * 100)}%`;
  if (measure === 'revenuePerRoom') return `$${Math.round(value)}`;
  return String(Math.round(value));
}

/** How each review outcome is spoken. Keyed by the outcome names
 * `assessTarget` returns, so a new outcome cannot silently fall through
 * to a generic line. */
const VERDICT = {
  beat: {
    kicker: 'THE REVIEW',
    tone: 'good',
    say: (t, actual) =>
      `You were asked for ${fmt(t.measure, t.threshold)} and you delivered `
      + `${fmt(t.measure, actual)}. They are pleased, and they are not easily pleased.`,
  },
  met: {
    kicker: 'THE REVIEW',
    tone: 'good',
    say: (t, actual) =>
      `${fmt(t.measure, actual)} against the ${fmt(t.measure, t.threshold)} they asked for. `
      + 'Met, which is what they expect, and what they will expect again.',
  },
  missed: {
    kicker: 'THE REVIEW',
    tone: 'bad',
    say: (t, actual) =>
      `They wanted ${fmt(t.measure, t.threshold)}. You brought them `
      + `${fmt(t.measure, actual)}. Nobody raises their voice. It is noted.`,
  },
  failed: {
    kicker: 'THE REVIEW',
    tone: 'bad',
    say: (t, actual) =>
      `${fmt(t.measure, t.threshold)} was the number. ${fmt(t.measure, actual)} is what there is. `
      + 'This is the part of the meeting where somebody asks whether the plan was ever realistic.',
  },
};

/** One button, for the cards that are announcements rather than choices. */
function acknowledge(label = 'Understood') {
  return [{ label, cost: '' }];
}

/**
 * The cards this evening earns, in the order they should be shown.
 *
 * Returns an array so a day that both reviews you and raises a demand
 * shows both, in the order they happened, rather than picking one and
 * dropping the other.
 *
 * `state` is the resolved state for the day, used only for what the
 * player can afford — every claim about the game itself comes from
 * `report`.
 */
export function investorCards(report, state) {
  const inv = report?.investors;
  const cards = [];
  if (!inv) return cards;

  // --- They arrive ----------------------------------------------------
  if (report.investorsArrived) {
    const target = inv.target;
    cards.push({
      id: 'investors-arrive',
      kicker: 'THEY HAVE BOUGHT IN',
      speaker: 'The investors',
      prompt:
        'Three of them, and a folder. They like what the course has become and they '
        + 'would like to put a hotel on it — their money, your name over the door, '
        + 'and a conversation like this one every fortnight.'
        + (target
          ? ` The first thing they want to see is ${MEASURE_LABEL[target.measure]} `
            + `of ${fmt(target.measure, target.threshold)} by day ${target.dueDay}.`
          : ''),
      choices: acknowledge('Shake on it'),
    });
  }

  // --- They judge you -------------------------------------------------
  if (inv.reviewed) {
    const spec = VERDICT[inv.reviewed.outcome];
    if (spec) {
      const change = inv.reviewed.change;
      const moved = change === 0
        ? 'Confidence holds where it was.'
        : `Confidence ${change > 0 ? 'up' : 'down'} ${Math.abs(Math.round(change))}, `
          + `to ${Math.round(inv.confidence)} of 100.`;
      const next = inv.target
        ? ` Next they want ${MEASURE_LABEL[inv.target.measure]} of `
          + `${fmt(inv.target.measure, inv.target.threshold)} by day ${inv.target.dueDay}.`
        : '';
      cards.push({
        id: `investors-review-${report.day ?? ''}`,
        kicker: spec.kicker,
        speaker: 'The investors',
        prompt: `${spec.say(inv.reviewed, inv.reviewed.actual)} ${moved}${next}`,
        choices: acknowledge(spec.tone === 'good' ? 'Good' : 'Understood'),
      });
    }
  }

  // --- They want out, or they want to sell ----------------------------
  if (inv.demandRaised && inv.buyoutDemand) {
    const demand = inv.buyoutDemand;
    const offer = demand.kind === 'offer';
    const affordable = (state?.money ?? 0) >= demand.amount;
    cards.push({
      id: 'investors-settlement',
      kicker: offer ? 'AN OFFER' : 'THEY WANT OUT',
      speaker: 'The investors',
      prompt: offer
        ? 'They have watched this place run well for long enough to think it does not '
          + `need them. They will sell you their stake for $${demand.amount.toLocaleString()}. `
          + `The offer stands until day ${demand.dueDay}, and after that it is simply gone.`
        : 'The folder is thinner this time. They want their money back — '
          + `$${demand.amount.toLocaleString()}, by day ${demand.dueDay}. `
          + 'If it is not there, they will take it out of the rooms.',
      choices: [
        {
          label: `Pay $${demand.amount.toLocaleString()} now`,
          cost: affordable ? '' : 'not enough in the bank',
          disabled: !affordable,
          // Read by main.js. Named rather than a function so a card
          // stays plain data and can be asserted against in a test.
          effect: 'payBuyout',
        },
        {
          label: offer ? 'Leave it for now' : 'Find the money later',
          cost: `until day ${demand.dueDay}`,
        },
      ],
    });
  }

  // --- How it ends ----------------------------------------------------
  if (inv.liquidated) {
    cards.push({
      id: 'investors-liquidated',
      kicker: 'THEY TOOK IT',
      speaker: 'The investors',
      prompt:
        'The deadline came and the money was not there, so they took it out of the '
        + 'building. Rooms sold, contracts closed, nobody rude about it. What is left '
        + 'of the hotel is yours, and so is the course. Nobody is coming to check on '
        + 'you again.',
      choices: acknowledge('Get on with it'),
    });
  } else if (inv.boughtToday) {
    cards.push({
      id: 'investors-bought',
      kicker: 'IT IS YOURS',
      speaker: 'The investors',
      prompt:
        'Paid in full. They shake hands, say something gracious about the greens, and '
        + 'go. No more fortnightly folders, no more numbers to hit for somebody else. '
        + 'The hotel and the course are yours outright.',
      choices: acknowledge('Yours'),
    });
  }

  return cards;
}
