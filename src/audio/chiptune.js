/**
 * A small 8-bit-style audio layer, built entirely from WebAudio oscillators
 * (plus procedurally generated noise for the splash effect and the guitar
 * pluck's pick-attack) -- no audio files, no external resources.
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
 *
 * The music itself aims for a calmer register than a typical chiptune: a
 * slow piano-ish arpeggio (triangle wave, quick attack, long decay) over a
 * sustained guitar-ish pluck (a brief filtered noise "pick" feeding a
 * lowpass-filtered tone), mostly in C major but coloured by the raised
 * 4th (F#) borrowed from C Lydian -- the "bright open sky" mode.
 */

// --- Note table: just the pitches the two tracks and the effects use,
// spanning a couple of octaves. 'F#4' is the deliberate Lydian colour --
// see BUILD_MELODY / PLAYBACK_MELODY below. ---
const NOTE = {
  G2: 97.999,
  A2: 110.0,
  C3: 130.81,
  A3: 220.0,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  'F#4': 369.99,
  G4: 392.0,
  A4: 440.0,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  C6: 1046.5,
};

// --- Build phase: an unhurried piano arpeggio, ~66 BPM on an eighth-note
// pulse, with rests (`null`) so the tune has room to breathe -- this plays
// under long stretches of reading and clicking, so density is the enemy.
// The raised 4th (F#4) passes through once, resolving up into G4, right
// before the loop returns home to C4. ---
const BUILD_BPM = 66;
const BUILD_STEP_SECONDS = 30 / BUILD_BPM; // one eighth note at BUILD_BPM
const BUILD_MELODY = [
  'C4', null, 'E4', 'G4', null, 'E4', null, null,
  'A3', null, 'C4', 'E4', null, 'F#4', 'G4', null,
];
// A slow, sustained guitar-ish root under the arpeggio: one pluck per half
// of the loop, left to ring the whole half rather than repeating.
const BUILD_BASS = [
  { step: 0, note: 'C3' },
  { step: 8, note: 'A2' },
];
const BUILD_BASS_RING_STEPS = 8;

// --- Playback: same key and the same eighth-note grid, a little faster
// and with fewer rests -- gentle forward motion (a day unfolding), not
// urgency -- plus a walking quarter-note bass (I-V-vi-V) in place of the
// build's two long-held roots. ---
const PLAYBACK_BPM = 72;
const PLAYBACK_STEP_SECONDS = 30 / PLAYBACK_BPM;
const PLAYBACK_MELODY = [
  'C4', 'E4', 'G4', null, 'E4', 'C5', 'G4', null,
  'A3', 'C4', 'E4', null, 'F#4', 'A4', 'G4', null,
];
const PLAYBACK_BASS = [
  { step: 0, note: 'C3' },
  { step: 4, note: 'G2' },
  { step: 8, note: 'A2' },
  { step: 12, note: 'G2' },
];
const PLAYBACK_BASS_RING_STEPS = 4.5;

const MUSIC_GAIN = 0.075;
const BASS_GAIN = MUSIC_GAIN * 0.55;
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

  /** Builds one short buffer of white noise, reused for the splash and the
   *  guitar pluck's pick-attack alike. */
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

  // --- Tone builders -------------------------------------------------------

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

  /**
   * A soft, lowpass-filtered tone with a quick attack and a longer decay --
   * reads as a struck piano note. Used for the melody arpeggio and, with
   * different envelopes, for the warmer one-shot effects (cheer, cash
   * register) so they sit inside the same palette as the music.
   */
  function warmTone(freq, { start = 0, duration = 0.5, gain = MUSIC_GAIN, type = 'triangle', filterMult = 3.2, attack = 0.006, destination } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * filterMult;
    filter.Q.value = 0.3;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(filter);
    filter.connect(env);
    env.connect(destination ?? masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  /**
   * A soft plucked-guitar voice: a brief filtered noise burst (the pick
   * attack) alongside a lowpass-filtered triangle tone that rings on well
   * after -- the sustained layer under the piano arpeggio.
   */
  function guitarPluck(freq, { start = 0, duration = 1.6, gain = MUSIC_GAIN } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + start;

    const buffer = ensureNoiseBuffer();
    if (buffer) {
      const pick = ctx.createBufferSource();
      pick.buffer = buffer;
      const pickFilter = ctx.createBiquadFilter();
      pickFilter.type = 'bandpass';
      pickFilter.frequency.value = freq * 2.5;
      pickFilter.Q.value = 0.7;
      const pickEnv = ctx.createGain();
      pickEnv.gain.setValueAtTime(gain * 0.6, t0);
      pickEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.025);
      pick.connect(pickFilter);
      pickFilter.connect(pickEnv);
      pickEnv.connect(masterGain);
      pick.start(t0);
      pick.stop(t0 + 0.03);
    }

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * 2.6;
    filter.Q.value = 0.2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(filter);
    filter.connect(env);
    env.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  // --- One-shot effects ----------------------------------------------------

  /** The *tok* of a struck drive: a short, soft, woody click. */
  function tok() {
    if (muted || !ctx) return;
    playTone(210, { duration: 0.05, type: 'triangle', gain: SFX_GAIN * 0.7 });
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
    filter.frequency.setValueAtTime(900, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.32);
    const env = ctx.createGain();
    env.gain.setValueAtTime(SFX_GAIN * 0.75, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
    src.connect(filter);
    filter.connect(env);
    env.connect(masterGain);
    src.start();
    src.stop(ctx.currentTime + 0.34);
  }

  /** A cheer for a birdie: a warm ascending three-note flourish. */
  function cheer() {
    if (muted || !ctx) return;
    warmTone(NOTE.C5, { start: 0, duration: 0.3, gain: SFX_GAIN * 0.8, filterMult: 3.5 });
    warmTone(NOTE.E5, { start: 0.11, duration: 0.3, gain: SFX_GAIN * 0.8, filterMult: 3.5 });
    warmTone(NOTE.G5, { start: 0.22, duration: 0.45, gain: SFX_GAIN * 0.85, filterMult: 3.5 });
  }

  /** A cash register for the evening report: two warm ascending chimes. */
  function cashRegister() {
    if (muted || !ctx) return;
    warmTone(NOTE.G5, { start: 0, duration: 0.22, gain: SFX_GAIN * 0.75, filterMult: 4, attack: 0.005 });
    warmTone(NOTE.C6, { start: 0.09, duration: 0.36, gain: SFX_GAIN * 0.8, filterMult: 4, attack: 0.005 });
  }

  // --- The looping background track --------------------------------------

  function scheduleLoop(track, token) {
    if (!ctx || muted || token !== loopToken) return;
    const isPlayback = track === 'playback';
    const melody = isPlayback ? PLAYBACK_MELODY : BUILD_MELODY;
    const bass = isPlayback ? PLAYBACK_BASS : BUILD_BASS;
    const bassRingSteps = isPlayback ? PLAYBACK_BASS_RING_STEPS : BUILD_BASS_RING_STEPS;
    const stepSeconds = isPlayback ? PLAYBACK_STEP_SECONDS : BUILD_STEP_SECONDS;
    const ringSteps = isPlayback ? 1.5 : 1.8; // how far a note's tail rings past its own step
    const loopSeconds = melody.length * stepSeconds;

    melody.forEach((name, i) => {
      if (!name) return; // a rest -- the space is part of the tune
      warmTone(NOTE[name], {
        start: i * stepSeconds,
        duration: stepSeconds * ringSteps,
        gain: MUSIC_GAIN,
      });
    });

    bass.forEach(({ step, note }) => {
      guitarPluck(NOTE[note], {
        start: step * stepSeconds,
        duration: bassRingSteps * stepSeconds,
        gain: BASS_GAIN,
      });
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
