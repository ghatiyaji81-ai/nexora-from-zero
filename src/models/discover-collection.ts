import mongoose, { type Model, Schema } from 'mongoose';

export interface DiscoverCollectionRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const discoverCollectionSchema = new Schema<DiscoverCollectionRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  archived: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false, collection: 'discover_collections' });

discoverCollectionSchema.index({ ownerId: 1, archived: 1, updatedAt: -1 }, { name: 'discover_collections_owner_recent' });
discoverCollectionSchema.index({ ownerId: 1, title: 1 }, { unique: true, name: 'discover_collections_owner_title' });

export const DiscoverCollection = (mongoose.models.DiscoverCollection as Model<DiscoverCollectionRecord> | undefined)
  ?? mongoose.model<DiscoverCollectionRecord>('DiscoverCollection', discoverCollectionSchema);
