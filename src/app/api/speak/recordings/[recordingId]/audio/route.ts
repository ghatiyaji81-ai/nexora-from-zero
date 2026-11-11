import mongoose from 'mongoose';
import { requireSpeak } from '@/lib/server/speak';
import { jsonResponse } from '@/lib/server/http';
import { SpeakRecording } from '@/models/speak-recording';

export const runtime = 'nodejs';
type Context = { params: Promise<{ recordingId: string }> };

export async function GET(request: Request, route: Context) {
  const gate = await requireSpeak(request, 'recording-play', 60);
  if ('response' in gate) return gate.response;
  const { recordingId } = await route.params;
  if (!mongoose.isValidObjectId(recordingId)) return jsonResponse({ error: 'Recording not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const recording = await SpeakRecording.findOne({ _id: recordingId, ownerId }).select('fileId name mimeType size').lean();
  if (!recording) return jsonResponse({ error: 'Recording not found.' }, 404);
  const database = mongoose.connection.db;
  if (!database) return jsonResponse({ error: 'Private audio storage is unavailable.' }, 503);
  const bucket = new mongoose.mongo.GridFSBucket(database, { bucketName: 'speak_recordings' });
  const storedFile = await bucket.find({ _id: recording.fileId, 'metadata.ownerId': ownerId }).limit(1).next();
  if (!storedFile || storedFile.length !== recording.size) return jsonResponse({ error: 'Recording not found.' }, 404);

  const download = bucket.openDownloadStream(recording.fileId);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      download.on('data', chunk => controller.enqueue(new Uint8Array(chunk)));
      download.once('end', () => controller.close());
      download.once('error', () => controller.error(new Error('The private recording could not be read.')));
    },
    cancel() {
      download.destroy();
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': recording.mimeType,
      'Content-Length': String(recording.size),
      'Content-Disposition': `inline; filename="${recording.name.replace(/["\\\r\n]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'none',
    },
  });
}
