import { loadEnvConfig } from '@next/env';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/server/db';
import { AuthRateLimit } from '@/models/auth-rate-limit';
import { PasswordResetToken } from '@/models/password-reset-token';
import { Permission } from '@/models/permission';
import { Profile } from '@/models/profile';
import { Session } from '@/models/session';
import { User } from '@/models/user';

loadEnvConfig(process.cwd());

async function main() {
  await connectToDatabase();
  for (const model of [User, Profile, Permission, Session, PasswordResetToken, AuthRateLimit]) {
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
