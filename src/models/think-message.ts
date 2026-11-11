import mongoose, { type Model, Schema } from 'mongoose';
import type { ThinkAgent } from '@/models/think-conversation';

export type ThinkCitation = { url: string; title: string };
export type ThinkToolExecution = {
  name: string;
  input: string;
  outcome: 'completed' | 'failed' | 'approval_required';
  summary: string;
  createdAt: Date;
};

export interface ThinkMessageRecord extends mongoose.Document {
  conversationId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  role: 'user' | 'assistant';
  content: string;
  provider: 'openai';
  modelId: string;
  agent: ThinkAgent;
  documentIds: mongoose.Types.ObjectId[];
  citations: ThinkCitation[];
  toolExecutions: ThinkToolExecution[];
  status: 'complete' | 'streaming' | 'failed' | 'interrupted';
  createdAt: Date;
  updatedAt: Date;
}

const citationSchema = new Schema<ThinkCitation>({
  url: { type: String, required: true, maxlength: 2048 },
  title: { type: String, required: true, maxlength: 240 },
}, { _id: false });

const toolExecutionSchema = new Schema<ThinkToolExecution>({
  name: { type: String, required: true, maxlength: 80 },
  input: { type: String, required: true, maxlength: 2000 },
  outcome: { type: String, enum: ['completed', 'failed', 'approval_required'], required: true },
  summary: { type: String, required: true, maxlength: 1000 },
  createdAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const thinkMessageSchema = new Schema<ThinkMessageRecord>({
  conversationId: { type: Schema.Types.ObjectId, ref: 'ThinkConversation', required: true, immutable: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true, maxlength: 60_000, default: '' },
  provider: { type: String, enum: ['openai'], required: true },
  modelId: { type: String, required: true, maxlength: 100 },
  agent: { type: String, enum: ['general', 'research', 'coding', 'study', 'writing', 'analysis'], required: true },
  documentIds: { type: [{ type: Schema.Types.ObjectId, ref: 'ThinkDocument' }], default: [] },
  citations: { type: [citationSchema], default: [] },
  toolExecutions: { type: [toolExecutionSchema], default: [] },
  status: { type: String, enum: ['complete', 'streaming', 'failed', 'interrupted'], required: true, default: 'complete' },
}, { timestamps: true, versionKey: false, collection: 'think_messages' });

thinkMessageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 }, { name: 'think_messages_history' });
thinkMessageSchema.index({ ownerId: 1, conversationId: 1, role: 1, createdAt: -1 }, { name: 'think_messages_owner_history' });
thinkMessageSchema.index({ ownerId: 1, content: 'text' }, { name: 'think_messages_owner_text' });

export const ThinkMessage = (mongoose.models.ThinkMessage as Model<ThinkMessageRecord> | undefined)
  ?? mongoose.model<ThinkMessageRecord>('ThinkMessage', thinkMessageSchema);
