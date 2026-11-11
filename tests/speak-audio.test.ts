import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSpeakRecordingBlob,
  getSpeechRecognitionConstructor,
  hasSpeakAudioSignature,
  normalizeSpeakAudioMimeType,
  playSpeech,
  selectRecorderMimeType,
  transcriptFromResults,
  type SpeechRecognitionLike,
  type SpeechUtteranceLike,
} from '../src/lib/speak-audio';

test('recording format selection uses supported browser codecs and handles unsupported browsers', () => {
  const tried: string[] = [];
  assert.equal(selectRecorderMimeType(type => { tried.push(type); return type === 'audio/mp4'; }), 'audio/mp4');
  assert.deepEqual(tried, ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']);
  assert.equal(selectRecorderMimeType(() => false), null);
});

test('interrupted recordings are discarded and successful chunks produce a replayable blob', async () => {
  const chunk = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: 'audio/webm' });
  assert.equal(createSpeakRecordingBlob([chunk], 'audio/webm', true), null);
  assert.equal(createSpeakRecordingBlob([], 'audio/webm'), null);
  const recording = createSpeakRecordingBlob([chunk], 'audio/webm');
  assert.ok(recording);
  assert.equal(recording.type, 'audio/webm');
  assert.equal(recording.size, 4);
  assert.deepEqual([...new Uint8Array(await recording.arrayBuffer())], [0x1a, 0x45, 0xdf, 0xa3]);
});

test('audio MIME types are normalized and verified against format signatures', () => {
  assert.equal(normalizeSpeakAudioMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(normalizeSpeakAudioMimeType('application/octet-stream'), null);
  assert.equal(hasSpeakAudioSignature(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), 'audio/webm'), true);
  assert.equal(hasSpeakAudioSignature(new TextEncoder().encode('OggS.....'), 'audio/ogg'), true);
  assert.equal(hasSpeakAudioSignature(new TextEncoder().encode('RIFF0000WAVE'), 'audio/wav'), true);
  assert.equal(hasSpeakAudioSignature(new TextEncoder().encode('not audio'), 'audio/webm'), false);
});

test('speech transcripts combine current result alternatives without exposing recognition event types', () => {
  const results = [
    { 0: { transcript: '  Hello ' }, length: 1 },
    { 0: { transcript: 'there.  ' }, length: 1 },
  ];
  assert.equal(transcriptFromResults(results), 'Hello there.');
  assert.equal(transcriptFromResults([]), '');
});

test('speech playback cancels previous audio and applies selected voice and bounded settings', () => {
  const calls: string[] = [];
  type Utterance = SpeechUtteranceLike & { voice: { lang: string } | null };
  const synthesis = {
    cancel() { calls.push('cancel'); },
    speak(utterance: Utterance) { calls.push(`speak:${utterance.text}`); },
  };
  const voice = { lang: 'hi-IN' };
  const utterance = playSpeech(synthesis, text => ({
    text, lang: '', rate: 1, volume: 1, voice: null,
  }), 'नमस्ते', { voice, rate: 3, volume: -1 });
  assert.equal(utterance.voice, voice);
  assert.equal(utterance.lang, 'hi-IN');
  assert.equal(utterance.rate, 2);
  assert.equal(utterance.volume, 0);
  assert.deepEqual(calls, ['cancel', 'speak:नमस्ते']);
});

test('speech recognition chooses browser implementation and falls back when unavailable', () => {
  class BrowserRecognition implements SpeechRecognitionLike {
    continuous = false;
    interimResults = false;
    lang = '';
    onresult = null;
    onerror = null;
    onend = null;
    start() {}
    stop() {}
    abort() {}
  }
  assert.equal(getSpeechRecognitionConstructor({ SpeechRecognition: BrowserRecognition }), BrowserRecognition);
  assert.equal(getSpeechRecognitionConstructor({ webkitSpeechRecognition: BrowserRecognition }), BrowserRecognition);
  assert.equal(getSpeechRecognitionConstructor({}), null);
});
