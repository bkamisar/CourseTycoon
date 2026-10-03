/**
 * The championship, on the decision card.
 *
 * Three moments in Act III deserve more than a grey line on the evening
 * report, for the same reason the investors got cards in Act II: the act
 * is about being judged by people outside the resort, and being judged in
 * a footnote reads like a bank statement.
 *
 *   - **the invitation** — a governing body writes. An announcement; the
 *     ladder is the act and one you could decline is one half the players
 *     never meet.
 *   - **the result** — the week: the winning score against the target
 *     they set, how the leader's total moved, then each condition by name.
 *
 * Everything on these cards is read off the report the day actually
 * produced. Nothing is recomputed, so a card cannot describe a
 * championship that did not happen or a figure the report disagrees with
 * — the bug this project produces more than any other, and one that would
 * be especially ugly here, where four numbers are being justified to the
 * player at once.
 */
import { RUNGS, contractFor } from '../sim/tournaments.js';
import { toParText } from './toPar.js';

/** One button, for the cards that are announcements rather than choices. */
function acknowledge(label = 'Understood') {
  return [{ label, cost: '' }];
}

/**
 * The field's average to par as a golfer says it: "6.2 over par",
 * "0.4 under par". Rounded to a tenth first so a value that rounds to
 * nothing reads "even par" rather than "0.0 over". (The evening report
 * words it the same way; it printed "-0.4 over" here once.)
 */
function averageText(n) {
  const tenth = Math.round(n * 10) / 10;
  if (tenth === 0) return 'even par';
  return `${Math.abs(tenth).toFixed(1)} ${tenth > 0 ? 'over' : 'under'} par`;
}

/**
 * How the field's FINAL round is told.
 *
 * `report.tournament.field` holds the last round's figures only -- the
 * earlier rounds are in the week's round log and the evening reports -- so
 * the sentence says which round it is. Passing one round off as the week
 * is how a card ends up quoting the last day's best score as the winner's
 * total; the winner comes from `week.winningTotal`.
 *
 * Deliberately impersonal -- no names, no leaderboard, no careers. The
 * field is weather with a scorecard, and what matters is how the COURSE
 * played, because that is the read-out for three weeks of conditioning.
 */
function fieldStory(field) {
  if (!field) return '';
  const over = field.averageToPar;
  const shape = over >= 8 ? 'a proper test'
    : over >= 4 ? 'a fair one'
      : over >= 1 ? 'gettable'
        : 'there for the taking';
  const broke = field.underPar === 0
    ? 'Nobody broke par.'
    : field.underPar === 1
      ? 'One player broke par.'
      : `${field.underPar} players broke par.`;
  return `In the final round, the field averaged ${averageText(over)} — ${shape}. ${broke} `
    + `The ${ordinalHole(field.hardestHole)} took the most off them.`;
}

/**
 * The week in a sentence: where the leader stood after the first round
 * and how it moved. Not a table -- the evening reports had the detail.
 * Empty for a week with fewer than two rounds logged, or a log without
 * scores, rather than inventing a story.
 */
function weekStory(week) {
  const log = week?.roundLog ?? [];
  if (log.length < 2) return '';
  const first = log[0];
  const last = log.at(-1);
  if (!Number.isFinite(first.leaderToPar) || !Number.isFinite(last.leaderToPar)) return '';
  const moved = last.leaderToPar - first.leaderToPar;
  const toughened = log.slice(1).some((r) => r.pins === 'tough' || r.pins === 'brutal');
  const eased = log.slice(1).some((r) => r.pins === 'easy');
  const steer = toughened && !eased ? ' The pins went in harder as the week went on.'
    : eased && !toughened ? ' The pins came out easier as the week went on.'
      : '';
  const drift = moved === 0
    ? 'was still there at the end'
    : `${moved > 0 ? 'gave back' : 'found'} ${Math.abs(moved)} by the end`;
  return `The leader was ${toParText(first.leaderToPar)} after the first round and ${drift}.${steer}`;
}

/** "14th", "3rd" — a hole number as somebody would say it aloud. */
function ordinalHole(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * The cards this evening earns, in the order they should be shown.
 *
 * Returns an array so an evening that both invites you and reports a
 * result shows both, rather than picking one and dropping the other.
 */
export function championshipCards(report, state) {
  const cards = [];
  if (!report) return cards;

  // --- The letter -----------------------------------------------------
  if (report.actThreeArrived) {
    cards.push({
      id: 'championship-invitation',
      kicker: 'A LETTER',
      speaker: 'The governing body',
      prompt:
        'Headed paper, and a tone that assumes you already know who they are. They have '
        + 'had their eye on the course for a while, they say, and now that the eighteen is '
        + 'finished and the ownership is settled they would like to know whether you would '
        + 'consider hosting. They start people at the County Open. Nobody outside the county '
        + 'will hear about it, which is rather the point of starting there.',
      choices: acknowledge('Read it twice'),
    });
  }

  // --- The week -------------------------------------------------------
  const t = report.tournament;
  if (t) {
    const rung = RUNGS[t.rung];
    const contract = contractFor(t.rung);
    const targetMet = (t.met ?? []).includes('target');

    // Built from the contract's own line items, so what the card shows as
    // earned and what the day actually banked come from one source.
    // `met` is whether the condition was achieved; `paid` is whether it
    // was worth anything, which the target gates.
    const conditions = (contract?.bonuses ?? []).map((bonus) => ({
      id: bonus.id,
      label: bonus.label,
      amount: bonus.amount,
      met: (t.met ?? []).includes(bonus.id),
      paid: targetMet && (t.met ?? []).includes(bonus.id),
    }));

    const wouldPay = conditions
      .filter((c) => c.met)
      .reduce((sum, c) => sum + c.amount, contract?.baseFee ?? 0);

    const earnedNotPaid = conditions.filter((c) => c.met && !c.paid);

    // The week is judged on the winner's total against the target, and a
    // course under the difficulty floor is its own failure, told as that:
    // a course that was too easy has not been tested, whatever the field
    // shot. Difficulty is printed to the tenth because the report stores it
    // floored to one, and "45 against at least 45" would read as a pass.
    const w = t.week ?? {};
    const range = w.target
      ? `${toParText(w.target.low)} to ${toParText(w.target.high)}`
      : '';
    const opening = t.difficultyMet === false
      ? `The course measured ${t.difficulty.toFixed(1)} on the first morning, and they had asked `
        + `for at least ${t.minDifficulty}. A venue that easy has not staged a championship, whatever `
        + 'the field shot — the week pays the base fee and nothing on top of it.'
      : targetMet
        ? `The winner finished ${toParText(w.winningTotal)}, inside the ${range} they wanted.`
        : `The winner finished ${toParText(w.winningTotal)}. They wanted ${range}, and a week that `
          + 'misses it has not tested the field — the base fee, and nothing on top of it.';

    const money = `$${(t.paid ?? 0).toLocaleString()} against a ceiling of `
      + `$${(contract?.ceiling ?? 0).toLocaleString()}.`;

    const withheld = earnedNotPaid.length
      ? ` You did hold the ${earnedNotPaid.map((c) => c.id).join(' and the ')}, for what `
        + 'it was worth, which on a week like this is nothing.'
      : '';

    // The target governs reputation and the rung as well as the money now,
    // so this can simply read what happened rather than working around a
    // simulation that disagreed with it. It used to be possible to miss
    // the band and GAIN nine points of reputation, which had the card
    // printing "you have not staged a championship" and "word gets round
    // in your favour" two sentences apart.
    const standing = t.barDays > 0
      ? ` They will give the ${rung?.label ?? 'rung'} to somebody else for ${t.barDays} days, `
        + 'and the write-up will be read by people who were not there.'
      : t.prestige > 0
        ? ' Word gets round, and it gets round in your favour.'
        : '';

    cards.push({
      id: `championship-result-${report.day ?? ''}`,
      kicker: targetMet && t.paid >= (contract?.ceiling ?? 0) ? 'A GOOD WEEK' : 'THE WRITE-UP',
      speaker: rung?.label ?? 'The championship',
      prompt: [opening, weekStory(t.week), fieldStory(t.field)].filter(Boolean).join(' ')
        + ` ${money}${withheld}${standing}`,
      // Read by the UI, and by tests, so the four conditions can be shown
      // individually rather than summed into a number nobody can argue
      // with.
      conditions,
      wouldPay,
      field: fieldStory(t.field),
      choices: acknowledge(targetMet ? 'Good' : 'Understood'),
    });
  }

  // --- The act is finished --------------------------------------------
  //
  // After the write-up, because the write-up is about the week and this is
  // about what the week meant.
  if (report.actThreePassed) {
    cards.push({
      id: 'championship-act-passed',
      kicker: 'A NATIONAL OPEN, HOSTED',
      speaker: 'The governing body',
      prompt:
        'A different letter this time, and a shorter one. They thank you for the week, they '
        + 'note that the course held up, and they say -- in the flattest possible terms, which '
        + 'from them is effusive -- that they would have no hesitation in coming back. '
        + 'Somewhere between the county open and this, the place stopped being a resort that '
        + 'hosts championships and became a championship venue that takes guests.',
      choices: acknowledge('Frame it'),
    });
  }

  return cards;
}
