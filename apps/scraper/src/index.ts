import { createLogger } from "@ycs/logger";
import {
  coursetableCatalogQueue,
  coursetableEvaluationsQueue,
  yaliesDirectoryQueue,
  yaleimsScoresQueue
} from "@ycs/queue";
import { createScraperWorker } from "./worker.js";
import { startScheduler } from "./scheduler.js";
import {
  scrapeCourseCatalog,
  scrapeCourseEvaluations,
  scrapeYaliesDirectory,
  scrapeYaleImsScores
} from "./scrapers/index.js";

const logger = createLogger("scraper");

createScraperWorker("coursetable-catalog", async (job) =>
  scrapeCourseCatalog(job.data.season ?? "202501")
);
createScraperWorker("coursetable-evaluations", async () => scrapeCourseEvaluations());
createScraperWorker("yalies-directory", async () => scrapeYaliesDirectory());
createScraperWorker("yaleims-scores", async () => scrapeYaleImsScores());

await startScheduler();

logger.info("Scraper service started", {
  queues: [
    coursetableCatalogQueue.name,
    coursetableEvaluationsQueue.name,
    yaliesDirectoryQueue.name,
    yaleimsScoresQueue.name
  ]
});
