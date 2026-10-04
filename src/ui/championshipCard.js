/**
 * The championship, on the decision card.
 *
 * Four moments in Act III deserve more than a grey line on the evening
 * report, for the same reason the investors got cards in Act II: the act
 * is about being judged by people outside the resort, and being judged in
 * a footnote reads like a bank statement.
 *
 *   - **the invitation** — a governing body writes. An announcement; the
 *     ladder is the act and one you could decline is one half the players
 *     never meet.
 *   - **the practice round** — mid-run-up, the officials play the course
 *     as it will be laid out on the first morning and say what a field
 *     would shoot on it. Information, with nothing to decide.
 *   - **the result** — the week: the winning score against the target
 *     they set, how the leader's total moved, then each condition by name.
 *   - **the act passed** — the governing body's last, short letter once the
 *     ladder is climbed.
 *
 * Everything on these cards is read off the report the day actually
 * produced. Nothing is recomputed, so a card cannot describe a
 * championship that did not happen or a figure the report disagrees with
 * — the bug this project produces more than any other, and one that would
 * be especially ugly here, where four numbers are being justified to the
 * player at once.
 */
import { RUNGS, contractFor } from '../sim/tournaments.js';
import { PIN_IDS } from '../sim/championshipWeek.js';
import { toParText, averageToParText } from './toPar.js';

/** One button, for the cards that are announcements rather than choices. */
function acknowledge(label = 'Understood') {
  return [{ label, cost: '' }];
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
  // The band is picked from the tenth the text prints, so "gettable" never
  // sits beside a figure that reads as something else.
  const over = Math.round(field.averageToPar * 10) / 10;
  const shape = over >= 8 ? 'a proper test'
    : over >= 4 ? 'a fair one'
      : over >= 1 ? 'gettable'
        : 'there for the taking';
  const broke = field.underPar === 0
    ? 'Nobody broke par.'
    : field.underPar === 1
      ? 'One player broke par.'
      : `${field.underPar} players broke par.`;
  return `In the final round, the field averaged ${averageToParText(over)} — ${shape}. ${broke} `
    + `The ${ordinalHole(field.hardestHole)} took the most off them.`;
}

/**
 * The week in a sentence: where the lead stood after the first round and
 * where it ended. Said of the SCORE, not a person -- the player leading
 * after round one need not be the one leading at the end, and the card
 * must not suggest they are. Not a table -- the evening reports had the
 * detail. Empty for a week with fewer than two rounds logged, or a log
 * without scores, rather than inventing a story.
 *
 * The pins are compared with the FIRST round's, by their order in
 * `PIN_IDS`. "Harder" only when some later round was set harder than the
 * opener and none easier, and likewise "easier"; a week that went both
 * ways, or stayed put, says nothing. Comparing against a fixed word
 * ("tough") told a week that opened tough and stayed tough that the pins
 * "went in harder".
 */
function weekStory(week) {
  const log = week?.roundLog ?? [];
  if (log.length < 2) return '';
  const first = log[0];
  const last = log.at(-1);
  if (!Number.isFinite(first.leaderToPar) || !Number.isFinite(last.leaderToPar)) return '';
  const opened = PIN_IDS.indexOf(first.pins);
  const later = log.slice(1).map((r) => PIN_IDS.indexOf(r.pins));
  const known = opened >= 0 && later.every((i) => i >= 0);
  const harder = known && later.some((i) => i > opened);
  const easier = known && later.some((i) => i < opened);
  const steer = harder && !easier ? ' The pins went in harder as the week went on.'
    : easier && !harder ? ' The pins came out easier as the week went on.'
      : '';
  const a = toParText(first.leaderToPar);
  const b = toParText(last.leaderToPar);
  const lead = first.leaderToPar === last.leaderToPar
    ? `The lead was ${a} after the first round and the same at the end.`
    : `The lead was ${a} after the first round and ${b} by the end.`;
  return lead + steer;
}

/** "14th", "3rd" — a hole number as somebody would say it aloud. */
function ordinalHole(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * The officials' practice round (run-up spec 2026-10-04 §2), told from
 * `report.practiceRound` and nothing else.
 *
 * Kept short for a phone: the setup it assumed, the forecast and its
 * range, the target, the difficulty against the floor, and a clause on
 * each saying which way it misses -- the decision the card exists to
 * prompt, with ten days left to act on it. "As it will be laid out on the
 * first morning" because it is tonight's design over every open hole, a
 * decision event's temporary closure being ignored for a championship
 * (day.js); "a projection" because a redesign, a new target or a
 * different crew changes the real week, and the weather and the field's
 * luck are not in it.
 *
 * The setup is rounded like the sheet's "Course is set to"; the
 * difficulty is floored to a tenth like the result card, so 64.96 against
 * a floor of 65 does not print as "65.0".
 */
function practiceCard(report) {
  const p = report.practiceRound;
  if (!p) return null;
  const forecast = `a field would win at about ${toParText(p.median)}, most likely `
    + `${toParText(p.low)} to ${toParText(p.high)}.`;
  const wanted = p.target
    ? ` They want ${toParText(p.target.low)} to ${toParText(p.target.high)}`
      + (p.median < p.target.low ? ' — on these numbers, too easy.'
        : p.median > p.target.high ? ' — on these numbers, too hard.'
          : '.')
    : '';
  // Compared unfloored, as the judge compares it; printed floored.
  const measured = typeof p.difficulty === 'number' && p.minDifficulty != null
    ? ` The course measures ${(Math.floor(p.difficulty * 10) / 10).toFixed(1)} against `
      + `their minimum of ${p.minDifficulty}`
      + (p.difficulty < p.minDifficulty ? ' — short of it.' : '.')
    : '';
  return {
    id: `practice-round-${report.day ?? ''}`,
    kicker: 'THE PRACTICE ROUND',
    speaker: 'The governing body',
    prompt: 'The officials played it today. On the course as it will be laid out on the first '
      + `morning, with the greens where your crew should have them (${Math.round(p.setupAtRoundOne)}), `
      + `${forecast}${wanted}${measured} A projection, not a promise.`,
    choices: acknowledge('Noted'),
  };
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

  // --- The practice round ---------------------------------------------
  //
  // Before any result card: it is about a week still to come. (The two
  // cannot share an evening today -- the practice is eleven days before
  // round 1 -- but the order is the one the spec asks for if they ever do.)
  const practice = practiceCard(report);
  if (practice) cards.push(practice);

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
    // floored to a tenth, and "45 against at least 45" would read as a pass.
    const w = t.week ?? {};
    const range = w.target
      ? `${toParText(w.target.low)} to ${toParText(w.target.high)}`
      : '';
    // No target on the report (it should always be there) reads as a plain
    // statement rather than printing an empty range.
    const measured = typeof t.difficulty === 'number'
      ? `The course measured ${t.difficulty.toFixed(1)} on the first morning`
      : 'The course was not hard enough on the first morning';
    const winner = `The winner finished ${toParText(w.winningTotal)}`;
    const opening = t.difficultyMet === false
      ? `${measured}, and they had asked for at least ${t.minDifficulty}. A venue that easy `
        + 'has not staged a championship, whatever the field shot — the week pays the base '
        + 'fee and nothing on top of it.'
      : targetMet
        ? (range ? `${winner}, inside the ${range} they wanted.` : `${winner}, which suited them.`)
        : `${winner}. ${range ? `They wanted ${range}, and a` : 'A'} week that misses the target `
          + 'has not tested the field — the base fee, and nothing on top of it.';

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

    // A good week is one the venue delivered: the target, the turf and the
    // pace, the three things the host controls on the course. It used to
    // need the whole ceiling, which needs the crowd bonus too -- and the
    // National's crowd bonus is out of reach for a sensible resort (its
    // gallery needs the short course, $0.99M-$1.25M of lost trade over 240
    // days for a $92,560 bonus; see docs/known-issues.md), so the National,
    // the week the act is for, could never be called a good one.
    const goodWeek = ['target', 'turf', 'pace'].every((id) => (t.met ?? []).includes(id));

    cards.push({
      id: `championship-result-${report.day ?? ''}`,
      kicker: goodWeek ? 'A GOOD WEEK' : 'THE WRITE-UP',
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
