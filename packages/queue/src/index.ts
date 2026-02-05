import { Queue, Worker, type Processor, type WorkerOptions } from "bullmq";
import { redisConnection } from "./redis.js";

/**
 * Create a BullMQ queue with shared Redis connection.
 */
export const createQueue = <T>(name: string) =>
  new Queue<T>(name, {
    connection: redisConnection,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
  });

/**
 * Create a BullMQ worker with shared Redis connection.
 */
export const createWorker = <T>(
  name: string,
  processor: Processor<T>,
  options?: WorkerOptions
) =>
  new Worker<T>(name, processor, {
    connection: redisConnection,
    ...options
  });

export * from "./queues.js";
export * from "./redis.js";
