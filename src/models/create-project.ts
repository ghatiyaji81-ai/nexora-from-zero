import mongoose, { type Model, Schema } from 'mongoose';
import type { CreateCategory, CreateProjectType } from '@/lib/create';

export type CreateProjectStatus = 'draft' | 'archived';

export interface CreateProjectRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  category: CreateCategory;
  projectType: CreateProjectType;
  status: CreateProjectStatus;
  favorite: boolean;
  thumbnailAssetId?: mongoose.Types.ObjectId;
  assetIds: mongoose.Types.ObjectId[];
  data: Record<string, unknown>;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

const createProjectSchema = new Schema<CreateProjectRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  category: { type: String, enum: ['image', 'video', 'graphic-design', 'document', 'presentation', 'social-media', 'marketing', 'audio', 'custom'], required: true },
  projectType: { type: String, enum: ['image', 'video', 'design', 'document', 'presentation', 'content', 'audio', 'custom'], required: true },
  status: { type: String, enum: ['draft', 'archived'], default: 'draft' },
  favorite: { type: Boolean, default: false },
  thumbnailAssetId: { type: Schema.Types.ObjectId, default: undefined },
  assetIds: { type: [Schema.Types.ObjectId], default: [] },
  data: { type: Schema.Types.Mixed, required: true },
  revision: { type: Number, min: 0, default: 0 },
}, { timestamps: true, versionKey: false, collection: 'create_projects' });

createProjectSchema.index({ ownerId: 1, status: 1, updatedAt: -1 }, { name: 'create_projects_owner_recent' });
createProjectSchema.index({ ownerId: 1, favorite: 1, updatedAt: -1 }, { name: 'create_projects_owner_favorites' });
createProjectSchema.index({ ownerId: 1, category: 1, updatedAt: -1 }, { name: 'create_projects_owner_category' });
createProjectSchema.index({ ownerId: 1, title: 'text', description: 'text' }, { name: 'create_projects_owner_search' });

export const CreateProject = (mongoose.models.CreateProject as Model<CreateProjectRecord> | undefined)
  ?? mongoose.model<CreateProjectRecord>('CreateProject', createProjectSchema);
