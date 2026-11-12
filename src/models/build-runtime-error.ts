import mongoose, { type Model, Schema } from 'mongoose';

export interface BuildRuntimeErrorRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  executionSessionId: mongoose.Types.ObjectId;
  sourceLogId: mongoose.Types.ObjectId;
  source: 'build' | 'runtime' | 'test' | 'execution';
  severity: 'error';
  command: string;
  message: string;
  filePath?: string;
  line?: number;
  column?: number;
  stackTrace: string;
  exitCode: number;
  occurredAt: Date;
  createdAt: Date;
}

const buildRuntimeErrorSchema = new Schema<BuildRuntimeErrorRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'BuildProject', required: true, immutable: true },
  executionSessionId: { type: Schema.Types.ObjectId, ref: 'BuildExecutionSession', required: true, immutable: true },
  sourceLogId: { type: Schema.Types.ObjectId, ref: 'BuildExecutionLog', required: true, immutable: true },
  source: { type: String, enum: ['build', 'runtime', 'test', 'execution'], required: true, immutable: true },
  severity: { type: String, enum: ['error'], required: true, immutable: true },
  command: { type: String, required: true, maxlength: 300, immutable: true },
  message: { type: String, required: true, maxlength: 1000, immutable: true },
  filePath: { type: String, maxlength: 240, immutable: true },
  line: { type: Number, min: 1, immutable: true },
  column: { type: Number, min: 1, immutable: true },
  stackTrace: { type: String, required: true, maxlength: 8192, immutable: true },
  exitCode: { type: Number, required: true, min: 1, max: 255, immutable: true },
  occurredAt: { type: Date, required: true, immutable: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false, collection: 'build_runtime_errors' });

buildRuntimeErrorSchema.index({ ownerId: 1, projectId: 1, occurredAt: -1 }, { name: 'build_runtime_errors_owner_project_recent' });
buildRuntimeErrorSchema.index({ sourceLogId: 1 }, { unique: true, name: 'build_runtime_errors_source_log_unique' });

export const BuildRuntimeError = (mongoose.models.BuildRuntimeError as Model<BuildRuntimeErrorRecord> | undefined)
  ?? mongoose.model<BuildRuntimeErrorRecord>('BuildRuntimeError', buildRuntimeErrorSchema);
