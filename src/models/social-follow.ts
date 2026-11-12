import mongoose, { type Model, Schema } from 'mongoose';

export interface SocialFollowRecord extends mongoose.Document {
  followerId: mongoose.Types.ObjectId;
  followingId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const socialFollowSchema = new Schema<SocialFollowRecord>({
  followerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  followingId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'social_follows' });

socialFollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true, name: 'social_follows_pair_unique' });
socialFollowSchema.index({ followingId: 1, createdAt: -1 }, { name: 'social_follows_followers' });
socialFollowSchema.index({ followerId: 1, createdAt: -1 }, { name: 'social_follows_following' });

export const SocialFollow = (mongoose.models.SocialFollow as Model<SocialFollowRecord> | undefined)
  ?? mongoose.model<SocialFollowRecord>('SocialFollow', socialFollowSchema);
