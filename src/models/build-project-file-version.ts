import mongoose, { type Model, Schema } from 'mongoose';

export interface BuildProjectFileVersionRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  fileId: mongoose.Types.ObjectId;
  path: string;
  size: number;
  revision: number;
  createdAt: Date;
}

const buildProjectFileVersionSchema = new Schema<BuildProjectFileVersionRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'BuildProject', required: true, immutable: true },
  fileId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  path: { type: String, required: true, maxlength: 240 },
  size: { type: Number, required: true, min: 0, max: 262144 },
  revision: { type: Number, required: true, min: 0 },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false, collection: 'build_project_file_versions' });

buildProjectFileVersionSchema.index({ ownerId: 1, projectId: 1, path: 1, revision: -1 }, { name: 'build_file_versions_owner_path_recent' });
buildProjectFileVersionSchema.index({ ownerId: 1, projectId: 1, path: 1, revision: 1 }, { unique: true, name: 'build_file_versions_owner_path_revision' });

export const BuildProjectFileVersion = (mongoose.models.BuildProjectFileVersion as Model<BuildProjectFileVersionRecord> | undefined)
  ?? mongoose.model<BuildProjectFileVersionRecord>('BuildProjectFileVersion', buildProjectFileVersionSchema);
