import mongoose, { type Model, Schema } from 'mongoose';

export interface PasswordResetTokenRecord extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<PasswordResetTokenRecord>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: undefined },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'password_reset_tokens' });

passwordResetTokenSchema.index({ tokenHash: 1 }, { unique: true, name: 'password_reset_token_hash_unique' });
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'password_reset_expiry_ttl' });
passwordResetTokenSchema.index({ userId: 1, createdAt: -1 }, { name: 'password_reset_user_created' });

export const PasswordResetToken = (mongoose.models.PasswordResetToken as Model<PasswordResetTokenRecord> | undefined)
  ?? mongoose.model<PasswordResetTokenRecord>('PasswordResetToken', passwordResetTokenSchema);
