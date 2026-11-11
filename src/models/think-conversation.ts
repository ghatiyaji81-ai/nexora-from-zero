import mongoose, { type Model, Schema } from 'mongoose';

export type ThinkAgent = 'general' | 'research' | 'coding' | 'study' | 'writing' | 'analysis';

export interface ThinkConversationRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  provider: 'openai';
  modelId: string;
  agent: ThinkAgent;
  pinned: boolean;
  archived: boolean;
  lastMessageAt?: Date;
  lastMessagePreview: string;
  createdAt: Date;
  updatedAt: Date;
}

const thinkConversationSchema = new Schema<ThinkConversationRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  title: { type: String, trim: true, maxlength: 100, default: 'New conversation' },
  provider: { type: String, enum: ['openai'], required: true, default: 'openai' },
  modelId: { type: String, required: true, maxlength: 100 },
  agent: { type: String, enum: ['general', 'research', 'coding', 'study', 'writing', 'analysis'], required: true, default: 'general' },
  pinned: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
  lastMessageAt: { type: Date, default: undefined },
  lastMessagePreview: { type: String, maxlength: 180, default: '' },
}, { timestamps: true, versionKey: false, collection: 'think_conversations' });

thinkConversationSchema.index({ ownerId: 1, archived: 1, pinned: -1, lastMessageAt: -1, updatedAt: -1 }, { name: 'think_conversations_owner_recent' });
thinkConversationSchema.index({ ownerId: 1, title: 'text', lastMessagePreview: 'text' }, { name: 'think_conversations_owner_text' });

export const ThinkConversation = (mongoose.models.ThinkConversation as Model<ThinkConversationRecord> | undefined)
  ?? mongoose.model<ThinkConversationRecord>('ThinkConversation', thinkConversationSchema);
