import mongoose, { type Model, Schema } from 'mongoose';

export interface SocialCommentRecord extends mongoose.Document {
  postId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  body: string;
  replyTo?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const socialCommentSchema = new Schema<SocialCommentRecord>({
  postId: { type: Schema.Types.ObjectId, ref: 'SocialPost', required: true, immutable: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  replyTo: { type: Schema.Types.ObjectId, ref: 'SocialComment', default: undefined },
}, { timestamps: true, versionKey: false, collection: 'social_comments' });

socialCommentSchema.index({ postId: 1, createdAt: 1, _id: 1 }, { name: 'social_comments_post_history' });
socialCommentSchema.index({ ownerId: 1, createdAt: -1 }, { name: 'social_comments_owner_recent' });

export const SocialComment = (mongoose.models.SocialComment as Model<SocialCommentRecord> | undefined)
  ?? mongoose.model<SocialCommentRecord>('SocialComment', socialCommentSchema);
