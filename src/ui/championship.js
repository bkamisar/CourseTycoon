/**
 * The championship sheet: infrastructure, the ladder, and the dial.
 *
 * Act III's whole decision surface. Until this existed the act was
 * complete in simulation and unreachable in play — nothing called
 * `bidFor`, so `state.tournament` was never set, and a player who finished
 * Act II simply kept playing Act II.
 *
 * `computeChampionshipData` is pure and is what the tests exercise; the
 * mount function below is DOM plumbing, which this project does not test
 * (see `tests/report.test.js`, which tests `computeReportData` and never
 * touches `mountReport`).
 *
 * Everything the sheet claims is read off the simulation rather than
 * recomputed here, because the bug this project produces more than any
 * other is the interface telling the player something the simulation
 * disagrees with.
 */
import { openHoles, playableHoles, amenity } from '../sim/state.js';
import {
  RUNG_IDS, RUNGS, contractFor, nextRungFor, eligibleFor, withinBand, bidFor,
  CHAMPIONSHIP_HOLES, RUN_UP_DAYS,
} from '../sim/tournaments.js';
import {
  CHAMPIONSHIP_BUILDINGS, CHAMPIONSHIP_BUILDING_IDS,
  galleryCapacity, galleryFor, crowdHandledFor,
} from '../sim/championshipBuildings.js';
import { courseDifficultyOf } from '../sim/hole.js';
import {
  normaliseWeek, championshipStatus, withPins, PINS, PIN_IDS,
} from '../sim/championshipWeek.js';
import { weatherOn, effectsOf } from '../sim/weather.js';
import { toParText } from './toPar.js';
import { PALETTE } from '../render/palette.js';

/**
 * Why a rung cannot be applied for, in words the player can act on.
 *
 * A disabled button with no reason is the same fault as a cost line that
 * does not say what it buys.
 */
function missingFor(state, rungId) {
  const rung = RUNGS[rungId];
  const reasons = [];
  const holes = openHoles(state).length;
  if (holes < CHAMPIONSHIP_HOLES) {
    reasons.push(`${CHAMPIONSHIP_HOLES} open holes (you have ${holes})`);
  }
  if (state.prestige < rung.prestige) {
    reasons.push(`prestige ${rung.prestige} (you have ${Math.round(state.prestige)})`);
  }
  const built = new Set((state.resort.amenities ?? []).map((a) => a.type));
  for (const id of rung.requires) {
    if (!built.has(id)) reasons.push(CHAMPIONSHIP_BUILDINGS[id]?.label ?? id);
  }
  return reasons;
}

/** Everything the sheet needs, and nothing it recomputes. */
export function computeChampionshipData(state) {
  const holesOpen = openHoles(state).length;
  const hosted = state.tournamentsHosted ?? [];
  const nextId = nextRungFor(hosted);
  const booked = state.tournament && !state.tournament.resolved ? state.tournament : null;

  // The booked rung wins. While a national is being prepared for, every
  // number on this sheet has to be about the national -- a gallery figure
  // quietly describing the NEXT rung would tell a player mid-run-up that
  // their crowd was covered when it is not.
  const subject = booked?.rung ?? nextId;
  const needed = galleryFor(subject);
  const capacity = galleryCapacity(state.resort.amenities ?? []);

  const setup = Math.round(state.resort.setup ?? 0);
  const target = Math.round(state.resort.setupTarget ?? 0);
  const band = subject ? RUNGS[subject].band : null;
  // The course's difficulty against the rung's floor, from the same
  // selector as the HUD so the two cannot disagree with each other or with
  // the judge (it measures the playable holes, and keeps the figure the
  // week settled on its first morning). With nothing booked there is no
  // week to settle anything, so the live measure of the playable holes.
  const status = championshipStatus(state);
  const rawDifficulty = status ? status.difficulty : courseDifficultyOf(playableHoles(state));
  // A missed rung stays the next rung and is given to somebody else for a
  // while (bidFor refuses it until the day after). Without this the sheet
  // offered an Apply button that did nothing when pressed.
  const barredUntil = nextId ? (state.tournamentBars?.[nextId] ?? 0) : 0;
  const barred = state.day <= barredUntil;

  return {
    money: state.money,
    // Floored, not rounded: 64.6 against a floor of 65 must not read as met.
    difficulty: Math.floor(rawDifficulty),
    runUpDays: RUN_UP_DAYS,
    next: nextId
      ? {
          id: nextId,
          label: RUNGS[nextId].label,
          blurb: RUNGS[nextId].blurb,
          band: RUNGS[nextId].band,
          rounds: RUNGS[nextId].rounds,
          target: RUNGS[nextId].target,
          minDifficulty: RUNGS[nextId].minDifficulty,
          difficultyMet: rawDifficulty >= RUNGS[nextId].minDifficulty,
          prepPerDay: RUNGS[nextId].prepPerDay,
          eligible: !barred && eligibleFor(nextId, {
            prestige: state.prestige, resort: state.resort, holesOpen,
          }),
          barredUntil: barred ? barredUntil : null,
          missing: missingFor(state, nextId),
        }
      : null,
    contract: nextId ? contractFor(nextId) : null,
    booked: booked
      ? {
          rung: booked.rung,
          label: RUNGS[booked.rung].label,
          daysLeft: Math.max(0, booked.day - state.day),
          band: RUNGS[booked.rung].band,
          prepPerDay: RUNGS[booked.rung].prepPerDay,
          contract: contractFor(booked.rung),
          rounds: status.rounds,
          roundsPlayed: status.roundsPlayed,
          target: status.target,
          minDifficulty: status.minDifficulty,
          difficultyMet: status.difficultyMet,
          difficultyFrozen: status.difficultyFrozen,
          inWeek: status.inWeek,
          leaderToPar: status.leaderToPar,
          projectedTotal: status.projectedTotal,
          roundLog: status.week.roundLog,
          pins: status.week.roundSettings.pins,
          pinChoices: PIN_IDS.map((id) => PINS[id]),
          // Today's, because the pins are set in the morning for the round
          // about to be played -- and the forecast is the weather, read
          // early (weather.js), so this cannot disagree with the day.
          weather: effectsOf(weatherOn(state.weatherSeed ?? 1, state.day)),
          // The field tees off at the resort's own interval (day.js passes
          // pricing.teeInterval to playField), which makes it the week's
          // pace lever -- and nothing on the sheet said so.
          teeInterval: state.resort.pricing?.teeInterval ?? null,
        }
      : null,
    dial: {
      setup,
      target,
      band,
      // Two different questions: is the course where they suggest, and is
      // the player asking the crew for somewhere they suggest. Information,
      // not the verdict -- the week is judged on the winning score, and the
      // band is the governing body's advice for a course at the rung's
      // minimum difficulty (see `dialNote`).
      targetInBand: band ? withinBand(target, band) : false,
      inBand: band ? withinBand(setup, band) : false,
      arrived: target > 0 && setup >= target,
    },
    gallery: {
      needed,
      capacity,
      handled: subject ? crowdHandledFor(state.resort.amenities ?? [], subject) : false,
    },
    buildings: CHAMPIONSHIP_BUILDING_IDS.map((id) => {
      const spec = CHAMPIONSHIP_BUILDINGS[id];
      const built = (state.resort.amenities ?? []).some((a) => a.type === id);
      return {
        id,
        label: spec.label,
        blurb: spec.blurb,
        build: spec.build,
        upkeep: spec.upkeep,
        gallery: spec.gallery,
        forRung: RUNGS[spec.rung]?.label ?? spec.rung,
        built,
        affordable: state.money >= spec.build,
      };
    }),
    ladder: RUNG_IDS.map((id) => ({
      id,
      label: RUNGS[id].label,
      hosted: hosted.includes(id),
      band: RUNGS[id].band,
      baseFee: RUNGS[id].baseFee,
      ceiling: RUNGS[id].purseCeiling,
    })),
  };
}

// --- The sheet itself -------------------------------------------------

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .champ-row {
      border-top: 2px solid ${PALETTE.UI_DARK};
      padding: 10px 0;
    }
    .champ-title { font-weight: bold; color: ${PALETTE.UI_LIGHT}; }
    .champ-detail { font-size: 12px; color: ${PALETTE.SAND}; margin-top: 2px; }
    .champ-blurb { font-size: 12px; color: ${PALETTE.UI_LIGHT}; margin-top: 4px; opacity: 0.85; }
    .champ-build, .champ-apply, .champ-step {
      font-family: inherit; font-size: 12px; cursor: pointer;
      background: ${PALETTE.UI_DARK}; color: ${PALETTE.ACCENT};
      border: 2px solid ${PALETTE.ACCENT}; padding: 6px 10px; margin-top: 6px;
    }
    .champ-build:disabled, .champ-apply:disabled {
      color: ${PALETTE.SAND}; border-color: ${PALETTE.SAND}; cursor: default; opacity: 0.6;
    }
    .champ-built-tag { font-size: 11px; color: ${PALETTE.FAIRWAY}; margin-top: 6px; display: inline-block; }
    .champ-dial { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
    .champ-dial-value { font-weight: bold; color: ${PALETTE.ACCENT}; min-width: 3em; }
    .champ-ok { color: ${PALETTE.FAIRWAY}; }
    .champ-off { color: ${PALETTE.SAND}; }
    .champ-line { font-size: 12px; color: ${PALETTE.UI_LIGHT}; display: flex; justify-content: space-between; }
    .champ-heading {
      font-weight: bold; color: ${PALETTE.ACCENT}; margin-top: 14px;
      text-transform: uppercase; font-size: 12px; letter-spacing: 1px;
    }
  `;
  document.head.appendChild(style);
}

function line(label, value, className) {
  const row = document.createElement('div');
  row.className = 'champ-line';
  const left = document.createElement('span');
  left.textContent = label;
  const right = document.createElement('span');
  right.textContent = value;
  if (className) right.className = className;
  row.append(left, right);
  return row;
}

function heading(text) {
  const el = document.createElement('div');
  el.className = 'champ-heading';
  el.textContent = text;
  return el;
}

/**
 * The morning call. Only while the week is under way: the pins are the
 * one decision a round asks for, set against the leader and the weather.
 */
function weekSection(data, state, commit) {
  const wrap = document.createElement('div');
  wrap.className = 'champ-row';
  const b = data.booked;
  wrap.appendChild(heading(`${b.label} · Round ${b.roundsPlayed + 1} of ${b.rounds}`));
  wrap.appendChild(line('Leader', toParText(b.leaderToPar)));
  // The leader's total is for the rounds played; the target is for the
  // whole week. The pace line puts them on the same footing.
  if (b.projectedTotal !== null) {
    wrap.appendChild(line('On pace for', toParText(b.projectedTotal),
      b.projectedTotal >= b.target.low && b.projectedTotal <= b.target.high ? 'champ-ok' : 'champ-off'));
  }
  wrap.appendChild(line('Target', `${toParText(b.target.low)} to ${toParText(b.target.high)}`));
  wrap.appendChild(line('Today', b.weather.label));

  const pinsLabel = document.createElement('div');
  pinsLabel.className = 'champ-detail';
  pinsLabel.textContent = `${b.weather.note} Where do the pins go?`;
  wrap.appendChild(pinsLabel);

  const pins = document.createElement('div');
  pins.className = 'champ-dial';
  pins.setAttribute('role', 'group');
  pins.setAttribute('aria-label', 'Pins for this round');
  for (const choice of b.pinChoices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'champ-step';
    button.textContent = choice.label;
    button.setAttribute('aria-pressed', String(choice.id === b.pins));
    if (choice.id === b.pins) button.classList.add('champ-ok');
    button.addEventListener('click', () => {
      const next = structuredClone(state);
      next.tournament = withPins(normaliseWeek(next.tournament), choice.id);
      commit(next);
    });
    pins.appendChild(button);
  }
  wrap.appendChild(pins);

  const note = document.createElement('div');
  note.className = 'champ-detail';
  note.textContent = PINS[b.pins].blurb;
  wrap.appendChild(note);

  // Pace is judged on every round, and the interval is the lever for it.
  // 22 is the operator's measurement (FIELD_TEE_INTERVAL in
  // tools/operator.js, 2026-10-03): the widest any rung needed to stop
  // failing pace on anything but the weather. The course is shut on a
  // round day, so a wider interval costs nothing.
  if (b.teeInterval !== null) {
    const pace = document.createElement('div');
    pace.className = 'champ-detail';
    pace.textContent = `The field tees off at your tee interval, ${b.teeInterval} min. `
      + 'Wider keeps the rounds on pace; 22 holds a National.';
    wrap.appendChild(pace);
  }
  return wrap;
}

/**
 * What the sheet says under the dial about the target the crew are asked for.
 *
 * The band used to be the judge, and this said so ("will not score ... is
 * judged between"). It is now the governing body's suggestion for a course
 * at the rung's minimum difficulty, and the week is judged on the winning
 * score -- so outside the band is a risk in a direction, not a verdict. A
 * course well past the minimum plays harder on its own and may want a
 * softer setup than the band to keep the winner in range.
 */
export function dialNote(dial, band) {
  if (withinBand(dial.target, band)) {
    return 'The crew work toward this and stop when they reach it. Firm greens are what a championship wants and what a Tuesday fourball hates, so the everyday trade pays for it until the week arrives.';
  }
  return dial.target < band.low
    ? `Asking for ${dial.target}, under their ${band.low}–${band.high}. On a course near the minimum difficulty the field may take it apart; one well past the minimum may want it this soft.`
    : `Asking for ${dial.target}, over their ${band.low}–${band.high}. Firm enough to risk pushing the winner over the target, more so on a course past the minimum.`;
}

/**
 * The dial. Only drawn while something is booked, because setting a target
 * with nothing to prepare for is a slider that does nothing.
 *
 * Steps rather than a range input: this game's other numbers (the green
 * fee, the tee interval, the room rate) are all stepped, and a drag
 * gesture on a phone competes with the sheet's own scrolling.
 */
function dialSection(data, state, commit) {
  const wrap = document.createElement('div');
  wrap.className = 'champ-row';
  const b = data.booked;

  // In the week the heading above is already the rung and the round, so
  // this section is just the course's setup, not the rung and "today" again.
  wrap.appendChild(heading(b.inWeek
    ? 'Setup'
    : `${b.label} · ${b.daysLeft === 0 ? 'today' : `${b.daysLeft} days`}`));
  wrap.appendChild(line('Course is set to', String(data.dial.setup),
    data.dial.inBand ? 'champ-ok' : 'champ-off'));
  // "Suggest" because the band is guidance now: the judge is the winning
  // total, and the setup is only the usual way of getting the greens there.
  wrap.appendChild(line('Setup they suggest', `${b.band.low}–${b.band.high}`));
  // The spec's promise (§8): the band was calibrated at the rung's minimum
  // difficulty, so it is advice for that course and not for every course.
  const advice = document.createElement('div');
  advice.className = 'champ-detail';
  advice.textContent = 'Their advice for a course at the minimum difficulty. The week is judged on the winning score, so a course well past the minimum may want a softer setup.';
  wrap.appendChild(advice);
  wrap.appendChild(line('Course difficulty', `${data.difficulty} (at least ${b.minDifficulty})`,
    b.difficultyMet ? 'champ-ok' : 'champ-off'));
  wrap.appendChild(line('Preparing costs', `$${b.prepPerDay.toLocaleString()}/day`));

  const dial = document.createElement('div');
  dial.className = 'champ-dial';
  const label = document.createElement('span');
  label.textContent = 'Ask the crew for';
  const value = document.createElement('span');
  value.className = `champ-dial-value ${data.dial.targetInBand ? 'champ-ok' : 'champ-off'}`;
  value.textContent = String(data.dial.target);

  function step(by) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'champ-step';
    button.textContent = by > 0 ? '+' : '−';
    button.addEventListener('click', () => {
      const next = structuredClone(state);
      const now = Math.round(next.resort.setupTarget ?? 0);
      next.resort.setupTarget = Math.max(0, Math.min(100, now + by));
      commit(next);
    });
    return button;
  }

  dial.append(label, step(-5), value, step(5));
  wrap.appendChild(dial);

  const note = document.createElement('div');
  note.className = 'champ-detail';
  note.textContent = dialNote(data.dial, b.band);
  wrap.appendChild(note);

  return wrap;
}

/** Applying for the next rung, with the whole contract quoted first. */
function applySection(data, state, commit) {
  const wrap = document.createElement('div');
  wrap.className = 'champ-row';
  const n = data.next;
  wrap.appendChild(heading(`Apply · ${n.label}`));

  const blurb = document.createElement('div');
  blurb.className = 'champ-blurb';
  blurb.textContent = n.blurb;
  wrap.appendChild(blurb);

  // The whole contract, before anybody agrees to anything. Every cost line
  // in this game tells the player what they are getting into if they read
  // it, and the tournament is not an exception.
  wrap.appendChild(line('Base fee', `$${data.contract.baseFee.toLocaleString()}`));
  for (const bonus of data.contract.bonuses) {
    wrap.appendChild(line(bonus.label, `+$${bonus.amount.toLocaleString()}`));
  }
  wrap.appendChild(line('At best', `$${data.contract.ceiling.toLocaleString()}`, 'champ-ok'));
  wrap.appendChild(line('Setup they suggest', `${n.band.low}–${n.band.high}`));
  wrap.appendChild(line('Rounds', String(n.rounds)));
  wrap.appendChild(line('Winning score wanted', `${toParText(n.target.low)} to ${toParText(n.target.high)}`));
  wrap.appendChild(line('Course difficulty', `${data.difficulty} (at least ${n.minDifficulty})`,
    n.difficultyMet ? 'champ-ok' : 'champ-off'));
  wrap.appendChild(line(`Preparing, ${data.runUpDays} days`,
    `$${(n.prepPerDay * data.runUpDays).toLocaleString()}`));

  const gate = document.createElement('div');
  gate.className = 'champ-detail';
  gate.textContent = 'Judged on the winning score: it has to land in the range above. Miss it, or turn up '
    + 'on the first morning with the course easier than they asked for, and the week pays the base fee '
    + 'alone. You can redesign during the run-up; the course is locked once the first round starts.';
  wrap.appendChild(gate);

  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'champ-apply';
  apply.disabled = !n.eligible;
  apply.textContent = n.eligible
    ? `Apply for the ${n.label}`
    : n.barredUntil !== null
      ? `Given to somebody else until day ${n.barredUntil}`
      : `Not yet: ${n.missing.join(', ')}`;
  apply.addEventListener('click', () => {
    const next = structuredClone(state);
    const booked = bidFor(next, n.id, { holesOpen: openHoles(next).length });
    // `bidFor` refuses rather than throwing, so a null means the bid was
    // not accepted and nothing may be treated as booked.
    if (!booked) return;
    next.tournament = booked;
    // Arriving with the dial at zero would mean a booked championship
    // whose crew never starts. The middle of the band is the obvious
    // opening position; the player can move it either way.
    next.resort.setupTarget = Math.round((n.band.low + n.band.high) / 2);
    commit(next);
  });
  wrap.appendChild(apply);

  return wrap;
}

/** One championship building. Follows `amenityRow` in `hotel.js`. */
function buildingRow(spec, state, commit) {
  const row = document.createElement('div');
  row.className = 'champ-row';

  const title = document.createElement('div');
  title.className = 'champ-title';
  title.textContent = spec.label;
  const detail = document.createElement('div');
  detail.className = 'champ-detail';
  detail.textContent =
    `$${spec.build.toLocaleString()} to build · $${spec.upkeep}/day to run · `
    + `holds ${spec.gallery.toLocaleString()} · needed for the ${spec.forRung}`;
  const blurb = document.createElement('div');
  blurb.className = 'champ-blurb';
  blurb.textContent = spec.blurb;
  row.append(title, detail, blurb);

  if (spec.built) {
    const tag = document.createElement('span');
    tag.className = 'champ-built-tag';
    tag.textContent = 'Built';
    row.appendChild(tag);
    return row;
  }

  const build = document.createElement('button');
  build.type = 'button';
  build.className = 'champ-build';
  build.disabled = !spec.affordable;
  build.textContent = spec.affordable
    ? `Build · $${spec.build.toLocaleString()}`
    : `$${(spec.build - state.money).toLocaleString()} short`;
  build.addEventListener('click', () => {
    if (state.money < spec.build) return;
    const next = structuredClone(state);
    next.money -= spec.build;
    next.resort.amenities.push(amenity(spec.id));
    commit(next);
  });
  row.appendChild(build);
  return row;
}

/**
 * Opens the championship sheet. `onChange(nextState)` fires on every
 * build, every bid and every turn of the dial — the same contract the
 * other sheets use.
 */
export function mountChampionshipSheet(sheetHost, { state, onChange }) {
  injectStyles();
  let current = state;

  sheetHost.open({
    id: 'championship',
    title: 'The championship',
    render(body) {
      function rerender() {
        body.replaceChildren();
        const data = computeChampionshipData(current);
        const commit = (next) => {
          current = next;
          onChange(current);
          rerender();
        };

        // The dial first when there is one, because a booked championship
        // is the live decision and the rest is planning. Under way, the
        // morning's pin call comes above it.
        if (data.booked?.inWeek) {
          body.appendChild(weekSection(data, current, commit));
          body.appendChild(dialSection(data, current, commit));
        } else if (data.booked) body.appendChild(dialSection(data, current, commit));
        else if (data.next) body.appendChild(applySection(data, current, commit));
        else {
          const done = document.createElement('div');
          done.className = 'champ-row';
          done.appendChild(heading('The ladder is climbed'));
          const text = document.createElement('div');
          text.className = 'champ-blurb';
          text.textContent = 'County, regional and national, all hosted. There is nothing left on this ladder to apply for.';
          done.appendChild(text);
          body.appendChild(done);
        }

        // The gallery, whenever there is a rung it could be about.
        if (data.gallery.needed > 0) {
          const gallery = document.createElement('div');
          gallery.className = 'champ-row';
          gallery.appendChild(heading('The gallery'));
          gallery.appendChild(line('They will bring', data.gallery.needed.toLocaleString()));
          gallery.appendChild(line('You can hold', data.gallery.capacity.toLocaleString(),
            data.gallery.handled ? 'champ-ok' : 'champ-off'));
          if (!data.gallery.handled) {
            const short = document.createElement('div');
            short.className = 'champ-detail';
            short.textContent =
              `${(data.gallery.needed - data.gallery.capacity).toLocaleString()} more than there is room for. `
              + 'The short course and the brew pub take some of them too, not only the stands.';
            gallery.appendChild(short);
          }
          body.appendChild(gallery);
        }

        const ladder = document.createElement('div');
        ladder.className = 'champ-row';
        ladder.appendChild(heading('The ladder'));
        for (const rung of data.ladder) {
          ladder.appendChild(line(
            `${rung.hosted ? '✓ ' : ''}${rung.label}`,
            `$${rung.baseFee.toLocaleString()}–$${rung.ceiling.toLocaleString()}`,
            rung.hosted ? 'champ-ok' : undefined
          ));
        }
        body.appendChild(ladder);

        body.appendChild(heading('Infrastructure'));
        for (const spec of data.buildings) {
          body.appendChild(buildingRow(spec, current, commit));
        }
      }

      rerender();
    },
  });
}
