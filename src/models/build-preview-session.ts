import mongoose, { type Model, Schema } from 'mongoose';
import type { BuildPreviewFramework } from '@/lib/build-preview';

export interface BuildPreviewSessionRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  executionSessionId: mongoose.Types.ObjectId;
  framework: BuildPreviewFramework;
  runtime: 'node' | 'static' | 'unsupported';
  status: 'starting' | 'running' | 'stopped' | 'failed';
  providerSessionId: string;
  startedAt: Date;
  stoppedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const buildPreviewSessionSchema = new Schema<BuildPreviewSessionRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'BuildProject', required: true, immutable: true },
  executionSessionId: { type: Schema.Types.ObjectId, ref: 'BuildExecutionSession', required: true, immutable: true },
  framework: { type: String, enum: ['nextjs', 'vite', 'react', 'node', 'static', 'unsupported'], required: true, immutable: true },
  runtime: { type: String, enum: ['node', 'static', 'unsupported'], required: true, immutable: true },
  status: { type: String, enum: ['starting', 'running', 'stopped', 'failed'], required: true },
  providerSessionId: { type: String, required: true, maxlength: 160, select: false },
  startedAt: { type: Date, required: true, immutable: true },
  stoppedAt: { type: Date },
  lastError: { type: String, maxlength: 1000 },
}, { timestamps: true, versionKey: false, collection: 'build_preview_sessions' });

buildPreviewSessionSchema.index({ ownerId: 1, projectId: 1, createdAt: -1 }, { name: 'build_preview_owner_project_recent' });
buildPreviewSessionSchema.index({ status: 1, updatedAt: -1 }, { name: 'build_preview_status_recent' });

export const BuildPreviewSession = (mongoose.models.BuildPreviewSession as Model<BuildPreviewSessionRecord> | undefined)
  ?? mongoose.model<BuildPreviewSessionRecord>('BuildPreviewSession', buildPreviewSessionSchema);
