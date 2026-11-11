import mongoose, { type Model, Schema } from 'mongoose';

export interface ThinkPreferenceRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  provider: 'openai';
  modelId: string;
  agent: 'general' | 'research' | 'coding' | 'study' | 'writing' | 'analysis';
  updatedAt: Date;
}

const thinkPreferenceSchema = new Schema<ThinkPreferenceRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  provider: { type: String, enum: ['openai'], required: true, default: 'openai' },
  modelId: { type: String, required: true, maxlength: 100 },
  agent: { type: String, enum: ['general', 'research', 'coding', 'study', 'writing', 'analysis'], required: true, default: 'general' },
}, { timestamps: { createdAt: false, updatedAt: true }, versionKey: false, collection: 'think_preferences' });

thinkPreferenceSchema.index({ ownerId: 1 }, { unique: true, name: 'think_preferences_owner_unique' });

export const ThinkPreference = (mongoose.models.ThinkPreference as Model<ThinkPreferenceRecord> | undefined)
  ?? mongoose.model<ThinkPreferenceRecord>('ThinkPreference', thinkPreferenceSchema);
