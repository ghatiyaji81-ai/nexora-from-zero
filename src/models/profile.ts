import mongoose, { type Model, Schema } from 'mongoose';

export interface ProfileRecord extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  locale: 'en' | 'hi';
  createdAt: Date;
  updatedAt: Date;
}

const profileSchema = new Schema<ProfileRecord>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  bio: { type: String, trim: true, maxlength: 500, default: '' },
  avatarUrl: { type: String, trim: true, maxlength: 2048, default: undefined },
  locale: { type: String, enum: ['en', 'hi'], default: 'en', required: true },
}, { timestamps: true, versionKey: false, collection: 'profiles' });

profileSchema.index({ userId: 1 }, { unique: true, name: 'profiles_user_unique' });

export const Profile = (mongoose.models.Profile as Model<ProfileRecord> | undefined)
  ?? mongoose.model<ProfileRecord>('Profile', profileSchema);
