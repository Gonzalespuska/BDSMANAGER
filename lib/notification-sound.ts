/**
 * Notification sound — Web Audio API generated "ding" (dva krátke tóny).
 *
 * User 2026-07-15: „nech mi ta skurvena aplikacia cinka ked chce nieco
 * potvrdit dobre".
 *
 * Prečo Web Audio a nie <audio src="ding.mp3">:
 *   • Žiadny binárny asset — všetko v kóde, nula bytov navyše
 *   • Autoplay policy: potrebuje user gesture; po prvom user interakcii
 *     (klik hocikde) sa AudioContext resume-ne a odvtedy ide ticho.
 *
 * API:
 *   playDing() — 2-tónový oznamovací ding
 *   playAlarm() — 3× ding v rade, pre kritické (unaccepted request pending)
 *
 * Client-only (window guard). Silent no-op v SSR / bez audio.
 */

let ctx: AudioContext | null = null;
let unlocked = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

/**
 * Pre-warm audio context na prvý user gesture — bez tohto Chrome
 * blokuje playDing() ak ešte nebola žiadna interakcia s tabom.
 */
export function unlockAudioOnFirstInteraction() {
  if (typeof window === "undefined" || unlocked) return;
  const unlock = () => {
    const c = ensureCtx();
    if (c && c.state === "suspended") {
      c.resume().catch(() => {});
    }
    unlocked = true;
    window.removeEventListener("click", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("click", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });
}

function tone(freq: number, startAt: number, duration: number, volume = 0.15) {
  const c = ensureCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.value = 0;
  // Envelope: krátky attack + release, aby to neplo ale prasklo pekne.
  gain.gain.setValueAtTime(0, c.currentTime + startAt);
  gain.gain.linearRampToValueAtTime(volume, c.currentTime + startAt + 0.005);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    c.currentTime + startAt + duration,
  );
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(c.currentTime + startAt);
  osc.stop(c.currentTime + startAt + duration + 0.02);
}

/** 2-tónový oznamovací ding (C6 → E6, 250 ms total). */
export function playDing() {
  tone(1046.5, 0, 0.14); // C6
  tone(1318.5, 0.13, 0.16); // E6
}

/** Alarm — 3× ding v rade (pre kritické / pending accept). */
export function playAlarm() {
  playDing();
  setTimeout(() => playDing(), 380);
  setTimeout(() => playDing(), 760);
}
