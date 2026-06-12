/**
 * Shared AudioContext management for notification sounds.
 *
 * Browsers cap the number of concurrent `AudioContext` instances (typically ~6).
 * Creating a fresh context per notification (the previous behavior) eventually
 * exhausts that pool and silently breaks audio. This module reuses a single
 * module-level `AudioContext`, recreating it only when it has been closed and
 * resuming it when the browser has left it in the `suspended` state (e.g. due
 * to autoplay policies).
 *
 * Validates: Requirements 3.3
 */

type AudioContextConstructor = typeof AudioContext;

interface AudioContextWindow {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
}

// Module-level singleton. Reused across every notification sound play.
let sharedCtx: AudioContext | null = null;

/**
 * Resolves the AudioContext constructor for the current environment, falling
 * back to the vendor-prefixed `webkitAudioContext` used by older Safari/iOS.
 * Returns `null` when the Web Audio API is unavailable.
 */
function resolveAudioContextCtor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as AudioContextWindow;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Returns the shared `AudioContext`, creating it lazily on first use and
 * recreating it only if the previous instance has been closed. If the context
 * is suspended (common before a user gesture), playback resumes it.
 *
 * The accessor is pure-ish and testable: given a stable environment it returns
 * the same instance across calls, and it never throws for a closed context —
 * it transparently creates a replacement.
 *
 * @returns the shared AudioContext, or `null` when Web Audio is unsupported.
 */
export function getAudioContext(): AudioContext | null {
  if (sharedCtx && sharedCtx.state !== 'closed') {
    return sharedCtx;
  }

  const Ctor = resolveAudioContextCtor();
  if (!Ctor) return null;

  sharedCtx = new Ctor();
  return sharedCtx;
}

/**
 * Resets the shared AudioContext reference. Intended for tests so each case
 * starts from a known state; not used by application code.
 */
export function resetAudioContextForTesting(): void {
  sharedCtx = null;
}

/**
 * Plays the two-tone notification chime using the shared `AudioContext`.
 *
 * Oscillator and gain nodes are created per play (they are single-use Web Audio
 * nodes), but the underlying context is reused. The whole routine is wrapped in
 * try/catch so an unavailable or restricted audio environment never disrupts
 * the notification flow.
 */
export function playNotificationSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // The context can be left suspended by autoplay policies until a user
    // gesture occurs; resume so the chime is audible once interaction begins.
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    /* audio not available */
  }
}
