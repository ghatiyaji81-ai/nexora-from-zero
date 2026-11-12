import mongoose, { type Model, Schema } from 'mongoose';

export interface SocialReactionRecord extends mongoose.Document {
  postId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const socialReactionSchema = new Schema<SocialReactionRecord>({
  postId: { type: Schema.Types.ObjectId, ref: 'SocialPost', required: true, immutable: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'social_reactions' });

socialReactionSchema.index({ postId: 1, ownerId: 1 }, { unique: true, name: 'social_reactions_post_owner_unique' });
socialReactionSchema.index({ ownerId: 1, createdAt: -1 }, { name: 'social_reactions_owner_recent' });

export const SocialReaction = (mongoose.models.SocialReaction as Model<SocialReactionRecord> | undefined)
  ?? mongoose.model<SocialReactionRecord>('SocialReaction', socialReactionSchema);
