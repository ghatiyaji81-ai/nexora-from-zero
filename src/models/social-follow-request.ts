import mongoose, { type Model, Schema } from 'mongoose';

export interface SocialFollowRequestRecord extends mongoose.Document {
  requesterId: mongoose.Types.ObjectId;
  recipientId: mongoose.Types.ObjectId;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const socialFollowRequestSchema = new Schema<SocialFollowRequestRecord>({
  requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', required: true },
}, { timestamps: true, versionKey: false, collection: 'social_follow_requests' });

socialFollowRequestSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true, name: 'social_follow_requests_pair_unique' });
socialFollowRequestSchema.index({ recipientId: 1, status: 1, createdAt: -1 }, { name: 'social_follow_requests_inbox' });

export const SocialFollowRequest = (mongoose.models.SocialFollowRequest as Model<SocialFollowRequestRecord> | undefined)
  ?? mongoose.model<SocialFollowRequestRecord>('SocialFollowRequest', socialFollowRequestSchema);
