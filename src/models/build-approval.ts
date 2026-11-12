import mongoose, { type Model, Schema } from 'mongoose';

export interface BuildApprovalRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  fileId: mongoose.Types.ObjectId;
  proposalFileId: mongoose.Types.ObjectId;
  path: string;
  summary: string;
  baseRevision: number;
  status: 'pending' | 'applying' | 'approved' | 'rejected' | 'stale';
  createdAt: Date;
  updatedAt: Date;
}

const buildApprovalSchema = new Schema<BuildApprovalRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'BuildProject', required: true, immutable: true },
  fileId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  proposalFileId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  path: { type: String, required: true, maxlength: 240, immutable: true },
  summary: { type: String, required: true, maxlength: 500, immutable: true },
  baseRevision: { type: Number, required: true, min: 0, immutable: true },
  status: { type: String, enum: ['pending', 'applying', 'approved', 'rejected', 'stale'], default: 'pending' },
}, { timestamps: true, versionKey: false, collection: 'build_approvals' });

buildApprovalSchema.index({ ownerId: 1, projectId: 1, status: 1, createdAt: -1 }, { name: 'build_approvals_owner_project_recent' });

export const BuildApproval = (mongoose.models.BuildApproval as Model<BuildApprovalRecord> | undefined)
  ?? mongoose.model<BuildApprovalRecord>('BuildApproval', buildApprovalSchema);
