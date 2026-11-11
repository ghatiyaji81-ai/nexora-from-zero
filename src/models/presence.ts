import mongoose, { type Model, Schema } from 'mongoose';

export interface PresenceRecord extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  lastSeenAt: Date;
  expiresAt: Date;
}

const presenceSchema = new Schema<PresenceRecord>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lastSeenAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
}, { versionKey: false, collection: 'connect_presence' });

presenceSchema.index({ userId: 1 }, { unique: true, name: 'connect_presence_user_unique' });
presenceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'connect_presence_expiry_ttl' });

export const Presence = (mongoose.models.ConnectPresence as Model<PresenceRecord> | undefined)
  ?? mongoose.model<PresenceRecord>('ConnectPresence', presenceSchema);
