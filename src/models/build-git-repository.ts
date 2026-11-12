import mongoose, { type Model, Schema } from 'mongoose';

export interface BuildGitRepositoryRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  initialized: boolean;
  defaultBranch: string;
  createdAt: Date;
  updatedAt: Date;
}

const buildGitRepositorySchema = new Schema<BuildGitRepositoryRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'BuildProject', required: true, immutable: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'BuildExecutionSession', required: true, immutable: true },
  initialized: { type: Boolean, default: false },
  defaultBranch: { type: String, default: 'main', maxlength: 120 },
}, { timestamps: true, versionKey: false, collection: 'build_git_repositories' });

buildGitRepositorySchema.index({ ownerId: 1, projectId: 1, sessionId: 1 }, { unique: true, name: 'build_git_repository_owner_session' });

export const BuildGitRepository = (mongoose.models.BuildGitRepository as Model<BuildGitRepositoryRecord> | undefined)
  ?? mongoose.model<BuildGitRepositoryRecord>('BuildGitRepository', buildGitRepositorySchema);
