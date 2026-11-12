import mongoose, { type Model, Schema } from 'mongoose';

export interface DiscoverResearchTaskRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  question: string;
  sourceIds: mongoose.Types.ObjectId[];
  status: 'complete';
  createdAt: Date;
}

const discoverResearchTaskSchema = new Schema<DiscoverResearchTaskRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  question: { type: String, required: true, trim: true, maxlength: 500 },
  sourceIds: { type: [Schema.Types.ObjectId], ref: 'DiscoverSource', default: [] },
  status: { type: String, enum: ['complete'], default: 'complete' },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'discover_research_tasks' });

discoverResearchTaskSchema.index({ ownerId: 1, createdAt: -1 }, { name: 'discover_tasks_owner_recent' });

export const DiscoverResearchTask = (mongoose.models.DiscoverResearchTask as Model<DiscoverResearchTaskRecord> | undefined)
  ?? mongoose.model<DiscoverResearchTaskRecord>('DiscoverResearchTask', discoverResearchTaskSchema);
