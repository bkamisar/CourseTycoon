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
 *   - **the result** — the week, named condition by named condition.
 *
 * Everything on these cards is read off the report the day actually
 * produced. Nothing is recomputed, so a card cannot describe a
 * championship that did not happen or a figure the report disagrees with
 * — the bug this project produces more than any other, and one that would
 * be especially ugly here, where four numbers are being justified to the
 * player at once.
 */
import { RUNGS, contractFor } from '../sim/tournaments.js';

/** One button, for the cards that are announcements rather than choices. */
function acknowledge(label = 'Understood') {
  return [{ label, cost: '' }];
}

/**
 * How the field's round is told.
 *
 * Deliberately impersonal — no names, no leaderboard, no careers. The
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
  return `The field averaged ${over.toFixed(1)} over — ${shape}. ${broke} `
    + `The ${ordinalHole(field.hardestHole)} took the most off them.`;
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
    const bandMet = (t.met ?? []).includes('band');

    // Built from the contract's own line items, so what the card shows as
    // earned and what the day actually banked come from one source.
    // `met` is whether the condition was achieved; `paid` is whether it
    // was worth anything, which the band gates.
    const conditions = (contract?.bonuses ?? []).map((bonus) => ({
      id: bonus.id,
      label: bonus.label,
      amount: bonus.amount,
      met: (t.met ?? []).includes(bonus.id),
      paid: bandMet && (t.met ?? []).includes(bonus.id),
    }));

    const wouldPay = conditions
      .filter((c) => c.met)
      .reduce((sum, c) => sum + c.amount, contract?.baseFee ?? 0);

    const earnedNotPaid = conditions.filter((c) => c.met && !c.paid);

    const opening = bandMet
      ? `The course was set to ${t.setup}, which is where they wanted it.`
      : `The course was set to ${t.setup}. They asked for ${t.band?.low}–${t.band?.high}, `
        + 'and a venue that turns up outside the band has not staged a championship — '
        + 'whatever else went right, the week pays the base fee and nothing on top of it.';

    const money = `$${(t.paid ?? 0).toLocaleString()} against a ceiling of `
      + `$${(contract?.ceiling ?? 0).toLocaleString()}.`;

    const withheld = earnedNotPaid.length
      ? ` You did hold the ${earnedNotPaid.map((c) => c.id).join(' and the ')}, for what `
        + 'it was worth, which on a week like this is nothing.'
      : '';

    // The band governs reputation and the rung as well as the money now,
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
      kicker: bandMet && t.paid >= (contract?.ceiling ?? 0) ? 'A GOOD WEEK' : 'THE WRITE-UP',
      speaker: rung?.label ?? 'The championship',
      prompt: `${opening} ${fieldStory(t.field)} ${money}${withheld}${standing}`,
      // Read by the UI, and by tests, so the four conditions can be shown
      // individually rather than summed into a number nobody can argue
      // with.
      conditions,
      wouldPay,
      field: fieldStory(t.field),
      choices: acknowledge(bandMet ? 'Good' : 'Understood'),
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
