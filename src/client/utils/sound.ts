// =============================================================================
// client/utils/sound.ts — procedural sound effects using browser Web Audio API
// -----------------------------------------------------------------------------
// This synthesizes clean retro game sound effects on-the-fly, requiring no
// external .mp3 assets.
// =============================================================================

let audioCtx: AudioContext | null = null;
let isMuted = false;

export function setMuted(muted: boolean) {
  isMuted = muted;
}

export function getMuted(): boolean {
  return isMuted;
}

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Sweeping low rumble for rolling dice
 */
export function playRoll() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

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

/**
 * Retro double-chime ding-ding for buying assets, passing START, or winning jackpots
 */
export function playCash() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const playChime = (delay: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
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

/**
 * Sad descending sweep for paying rent or tax
 */
export function playRentPay() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

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

/**
 * Ascending arpeggio sweeps for drawing Chance or Esusu cards
 */
export function playDraw() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      const delay = idx * 0.05;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

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

/**
 * Detuned sawtooth warning buzz for getting sent to Jail (Kirikiri)
 */
export function playJail() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.type = "sawtooth";
    osc2.type = "sawtooth";

    osc1.frequency.setValueAtTime(110, now);
    osc2.frequency.setValueAtTime(113, now); // slightly detuned

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.start(now);
    osc2.start(now);

    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  } catch (e) {
    console.warn("Audio playback error:", e);
  }
}

/**
 * Dual percussive knocks (hammer-building sound) for upgrading properties
 */
export function playBuild() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const playKnock = (delay: number, pitch: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

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
