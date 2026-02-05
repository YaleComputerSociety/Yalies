import {
  coursetableCatalogQueue,
  coursetableEvaluationsQueue,
  yaliesDirectoryQueue,
  yaleimsScoresQueue
} from "@ycs/queue";

/**
 * Register recurring scraper jobs.
 */
export const startScheduler = async (): Promise<void> => {
  await coursetableCatalogQueue.add(
    "coursetableCatalog",
    {},
    { repeat: { cron: "0 3 * * *", tz: "America/New_York" } }
  );

  await coursetableEvaluationsQueue.add(
    "coursetableEvaluations",
    {},
    { repeat: { cron: "0 3 * * 1", tz: "America/New_York" } }
  );

  await yaliesDirectoryQueue.add(
    "yaliesDirectory",
    {},
    { repeat: { cron: "0 3 * * 0", tz: "America/New_York" } }
  );

  await yaleimsScoresQueue.add(
    "yaleimsScores",
    {},
    { repeat: { cron: "*/30 * * * *", tz: "America/New_York" } }
  );
};
