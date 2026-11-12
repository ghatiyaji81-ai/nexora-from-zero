import mongoose, { type Model, Schema } from 'mongoose';

export interface SocialBookmarkRecord extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  postId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const socialBookmarkSchema = new Schema<SocialBookmarkRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  postId: { type: Schema.Types.ObjectId, ref: 'SocialPost', required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'social_bookmarks' });

socialBookmarkSchema.index({ ownerId: 1, postId: 1 }, { unique: true, name: 'social_bookmarks_owner_post_unique' });
socialBookmarkSchema.index({ ownerId: 1, createdAt: -1 }, { name: 'social_bookmarks_owner_recent' });

export const SocialBookmark = (mongoose.models.SocialBookmark as Model<SocialBookmarkRecord> | undefined)
  ?? mongoose.model<SocialBookmarkRecord>('SocialBookmark', socialBookmarkSchema);
