import mongoose, { type Model, Schema } from 'mongoose';

export type MessageAttachmentKind = 'image' | 'video' | 'document' | 'audio';

export interface MessageAttachmentRecord {
  fileId: mongoose.Types.ObjectId;
  fileName: string;
  contentType: string;
  size: number;
  kind: MessageAttachmentKind;
}

export interface MessageReceiptRecord {
  userId: mongoose.Types.ObjectId;
  at: Date;
}

export interface MessageReactionRecord {
  userId: mongoose.Types.ObjectId;
  emoji: string;
  at: Date;
}

export interface MessageRecord extends mongoose.Document {
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  body: string;
  attachments: MessageAttachmentRecord[];
  replyTo?: mongoose.Types.ObjectId;
  editedAt?: Date;
  deletedFor: mongoose.Types.ObjectId[];
  deletedForEveryoneAt?: Date;
  deliveredTo: MessageReceiptRecord[];
  readBy: MessageReceiptRecord[];
  reactions: MessageReactionRecord[];
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<MessageAttachmentRecord>({
  fileId: { type: Schema.Types.ObjectId, required: true },
  fileName: { type: String, required: true, maxlength: 160 },
  contentType: { type: String, required: true, maxlength: 100 },
  size: { type: Number, required: true, min: 1 },
  kind: { type: String, enum: ['image', 'video', 'document', 'audio'], required: true },
}, { _id: false });

const receiptSchema = new Schema<MessageReceiptRecord>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, required: true, default: Date.now },
}, { _id: false });

const reactionSchema = new Schema<MessageReactionRecord>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  emoji: { type: String, required: true, maxlength: 16 },
  at: { type: Date, required: true, default: Date.now },
}, { _id: false });

const messageSchema = new Schema<MessageRecord>({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, trim: true, maxlength: 4000, default: '' },
  attachments: { type: [attachmentSchema], default: [] },
  replyTo: { type: Schema.Types.ObjectId, ref: 'Message', default: undefined },
  editedAt: { type: Date, default: undefined },
  deletedFor: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
  deletedForEveryoneAt: { type: Date, default: undefined },
  deliveredTo: { type: [receiptSchema], default: [] },
  readBy: { type: [receiptSchema], default: [] },
  reactions: { type: [reactionSchema], default: [] },
}, { timestamps: true, versionKey: false, collection: 'connect_messages' });

messageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 }, { name: 'connect_messages_history' });
messageSchema.index({ conversationId: 1, senderId: 1, createdAt: -1 }, { name: 'connect_messages_sender_history' });
messageSchema.index({ conversationId: 1, 'readBy.userId': 1, senderId: 1, createdAt: -1 }, { name: 'connect_messages_unread' });
messageSchema.index({ replyTo: 1 }, { sparse: true, name: 'connect_messages_reply' });
messageSchema.index({ 'attachments.fileId': 1 }, { unique: true, sparse: true, name: 'connect_messages_attachment_unique' });

export const Message = (mongoose.models.ConnectMessage as Model<MessageRecord> | undefined)
  ?? mongoose.model<MessageRecord>('ConnectMessage', messageSchema);
