import mongoose, { type Model, Schema } from 'mongoose';
import type { BuildTemplateId } from '@/lib/build';

export interface BuildProjectRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  template: BuildTemplateId;
  status: 'active' | 'archived';
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const buildProjectSchema = new Schema<BuildProjectRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  template: { type: String, required: true, enum: ['blank', 'html', 'node', 'typescript', 'react', 'nextjs', 'python', 'flask', 'django', 'express', 'java', 'c', 'cpp', 'data-science', 'machine-learning'] },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  tags: { type: [String], default: [] },
}, { timestamps: true, versionKey: false, collection: 'build_projects' });

buildProjectSchema.index({ ownerId: 1, status: 1, updatedAt: -1 }, { name: 'build_projects_owner_recent' });
buildProjectSchema.index({ ownerId: 1, title: 'text', description: 'text' }, { name: 'build_projects_owner_search' });

export const BuildProject = (mongoose.models.BuildProject as Model<BuildProjectRecord> | undefined)
  ?? mongoose.model<BuildProjectRecord>('BuildProject', buildProjectSchema);
