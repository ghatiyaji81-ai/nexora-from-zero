import mongoose, { type Model, Schema } from 'mongoose';

export interface CreateProjectVersionRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  revision: number;
  title: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

const createProjectVersionSchema = new Schema<CreateProjectVersionRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'CreateProject', required: true, immutable: true },
  revision: { type: Number, required: true, min: 0 },
  title: { type: String, required: true, maxlength: 120 },
  data: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false, collection: 'create_project_versions' });

createProjectVersionSchema.index({ ownerId: 1, projectId: 1, revision: -1 }, { name: 'create_versions_owner_project_recent' });
createProjectVersionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365, name: 'create_versions_expire_year' });

export const CreateProjectVersion = (mongoose.models.CreateProjectVersion as Model<CreateProjectVersionRecord> | undefined)
  ?? mongoose.model<CreateProjectVersionRecord>('CreateProjectVersion', createProjectVersionSchema);
