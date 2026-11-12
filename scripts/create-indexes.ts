import { loadEnvConfig } from '@next/env';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/server/db';
import { AuthRateLimit } from '@/models/auth-rate-limit';
import { Conversation } from '@/models/conversation';
import { Message } from '@/models/message';
import { PasswordResetToken } from '@/models/password-reset-token';
import { Permission } from '@/models/permission';
import { Presence } from '@/models/presence';
import { Profile } from '@/models/profile';
import { Session } from '@/models/session';
import { TypingState } from '@/models/typing-state';
import { User } from '@/models/user';
import { ThinkConversation } from '@/models/think-conversation';
import { ThinkMessage } from '@/models/think-message';
import { ThinkPreference } from '@/models/think-preference';
import { ThinkDocument } from '@/models/think-document';
import { SpeakRecording } from '@/models/speak-recording';
import { CreateProject } from '@/models/create-project';
import { CreateProjectVersion } from '@/models/create-project-version';
import { CreateAsset } from '@/models/create-asset';
import { CreateExport } from '@/models/create-export';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';
import { BuildProjectFileVersion } from '@/models/build-project-file-version';
import { BuildApproval } from '@/models/build-approval';
import { BuildSecurityScan } from '@/models/build-security-scan';
import { BuildExecutionSession } from '@/models/build-execution-session';
import { BuildExecutionLog } from '@/models/build-execution-log';
import { BuildGitRepository } from '@/models/build-git-repository';
import { BuildPreviewSession } from '@/models/build-preview-session';
import { BuildRuntimeError } from '@/models/build-runtime-error';
import { DiscoverSearch } from '@/models/discover-search';
import { DiscoverSource } from '@/models/discover-source';
import { DiscoverCollection } from '@/models/discover-collection';
import { DiscoverBookmark } from '@/models/discover-bookmark';
import { DiscoverResearchTask } from '@/models/discover-research-task';
import { DiscoverResearchReport } from '@/models/discover-research-report';
import { DiscoverEvidence } from '@/models/discover-evidence';
import { SocialProfile } from '@/models/social-profile';
import { SocialFollow } from '@/models/social-follow';
import { SocialFollowRequest } from '@/models/social-follow-request';
import { SocialPost } from '@/models/social-post';
import { SocialComment } from '@/models/social-comment';
import { SocialReaction } from '@/models/social-reaction';
import { SocialBookmark } from '@/models/social-bookmark';
import { SocialBlock } from '@/models/social-block';
import { SocialStory } from '@/models/social-story';
import { SocialNotification } from '@/models/social-notification';
import { SocialReport } from '@/models/social-report';

loadEnvConfig(process.cwd());

async function main() {
  await connectToDatabase();
  for (const model of [User, Profile, Permission, Session, PasswordResetToken, AuthRateLimit, Conversation, Message, Presence, TypingState, ThinkConversation, ThinkMessage, ThinkPreference, ThinkDocument, SpeakRecording, CreateProject, CreateProjectVersion, CreateAsset, CreateExport, BuildProject, BuildProjectFile, BuildProjectFileVersion, BuildApproval, BuildSecurityScan, BuildExecutionSession, BuildExecutionLog, BuildGitRepository, BuildPreviewSession, BuildRuntimeError, DiscoverSearch, DiscoverSource, DiscoverCollection, DiscoverBookmark, DiscoverResearchTask, DiscoverResearchReport, DiscoverEvidence, SocialProfile, SocialFollow, SocialFollowRequest, SocialPost, SocialComment, SocialReaction, SocialBookmark, SocialBlock, SocialStory, SocialNotification, SocialReport]) {
    await model.createIndexes();
    console.log(`Created indexes for ${model.collection.collectionName}.`);
  }
}

main()
  .catch(error => {
    console.error('MongoDB index creation failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
