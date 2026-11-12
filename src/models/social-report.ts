import mongoose, { type Model, Schema } from 'mongoose';

export interface SocialReportRecord extends mongoose.Document {
  reporterId: mongoose.Types.ObjectId;
  targetType: 'profile' | 'post' | 'comment' | 'story';
  targetId: mongoose.Types.ObjectId;
  reason: 'spam' | 'harassment' | 'hate' | 'violence' | 'privacy' | 'other';
  details: string;
  status: 'open' | 'reviewed' | 'resolved';
  createdAt: Date;
}

const socialReportSchema = new Schema<SocialReportRecord>({
  reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  targetType: { type: String, enum: ['profile', 'post', 'comment', 'story'], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  reason: { type: String, enum: ['spam', 'harassment', 'hate', 'violence', 'privacy', 'other'], required: true },
  details: { type: String, trim: true, maxlength: 1000, default: '' },
  status: { type: String, enum: ['open', 'reviewed', 'resolved'], default: 'open', required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'social_reports' });

socialReportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true, name: 'social_reports_reporter_target_unique' });
socialReportSchema.index({ status: 1, createdAt: 1 }, { name: 'social_reports_moderation_queue' });

export const SocialReport = (mongoose.models.SocialReport as Model<SocialReportRecord> | undefined)
  ?? mongoose.model<SocialReportRecord>('SocialReport', socialReportSchema);
