/**
 * A small 8-bit-style audio layer, built entirely from WebAudio oscillators
 * (plus one procedurally generated noise burst for the splash effect) --
 * no audio files, no external resources.
 *
 * Two rules matter more than the music itself:
 *
 *  - MUTED BY DEFAULT. A game that makes noise unprompted on a phone is a
 *    game that gets closed. `createChiptune()` starts muted; nothing plays
 *    a single sound until `setMuted(false)`/`toggleMuted()` is called, and
 *    that call is expected to come from a visible, explicit toggle in the
 *    UI -- see `mountMuteToggle`.
 *
 *  - LAZY INIT ON A USER GESTURE. Mobile browsers refuse to start an
 *    AudioContext before one, so nothing here constructs one at module
 *    load or in `createChiptune()` itself. `ensureContext()` is called
 *    only from inside functions that already require the player to be
 *    unmuted -- and unmuting is itself the gesture -- so a fresh
 *    AudioContext is only ever born as the direct consequence of a tap.
 */

// --- A tiny pentatonic-ish scale, chosen for that unmistakable chiptune
// flavour without needing any harmony theory beyond "these notes agree". ---
const NOTE = {
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0,
  A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
};

/** The build-phase loop: unhurried, four bars, repeats cleanly. */
const BUILD_MELODY = ['C4', 'E4', 'G4', 'E4', 'A4', 'G4', 'E4', 'C4'];
/** The playback loop: same key, more steps and a shorter step -- busier. */
const PLAYBACK_MELODY = ['C4', 'E4', 'G4', 'C5', 'D5', 'C5', 'A4', 'G4', 'E4', 'D4', 'E4', 'G4'];

const BUILD_STEP_SECONDS = 0.2;
const PLAYBACK_STEP_SECONDS = 0.145;

const MUSIC_GAIN = 0.05;
const SFX_GAIN = 0.16;

function getAudioContextClass() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

/**
 * Creates the chiptune engine. Call `unlock()` from the same user gesture
 * that turns audio on (a mute toggle's own click handler is exactly that);
 * every other method is a safe no-op until then.
 */
export function createChiptune() {
  let ctx = null;
  let masterGain = null;
  let noiseBuffer = null;
  let muted = true;
  let currentTrack = null; // 'build' | 'playback' | null
  let loopTimer = null;
  let loopToken = 0;

  function ensureContext() {
    if (ctx) return ctx;
    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) return null;
    ctx = new AudioContextClass();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
    return ctx;
  }

  /** Builds one short buffer of white noise, reused for every splash. */
  function ensureNoiseBuffer() {
    if (noiseBuffer || !ctx) return noiseBuffer;
    const duration = 0.25;
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  /** Call from a user-gesture handler (the mute toggle) to arm audio. */
  function unlock() {
    const c = ensureContext();
    if (c && c.state === 'suspended') c.resume();
  }

  function stopMusic() {
    loopToken += 1; // invalidates any pending scheduled loop continuation
    if (loopTimer !== null) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
  }

  // --- One-shot notes and effects ---------------------------------------

  function playTone(freq, { start = 0, duration = 0.12, type = 'square', gain = SFX_GAIN, destination } = {}) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + start;
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(destination ?? masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function playSweep(fromFreq, toFreq, { start = 0, duration = 0.3, type = 'square', gain = SFX_GAIN } = {}) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    const t0 = ctx.currentTime + start;
    osc.frequency.setValueAtTime(fromFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), t0 + duration);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /** The *tok* of a struck drive: a short, dry, low click. */
  function tok() {
    if (muted || !ctx) return;
    playTone(180, { duration: 0.06, type: 'square', gain: SFX_GAIN * 0.8 });
  }

  /** A splash: filtered noise, pitched down like water swallowing a ball. */
  function splash() {
    if (muted || !ctx) return;
    const buffer = ensureNoiseBuffer();
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.3);
    const env = ctx.createGain();
    env.gain.setValueAtTime(SFX_GAIN * 0.9, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    src.connect(filter);
    filter.connect(env);
    env.connect(masterGain);
    src.start();
    src.stop(ctx.currentTime + 0.32);
  }

  /** A cheer for a birdie: a bright ascending three-note flourish. */
  function cheer() {
    if (muted || !ctx) return;
    playTone(NOTE.C5, { start: 0, duration: 0.12, gain: SFX_GAIN });
    playTone(NOTE.E5, { start: 0.09, duration: 0.12, gain: SFX_GAIN });
    playTone(NOTE.G5, { start: 0.18, duration: 0.22, gain: SFX_GAIN });
  }

  /** A cash register for the evening report: two quick bright dings. */
  function cashRegister() {
    if (muted || !ctx) return;
    playTone(1500, { start: 0, duration: 0.05, type: 'square', gain: SFX_GAIN });
    playTone(1900, { start: 0.05, duration: 0.16, type: 'square', gain: SFX_GAIN });
  }

  // --- The looping background track --------------------------------------

  function scheduleLoop(track, token) {
    if (!ctx || muted || token !== loopToken) return;
    const melody = track === 'playback' ? PLAYBACK_MELODY : BUILD_MELODY;
    const stepSeconds = track === 'playback' ? PLAYBACK_STEP_SECONDS : BUILD_STEP_SECONDS;
    const loopSeconds = melody.length * stepSeconds;

    melody.forEach((name, i) => {
      playTone(NOTE[name], {
        start: i * stepSeconds,
        duration: stepSeconds * 0.8,
        type: 'square',
        gain: MUSIC_GAIN,
      });
      // Playback is "slightly busier": a soft off-beat tick between notes.
      if (track === 'playback') {
        playTone(NOTE[name] / 2, {
          start: i * stepSeconds + stepSeconds * 0.5,
          duration: stepSeconds * 0.25,
          type: 'triangle',
          gain: MUSIC_GAIN * 0.5,
        });
      }
    });

    loopTimer = setTimeout(() => scheduleLoop(track, token), loopSeconds * 1000);
  }

  /** Starts (or switches to) a named loop: 'build' or 'playback'. */
  function playMusic(track) {
    currentTrack = track;
    stopMusic();
    if (muted || !ctx) return;
    const token = loopToken;
    scheduleLoop(track, token);
  }

  function setMuted(next) {
    muted = next;
    if (muted) {
      stopMusic();
    } else {
      unlock();
      if (currentTrack) playMusic(currentTrack);
    }
  }

  function toggleMuted() {
    setMuted(!muted);
    return muted;
  }

  return {
    get muted() {
      return muted;
    },
    unlock,
    setMuted,
    toggleMuted,
    playMusic,
    stopMusic,
    sfx: { tok, splash, cheer, cashRegister },
  };
}

// ---------------------------------------------------------------------
// A small, self-contained DOM mute toggle -- optional convenience so
// callers (src/main.js) don't each have to hand-roll the same button.
// ---------------------------------------------------------------------

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .audio-toggle {
      min-width: 44px;
      min-height: 44px;
      padding: 0;
      background: transparent;
      border: none;
      color: inherit;
      font-size: 18px;
      line-height: 44px;
      text-align: center;
      pointer-events: auto;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Mounts a small, clearly-labelled mute/unmute button into `root`. Its own
 * click is the user gesture that unlocks audio, so no separate "enable
 * sound" prompt is needed.
 */
export function mountMuteToggle(root, chiptune) {
  injectStyles();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'audio-toggle';

  function render() {
    const isMuted = chiptune.muted;
    btn.textContent = isMuted ? '\u{1F507}' : '\u{1F50A}'; // muted / loud speaker
    btn.setAttribute('aria-label', isMuted ? 'Unmute sound' : 'Mute sound');
    btn.setAttribute('aria-pressed', String(!isMuted));
  }

  btn.addEventListener('click', () => {
    chiptune.toggleMuted();
    render();
  });

  render();
  root.appendChild(btn);
  return { element: btn, update: render };
}
