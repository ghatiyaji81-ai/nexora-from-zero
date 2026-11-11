import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { hasSpeakAudioSignature, normalizeSpeakAudioMimeType } from '@/lib/speak-audio';
import { requireSpeak } from '@/lib/server/speak';
import { jsonResponse } from '@/lib/server/http';
import { SpeakRecording } from '@/models/speak-recording';
import { ThinkConversation } from '@/models/think-conversation';

export const runtime = 'nodejs';
const MAX_RECORDING_BYTES = 10 * 1024 * 1024;
const metadataSchema = z.object({
  durationMs: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(60 * 60 * 1000)),
  transcript: z.string().trim().max(4000).default(''),
  conversationId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

function publicRecording(recording: {
  _id: mongoose.Types.ObjectId;
  conversationId?: mongoose.Types.ObjectId;
  name: string;
  mimeType: string;
  size: number;
  durationMs: number;
  transcript: string;
  createdAt: Date;
}) {
  return {
    id: recording._id.toString(),
    conversationId: recording.conversationId?.toString() ?? null,
    name: recording.name,
    mimeType: recording.mimeType,
    size: recording.size,
    durationMs: recording.durationMs,
    transcript: recording.transcript,
    createdAt: recording.createdAt,
  };
}

export async function GET(request: Request) {
  const gate = await requireSpeak(request, 'recording-list');
  if ('response' in gate) return gate.response;
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const recordings = await SpeakRecording.find({ ownerId }).sort({ createdAt: -1 }).limit(100).select('-ownerId -fileId').lean();
  return jsonResponse({ recordings: recordings.map(recording => publicRecording(recording)) });
}

export async function POST(request: Request) {
  const gate = await requireSpeak(request, 'recording-upload', 12);
  if ('response' in gate) return gate.response;
  const contentLength = Number(request.headers.get('content-length'));
  if (!Number.isFinite(contentLength) || contentLength < 1 || contentLength > MAX_RECORDING_BYTES + 64 * 1024) {
    return jsonResponse({ error: 'Recording uploads must be 10 MB or smaller.' }, 413);
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('audio');
  const parsed = metadataSchema.safeParse({
    durationMs: form?.get('durationMs'),
    transcript: form?.get('transcript') ?? '',
    conversationId: form?.get('conversationId') || undefined,
  });
  if (!(file instanceof File) || !parsed.success || file.size < 1 || file.size > MAX_RECORDING_BYTES) {
    return jsonResponse({ error: 'Choose a supported recording up to 10 MB with valid recording details.' }, 400);
  }
  const mimeType = normalizeSpeakAudioMimeType(file.type);
  if (!mimeType) return jsonResponse({ error: 'This recording format is not supported by SPEAK.' }, 415);

  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (parsed.data.conversationId) {
    const conversation = await ThinkConversation.exists({ _id: parsed.data.conversationId, ownerId });
    if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasSpeakAudioSignature(bytes, mimeType)) return jsonResponse({ error: 'The uploaded file does not match its audio format.' }, 415);
  const database = mongoose.connection.db;
  if (!database) return jsonResponse({ error: 'Private audio storage is unavailable.' }, 503);

  const extension = mimeType === 'audio/x-wav' ? 'wav' : ({
    'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg',
    'audio/wav': 'wav', 'audio/mpeg': 'mp3',
  } as const)[mimeType];
  const name = `speak-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
  const bucket = new mongoose.mongo.GridFSBucket(database, { bucketName: 'speak_recordings' });
  const upload = bucket.openUploadStream(name, {
    metadata: { ownerId, contentType: mimeType, private: true, purpose: 'speak-recording' },
  });
  try {
    await pipeline(Readable.from([bytes]), upload);
    const recording = await SpeakRecording.create({
      ownerId,
      conversationId: parsed.data.conversationId ? new mongoose.Types.ObjectId(parsed.data.conversationId) : undefined,
      fileId: upload.id,
      name,
      mimeType,
      size: bytes.length,
      durationMs: parsed.data.durationMs,
      transcript: parsed.data.transcript,
    });
    return jsonResponse({ recording: publicRecording(recording) }, 201);
  } catch (error) {
    await bucket.delete(upload.id).catch(() => undefined);
    console.error('SPEAK recording upload failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The recording could not be stored. Please retry.' }, 503);
  }
}
