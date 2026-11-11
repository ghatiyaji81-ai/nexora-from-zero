import mongoose, { type Model, Schema } from 'mongoose';

export interface TypingStateRecord extends mongoose.Document {
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  expiresAt: Date;
  updatedAt: Date;
}

const typingStateSchema = new Schema<TypingStateRecord>({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: { createdAt: false, updatedAt: true }, versionKey: false, collection: 'connect_typing_states' });

typingStateSchema.index({ conversationId: 1, userId: 1 }, { unique: true, name: 'connect_typing_unique' });
typingStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'connect_typing_expiry_ttl' });

export const TypingState = (mongoose.models.ConnectTypingState as Model<TypingStateRecord> | undefined)
  ?? mongoose.model<TypingStateRecord>('ConnectTypingState', typingStateSchema);
