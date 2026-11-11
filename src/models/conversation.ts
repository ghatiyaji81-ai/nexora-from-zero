import mongoose, { type Model, Schema } from 'mongoose';

export type ConversationType = 'direct' | 'group';

export interface ConversationRecord extends mongoose.Document {
  type: ConversationType;
  memberIds: mongoose.Types.ObjectId[];
  directKey?: string;
  title?: string;
  description: string;
  avatarFileId?: mongoose.Types.ObjectId;
  adminIds: mongoose.Types.ObjectId[];
  allowMemberInvites: boolean;
  allowMemberEditInfo: boolean;
  createdBy: mongoose.Types.ObjectId;
  lastMessageAt?: Date;
  lastMessageText: string;
  lastMessageSenderId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<ConversationRecord>({
  type: { type: String, enum: ['direct', 'group'], required: true },
  memberIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], required: true, validate: (members: mongoose.Types.ObjectId[]) => members.length >= 1 },
  directKey: { type: String, trim: true, select: false },
  title: { type: String, trim: true, maxlength: 80, default: undefined },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  avatarFileId: { type: Schema.Types.ObjectId, default: undefined },
  adminIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
  allowMemberInvites: { type: Boolean, default: false },
  allowMemberEditInfo: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lastMessageAt: { type: Date, default: undefined },
  lastMessageText: { type: String, maxlength: 180, default: '' },
  lastMessageSenderId: { type: Schema.Types.ObjectId, ref: 'User', default: undefined },
}, { timestamps: true, versionKey: false, collection: 'connect_conversations' });

conversationSchema.index({ memberIds: 1, lastMessageAt: -1, updatedAt: -1 }, { name: 'connect_conversations_member_recent' });
conversationSchema.index({ directKey: 1 }, { unique: true, sparse: true, name: 'connect_conversations_direct_unique' });
conversationSchema.index({ type: 1, createdAt: -1 }, { name: 'connect_conversations_type_created' });

export const Conversation = (mongoose.models.Conversation as Model<ConversationRecord> | undefined)
  ?? mongoose.model<ConversationRecord>('Conversation', conversationSchema);
