import mongoose, { type Model, Schema } from 'mongoose';

export interface DiscoverSourceRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  title: string;
  mimeType: string;
  excerpt: string;
  start: number;
  end: number;
  createdAt: Date;
}

const discoverSourceSchema = new Schema<DiscoverSourceRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  documentId: { type: Schema.Types.ObjectId, ref: 'ThinkDocument', required: true, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  mimeType: { type: String, required: true, maxlength: 100 },
  excerpt: { type: String, required: true, maxlength: 1000 },
  start: { type: Number, required: true, min: 0 },
  end: { type: Number, required: true, min: 1 },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'discover_sources' });

discoverSourceSchema.index({ ownerId: 1, documentId: 1, start: 1, end: 1 }, { unique: true, name: 'discover_sources_owner_location' });
discoverSourceSchema.index({ ownerId: 1, createdAt: -1 }, { name: 'discover_sources_owner_recent' });

export const DiscoverSource = (mongoose.models.DiscoverSource as Model<DiscoverSourceRecord> | undefined)
  ?? mongoose.model<DiscoverSourceRecord>('DiscoverSource', discoverSourceSchema);
