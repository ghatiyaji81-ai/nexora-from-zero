import mongoose, { type Model, Schema } from 'mongoose';

export const permissionNames = [
  'profile:read',
  'profile:write',
  'workspace:read',
] as const;

export type PermissionName = (typeof permissionNames)[number];

export interface PermissionRecord extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  role: 'owner' | 'member' | 'admin';
  grants: PermissionName[];
  createdAt: Date;
  updatedAt: Date;
}

const permissionSchema = new Schema<PermissionRecord>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'member', 'admin'], default: 'owner', required: true },
  grants: {
    type: [{ type: String, enum: permissionNames }],
    default: ['profile:read', 'profile:write', 'workspace:read'],
    required: true,
  },
}, { timestamps: true, versionKey: false, collection: 'permissions' });

permissionSchema.index({ userId: 1 }, { unique: true, name: 'permissions_user_unique' });
permissionSchema.index({ role: 1 }, { name: 'permissions_role' });

export const Permission = (mongoose.models.Permission as Model<PermissionRecord> | undefined)
  ?? mongoose.model<PermissionRecord>('Permission', permissionSchema);
