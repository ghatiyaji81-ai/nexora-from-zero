import mongoose, { type Model, Schema } from 'mongoose';

export interface ThinkDocumentRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  fileId: mongoose.Types.ObjectId;
  name: string;
  mimeType: 'application/pdf' | 'text/plain' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  size: number;
  sha256: string;
  extractedText: string;
  pageCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const thinkDocumentSchema = new Schema<ThinkDocumentRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  fileId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  mimeType: { type: String, enum: ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], required: true },
  size: { type: Number, required: true, min: 1, max: 15 * 1024 * 1024 },
  sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  extractedText: { type: String, required: true, maxlength: 500_000, select: false },
  pageCount: { type: Number, min: 1, default: undefined },
}, { timestamps: true, versionKey: false, collection: 'think_documents' });

thinkDocumentSchema.index({ ownerId: 1, createdAt: -1 }, { name: 'think_documents_owner_recent' });
thinkDocumentSchema.index({ ownerId: 1, sha256: 1 }, { name: 'think_documents_owner_hash' });
thinkDocumentSchema.index({ fileId: 1 }, { unique: true, name: 'think_documents_file_unique' });

export const ThinkDocument = (mongoose.models.ThinkDocument as Model<ThinkDocumentRecord> | undefined)
  ?? mongoose.model<ThinkDocumentRecord>('ThinkDocument', thinkDocumentSchema);
