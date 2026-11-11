import mongoose from 'mongoose';
import { z } from 'zod';
import { requireSpeak } from '@/lib/server/speak';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { SpeakRecording } from '@/models/speak-recording';
import { ThinkConversation } from '@/models/think-conversation';

export const runtime = 'nodejs';
type Context = { params: Promise<{ recordingId: string }> };
const updateSchema = z.object({ conversationId: z.string().regex(/^[a-f\d]{24}$/i).nullable() }).strict();

export async function PATCH(request: Request, route: Context) {
  const gate = await requireSpeak(request, 'recording-attach', 40);
  if ('response' in gate) return gate.response;
  const { recordingId } = await route.params;
  const parsed = updateSchema.safeParse(await parseJsonBody(request));
  if (!mongoose.isValidObjectId(recordingId) || !parsed.success) return jsonResponse({ error: 'Recording attachment is invalid.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (parsed.data.conversationId && !await ThinkConversation.exists({ _id: parsed.data.conversationId, ownerId })) {
    return jsonResponse({ error: 'Conversation not found.' }, 404);
  }
  const update = parsed.data.conversationId
    ? { $set: { conversationId: new mongoose.Types.ObjectId(parsed.data.conversationId) } }
    : { $unset: { conversationId: 1 } };
  const recording = await SpeakRecording.findOneAndUpdate(
    { _id: recordingId, ownerId },
    update,
    { returnDocument: 'after', runValidators: true },
  ).select('-ownerId -fileId').lean();
  if (!recording) return jsonResponse({ error: 'Recording not found.' }, 404);
  return jsonResponse({
    recording: {
      id: recording._id.toString(),
      conversationId: recording.conversationId?.toString() ?? null,
      name: recording.name,
      mimeType: recording.mimeType,
      size: recording.size,
      durationMs: recording.durationMs,
      transcript: recording.transcript,
      createdAt: recording.createdAt,
    },
  });
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireSpeak(request, 'recording-delete', 30);
  if ('response' in gate) return gate.response;
  const { recordingId } = await route.params;
  if (!mongoose.isValidObjectId(recordingId)) return jsonResponse({ error: 'Recording not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const recording = await SpeakRecording.findOne({ _id: recordingId, ownerId });
  if (!recording) return jsonResponse({ error: 'Recording not found.' }, 404);
  const database = mongoose.connection.db;
  if (!database) return jsonResponse({ error: 'Private audio storage is unavailable.' }, 503);
  const bucket = new mongoose.mongo.GridFSBucket(database, { bucketName: 'speak_recordings' });
  try {
    await bucket.delete(recording.fileId);
  } catch (error) {
    console.error('SPEAK recording deletion failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The private recording could not be deleted. Please retry.' }, 503);
  }
  await SpeakRecording.deleteOne({ _id: recording._id, ownerId });
  return jsonResponse({ success: true });
}
