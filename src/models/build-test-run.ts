import mongoose, { type Model, Schema } from 'mongoose';
import type { BuildTestFramework } from '@/lib/build-testing';

export type BuildTestRunStatus = 'running' | 'passed' | 'failed' | 'cancelled' | 'timed_out' | 'blocked' | 'unavailable';
export interface BuildTestRunRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  executionSessionId: mongoose.Types.ObjectId;
  framework: BuildTestFramework;
  command: string;
  selection?: string;
  status: BuildTestRunStatus;
  exitCode?: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
  counts: { total?: number; passed?: number; failed?: number; skipped?: number };
  failures: Array<{ name: string; message: string }>;
  startedAt: Date;
  finishedAt?: Date;
  createdAt: Date;
}

const buildTestRunSchema = new Schema<BuildTestRunRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'BuildProject', required: true, immutable: true },
  executionSessionId: { type: Schema.Types.ObjectId, ref: 'BuildExecutionSession', required: true, immutable: true },
  framework: { type: String, enum: ['vitest', 'jest', 'playwright', 'cypress', 'node-test', 'pytest', 'unittest', 'maven', 'gradle', 'unknown'], required: true, immutable: true },
  command: { type: String, required: true, maxlength: 500, immutable: true },
  selection: { type: String, maxlength: 240, immutable: true },
  status: { type: String, enum: ['running', 'passed', 'failed', 'cancelled', 'timed_out', 'blocked', 'unavailable'], required: true },
  exitCode: { type: Number, min: -1, max: 255 },
  stdout: { type: String, maxlength: 65536, default: '' },
  stderr: { type: String, maxlength: 65536, default: '' },
  durationMs: { type: Number, min: 0, max: 600000 },
  counts: {
    total: { type: Number, min: 0 }, passed: { type: Number, min: 0 },
    failed: { type: Number, min: 0 }, skipped: { type: Number, min: 0 },
  },
  failures: {
    type: [{ name: { type: String, maxlength: 500 }, message: { type: String, maxlength: 1000 } }],
    default: [], maxlength: 50,
  },
  startedAt: { type: Date, required: true, immutable: true },
  finishedAt: { type: Date },
}, { timestamps: true, versionKey: false, collection: 'build_test_runs' });

buildTestRunSchema.index({ ownerId: 1, projectId: 1, createdAt: -1 }, { name: 'build_test_runs_owner_project_recent' });
buildTestRunSchema.index({ ownerId: 1, projectId: 1, status: 1 }, { name: 'build_test_runs_owner_project_status' });

export const BuildTestRun = (mongoose.models.BuildTestRun as Model<BuildTestRunRecord> | undefined)
  ?? mongoose.model<BuildTestRunRecord>('BuildTestRun', buildTestRunSchema);
