// =============================================================================
// client/utils/sound.ts — game sound effects
// -----------------------------------------------------------------------------
// Two layers:
//   1. Sample playback — if a real audio file exists in public/sfx/ for an
//      event, it is decoded once and played (better quality, themed SFX).
//   2. Synth fallback — if no sample is present (or it failed to load), a
//      procedural Web Audio tone is generated, so the game always has sound
//      with zero asset files. Drop files into public/sfx/ to upgrade in place.
// See public/sfx/README.md for recommended CC0 sources and filenames.
// =============================================================================

let audioCtx: AudioContext | null = null;
let isMuted = false;
let masterVolume = 0.6;
// Shared output chain: every cue routes through a master gain into a gentle
// compressor/limiter, so stacked tones stay warm instead of harsh/clippy and
// one volume knob governs everything.
let masterGain: GainNode | null = null;

// Decoded sample buffers, keyed by event name. Absent = fall back to synth.
const buffers = new Map<SfxName, AudioBuffer>();
let preloadStarted = false;

export type SfxName =
  | "roll"
  | "cash"
  | "rent"
  | "draw"
  | "jail"
  | "build"
  | "your-turn"
  | "game-over";

// Where each event's sample lives (served from public/sfx/). BASE_URL keeps
// paths correct when the app is deployed under a sub-path.
const SFX_FILES: Record<SfxName, string> = {
  roll: "roll.wav",
  cash: "cash.wav",
  rent: "rent.wav",
  draw: "draw.wav",
  jail: "jail.wav",
  build: "build.wav",
  "your-turn": "your-turn.wav",
  "game-over": "game-over.wav",
};

export function setMuted(muted: boolean) {
  isMuted = muted;
}

export function getMuted(): boolean {
  return isMuted;
}

// 0–1. Governs the whole output chain (samples + synth).
export function setVolume(v: number) {
  masterVolume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = masterVolume;
}

export function getVolume(): number {
  return masterVolume;
}

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const Ctor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

// Lazily build the shared master gain → compressor → speakers chain. All cues
// connect here instead of straight to ctx.destination.
function getMasterGain(ctx: AudioContext): GainNode {
  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.gain.value = masterVolume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 26;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    masterGain.connect(comp);
    comp.connect(ctx.destination);
  }
  return masterGain;
}

// Fetch + decode every available sample once. Missing files are expected and
// silently skipped (that event just uses its synth fallback). Safe to call
// before any user gesture — decoding does not require a resumed context.
export async function preloadSounds(): Promise<void> {
  if (preloadStarted) return;
  preloadStarted = true;
  const ctx = getAudioContext();
  await Promise.all(
    (Object.keys(SFX_FILES) as SfxName[]).map(async (name) => {
      try {
        const url = `${import.meta.env.BASE_URL}sfx/${SFX_FILES[name]}`;
        const res = await fetch(url);
        if (!res.ok) return; // no file dropped in yet — use synth fallback
        const data = await res.arrayBuffer();
        buffers.set(name, await ctx.decodeAudioData(data));
      } catch {
        // Missing/corrupt/unsupported file — fall back to synth for this event.
      }
    })
  );
}

// Play a decoded sample if we have one. Returns false when there's nothing to
// play (so the caller can fall back to its synth tone).
function playSample(name: SfxName): boolean {
  const buffer = buffers.get(name);
  if (!buffer) return false;
  try {
    const ctx = getAudioContext();
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    gain.gain.value = 1; // master chain applies the volume
    src.connect(gain);
    gain.connect(getMasterGain(ctx));
    src.start();
    return true;
  } catch (e) {
    console.warn("Sample playback error:", e);
    return false;
  }
}

// Play the sample for `name`; if none is loaded, run the synth fallback.
function play(name: SfxName, synth: () => void) {
  if (isMuted) return;
  if (!playSample(name)) synth();
}

// =============================================================================
// Synth fallbacks — procedural Web Audio tones (used when no sample is present)
// =============================================================================

/** Sweeping low rumble for rolling dice */
function synthRoll() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(getMasterGain(ctx));

    osc.type = "triangle";
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.35);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.35);

    osc.start(now);
    osc.stop(now + 0.35);
  } catch (e) {
    console.warn("Audio playback error:", e);
  }
}

/** Retro double-chime for buying assets, passing START, or winning jackpots */
function synthCash() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const playChime = (delay: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(getMasterGain(ctx));

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.12, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.22);

      osc.start(now + delay);
      osc.stop(now + delay + 0.25);
    };

    playChime(0, 880); // A5
    playChime(0.08, 1318.5); // E6
  } catch (e) {
    console.warn("Audio playback error:", e);
  }
}

/** Sad descending sweep for paying rent or tax */
function synthRentPay() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(getMasterGain(ctx));

    osc.type = "triangle";
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(180, now + 0.4);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.4);

    osc.start(now);
    osc.stop(now + 0.4);
  } catch (e) {
    console.warn("Audio playback error:", e);
  }
}

/** Ascending arpeggio for drawing Chance or Hustle cards */
function synthDraw() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      const delay = idx * 0.05;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(getMasterGain(ctx));

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.08, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12);

      osc.start(now + delay);
      osc.stop(now + delay + 0.15);
    });
  } catch (e) {
    console.warn("Audio playback error:", e);
  }
}

/** Detuned sawtooth warning buzz for getting sent to Jail (Kirikiri) */
function synthJail() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(getMasterGain(ctx));

    // Triangle (not sawtooth) — a warmer, less buzzy "uh-oh" for jail.
    osc1.type = "triangle";
    osc2.type = "triangle";

    osc1.frequency.setValueAtTime(140, now);
    osc1.frequency.exponentialRampToValueAtTime(90, now + 0.4);
    osc2.frequency.setValueAtTime(143, now); // slightly detuned for body
    osc2.frequency.exponentialRampToValueAtTime(92, now + 0.4);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.start(now);
    osc2.start(now);

    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  } catch (e) {
    console.warn("Audio playback error:", e);
  }
}

/** Dual percussive knocks (hammer-building sound) for upgrading properties */
function synthBuild() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const playKnock = (delay: number, pitch: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(getMasterGain(ctx));

      osc.type = "triangle";
      osc.frequency.setValueAtTime(pitch, now + delay);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.4, now + delay + 0.07);

      gain.gain.setValueAtTime(0.2, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.07);

      osc.start(now + delay);
      osc.stop(now + delay + 0.09);
    };

    playKnock(0, 550);
    playKnock(0.1, 700);
  } catch (e) {
    console.warn("Audio playback error:", e);
  }
}

/** Triumphant rising arpeggio for completing a Hotel (top-tier upgrade). */
function synthHotel() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5–E5–G5–C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(getMasterGain(ctx));
      osc.type = "triangle";
      const t = now + i * 0.08;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  } catch (e) {
    console.warn("Audio playback error:", e);
  }
}

/** Rising three-note fanfare for the "It's your turn!" notification */
function synthYourTurn() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const playNote = (delay: number, freq: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(getMasterGain(ctx));

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.15, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);

      osc.start(now + delay);
      osc.stop(now + delay + duration + 0.01);
    };

    // Rising three-note fanfare: G5 → B5 → D6
    playNote(0, 783.99, 0.15);
    playNote(0.12, 987.77, 0.15);
    playNote(0.24, 1174.66, 0.25);
  } catch (e) {
    console.warn("Audio playback error:", e);
  }
}

/** Triumphant fanfare for game-over / victory moment */
function synthGameOver() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    // C5 → E5 → G5 → C6 (major chord arpeggio)
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, idx) => {
      const delay = idx * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(getMasterGain(ctx));

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.12, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.4);

      osc.start(now + delay);
      osc.stop(now + delay + 0.45);
    });
  } catch (e) {
    console.warn("Audio playback error:", e);
  }
}

// =============================================================================
// Public API — sample-first, synth-fallback. Same names the rest of the app
// already calls, so callers don't change.
// =============================================================================

export const playRoll = () => play("roll", synthRoll);
export const playCash = () => play("cash", synthCash);
export const playRentPay = () => play("rent", synthRentPay);
export const playDraw = () => play("draw", synthDraw);
export const playJail = () => play("jail", synthJail);
export const playBuild = () => play("build", synthBuild);
export const playHotel = () => {
  if (isMuted) return;
  synthHotel();
};
export const playYourTurn = () => play("your-turn", synthYourTurn);
export const playGameOver = () => play("game-over", synthGameOver);
