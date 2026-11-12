import mongoose, { type Model, Schema } from 'mongoose';

export interface SocialNotificationRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  targetId?: mongoose.Types.ObjectId;
  eventKey: string;
  type: 'follow' | 'follow_request' | 'like' | 'comment' | 'story_reply' | 'follow_request_accepted';
  readAt?: Date;
  createdAt: Date;
}

const socialNotificationSchema = new Schema<SocialNotificationRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  targetId: { type: Schema.Types.ObjectId, default: undefined },
  eventKey: { type: String, required: true, maxlength: 160 },
  type: { type: String, enum: ['follow', 'follow_request', 'like', 'comment', 'story_reply', 'follow_request_accepted'], required: true },
  readAt: { type: Date, default: undefined },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'social_notifications' });

socialNotificationSchema.index({ ownerId: 1, eventKey: 1 }, { unique: true, name: 'social_notifications_owner_event_unique' });
socialNotificationSchema.index({ ownerId: 1, readAt: 1, createdAt: -1 }, { name: 'social_notifications_inbox' });

export const SocialNotification = (mongoose.models.SocialNotification as Model<SocialNotificationRecord> | undefined)
  ?? mongoose.model<SocialNotificationRecord>('SocialNotification', socialNotificationSchema);
