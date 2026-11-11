import 'server-only';

export interface SpeakProviderCapabilities {
  realtime: boolean;
  speechToText: boolean;
  textToSpeech: boolean;
}

export type SpeakTranscriptionEvent = { text: string; final: boolean };
export type SpeakAudioInput = { chunks: AsyncIterable<Uint8Array>; mimeType: string; language: string; signal: AbortSignal };
export type SpeakSynthesisOptions = { text: string; voice?: string; language: string; signal: AbortSignal };

export interface SpeakProviderAdapter {
  readonly id: string;
  readonly capabilities: SpeakProviderCapabilities;
  isConfigured(): boolean;
  transcribe?(input: SpeakAudioInput): AsyncIterable<SpeakTranscriptionEvent>;
  synthesize?(input: SpeakSynthesisOptions): Promise<{ audio: ReadableStream<Uint8Array>; mimeType: string }>;
}

export const SPEAK_CLOUD_VOICE_STATUS = 'No cloud voice provider is configured; SPEAK uses browser-native speech APIs.';
