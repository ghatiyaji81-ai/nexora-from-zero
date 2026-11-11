import 'server-only';
import mongoose from 'mongoose';
import { getMongoUri } from '@/lib/server/env';

type MongooseCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithMongoose = globalThis as typeof globalThis & { __nexoraMongoose?: MongooseCache };
const cache = globalWithMongoose.__nexoraMongoose ?? { connection: null, promise: null };
globalWithMongoose.__nexoraMongoose = cache;

export async function connectToDatabase() {
  if (cache.connection?.connection.readyState === 1) return cache.connection;

  if (!cache.promise) {
    cache.promise = mongoose.connect(getMongoUri(), {
      autoIndex: process.env.NODE_ENV !== 'production',
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    });
  }

  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } catch (error) {
    cache.promise = null;
    cache.connection = null;
    throw error;
  }
}
