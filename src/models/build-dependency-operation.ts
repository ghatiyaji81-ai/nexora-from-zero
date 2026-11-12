import mongoose, { type Model, Schema } from 'mongoose';

export interface BuildDependencyOperationRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  action: 'add' | 'remove' | 'update' | 'outdated' | 'vulnerability-scan';
  packageName?: string;
  requestedVersion?: string;
  status: 'blocked' | 'rejected' | 'approved';
  reason: string;
  createdAt: Date;
}

const buildDependencyOperationSchema = new Schema<BuildDependencyOperationRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'BuildProject', required: true, immutable: true },
  action: { type: String, enum: ['add', 'remove', 'update', 'outdated', 'vulnerability-scan'], required: true, immutable: true },
  packageName: { type: String, maxlength: 120, immutable: true },
  requestedVersion: { type: String, maxlength: 100, immutable: true },
  status: { type: String, enum: ['blocked', 'rejected', 'approved'], required: true },
  reason: { type: String, required: true, maxlength: 500 },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false, collection: 'build_dependency_operations' });

buildDependencyOperationSchema.index({ ownerId: 1, projectId: 1, createdAt: -1 }, { name: 'build_dependency_operations_owner_recent' });

export const BuildDependencyOperation = (mongoose.models.BuildDependencyOperation as Model<BuildDependencyOperationRecord> | undefined)
  ?? mongoose.model<BuildDependencyOperationRecord>('BuildDependencyOperation', buildDependencyOperationSchema);
