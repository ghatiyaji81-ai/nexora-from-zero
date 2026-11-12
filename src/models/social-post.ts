import mongoose, { type Model, Schema } from 'mongoose';

export interface SocialPostRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  body: string;
  audience: 'public' | 'followers';
  commentsEnabled: boolean;
  pinned: boolean;
  likeCount: number;
  commentCount: number;
  editedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const socialPostSchema = new Schema<SocialPostRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 5000 },
  audience: { type: String, enum: ['public', 'followers'], default: 'public', required: true },
  commentsEnabled: { type: Boolean, default: true },
  pinned: { type: Boolean, default: false },
  likeCount: { type: Number, min: 0, default: 0 },
  commentCount: { type: Number, min: 0, default: 0 },
  editedAt: { type: Date, default: undefined },
}, { timestamps: true, versionKey: false, collection: 'social_posts' });

socialPostSchema.index({ ownerId: 1, createdAt: -1, _id: -1 }, { name: 'social_posts_owner_recent' });
socialPostSchema.index({ audience: 1, createdAt: -1, _id: -1 }, { name: 'social_posts_feed' });
socialPostSchema.index({ ownerId: 1, pinned: 1, createdAt: -1 }, { name: 'social_posts_owner_pinned' });

export const SocialPost = (mongoose.models.SocialPost as Model<SocialPostRecord> | undefined)
  ?? mongoose.model<SocialPostRecord>('SocialPost', socialPostSchema);
