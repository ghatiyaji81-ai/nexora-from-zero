import mongoose, { type Model, Schema } from 'mongoose';

export interface SocialStoryRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  body: string;
  audience: 'public' | 'followers';
  expiresAt: Date;
  createdAt: Date;
}

const socialStorySchema = new Schema<SocialStoryRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 500 },
  audience: { type: String, enum: ['public', 'followers'], default: 'public', required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'social_stories' });

socialStorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'social_stories_expiry_ttl' });
socialStorySchema.index({ ownerId: 1, expiresAt: 1, createdAt: -1 }, { name: 'social_stories_owner_active' });

export const SocialStory = (mongoose.models.SocialStory as Model<SocialStoryRecord> | undefined)
  ?? mongoose.model<SocialStoryRecord>('SocialStory', socialStorySchema);
