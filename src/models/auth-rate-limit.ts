import mongoose, { type Model, Schema } from 'mongoose';

export interface AuthRateLimitRecord extends mongoose.Document {
  bucketHash: string;
  count: number;
  expiresAt: Date;
}

const authRateLimitSchema = new Schema<AuthRateLimitRecord>({
  bucketHash: { type: String, required: true, select: false },
  count: { type: Number, min: 1, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
}, { versionKey: false, collection: 'auth_rate_limits' });

authRateLimitSchema.index({ bucketHash: 1 }, { unique: true, name: 'auth_rate_limit_bucket_unique' });
authRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'auth_rate_limit_expiry_ttl' });

export const AuthRateLimit = (mongoose.models.AuthRateLimit as Model<AuthRateLimitRecord> | undefined)
  ?? mongoose.model<AuthRateLimitRecord>('AuthRateLimit', authRateLimitSchema);
