import mongoose, { type Model, Schema } from 'mongoose';

export interface DiscoverResearchReportRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  taskId: mongoose.Types.ObjectId;
  title: string;
  markdown: string;
  createdAt: Date;
}

const discoverResearchReportSchema = new Schema<DiscoverResearchReportRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  taskId: { type: Schema.Types.ObjectId, ref: 'DiscoverResearchTask', required: true, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  markdown: { type: String, required: true, maxlength: 30_000 },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'discover_research_reports' });

discoverResearchReportSchema.index({ ownerId: 1, createdAt: -1 }, { name: 'discover_reports_owner_recent' });

export const DiscoverResearchReport = (mongoose.models.DiscoverResearchReport as Model<DiscoverResearchReportRecord> | undefined)
  ?? mongoose.model<DiscoverResearchReportRecord>('DiscoverResearchReport', discoverResearchReportSchema);
