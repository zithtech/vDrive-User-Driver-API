import Redis from 'ioredis';
import { logger } from './logger';
import config from '../config';

let client: Redis | null = null;
let pubClient: Redis | null = null;
let subClient: Redis | null = null;
export const connectRedis = async (): Promise<void> => {
  if (client && pubClient && subClient) return;

  const redisOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 100, 3000); // exponential backoff: 100ms → 3s cap
      logger.warn(`Redis retry attempt ${times}, reconnecting in ${delay}ms`);
      return delay;
    },
    reconnectOnError: (err: Error) => {
      // Reconnect on READONLY errors (occurs during Redis primary failover)
      return err.message.includes('READONLY');
    },
  };

  client = new Redis(config.redis.url, redisOptions);
  pubClient = client.duplicate();
  subClient = client.duplicate();

  const attachListeners = (c: Redis, name: string) => {
    c.on('error', (err: Error) => logger.error(`Redis ${name} error:`, err.message));
    c.on('reconnecting', () => logger.warn(`Redis ${name} reconnecting...`));
    c.on('ready', () => logger.info(`Redis ${name} ready`));
  };

  attachListeners(client, 'client');
  attachListeners(pubClient, 'pubClient');
  attachListeners(subClient, 'subClient');

  try {
    await client.connect(); // explicit connect (lazyConnect: true)
    await pubClient.connect();
    await subClient.connect();
    await client.ping(); // health check
    logger.info('✅ Connected to Redis (Main, Pub, Sub)');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('❌ Redis connection failed:', errorMessage);
    client = null;
    pubClient = null;
    subClient = null;
    throw new Error('Redis connection failed');
  }
};

export const disconnectRedis = async (): Promise<void> => {
  const promises: Promise<any>[] = [];
  if (client) promises.push(client.quit());
  if (pubClient) promises.push(pubClient.quit());
  if (subClient) promises.push(subClient.quit());

  await Promise.all(promises);
  client = null;
  pubClient = null;
  subClient = null;
  logger.info('Redis disconnected');
};

export const getRedisClient = (): Redis => {
  if (!client) {
    throw new Error('Redis not connected. Call connectRedis first.');
  }
  return client;
};

export const getPubClient = (): Redis => {
  if (!pubClient) {
    throw new Error('Redis PubClient not connected. Call connectRedis first.');
  }
  return pubClient;
};

export const getSubClient = (): Redis => {
  if (!subClient) {
    throw new Error('Redis SubClient not connected. Call connectRedis first.');
  }
  return subClient;
};

/**
 * Acquire a distributed lock using Redis SET NX
 * @param key Lock key
 * @param ttlSeconds TTL in seconds
 * @returns true if lock acquired, false otherwise
 */
export const acquireLock = async (key: string, ttlSeconds: number): Promise<boolean> => {
  try {
    const redis = getRedisClient();
    const result = await redis.set(`lock:${key}`, 'locked', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch (error) {
    logger.error(`Error acquiring lock for ${key}:`, error);
    return false;
  }
};

/**
 * Release a distributed lock
 * @param key Lock key
 */
export const releaseLock = async (key: string): Promise<void> => {
  try {
    const redis = getRedisClient();
    await redis.del(`lock:${key}`);
  } catch (error) {
    logger.error(`Error releasing lock for ${key}:`, error);
  }
};
