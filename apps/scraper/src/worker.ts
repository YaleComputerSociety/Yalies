import { createWorker } from "@ycs/queue";
import { createLogger } from "@ycs/logger";
import type { Job } from "bullmq";

const logger = createLogger("scraper-worker");

/**
 * Create a worker with error handling and logging.
 */
export const createScraperWorker = <T>(
  name: string,
  handler: (job: Job<T>) => Promise<void>
) =>
  createWorker<T>(name, async (job) => {
    logger.info("Job started", { name, jobId: job.id });
    try {
      await handler(job);
      logger.info("Job completed", { name, jobId: job.id });
    } catch (error) {
      logger.error("Job failed", { name, jobId: job.id, error: String(error) });
      throw error;
    }
  });
