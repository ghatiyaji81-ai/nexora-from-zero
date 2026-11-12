import mongoose, { type Model, Schema } from 'mongoose';
import type { BuildFinding } from '@/lib/build';

export interface BuildSecurityScanRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  findings: BuildFinding[];
  scannedFileCount: number;
  truncated: boolean;
  createdAt: Date;
}

const buildFindingSchema = new Schema<BuildFinding>({
  rule: { type: String, required: true },
  severity: { type: String, enum: ['high', 'medium', 'low'], required: true },
  title: { type: String, required: true },
  path: { type: String, required: true },
  line: { type: Number, required: true, min: 1 },
  explanation: { type: String, required: true },
  status: { type: String, enum: ['needs_review'], required: true },
}, { _id: false });

const buildSecurityScanSchema = new Schema<BuildSecurityScanRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'BuildProject', required: true, immutable: true },
  findings: { type: [buildFindingSchema], required: true, default: [] },
  scannedFileCount: { type: Number, required: true, min: 0 },
  truncated: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false, collection: 'build_security_scans' });

buildSecurityScanSchema.index({ ownerId: 1, projectId: 1, createdAt: -1 }, { name: 'build_scans_owner_project_recent' });

export const BuildSecurityScan = (mongoose.models.BuildSecurityScan as Model<BuildSecurityScanRecord> | undefined)
  ?? mongoose.model<BuildSecurityScanRecord>('BuildSecurityScan', buildSecurityScanSchema);
