/**
 * Fade preview audio down before guest video/voice (web experience only — not for export).
 */
export function duckAudio(audio: HTMLAudioElement, durationMs = 800): void {
  const step = 0.05;
  const v = Math.max(0, Math.min(1, audio.volume));
  if (v <= step) {
    try {
      audio.pause();
      audio.volume = 1;
    } catch {
      /* ignore */
    }
    return;
  }
  const steps = Math.ceil(v / step);
  const intervalMs = Math.max(16, durationMs / Math.max(steps, 1));
  const fade = setInterval(() => {
    try {
      if (audio.volume <= step) {
        audio.pause();
        audio.volume = 1;
        clearInterval(fade);
        return;
      }
      audio.volume = Math.max(0, Math.min(1, audio.volume - step));
    } catch {
      clearInterval(fade);
    }
  }, intervalMs);
}
