import IORedis from "ioredis";
import { env } from "@ycs/config";

/**
 * Shared Redis connection for BullMQ.
 */
export const redisConnection = new IORedis(env.REDIS_URL);
