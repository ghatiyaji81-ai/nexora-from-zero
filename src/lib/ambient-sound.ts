/**
 * NEXORA Web Audio Ambient Sound Generator
 * Generates procedural calm soundscapes (Rain, White Noise, Lo-Fi Warm Drone)
 * purely in-browser using Web Audio API.
 *
 * Rules:
 * - NEVER autoplays (only starts on user interaction).
 * - Has explicit volume control and mute.
 * - Automatically stops when the focus session ends or resets.
 */

export type AmbientSoundType = 'off' | 'rain' | 'white-noise' | 'lo-fi';

export interface AmbientAudioState {
  currentSound: AmbientSoundType;
  volume: number; // 0 to 1
  isMuted: boolean;
  isPlaying: boolean;
}

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let activeSourceNodes: AudioNode[] = [];

let ambientState: AmbientAudioState = {
  currentSound: 'off',
  volume: 0.3, // calibrated to comfortable 30% default
  isMuted: false,
  isPlaying: false,
};

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function notifyAmbientChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('nexora-ambient-change', {
      detail: { ...ambientState },
    })
  );
}

function clearNodes() {
  for (const node of activeSourceNodes) {
    try {
      if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
        (node as AudioScheduledSourceNode).stop();
      }
      node.disconnect();
    } catch {}
  }
  activeSourceNodes = [];
}

/**
 * Generate a white noise buffer
 */
function createNoiseBuffer(ctx: AudioContext, seconds = 3): AudioBuffer {
  const bufferSize = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Rain synthesis: Bandpassed noise with gentle modulation
 */
function buildRain(ctx: AudioContext, dest: AudioNode): AudioNode[] {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 4);
  noise.loop = true;

  // Gentle low-pass to eliminate harsh frequencies
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 700; // softened from 950Hz

  // Band-pass to shape rain tone
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 420;
  bandpass.Q.value = 0.7;

  // Gain node for rain body
  const rainGain = ctx.createGain();
  rainGain.gain.value = 0.65;

  noise.connect(lowpass);
  lowpass.connect(bandpass);
  bandpass.connect(rainGain);
  rainGain.connect(dest);

  noise.start();
  return [noise, lowpass, bandpass, rainGain];
}

/**
 * White noise synthesis: Smooth soft filtered noise
 */
function buildWhiteNoise(ctx: AudioContext, dest: AudioNode): AudioNode[] {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 3);
  noise.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 850; // soft warm roll-off for non-fatiguing gentle air

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.5;

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(dest);

  noise.start();
  return [noise, filter, noiseGain];
}

/**
 * Lo-Fi drone: Soft analog dual-oscillator drone with warm harmonic resonance
 */
function buildLoFiDrone(ctx: AudioContext, dest: AudioNode): AudioNode[] {
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 65.41; // C2

  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = 130.81; // C3
  osc2.detune.value = 4; // subtle detune warmth

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 220; // deep, velvety lo-fi warmth

  // LFO to create slow breathing pulse
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.15; // slow 6-second cycle
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 40; // modulates filter by +/- 40Hz
  lfo.connect(filter.frequency);

  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.7;

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(droneGain);
  droneGain.connect(dest);

  osc1.start();
  osc2.start();
  lfo.start();

  return [osc1, osc2, lfo, lfoGain, filter, droneGain];
}

export function getAmbientState(): AmbientAudioState {
  return { ...ambientState };
}

export function setAmbientSound(type: AmbientSoundType): void {
  if (type === 'off') {
    stopAmbientSound();
    return;
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  clearNodes();

  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
  }

  const effectiveGain = ambientState.isMuted ? 0 : ambientState.volume;
  masterGain.gain.cancelScheduledValues(ctx.currentTime);
  masterGain.gain.setValueAtTime(effectiveGain, ctx.currentTime);

  let nodes: AudioNode[] = [];
  if (type === 'rain') {
    nodes = buildRain(ctx, masterGain);
  } else if (type === 'white-noise') {
    nodes = buildWhiteNoise(ctx, masterGain);
  } else if (type === 'lo-fi') {
    nodes = buildLoFiDrone(ctx, masterGain);
  }

  activeSourceNodes = nodes;
  ambientState = {
    ...ambientState,
    currentSound: type,
    isPlaying: true,
  };

  notifyAmbientChange();
}

export function setAmbientVolume(newVolume: number): void {
  const bounded = Math.max(0, Math.min(1, newVolume));
  ambientState = {
    ...ambientState,
    volume: bounded,
  };

  if (masterGain && audioCtx) {
    const effectiveGain = ambientState.isMuted ? 0 : bounded;
    masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
    masterGain.gain.setValueAtTime(effectiveGain, audioCtx.currentTime);
  }

  notifyAmbientChange();
}

export function toggleAmbientMute(): boolean {
  ambientState = {
    ...ambientState,
    isMuted: !ambientState.isMuted,
  };

  if (masterGain && audioCtx) {
    const effectiveGain = ambientState.isMuted ? 0 : ambientState.volume;
    masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
    masterGain.gain.setValueAtTime(effectiveGain, audioCtx.currentTime);
  }

  notifyAmbientChange();
  return ambientState.isMuted;
}

export function stopAmbientSound(): void {
  if (masterGain && audioCtx) {
    try {
      masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    } catch {}
  }

  setTimeout(() => {
    clearNodes();
  }, 160);

  ambientState = {
    ...ambientState,
    currentSound: 'off',
    isPlaying: false,
  };

  notifyAmbientChange();
}

