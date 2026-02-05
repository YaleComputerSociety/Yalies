import { Queue } from "bullmq";
import { redisConnection } from "./redis.js";

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 }
};

export const coursetableCatalogQueue = new Queue("coursetable-catalog", {
  connection: redisConnection,
  defaultJobOptions
});

export const coursetableEvaluationsQueue = new Queue("coursetable-evaluations", {
  connection: redisConnection,
  defaultJobOptions
});

export const yaliesDirectoryQueue = new Queue("yalies-directory", {
  connection: redisConnection,
  defaultJobOptions
});

export const yaleimsScoresQueue = new Queue("yaleims-scores", {
  connection: redisConnection,
  defaultJobOptions
});
