import mongoose, { type Model, Schema } from 'mongoose';
import type { BuildRuntime } from '@/lib/server/build-execution-provider';

export interface BuildExecutionSessionRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  runtime: BuildRuntime;
  containerId: string;
  status: 'starting' | 'active' | 'stopped' | 'failed';
  busy: boolean;
  sourceSnapshot: Array<{ path: string; fileId: mongoose.Types.ObjectId; revision: number }>;
  startedAt: Date;
  stoppedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const buildExecutionSessionSchema = new Schema<BuildExecutionSessionRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'BuildProject', required: true, immutable: true },
  runtime: { type: String, enum: ['node', 'python', 'java', 'native'], required: true, immutable: true },
  containerId: { type: String, required: true, immutable: true, maxlength: 64 },
  status: { type: String, enum: ['starting', 'active', 'stopped', 'failed'], default: 'starting' },
  busy: { type: Boolean, default: false },
  sourceSnapshot: {
    type: [{
      path: { type: String, required: true, maxlength: 240 },
      fileId: { type: Schema.Types.ObjectId, required: true },
      revision: { type: Number, required: true, min: 0 },
    }],
    required: true,
    default: [],
  },
  startedAt: { type: Date, required: true, immutable: true },
  stoppedAt: { type: Date },
}, { timestamps: true, versionKey: false, collection: 'build_execution_sessions' });

buildExecutionSessionSchema.index({ ownerId: 1, projectId: 1, createdAt: -1 }, { name: 'build_execution_owner_project_recent' });
buildExecutionSessionSchema.index({ status: 1, updatedAt: -1 }, { name: 'build_execution_status_recent' });

export const BuildExecutionSession = (mongoose.models.BuildExecutionSession as Model<BuildExecutionSessionRecord> | undefined)
  ?? mongoose.model<BuildExecutionSessionRecord>('BuildExecutionSession', buildExecutionSessionSchema);
