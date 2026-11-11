'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSpeechRecognitionConstructor,
  createSpeakRecordingBlob,
  playSpeech,
  selectRecorderMimeType,
  transcriptFromResults,
  type SpeechRecognitionLike,
  type SpeechVoiceLike,
} from '@/lib/speak-audio';

type AgentId = 'general' | 'research' | 'coding' | 'study' | 'writing' | 'analysis';
type Conversation = { id: string; title: string; model?: string; agent?: AgentId; updatedAt?: string };
type Message = { id: string; role: 'user' | 'assistant'; content: string; status: 'complete' | 'streaming' | 'failed' | 'interrupted'; createdAt: string };
type Recording = { id: string; conversationId: string | null; name: string; mimeType: string; size: number; durationMs: number; transcript: string; createdAt: string };
type BrowserSpeechVoice = SpeechSynthesisVoice & SpeechVoiceLike;
const MAX_RECORDING_DURATION_MS = 60 * 60 * 1000;
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

async function responseError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error ?? `Request failed (${response.status}).`;
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(totalSeconds / 60).toString().padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
}

function speakErrorMessage(error: string) {
  const messages: Record<string, string> = {
    'not-allowed': 'Microphone access was denied. Allow microphone access in your browser settings and try again.',
    'service-not-allowed': 'Speech recognition is disabled by the browser or device policy.',
    'audio-capture': 'No microphone is available. Connect a microphone and try again.',
    network: 'Browser speech recognition could not connect. Check your connection and try again.',
    'no-speech': 'No speech was detected. Try speaking a little closer to the microphone.',
    aborted: 'Speech recognition was stopped.',
  };
  return messages[error] ?? `Speech recognition failed (${error}).`;
}

export function SpeakWorkspace({ displayName }: { displayName: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [voices, setVoices] = useState<BrowserSpeechVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [continuous, setContinuous] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [recognitionAvailable, setRecognitionAvailable] = useState(false);
  const [synthesisAvailable, setSynthesisAvailable] = useState(false);
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'processing'>('idle');
  const [transcript, setTranscript] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [localAudioUrl, setLocalAudioUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playingId, setPlayingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const transcriptRef = useRef('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const localBlobRef = useRef<Blob | null>(null);
  const durationRef = useRef(0);
  const recordingStartedAtRef = useRef(0);
  const urlRef = useRef('');
  const playbackUrlRef = useRef('');
  const playerRef = useRef<HTMLAudioElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const setTranscriptValue = useCallback((value: string) => {
    transcriptRef.current = value;
    setTranscript(value);
  }, []);

  const refreshConversations = useCallback(async () => {
    const response = await fetch('/api/think/conversations', { cache: 'no-store' });
    if (!response.ok) throw new Error(await responseError(response));
    const body = await response.json() as { conversations: Array<Conversation & { _id?: string }> };
    const items = body.conversations.map(item => ({ ...item, id: item.id ?? item._id ?? '' })).filter(item => item.id);
    setConversations(items);
    return items;
  }, []);

  const refreshRecordings = useCallback(async () => {
    const response = await fetch('/api/speak/recordings', { cache: 'no-store' });
    if (!response.ok) throw new Error(await responseError(response));
    const body = await response.json() as { recordings: Recording[] };
    setRecordings(body.recordings);
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    if (!id) { setMessages([]); return; }
    const response = await fetch(`/api/think/conversations/${id}/messages`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await responseError(response));
    const body = await response.json() as { messages: Message[] };
    setMessages(body.messages);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void Promise.all([
      fetch('/api/think/conversations', { cache: 'no-store', signal: controller.signal }),
      fetch('/api/speak/recordings', { cache: 'no-store', signal: controller.signal }),
    ]).then(async ([conversationResponse, recordingResponse]) => {
      if (!conversationResponse.ok) throw new Error(await responseError(conversationResponse));
      if (!recordingResponse.ok) throw new Error(await responseError(recordingResponse));
      const [conversationBody, recordingBody] = await Promise.all([
        conversationResponse.json() as Promise<{ conversations: Array<Conversation & { _id?: string }> }>,
        recordingResponse.json() as Promise<{ recordings: Recording[] }>,
      ]);
      if (!active) return;
      const items = conversationBody.conversations.map(item => ({ ...item, id: item.id ?? item._id ?? '' })).filter(item => item.id);
      setConversations(items);
      setRecordings(recordingBody.recordings);
      if (items[0]) setConversationId(items[0].id);
    }).catch(loadError => {
      if (active && !(loadError instanceof DOMException && loadError.name === 'AbortError')) setError(loadError instanceof Error ? loadError.message : 'SPEAK could not load.');
    }).finally(() => { if (active) setLoading(false); });
    setRecognitionAvailable(Boolean(getSpeechRecognitionConstructor(window as SpeechWindow)));
    setSynthesisAvailable('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window);
    return () => { active = false; controller.abort(); };
  }, []);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    let active = true;
    setMessages([]);
    void loadMessages(conversationId).catch(loadError => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Conversation history could not load.');
    });
    return () => { active = false; };
  }, [conversationId, loadMessages]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const synthesis = window.speechSynthesis;
    const updateVoices = () => {
      const available = synthesis.getVoices();
      setVoices(available);
      setSelectedVoice(previous => previous || available[0]?.voiceURI || '');
    };
    updateVoices();
    synthesis.addEventListener('voiceschanged', updateVoices);
    return () => synthesis.removeEventListener('voiceschanged', updateVoices);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recognitionRef.current?.abort();
      streamAbortRef.current?.abort();
      discardRecordingRef.current = true;
      recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      void audioContextRef.current?.close();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (recordingState !== 'recording') return;
    const timer = window.setInterval(() => {
      const duration = durationRef.current + Math.max(0, performance.now() - recordingStartedAtRef.current);
      if (duration >= MAX_RECORDING_DURATION_MS) {
        durationRef.current = MAX_RECORDING_DURATION_MS;
        recordingStartedAtRef.current = performance.now();
        stopRecording();
      } else setElapsedMs(duration);
    }, 100);
    return () => window.clearInterval(timer);
  }, [recordingState]);

  function stopWaveform() {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }

  function releaseMicrophone() {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
    stopWaveform();
  }

  function drawWaveform(analyser: AnalyserNode) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const values = new Uint8Array(analyser.fftSize);
    const draw = () => {
      analyser.getByteTimeDomainData(values);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.lineWidth = 2;
      context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent-ink').trim() || '#71833f';
      context.beginPath();
      const step = canvas.width / values.length;
      for (let index = 0; index < values.length; index += 1) {
        const x = index * step;
        const y = (values[index] / 255) * canvas.height;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
      animationRef.current = requestAnimationFrame(draw);
    };
    draw();
  }

  function startListening() {
    const Constructor = getSpeechRecognitionConstructor(window as SpeechWindow);
    if (!Constructor) {
      setError('Speech recognition is not available in this browser. You can still type a transcript or record audio.');
      setRecognitionAvailable(false);
      return;
    }
    if (recordingState === 'recording' || recordingState === 'paused') {
      setError('Stop the audio recording before starting speech recognition.');
      return;
    }
    setError('');
    const recognition = new Constructor();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.onresult = event => setTranscriptValue(transcriptFromResults(event.results).slice(0, 4000));
    recognition.onerror = event => {
      setListening(false);
      setError(speakErrorMessage(event.error));
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current?.abort();
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      setNotice('Listening in your browser…');
    } catch (startError) {
      recognitionRef.current = null;
      setError(startError instanceof Error ? startError.message : 'Speech recognition could not start.');
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
    setNotice('');
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Audio recording is not supported in this browser.');
      return;
    }
    if (listening) stopListening();
    const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
      ? selectRecorderMimeType(value => MediaRecorder.isTypeSupported(value))
      : null;
    if (!mimeType) {
      setError('This browser does not report a supported recording format.');
      return;
    }
    setRecordingState('processing');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      discardRecordingRef.current = false;
      localBlobRef.current = null;
      durationRef.current = 0;
      setElapsedMs(0);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      setLocalAudioUrl('');
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        releaseMicrophone();
        if (discardRecordingRef.current) {
          chunksRef.current = [];
          localBlobRef.current = null;
          setRecordingState('idle');
          return;
        }
        const blob = createSpeakRecordingBlob(chunksRef.current, recorder.mimeType, discardRecordingRef.current);
        if (!blob) {
          chunksRef.current = [];
          localBlobRef.current = null;
          setRecordingState('idle');
          return;
        }
        localBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setLocalAudioUrl(url);
        setRecordingState('idle');
        setNotice(blob.size ? 'Recording ready to preview or save privately.' : '');
      };
      recorder.onerror = () => {
        setError('Audio recording was interrupted. The partial recording was discarded.');
        chunksRef.current = [];
        setRecordingState('idle');
        releaseMicrophone();
      };
      recorderRef.current = recorder;
      recorder.start(250);
      recordingStartedAtRef.current = performance.now();
      setRecordingState('recording');
      setNotice('Recording. Your audio stays in this browser until you choose Save recording.');
      drawWaveform(analyser);
    } catch (recordingError) {
      releaseMicrophone();
      if (mountedRef.current) setRecordingState('idle');
      const name = recordingError instanceof DOMException ? recordingError.name : '';
      if (mountedRef.current) setError(name === 'NotAllowedError' ? 'Microphone access was denied. Allow microphone access to record audio.' : name === 'NotFoundError' ? 'No microphone was found.' : 'The microphone could not be opened.');
    }
  }

  function pauseRecording() {
    if (recorderRef.current?.state !== 'recording') return;
    durationRef.current += Math.max(0, performance.now() - recordingStartedAtRef.current);
    recorderRef.current.pause();
    setElapsedMs(durationRef.current);
    setRecordingState('paused');
    stopWaveform();
  }

  function resumeRecording() {
    if (recorderRef.current?.state !== 'paused') return;
    try {
      if (!mediaStreamRef.current?.active) throw new Error('The microphone is no longer active.');
      recorderRef.current.resume();
      recordingStartedAtRef.current = performance.now();
      setRecordingState('recording');
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(mediaStreamRef.current!);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      drawWaveform(analyser);
    } catch {
      setError('The recording could not resume. Stop and save the available audio or discard it.');
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    if (recorder.state === 'recording') durationRef.current += Math.max(0, performance.now() - recordingStartedAtRef.current);
    durationRef.current = Math.min(durationRef.current, MAX_RECORDING_DURATION_MS);
    setElapsedMs(durationRef.current);
    setRecordingState('processing');
    stopWaveform();
    recorder.stop();
  }

  function discardLocalRecording() {
    discardRecordingRef.current = true;
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
    releaseMicrophone();
    chunksRef.current = [];
    localBlobRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = '';
    setLocalAudioUrl('');
    setElapsedMs(0);
    durationRef.current = 0;
    setRecordingState('idle');
    setNotice('');
  }

  async function createConversation() {
    const settingsResponse = await fetch('/api/think/settings', { cache: 'no-store' });
    if (!settingsResponse.ok) throw new Error(await responseError(settingsResponse));
    const settings = await settingsResponse.json() as { preference: { model: string; agent: AgentId } };
    const response = await fetch('/api/think/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: settings.preference.model, agent: settings.preference.agent }),
    });
    if (!response.ok) throw new Error(await responseError(response));
    const body = await response.json() as { conversation: Conversation & { _id?: string } };
    const created = { ...body.conversation, id: body.conversation.id ?? body.conversation._id ?? '' };
    setConversations(previous => [created, ...previous.filter(item => item.id !== created.id)]);
    setConversationId(created.id);
    setMessages([]);
    return created.id;
  }

  async function sendTranscript() {
    const content = transcriptRef.current.trim();
    if (!content || sending) return;
    setError('');
    setNotice('');
    stopListening();
    setSending(true);
    let activeConversationId = conversationId;
    let activeAssistantId = '';
    try {
      if (!activeConversationId) activeConversationId = await createConversation();
      const controller = new AbortController();
      streamAbortRef.current = controller;
      const response = await fetch(`/api/think/conversations/${activeConversationId}/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      if (!response.body) throw new Error('The THINK response stream was empty.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let completed = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const eventName = block.split('\n').find(line => line.startsWith('event:'))?.slice(6).trim();
          const dataLine = block.split('\n').find(line => line.startsWith('data:'))?.slice(5).trim();
          if (eventName && dataLine) {
            const data = JSON.parse(dataLine) as Record<string, unknown>;
            if (eventName === 'meta') {
              activeAssistantId = String(data.assistantMessageId);
              const incoming = data.userMessage as Message | null;
              if (incoming) setMessages(previous => [...previous, incoming]);
              setMessages(previous => [...previous, { id: activeAssistantId, role: 'assistant', content: '', status: 'streaming', createdAt: new Date().toISOString() }]);
            } else if (eventName === 'delta' && typeof data.text === 'string') {
              assistantText += data.text;
              setMessages(previous => previous.map(message => message.id === activeAssistantId ? { ...message, content: assistantText } : message));
            } else if (eventName === 'done') {
              completed = true;
              setMessages(previous => previous.map(message => message.id === activeAssistantId ? { ...message, status: 'complete' } : message));
            } else if (eventName === 'error') {
              throw new Error(typeof data.message === 'string' ? data.message : 'THINK could not complete this response.');
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
      if (!completed) throw new Error('The THINK response was interrupted before completion.');
      setTranscriptValue('');
      await Promise.all([loadMessages(activeConversationId), refreshConversations()]);
      if (autoRead && assistantText.trim()) readAloud(assistantText);
      else if (continuous) startListening();
      setNotice('Response saved to your THINK conversation.');
    } catch (sendError) {
      if (sendError instanceof DOMException && sendError.name === 'AbortError') {
        setMessages(previous => previous.map((message, index) => index === previous.length - 1 && message.status === 'streaming' ? { ...message, status: 'interrupted' } : message));
        setNotice('Response stopped. You can retry from the THINK conversation.');
      } else {
        if (activeAssistantId) setMessages(previous => previous.map(message => message.id === activeAssistantId ? { ...message, status: 'failed' } : message));
        setError(sendError instanceof Error ? sendError.message : 'Your message could not be sent.');
      }
    } finally {
      streamAbortRef.current = null;
      setSending(false);
    }
  }

  function readAloud(text: string) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      setError('Speech playback is not available in this browser.');
      return;
    }
    const voice = voices.find(item => item.voiceURI === selectedVoice) ?? null;
    const utterance = playSpeech(window.speechSynthesis, value => new SpeechSynthesisUtterance(value), text, { voice, rate, volume });
    setSpeaking(true);
    utterance.onend = () => {
      setSpeaking(false);
      if (continuous) startListening();
    };
    utterance.onerror = event => {
      setSpeaking(false);
      if (event.error !== 'canceled' && event.error !== 'interrupted') setError(`Speech playback failed (${event.error}).`);
    };
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  async function saveRecording() {
    const blob = localBlobRef.current;
    if (!blob || !blob.size) return;
    setSaving(true);
    setError('');
    try {
      const extension = blob.type.split(';', 1)[0].split('/').pop()?.replace('x-wav', 'wav') ?? 'webm';
      const form = new FormData();
      form.set('audio', new File([blob], `voice-recording.${extension}`, { type: blob.type }));
      form.set('durationMs', String(Math.min(Math.round(elapsedMs), 60 * 60 * 1000)));
      form.set('transcript', transcriptRef.current);
      if (conversationId) form.set('conversationId', conversationId);
      const response = await fetch('/api/speak/recordings', { method: 'POST', body: form });
      if (!response.ok) throw new Error(await responseError(response));
      const body = await response.json() as { recording: Recording };
      setRecordings(previous => [body.recording, ...previous.filter(item => item.id !== body.recording.id)]);
      localBlobRef.current = null;
      setNotice('Recording saved privately to your NEXORA account.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Recording could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function playRecording(recording: Recording) {
    if (playingId === recording.id) {
      playerRef.current?.pause();
      setPlayingId('');
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = '';
      return;
    }
    setError('');
    try {
      const response = await fetch(`/api/speak/recordings/${recording.id}/audio`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await responseError(response));
      const blob = await response.blob();
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = URL.createObjectURL(blob);
      if (playerRef.current) {
        playerRef.current.src = playbackUrlRef.current;
        await playerRef.current.play();
        setPlayingId(recording.id);
      }
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : 'Recording playback failed.');
    }
  }

  async function attachRecording(recording: Recording, nextConversationId: string) {
    try {
      const response = await fetch(`/api/speak/recordings/${recording.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: nextConversationId || null }),
      });
      if (!response.ok) { setError(await responseError(response)); return; }
      const body = await response.json() as { recording: Recording };
      setRecordings(previous => previous.map(item => item.id === body.recording.id ? body.recording : item));
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : 'Recording could not be attached.');
    }
  }

  async function deleteRecording(recording: Recording) {
    try {
      const response = await fetch(`/api/speak/recordings/${recording.id}`, { method: 'DELETE' });
      if (!response.ok) { setError(await responseError(response)); return; }
      setRecordings(previous => previous.filter(item => item.id !== recording.id));
      if (playingId === recording.id) {
        playerRef.current?.pause();
        setPlayingId('');
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Recording could not be deleted.');
    }
  }

  const currentVoice = voices.find(item => item.voiceURI === selectedVoice);
  const languages = [...new Set(voices.map(voice => voice.lang).filter(Boolean))];
  const supportedLanguageOptions = languages.length ? languages : [language];

  return (
    <main className="speak-workspace">
      <header className="speak-header">
        <div className="speak-heading">
          <span className="speak-mark" aria-hidden="true">◖</span>
          <div><p className="speak-eyebrow">NEXORA · VOICE INTELLIGENCE</p><h1>Speak naturally.</h1><p>Think out loud. Keep every conversation yours.</p></div>
        </div>
        <label className="speak-conversation-select"><span>THINK CONVERSATION</span><select aria-label="THINK conversation" value={conversationId} onChange={event => setConversationId(event.target.value)}><option value="">New conversation</option>{conversations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      </header>

      {error && <div className="speak-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {notice && <p className="speak-notice" role="status">{notice}</p>}

      <div className="speak-grid">
        <section className="speak-console" aria-labelledby="speak-console-title">
          <div className="speak-console-top"><div><p className="speak-eyebrow">VOICE CONSOLE</p><h2 id="speak-console-title">Your voice, your pace.</h2></div><span className={`speak-state-pill${listening ? ' is-listening' : recordingState === 'recording' ? ' is-recording' : ''}`} role="status">{listening ? 'Listening' : recordingState === 'recording' ? 'Recording' : recordingState === 'paused' ? 'Paused' : recordingState === 'processing' ? 'Preparing audio' : 'Ready when you are'}</span></div>
          <div className={`speak-orb${listening ? ' is-listening' : ''}${recordingState === 'recording' ? ' is-recording' : ''}`}><span className="speak-orb-core">◖</span><i /><i /><i /><i /></div>
          <div className="speak-visualizer"><canvas ref={canvasRef} width={600} height={96} role="img" aria-label="Live microphone waveform while recording" /><span>{formatDuration(elapsedMs)}</span></div>
          <div className="speak-primary-controls">
            {!listening ? <button className="speak-primary-button" type="button" disabled={!recognitionAvailable || recordingState !== 'idle' || sending} onClick={startListening}><span aria-hidden="true">◉</span> {recognitionAvailable ? 'Start speaking' : 'Speech input unavailable'}</button> : <button className="speak-primary-button is-active" type="button" onClick={stopListening}><span aria-hidden="true">■</span> Stop listening</button>}
            {!recordingState || recordingState === 'idle' ? <button type="button" className="speak-secondary-button" onClick={() => void startRecording()}><span aria-hidden="true">●</span> Record audio</button> : <div className="speak-record-controls">{recordingState === 'recording' ? <button type="button" onClick={pauseRecording}>Ⅱ Pause</button> : recordingState === 'paused' ? <button type="button" onClick={resumeRecording}>▶ Resume</button> : <span>Preparing audio…</span>}{(recordingState === 'recording' || recordingState === 'paused') && <button type="button" onClick={stopRecording}>■ Stop</button>}</div>}
            {speaking && <button type="button" className="speak-secondary-button" onClick={stopSpeaking}>■ Stop speaking</button>}
            {sending && <button type="button" className="speak-secondary-button" onClick={() => streamAbortRef.current?.abort()}>■ Stop reply</button>}
          </div>
          {!recognitionAvailable && <p className="speak-capability-note">This browser does not expose speech recognition. You can type a transcript or record audio instead.</p>}
          {!synthesisAvailable && <p className="speak-capability-note">Speech playback is unavailable in this browser; your THINK replies remain readable.</p>}

          <label className="speak-transcript-label" htmlFor="speak-transcript"><span>EDITABLE TRANSCRIPT</span><small>{transcript.length}/4000</small></label>
          <textarea id="speak-transcript" className="speak-transcript" value={transcript} maxLength={4000} onChange={event => setTranscriptValue(event.target.value)} placeholder={listening ? 'Listening for your words…' : 'Your recognized words will appear here. You can also type a message.'} />
          <div className="speak-transcript-actions"><span>Review your words before sending to THINK.</span><button type="button" disabled={!transcript.trim() || sending} onClick={() => void sendTranscript()}>{sending ? 'Sending…' : 'Send to THINK'} <span aria-hidden="true">↗</span></button></div>

          {localAudioUrl && <div className="speak-local-recording"><div><strong>Recording preview</strong><span>{formatDuration(elapsedMs)} · saved only when you choose</span></div><audio src={localAudioUrl} controls aria-label="Preview your new recording" /><div className="speak-local-actions"><button type="button" disabled={saving} onClick={() => void saveRecording()}>{saving ? 'Saving…' : 'Save recording'}</button><button type="button" disabled={saving} onClick={discardLocalRecording}>Discard</button></div></div>}
          <audio ref={playerRef} className="speak-hidden-player" onEnded={() => { setPlayingId(''); if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current); playbackUrlRef.current = ''; }} onError={() => setError('This audio format could not be played by the browser.')} />
        </section>

        <aside className="speak-settings" aria-label="Voice settings">
          <section className="speak-card">
            <div className="speak-card-heading"><span className="speak-card-icon">⌁</span><div><h2>Your voice</h2><p>Choose how NEXORA sounds.</p></div></div>
            <label className="speak-field"><span>VOICE</span><select value={selectedVoice} disabled={!voices.length} onChange={event => { setSelectedVoice(event.target.value); const selected = voices.find(voice => voice.voiceURI === event.target.value); if (selected) setLanguage(selected.lang); }} aria-label="Speech voice">{voices.length ? voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}{voice.default ? ' · Default' : ''}</option>) : <option value="">System default</option>}</select></label>
            <label className="speak-field"><span>LANGUAGE</span><select value={language} onChange={event => { setLanguage(event.target.value); const match = voices.find(voice => voice.lang === event.target.value); if (match) setSelectedVoice(match.voiceURI); }} aria-label="Speech language">{!supportedLanguageOptions.includes(language) && <option value={language}>{language}</option>}{supportedLanguageOptions.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="speak-range"><span>Speaking speed <strong>{rate.toFixed(1)}×</strong></span><input type="range" min="0.5" max="2" step="0.1" value={rate} onChange={event => setRate(Number(event.target.value))} aria-label="Speaking speed" /></label>
            <label className="speak-range"><span>Volume <strong>{Math.round(volume * 100)}%</strong></span><input type="range" min="0" max="1" step="0.05" value={volume} onChange={event => setVolume(Number(event.target.value))} aria-label="Speech volume" /></label>
            {currentVoice && <button className="speak-test-voice" type="button" disabled={!synthesisAvailable} onClick={() => readAloud(`Hello ${displayName}. This is your selected voice.`)}>▶ Preview voice</button>}
            <label className="speak-toggle"><span><strong>Read replies aloud</strong><small>Speak each THINK response</small></span><input type="checkbox" checked={autoRead} disabled={!synthesisAvailable} onChange={event => setAutoRead(event.target.checked)} /></label>
            <label className="speak-toggle"><span><strong>Continuous conversation</strong><small>Resume listening after replies</small></span><input type="checkbox" checked={continuous} disabled={!recognitionAvailable} onChange={event => setContinuous(event.target.checked)} /></label>
          </section>
          <section className="speak-privacy-card"><span aria-hidden="true">⌑</span><div><strong>Private by design</strong><p>Microphone access starts only when you choose. Browser speech recognition may use your browser’s speech service. Audio recordings stay in this browser until you save them.</p></div></section>
        </aside>
      </div>

      <section className="speak-history" aria-labelledby="speak-history-title">
        <div className="speak-section-heading"><div><p className="speak-eyebrow">YOUR SPACE</p><h2 id="speak-history-title">Conversation & recordings</h2></div><button type="button" onClick={() => void createConversation().catch(createError => setError(createError instanceof Error ? createError.message : 'Conversation could not be created.'))}>＋ New conversation</button></div>
        <div className="speak-history-grid">
          <section className="speak-history-card"><h3>Think conversation</h3>{loading ? <p className="speak-empty-state">Loading your conversations…</p> : messages.length ? <div className="speak-message-list">{messages.slice(-8).map(message => <article key={message.id} className={`speak-message speak-message-${message.role}`}><div><strong>{message.role === 'user' ? 'You' : 'NEXORA'}</strong><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.content || (message.status === 'streaming' ? 'Thinking…' : message.status)}</p>{message.role === 'assistant' && message.content && <button type="button" disabled={!synthesisAvailable} onClick={() => readAloud(message.content)}>▶ Read aloud</button>}</article>)}</div> : <p className="speak-empty-state">{conversationId ? 'No messages in this conversation yet. Speak or type a thought above.' : 'Choose New conversation or send a thought to get started.'}</p>}</section>
          <section className="speak-history-card"><h3>Saved recordings <span>{recordings.length}</span></h3>{recordings.length ? <div className="speak-recording-list">{recordings.map(recording => <article key={recording.id} className="speak-recording-item"><span className="speak-recording-icon">♫</span><div className="speak-recording-info"><strong>{recording.name}</strong><small>{formatDuration(recording.durationMs)} · {new Date(recording.createdAt).toLocaleDateString()}</small>{recording.transcript && <p>{recording.transcript}</p>}<label className="speak-attach-label"><span>THINK CONVERSATION</span><select value={recording.conversationId ?? ''} onChange={event => void attachRecording(recording, event.target.value)} aria-label={`Attach ${recording.name} to a conversation`}><option value="">Not attached</option>{conversations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div><div className="speak-recording-actions"><button type="button" onClick={() => void playRecording(recording)} aria-label={`${playingId === recording.id ? 'Stop' : 'Play'} ${recording.name}`}>{playingId === recording.id ? '■' : '▶'}</button><button type="button" className="is-destructive" onClick={() => void deleteRecording(recording)} aria-label={`Delete ${recording.name}`}>×</button></div></article>)}</div> : <p className="speak-empty-state">{loading ? 'Loading recordings…' : 'Your saved audio recordings will appear here.'}</p>}</section>
        </div>
        <p className="speak-cloud-note">Voice input and playback use browser-native APIs. AI replies come from your existing THINK conversation and require its configured provider. SPEAK does not currently send audio to a cloud voice provider.</p>
      </section>
    </main>
  );
}
