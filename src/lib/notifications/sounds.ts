/**
 * Notification sound player.
 *
 * Uses the Web Audio API to synthesize short tones — no audio asset files
 * needed, which keeps the AAB small and avoids licensing issues. Each sound
 * is a brief oscillator envelope that mimics a common notification tone.
 *
 * On Capacitor native, the Android notification channel handles sound
 * independently; this module is only used for the in-app (foreground) guest
 * reminder path.
 */

import type { NotificationSound } from "@/lib/daydial/types";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) {
    // If the context was closed (e.g. by the browser), discard it and recreate.
    if (audioCtx.state === "closed") {
      audioCtx = null;
    } else {
      return audioCtx;
    }
  }
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

interface ToneSpec {
  freq: number;
  start: number;
  duration: number;
  type: OscillatorType;
  gain?: number;
}

function playTones(ctx: AudioContext, tones: ToneSpec[]): void {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.3;
  master.connect(ctx.destination);

  // Track the end time so we can disconnect nodes after playback finishes,
  // preventing audio graph node accumulation in the WebView.
  let maxEnd = 0;
  const nodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  for (const t of tones) {
    const osc = ctx.createOscillator();
    osc.type = t.type;
    osc.frequency.value = t.freq;
    const g = ctx.createGain();
    const peak = t.gain ?? 0.5;
    g.gain.setValueAtTime(0, now + t.start);
    g.gain.linearRampToValueAtTime(peak, now + t.start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.duration);
    osc.connect(g);
    g.connect(master);
    osc.start(now + t.start);
    osc.stop(now + t.start + t.duration + 0.05);
    nodes.push({ osc, gain: g });
    maxEnd = Math.max(maxEnd, t.start + t.duration + 0.1);
  }

  // Disconnect all nodes after playback to free WebView audio resources.
  const cleanupMs = maxEnd * 1000 + 100;
  setTimeout(() => {
    for (const { osc, gain } of nodes) {
      try {
        osc.disconnect();
      } catch {
        /* already disconnected */
      }
      try {
        gain.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    try {
      master.disconnect();
    } catch {
      /* already disconnected */
    }
  }, cleanupMs);
}

const SOUND_PRESETS: Record<Exclude<NotificationSound, "none">, ToneSpec[]> = {
  chime: [
    { freq: 880, start: 0, duration: 0.3, type: "sine" },
    { freq: 1320, start: 0.12, duration: 0.3, type: "sine" },
  ],
  bell: [
    { freq: 660, start: 0, duration: 0.5, type: "triangle" },
    { freq: 990, start: 0.05, duration: 0.45, type: "triangle", gain: 0.3 },
  ],
  digital: [
    { freq: 1000, start: 0, duration: 0.08, type: "square" },
    { freq: 1000, start: 0.12, duration: 0.08, type: "square" },
    { freq: 1500, start: 0.24, duration: 0.12, type: "square" },
  ],
  gentle: [
    { freq: 523, start: 0, duration: 0.4, type: "sine" },
    { freq: 659, start: 0.15, duration: 0.4, type: "sine", gain: 0.4 },
  ],
};

/**
 * Play the given notification sound. No-op for "none" or when the Web Audio
 * API is unavailable. The AudioContext is resumed on first use (browsers
 * suspend it until a user gesture).
 */
export function playNotificationSound(sound: NotificationSound): void {
  if (sound === "none") return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const preset = SOUND_PRESETS[sound];
  if (preset) playTones(ctx, preset);
}

/**
 * Preview a sound from settings (used by the Settings screen). Wraps
 * playNotificationSound with a try/catch so a failed preview never throws.
 */
export function previewNotificationSound(sound: NotificationSound): void {
  try {
    playNotificationSound(sound);
  } catch {
    // ignore — audio is a nice-to-have
  }
}

/**
 * Close and release the AudioContext. Call this when the app is being
 * torn down or when audio is no longer needed to prevent resource leaks
 * in the Capacitor WebView.
 */
export function cleanupAudioContext(): void {
  if (audioCtx && audioCtx.state !== "closed") {
    void audioCtx.close().catch(() => {
      /* ignore */
    });
  }
  audioCtx = null;
}
