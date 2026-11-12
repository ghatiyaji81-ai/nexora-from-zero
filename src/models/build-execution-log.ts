import mongoose, { type Model, Schema } from 'mongoose';

export interface BuildExecutionLogRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  kind: 'command' | 'git';
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  createdAt: Date;
}

const buildExecutionLogSchema = new Schema<BuildExecutionLogRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'BuildProject', required: true, immutable: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'BuildExecutionSession', required: true, immutable: true },
  kind: { type: String, enum: ['command', 'git'], required: true, immutable: true },
  command: { type: String, required: true, maxlength: 300, immutable: true },
  stdout: { type: String, maxlength: 65536, default: '', immutable: true },
  stderr: { type: String, maxlength: 65536, default: '', immutable: true },
  exitCode: { type: Number, required: true, min: -1, max: 255, immutable: true },
  durationMs: { type: Number, required: true, min: 0, max: 600000, immutable: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false, collection: 'build_execution_logs' });

buildExecutionLogSchema.index({ ownerId: 1, projectId: 1, sessionId: 1, createdAt: -1 }, { name: 'build_execution_logs_owner_session_recent' });

export const BuildExecutionLog = (mongoose.models.BuildExecutionLog as Model<BuildExecutionLogRecord> | undefined)
  ?? mongoose.model<BuildExecutionLogRecord>('BuildExecutionLog', buildExecutionLogSchema);
