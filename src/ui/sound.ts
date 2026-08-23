/**
 * Sound hooks. The engine emits events; this maps them to short WebAudio
 * blips. Real audio assets can replace `blip` later without touching the UI:
 * everything routes through playForEvent().
 */
import type { GameEvent } from '../engine/types';

let muted = true;
let context: AudioContext | null = null;

export function soundsMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (!muted && !context) {
    try {
      context = new AudioContext();
    } catch {
      context = null;
    }
  }
}

function blip(freq: number, durationMs: number, type: OscillatorType = 'square'): void {
  if (muted || !context) return;
  try {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + durationMs / 1000);
    osc.connect(gain).connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + durationMs / 1000);
  } catch {
    /* audio is best-effort */
  }
}

/** The single entry point: one engine event → at most one sound. */
export function playForEvent(event: GameEvent): void {
  switch (event.type) {
    case 'combat':
      if (event.dice?.result === 'hit') blip(220, 90);
      else if (event.dice?.result === 'riposte') blip(160, 120, 'sawtooth');
      else blip(300, 50, 'sine');
      break;
    case 'death':
      blip(90, 220, 'sawtooth');
      break;
    case 'summon':
      blip(440, 70, 'triangle');
      break;
    case 'combo':
      blip(520, 160, 'triangle');
      break;
    case 'doom':
      blip(120, 100, 'square');
      break;
    case 'gameOver':
      blip(70, 500, 'sawtooth');
      break;
    default:
      break;
  }
}
