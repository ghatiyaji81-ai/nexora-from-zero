import mongoose, { type Model, Schema } from 'mongoose';

export interface SocialProfileRecord extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  username: string;
  displayName: string;
  bio: string;
  website?: string;
  location?: string;
  interests: string[];
  visibility: 'public' | 'private';
  createdAt: Date;
  updatedAt: Date;
}

const socialProfileSchema = new Schema<SocialProfileRecord>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  username: { type: String, required: true, lowercase: true, trim: true, minlength: 3, maxlength: 30, match: /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/ },
  displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  bio: { type: String, trim: true, maxlength: 500, default: '' },
  website: { type: String, trim: true, maxlength: 300, default: undefined },
  location: { type: String, trim: true, maxlength: 100, default: undefined },
  interests: { type: [String], default: [], validate: (values: string[]) => values.length <= 20 && values.every(value => value.length <= 40) },
  visibility: { type: String, enum: ['public', 'private'], default: 'public', required: true },
}, { timestamps: true, versionKey: false, collection: 'social_profiles' });

socialProfileSchema.index({ userId: 1 }, { unique: true, name: 'social_profiles_user_unique' });
socialProfileSchema.index({ username: 1 }, { unique: true, name: 'social_profiles_username_unique' });
socialProfileSchema.index({ visibility: 1, updatedAt: -1 }, { name: 'social_profiles_discovery' });

export const SocialProfile = (mongoose.models.SocialProfile as Model<SocialProfileRecord> | undefined)
  ?? mongoose.model<SocialProfileRecord>('SocialProfile', socialProfileSchema);
