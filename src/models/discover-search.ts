import mongoose, { type Model, Schema } from 'mongoose';

export interface DiscoverSearchRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  query: string;
  exactPhrase: boolean;
  resultCount: number;
  createdAt: Date;
}

const discoverSearchSchema = new Schema<DiscoverSearchRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  query: { type: String, required: true, trim: true, maxlength: 240 },
  exactPhrase: { type: Boolean, default: true },
  resultCount: { type: Number, min: 0, max: 50, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'discover_searches' });

discoverSearchSchema.index({ ownerId: 1, createdAt: -1 }, { name: 'discover_searches_owner_recent' });

export const DiscoverSearch = (mongoose.models.DiscoverSearch as Model<DiscoverSearchRecord> | undefined)
  ?? mongoose.model<DiscoverSearchRecord>('DiscoverSearch', discoverSearchSchema);
