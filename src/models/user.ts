import mongoose, { type Model, Schema } from 'mongoose';

export interface UserRecord extends mongoose.Document {
  email: string;
  fullName: string;
  passwordHash: string;
  status: 'active' | 'disabled';
  emailVerifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserRecord>({
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  passwordHash: { type: String, required: true, select: false },
  status: { type: String, required: true, enum: ['active', 'disabled'], default: 'active' },
  emailVerifiedAt: { type: Date, default: undefined },
}, { timestamps: true, versionKey: false, collection: 'users' });

userSchema.index({ email: 1 }, { unique: true, name: 'users_email_unique' });
userSchema.index({ status: 1, createdAt: -1 }, { name: 'users_status_created' });

export const User = (mongoose.models.User as Model<UserRecord> | undefined)
  ?? mongoose.model<UserRecord>('User', userSchema);
