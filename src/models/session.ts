import mongoose, { type Model, Schema } from 'mongoose';

export interface SessionRecord extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
}

const sessionSchema = new Schema<SessionRecord>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  lastUsedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'sessions' });

sessionSchema.index({ tokenHash: 1 }, { unique: true, name: 'sessions_token_hash_unique' });
sessionSchema.index({ userId: 1, expiresAt: 1 }, { name: 'sessions_user_expiry' });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'sessions_expiry_ttl' });

export const Session = (mongoose.models.Session as Model<SessionRecord> | undefined)
  ?? mongoose.model<SessionRecord>('Session', sessionSchema);
