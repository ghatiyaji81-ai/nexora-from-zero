import mongoose, { type Model, Schema } from 'mongoose';

export interface CreateAssetRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  fileId: mongoose.Types.ObjectId;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'video' | 'audio' | 'document';
  folder: string;
  tags: string[];
  favorite: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const createAssetSchema = new Schema<CreateAssetRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'CreateProject', default: undefined },
  fileId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  mimeType: { type: String, required: true, maxlength: 80 },
  size: { type: Number, required: true, min: 1, max: 25 * 1024 * 1024 },
  kind: { type: String, enum: ['image', 'video', 'audio', 'document'], required: true },
  folder: { type: String, trim: true, maxlength: 80, default: '' },
  tags: { type: [String], default: [], validate: (tags: string[]) => tags.length <= 12 && tags.every(tag => tag.length <= 30) },
  favorite: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false, collection: 'create_assets' });

createAssetSchema.index({ ownerId: 1, createdAt: -1 }, { name: 'create_assets_owner_recent' });
createAssetSchema.index({ ownerId: 1, projectId: 1, createdAt: -1 }, { name: 'create_assets_owner_project_recent' });
createAssetSchema.index({ ownerId: 1, kind: 1, favorite: 1 }, { name: 'create_assets_owner_filter' });
createAssetSchema.index({ fileId: 1 }, { unique: true, name: 'create_assets_file_unique' });

export const CreateAsset = (mongoose.models.CreateAsset as Model<CreateAssetRecord> | undefined)
  ?? mongoose.model<CreateAssetRecord>('CreateAsset', createAssetSchema);
