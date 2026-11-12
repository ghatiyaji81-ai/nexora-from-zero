import mongoose, { type Model, Schema } from 'mongoose';

export interface SocialBlockRecord extends mongoose.Document {
  blockerId: mongoose.Types.ObjectId;
  blockedId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const socialBlockSchema = new Schema<SocialBlockRecord>({
  blockerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  blockedId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'social_blocks' });

socialBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true, name: 'social_blocks_pair_unique' });
socialBlockSchema.index({ blockedId: 1 }, { name: 'social_blocks_reverse_lookup' });

export const SocialBlock = (mongoose.models.SocialBlock as Model<SocialBlockRecord> | undefined)
  ?? mongoose.model<SocialBlockRecord>('SocialBlock', socialBlockSchema);
