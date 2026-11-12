import mongoose, { type Model, Schema } from 'mongoose';

export interface DiscoverBookmarkRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  sourceId: mongoose.Types.ObjectId;
  collectionId?: mongoose.Types.ObjectId;
  note: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const discoverBookmarkSchema = new Schema<DiscoverBookmarkRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  sourceId: { type: Schema.Types.ObjectId, ref: 'DiscoverSource', required: true, immutable: true },
  collectionId: { type: Schema.Types.ObjectId, ref: 'DiscoverCollection', default: undefined },
  note: { type: String, trim: true, maxlength: 1000, default: '' },
  tags: { type: [String], default: [], validate: (tags: string[]) => tags.length <= 12 && tags.every(tag => tag.length <= 30) },
}, { timestamps: true, versionKey: false, collection: 'discover_bookmarks' });

discoverBookmarkSchema.index({ ownerId: 1, sourceId: 1 }, { unique: true, name: 'discover_bookmarks_owner_source' });
discoverBookmarkSchema.index({ ownerId: 1, collectionId: 1, updatedAt: -1 }, { name: 'discover_bookmarks_owner_collection' });

export const DiscoverBookmark = (mongoose.models.DiscoverBookmark as Model<DiscoverBookmarkRecord> | undefined)
  ?? mongoose.model<DiscoverBookmarkRecord>('DiscoverBookmark', discoverBookmarkSchema);
