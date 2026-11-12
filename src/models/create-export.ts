import mongoose, { type Model, Schema } from 'mongoose';

export type CreateExportFormat = 'png' | 'svg' | 'jpeg' | 'webp' | 'pdf' | 'md' | 'txt' | 'html' | 'webm' | 'mp3' | 'wav';

export interface CreateExportRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  projectTitle: string;
  format: CreateExportFormat;
  createdAt: Date;
}

const createExportSchema = new Schema<CreateExportRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'CreateProject', required: true, immutable: true },
  projectTitle: { type: String, required: true, maxlength: 120 },
  format: { type: String, enum: ['png', 'svg', 'jpeg', 'webp', 'pdf', 'md', 'txt', 'html', 'webm', 'mp3', 'wav'], required: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false, collection: 'create_exports' });

createExportSchema.index({ ownerId: 1, createdAt: -1 }, { name: 'create_exports_owner_recent' });
createExportSchema.index({ ownerId: 1, projectId: 1, createdAt: -1 }, { name: 'create_exports_owner_project' });
createExportSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365, name: 'create_exports_expire_year' });

export const CreateExport = (mongoose.models.CreateExport as Model<CreateExportRecord> | undefined)
  ?? mongoose.model<CreateExportRecord>('CreateExport', createExportSchema);
