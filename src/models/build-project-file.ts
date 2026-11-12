import mongoose, { type Model, Schema } from 'mongoose';

export interface BuildProjectFileRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  path: string;
  fileId: mongoose.Types.ObjectId;
  size: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

const buildProjectFileSchema = new Schema<BuildProjectFileRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'BuildProject', required: true, immutable: true },
  path: { type: String, required: true, maxlength: 240 },
  fileId: { type: Schema.Types.ObjectId, required: true },
  size: { type: Number, required: true, min: 0, max: 262144 },
  revision: { type: Number, default: 0, min: 0 },
}, { timestamps: true, versionKey: false, collection: 'build_project_files' });

buildProjectFileSchema.index({ ownerId: 1, projectId: 1, path: 1 }, { unique: true, name: 'build_files_owner_project_path' });
buildProjectFileSchema.index({ ownerId: 1, projectId: 1, updatedAt: -1 }, { name: 'build_files_owner_project_recent' });

export const BuildProjectFile = (mongoose.models.BuildProjectFile as Model<BuildProjectFileRecord> | undefined)
  ?? mongoose.model<BuildProjectFileRecord>('BuildProjectFile', buildProjectFileSchema);
