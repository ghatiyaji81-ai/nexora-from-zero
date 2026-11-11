export const SPEAK_AUDIO_MIME_TYPES = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
} as const;

export type SpeakAudioMimeType = keyof typeof SPEAK_AUDIO_MIME_TYPES;

const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

export function normalizeSpeakAudioMimeType(value: string): SpeakAudioMimeType | null {
  const mimeType = value.split(';', 1)[0].trim().toLowerCase();
  return Object.hasOwn(SPEAK_AUDIO_MIME_TYPES, mimeType) ? mimeType as SpeakAudioMimeType : null;
}

export function selectRecorderMimeType(isTypeSupported: (mimeType: string) => boolean): string | null {
  return RECORDER_MIME_CANDIDATES.find(isTypeSupported) ?? null;
}

export function hasSpeakAudioSignature(bytes: Uint8Array, mimeType: SpeakAudioMimeType) {
  const ascii = (start: number, value: string) => value.split('').every((character, index) => bytes[start + index] === character.charCodeAt(0));
  if (mimeType === 'audio/webm') return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (mimeType === 'audio/ogg') return bytes.length >= 4 && ascii(0, 'OggS');
  if (mimeType === 'audio/mp4') return bytes.length >= 12 && ascii(4, 'ftyp');
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return bytes.length >= 12 && ascii(0, 'RIFF') && ascii(8, 'WAVE');
  if (mimeType === 'audio/mpeg') return bytes.length >= 3 && (ascii(0, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
  return false;
}

export function createSpeakRecordingBlob(chunks: BlobPart[], mimeType: string, interrupted = false) {
  if (interrupted || !chunks.length) return null;
  const blob = new Blob(chunks, { type: mimeType });
  return blob.size ? blob : null;
}

export type SpeechRecognitionAlternativeLike = { transcript: string };
export type SpeechRecognitionResultLike = ArrayLike<SpeechRecognitionAlternativeLike>;
export type SpeechRecognitionResultListLike = ArrayLike<SpeechRecognitionResultLike>;
export type SpeechRecognitionEventLike = { results: SpeechRecognitionResultListLike };

export function transcriptFromResults(results: SpeechRecognitionResultListLike) {
  const transcript: string[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const alternative = results[index]?.[0];
    if (alternative?.transcript) transcript.push(alternative.transcript);
  }
  return transcript.join('').trim();
}

export interface SpeechVoiceLike {
  lang: string;
}

export interface SpeechUtteranceLike {
  text: string;
  lang: string;
  rate: number;
  volume: number;
  voice: SpeechVoiceLike | null;
}

export interface SpeechSynthesisPort<Utterance extends SpeechUtteranceLike> {
  cancel(): void;
  speak(utterance: Utterance): void;
}

export function playSpeech<Utterance extends SpeechUtteranceLike>(
  synthesis: SpeechSynthesisPort<Utterance>,
  createUtterance: (text: string) => Utterance,
  text: string,
  options: { voice: SpeechVoiceLike | null; rate: number; volume: number },
) {
  const utterance = createUtterance(text);
  utterance.voice = options.voice;
  utterance.lang = options.voice?.lang || 'en-US';
  utterance.rate = Math.min(2, Math.max(0.5, options.rate));
  utterance.volume = Math.min(1, Math.max(0, options.volume));
  synthesis.cancel();
  synthesis.speak(utterance);
  return utterance;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
export type SpeechRecognitionScope = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function getSpeechRecognitionConstructor(scope: SpeechRecognitionScope) {
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}
