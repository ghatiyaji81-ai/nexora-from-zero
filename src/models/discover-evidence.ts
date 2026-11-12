import mongoose, { type Model, Schema } from 'mongoose';

export interface DiscoverEvidenceRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  taskId: mongoose.Types.ObjectId;
  sourceId: mongoose.Types.ObjectId;
  excerpt: string;
  start: number;
  end: number;
  createdAt: Date;
}

const discoverEvidenceSchema = new Schema<DiscoverEvidenceRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  taskId: { type: Schema.Types.ObjectId, ref: 'DiscoverResearchTask', required: true, immutable: true },
  sourceId: { type: Schema.Types.ObjectId, ref: 'DiscoverSource', required: true, immutable: true },
  excerpt: { type: String, required: true, maxlength: 1000 },
  start: { type: Number, required: true, min: 0 },
  end: { type: Number, required: true, min: 1 },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'discover_evidence' });

discoverEvidenceSchema.index({ ownerId: 1, taskId: 1 }, { name: 'discover_evidence_owner_task' });
discoverEvidenceSchema.index({ ownerId: 1, sourceId: 1 }, { name: 'discover_evidence_owner_source' });

export const DiscoverEvidence = (mongoose.models.DiscoverEvidence as Model<DiscoverEvidenceRecord> | undefined)
  ?? mongoose.model<DiscoverEvidenceRecord>('DiscoverEvidence', discoverEvidenceSchema);
