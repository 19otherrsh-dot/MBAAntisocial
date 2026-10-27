import mongoose from 'mongoose';
import { env } from './env';

/**
 * Next.js hot-reloads modules in development and runs many concurrent lambdas
 * in production. Both would otherwise open a new pool per module instance, so
 * the connection promise is cached on `globalThis`.
 */
interface CachedConnection {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: CachedConnection | undefined;
}

const cached: CachedConnection = globalThis.mongooseCache ?? { conn: null, promise: null };
globalThis.mongooseCache = cached;

// Reject writes that silently drop unknown keys, and surface cast errors.
mongoose.set('strictQuery', true);

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(env.MONGODB_URI, {
        dbName: env.MONGODB_DB_NAME,
        // Buffering hides connection failures behind request timeouts.
        bufferCommands: false,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
      })
      .catch((error) => {
        // Clear the cache so the next request retries instead of awaiting a
        // permanently rejected promise.
        cached.promise = null;
        throw error;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;
