/**
 * The play screen: one hole, one ball, played by the person holding the
 * phone.
 *
 * This module owns the DOM (a header, a dock with the swing meter and
 * buttons) and the input, and holds the little state machine that walks a
 * stroke through aim → swing → flight → message. It decides nothing about
 * golf: where a ball goes is playGolf.js#resolveStroke, how a swing is
 * timed is swingMeter.js, what the words say is playCopy.js, and what is
 * drawn is playView.js. Keeping it that way is what lets every one of
 * those be tested without a browser.
 *
 * Same contract as mountHoleEditor: returns `{ render, destroy }`, and
 * the caller calls `render(ctx, rect, nowMs)` every frame while the
 * `play` screen is active. `nowMs` must be the requestAnimationFrame
 * timestamp — it shares a clock with `performance.now()`, which is what
 * the tap handlers read.
 */
import { PALETTE } from '../render/palette.js';
import { topChromeOverlapPx, bottomChromeOverlapPx } from '../render/pixel.js';
import { drawPlayScene } from '../render/playView.js';
import { shotFrame, makePlayCamera } from '../render/playCamera.js';
import { METER, newSwing, tapSwing, tickSwing, cursorAt } from '../play/swingMeter.js';
import { flightAt } from '../play/flight.js';
import {
  startHole, isFinished, defaultTarget, clampTarget, planShot, resolveStroke, applyStroke, reachFrom,
} from '../sim/playGolf.js';
import { greenSlope, slopeFraction } from '../sim/putting.js';
import { LIE } from '../sim/terrain.js';
import { headerLines, caddieLine, strokeLine, finishLine, meterHint } from './playCopy.js';

/** Internal canvas px a finger may wander and still count as a tap. */
const TAP_THRESHOLD_PX = 4;
/** How long a result line holds the screen before the next shot. */
const MESSAGE_MS = 1100;

/** Where a cursor value sits along the meter bar, 0–100. */
export function meterPercent(value) {
  const span = METER.MAX - METER.LATE_LIMIT;
  return Math.max(0, Math.min(100, ((value - METER.LATE_LIMIT) / span) * 100));
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .play-header {
      position: fixed; left: 0; right: 0; top: 0; z-index: 8;
      padding: 6px 10px; background: ${PALETTE.UI_DARK};
      border-bottom: 1px solid ${PALETTE.OUTLINE};
      font-family: monospace; font-size: 12px; line-height: 1.5; color: ${PALETTE.WHITE};
      pointer-events: none;
    }
    /* Rows wrap rather than clip: 'Hole 12 · Par 5 · 520y' beside a best
       score and a round tally does not fit one line of a narrow phone. */
    .play-header-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0 8px; }
    .play-header-row > span { white-space: nowrap; }
    .play-header-row > span:last-child { color: ${PALETTE.ACCENT}; }
    .play-header-row + .play-header-row { color: ${PALETTE.UI_LIGHT}; }
    .play-dock {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 8;
      display: flex; flex-direction: column; gap: 6px; padding: 8px;
      background: ${PALETTE.UI_DARK}; border-top: 1px solid ${PALETTE.OUTLINE};
      font-family: monospace; color: ${PALETTE.WHITE}; pointer-events: auto;
    }
    .play-caddie { min-height: 18px; font-size: 13px; font-weight: bold; }
    .play-meter {
      position: relative; height: 20px; overflow: hidden;
      background: ${PALETTE.OUTLINE}; border: 1px solid ${PALETTE.UI_LIGHT}; border-radius: 3px;
    }
    .play-meter > div { position: absolute; top: 0; bottom: 0; }
    .play-meter-miss { left: 0; background: ${PALETTE.SAND_SHADOW}; opacity: 0.5; }
    .play-meter-over { right: 0; background: ${PALETTE.FOOD_RED}; opacity: 0.7; }
    .play-meter-window { background: ${PALETTE.ACCENT}; opacity: 0.25; }
    .play-meter-line { width: 2px; margin-left: -1px; background: ${PALETTE.WHITE}; }
    .play-meter-mark { width: 2px; margin-left: -1px; background: ${PALETTE.ACCENT}; }
    .play-meter-power { width: 2px; margin-left: -1px; background: ${PALETTE.FAIRWAY}; }
    .play-meter-cursor {
      width: 4px; margin-left: -2px; background: ${PALETTE.WHITE};
      box-shadow: 0 0 0 1px ${PALETTE.OUTLINE};
    }
    .play-buttons { display: flex; gap: 6px; min-height: 44px; align-items: stretch; }
    .play-hint { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 13px; color: ${PALETTE.ACCENT}; }
    .play-btn {
      min-height: 44px; min-width: 64px; padding: 4px 12px;
      background: ${PALETTE.PATH}; color: ${PALETTE.WHITE};
      border: 1px solid ${PALETTE.OUTLINE}; border-radius: 6px;
      font-family: monospace; font-size: 13px;
    }
    .play-btn--primary { flex: 1; background: ${PALETTE.FAIRWAY}; color: ${PALETTE.OUTLINE}; font-weight: bold; }
  `;
  document.head.appendChild(style);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Mounts the play screen for one hole.
 *
 *   hole, par, lengthYards   the hole and the two figures the header shows
 *   best                     the player's best here, or null
 *   weather                  { short, spread } for today
 *   round                    roundLine(...) for the holes already played this visit
 *   hasNext                  whether there is a built hole after this one
 *   topInsetPx               px to leave clear at the top when embedded (main.js knows)
 *   sfx                      chiptune.sfx (tok / splash / cheer); they mute themselves
 *   onFinish(play)           called once when the hole ends; returns
 *                            { isNewBest, best, round } for the finished display
 *   onNext / onReplay / onExit   the three ways out
 */
export function mountPlayHole({
  canvas, surface, container, hole, par, lengthYards, best = null, weather, round = '', hasNext = false,
  topInsetPx = 0, sfx, onFinish, onNext, onReplay, onExit,
}) {
  injectStyles();

  // --- DOM ---------------------------------------------------------------
  const headerEl = el('div', 'play-header');
  // Inside a host that draws its own bar over the top of the frame, top:0
  // is underneath it — the same allowance main.js makes for the HUD.
  headerEl.style.top = `${topInsetPx}px`;
  const titleRow = el('div', 'play-header-row');
  const titleEl = el('span');
  const rightEl = el('span');
  titleRow.append(titleEl, rightEl);
  const statusRow = el('div', 'play-header-row');
  const statusEl = el('span');
  const weatherEl = el('span');
  statusRow.append(statusEl, weatherEl);
  headerEl.append(titleRow, statusRow);

  const dockEl = el('div', 'play-dock');
  const caddieEl = el('div', 'play-caddie');
  const meterEl = el('div', 'play-meter');
  const missEl = el('div', 'play-meter-miss');
  const windowEl = el('div', 'play-meter-window');
  const overEl = el('div', 'play-meter-over');
  const lineEl = el('div', 'play-meter-line');
  const markEl = el('div', 'play-meter-mark');
  const powerEl = el('div', 'play-meter-power');
  const cursorEl = el('div', 'play-meter-cursor');
  // The static furniture of the bar, placed once from the meter's own constants.
  missEl.style.width = `${meterPercent(0)}%`;
  overEl.style.width = `${100 - meterPercent(1)}%`;
  windowEl.style.left = `${meterPercent(-METER.ACC_WINDOW)}%`;
  windowEl.style.width = `${meterPercent(METER.ACC_WINDOW) - meterPercent(-METER.ACC_WINDOW)}%`;
  lineEl.style.left = `${meterPercent(0)}%`;
  meterEl.append(missEl, windowEl, overEl, lineEl, markEl, powerEl, cursorEl);
  const buttonsEl = el('div', 'play-buttons');
  dockEl.append(caddieEl, meterEl, buttonsEl);
  container.append(headerEl, dockEl);

  // --- State -------------------------------------------------------------
  let play = startHole(hole);
  let phase = 'aim';
  let target = defaultTarget(hole, play);
  let swing = newSwing();
  let lastSwing = null;       // the finished swing of the stroke on screen
  let struckPlan = null;      // the plan that stroke was played to
  let outcome = null;
  let struckAt = 0;
  let messageUntil = 0;
  let line = '';              // result / finish line, shown in place of the caddie
  let bestNow = best;
  let roundNow = round;
  let viewRect = { x: 0, y: 0, width: surface.width, height: surface.height };
  let camera = null;
  let cameraKey = '';

  function remeasure() {
    const topPx = topChromeOverlapPx(canvas, headerEl, surface.scale);
    const bottomPx = bottomChromeOverlapPx(canvas, dockEl, surface.scale);
    viewRect = {
      x: 0, y: topPx, width: surface.width,
      height: Math.max(40, surface.height - topPx - bottomPx),
    };
  }

  // The camera is framed once per resting ball — not per frame, and not
  // while the target is dragged, or the ground would slide under the
  // finger that is aiming at it.
  function ensureCamera() {
    const key = `${viewRect.y}|${viewRect.height}|${play.strokes}|${play.ball.x}|${play.ball.y}|${play.lie}`;
    if (key === cameraKey && camera) return;
    cameraKey = key;
    camera = makePlayCamera(hole, viewRect, shotFrame(hole, play, defaultTarget(hole, play)));
  }

  function button(label, onClick, primary = false) {
    const btn = el('button', primary ? 'play-btn play-btn--primary' : 'play-btn', label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function updateHeader() {
    const h = headerLines({ hole, par, lengthYards, play, best: bestNow, weatherShort: weather.short, round: roundNow });
    titleEl.textContent = h.title;
    rightEl.textContent = h.right;
    statusEl.textContent = phase === 'finished' ? '' : h.status;
    weatherEl.textContent = h.weather;
  }

  function updateDock() {
    if (phase === 'aim') {
      caddieEl.textContent = caddieLine(planShot(hole, play, target));
      buttonsEl.replaceChildren(
        button('Swing', () => tap(performance.now()), true),
        button('Exit', () => onExit?.()),
      );
    } else if (phase === 'swing') {
      buttonsEl.replaceChildren(el('div', 'play-hint', meterHint(swing.phase)));
    } else if (phase === 'finished') {
      caddieEl.textContent = line;
      const buttons = [];
      if (hasNext) buttons.push(button('Next hole', () => onNext?.(), true));
      buttons.push(button('Replay', () => onReplay?.(), !hasNext));
      buttons.push(button('Done', () => onExit?.()));
      buttonsEl.replaceChildren(...buttons);
    } else {
      // flight, message
      caddieEl.textContent = line;
      buttonsEl.replaceChildren(el('div', 'play-hint', ''));
    }
    remeasure();
  }

  // --- Aiming ------------------------------------------------------------
  // Tap = put the target there. Drag = nudge the target by the drag, from
  // wherever the finger happens to be, so the finger never has to sit on
  // top of the thing being aimed.
  function clampToView(world) {
    const s = camera.toScreen(world);
    const x = Math.max(viewRect.x + 2, Math.min(viewRect.x + viewRect.width - 2, s.x));
    const y = Math.max(viewRect.y + 2, Math.min(viewRect.y + viewRect.height - 2, s.y));
    return clampTarget(hole, play, camera.toWorld({ x, y }));
  }

  let drag = null;
  function onPointerDown(evt) {
    if (phase !== 'aim' || !camera) return;
    const point = surface.toCanvasCoords(evt.clientX, evt.clientY);
    drag = { start: point, targetScreen: camera.toScreen(target), moved: false };
  }
  function onPointerMove(evt) {
    if (!drag || phase !== 'aim') return;
    const point = surface.toCanvasCoords(evt.clientX, evt.clientY);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < TAP_THRESHOLD_PX) return;
    drag.moved = true;
    target = clampToView(camera.toWorld({ x: drag.targetScreen.x + dx, y: drag.targetScreen.y + dy }));
    caddieEl.textContent = caddieLine(planShot(hole, play, target));
  }
  function onPointerUp() {
    if (!drag) return;
    if (!drag.moved && phase === 'aim') {
      target = clampToView(camera.toWorld(drag.start));
      caddieEl.textContent = caddieLine(planShot(hole, play, target));
    }
    drag = null;
  }

  // --- Swinging ----------------------------------------------------------
  function tap(now) {
    if (phase === 'aim') {
      swing = tapSwing(newSwing(), now);
      phase = 'swing';
      line = '';
      updateDock();
    } else if (phase === 'swing') {
      const before = swing.phase;
      swing = tapSwing(swing, now);
      if (swing.phase !== before) updateDock();
    }
  }
  // While a swing is running, a touch ANYWHERE is the tap — nobody should
  // have to find a button with their thumb while watching a cursor.
  function onAnyPointerDown(evt) {
    if (phase !== 'swing') return;
    evt.preventDefault();
    tap(performance.now());
  }
  function onKeyDown(evt) {
    if (evt.code !== 'Space' || evt.repeat) return;
    if (phase !== 'aim' && phase !== 'swing') return;
    evt.preventDefault();
    tap(performance.now());
  }

  function strike(now) {
    lastSwing = swing;
    struckPlan = planShot(hole, play, target);
    outcome = resolveStroke(hole, play, target, swing, weather.spread);
    struckAt = now;
    phase = 'flight';
    sfx?.tok();
    updateDock();
  }

  function land(now) {
    play = applyStroke(play, outcome);
    if (outcome.penalty === 'water') sfx?.splash();
    if (isFinished(play)) {
      phase = 'finished';
      const result = onFinish?.(play) ?? {};
      if (result.best !== undefined) bestNow = result.best;
      if (result.round !== undefined) roundNow = result.round;
      line = finishLine(play, par, Boolean(result.isNewBest));
      if (play.holed && play.strokes <= par) sfx?.cheer();
    } else {
      phase = 'message';
      messageUntil = now + MESSAGE_MS;
      line = strokeLine(hole, outcome, play, lastSwing);
    }
    updateHeader();
    updateDock();
  }

  function nextShot() {
    phase = 'aim';
    target = defaultTarget(hole, play);
    swing = newSwing();
    lastSwing = null;
    outcome = null;
    line = '';
    updateDock();
  }

  // --- The meter ---------------------------------------------------------
  function updateMeter(now) {
    const aiming = phase === 'aim' || phase === 'swing';
    const plan = aiming ? planShot(hole, play, target) : struckPlan;
    markEl.hidden = phase === 'finished' || !plan;
    if (plan) markEl.style.left = `${meterPercent(plan.needed)}%`;

    const shownSwing = phase === 'swing' ? swing : lastSwing;
    const hasPower = shownSwing && (shownSwing.phase === 'falling' || shownSwing.phase === 'done');
    powerEl.hidden = !hasPower || phase === 'finished';
    if (hasPower) powerEl.style.left = `${meterPercent(shownSwing.power)}%`;

    cursorEl.hidden = !shownSwing || phase === 'aim' || phase === 'finished';
    if (shownSwing) cursorEl.style.left = `${meterPercent(cursorAt(shownSwing, now))}%`;
  }

  // --- Frame -------------------------------------------------------------
  function render(ctx, rect, now) {
    if (phase === 'swing') {
      const before = swing.phase;
      swing = tickSwing(swing, now);
      if (swing.phase === 'done') strike(now);
      else if (swing.phase !== before) updateDock();
    }

    let ball = play.ball;
    let lift = 0;
    if (phase === 'flight') {
      const f = flightAt(outcome, now - struckAt);
      if (f.done) {
        land(now);
        ball = play.ball;
      } else {
        ball = f;
        lift = f.lift;
      }
    }
    if (phase === 'message' && now >= messageUntil) nextShot();

    ensureCamera();
    updateMeter(now);

    const putting = play.lie === LIE.GREEN && phase !== 'flight';
    drawPlayScene(ctx, rect.width, rect.height, {
      hole, viewRect, camera, ball, lift,
      target: phase === 'aim' || phase === 'swing' ? target : null,
      reachYards: play.lie === LIE.GREEN ? null : reachFrom(play.lie),
      slope: putting || (outcome && outcome.kind === 'putt') ? greenSlope(hole) : null,
      slopeFraction: slopeFraction(hole.greenPreset),
    });
  }

  function onResize() { remeasure(); }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointerdown', onAnyPointerDown, true);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);

  updateHeader();
  updateDock();

  function destroy() {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointerdown', onAnyPointerDown, true);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    headerEl.remove();
    dockEl.remove();
  }

  return { render, destroy };
}
