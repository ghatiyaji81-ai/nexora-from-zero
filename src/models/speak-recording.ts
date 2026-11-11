import mongoose, { type Model, Schema } from 'mongoose';
import type { SpeakAudioMimeType } from '@/lib/speak-audio';

export interface SpeakRecordingRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  conversationId?: mongoose.Types.ObjectId;
  fileId: mongoose.Types.ObjectId;
  name: string;
  mimeType: SpeakAudioMimeType;
  size: number;
  durationMs: number;
  transcript: string;
  createdAt: Date;
  updatedAt: Date;
}

const speakRecordingSchema = new Schema<SpeakRecordingRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'ThinkConversation', default: undefined },
  fileId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  mimeType: { type: String, enum: ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mpeg'], required: true },
  size: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
  durationMs: { type: Number, required: true, min: 0, max: 60 * 60 * 1000 },
  transcript: { type: String, trim: true, maxlength: 4000, default: '' },
}, { timestamps: true, versionKey: false, collection: 'speak_recordings' });

speakRecordingSchema.index({ ownerId: 1, createdAt: -1 }, { name: 'speak_recordings_owner_recent' });
speakRecordingSchema.index({ ownerId: 1, conversationId: 1, createdAt: -1 }, { name: 'speak_recordings_owner_conversation' });
speakRecordingSchema.index({ fileId: 1 }, { unique: true, name: 'speak_recordings_file_unique' });

export const SpeakRecording = (mongoose.models.SpeakRecording as Model<SpeakRecordingRecord> | undefined)
  ?? mongoose.model<SpeakRecordingRecord>('SpeakRecording', speakRecordingSchema);
