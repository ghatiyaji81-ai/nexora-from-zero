import mongoose, { type Model, Schema } from 'mongoose';

export interface BuildDependencySnapshotRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  files: Array<{ path: string; fileId: mongoose.Types.ObjectId; revision: number; sha256: string }>;
  createdAt: Date;
}

const buildDependencySnapshotSchema = new Schema<BuildDependencySnapshotRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'BuildProject', required: true, immutable: true },
  files: {
    type: [{
      path: { type: String, required: true, maxlength: 240 },
      fileId: { type: Schema.Types.ObjectId, required: true },
      revision: { type: Number, required: true, min: 0 },
      sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    }],
    required: true, maxlength: 20,
  },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false, collection: 'build_dependency_snapshots' });

buildDependencySnapshotSchema.index({ ownerId: 1, projectId: 1, createdAt: -1 }, { name: 'build_dependency_snapshots_owner_recent' });

export const BuildDependencySnapshot = (mongoose.models.BuildDependencySnapshot as Model<BuildDependencySnapshotRecord> | undefined)
  ?? mongoose.model<BuildDependencySnapshotRecord>('BuildDependencySnapshot', buildDependencySnapshotSchema);
