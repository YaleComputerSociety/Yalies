import { SessionManager } from "@ycs/auth";
import { createLogger } from "@ycs/logger";
import { YaleScraper, parseTable } from "@ycs/scraper-lib";
import { serviceClient } from "@ycs/db";

const logger = createLogger("scraper-yaleims-scores");

/**
 * Scrape intramural scores and update games.
 */
export const scrapeYaleImsScores = async (): Promise<void> => {
  const { data: job, error: jobError } = await serviceClient
    .from("scrape_jobs")
    .insert({ job_type: "yaleimsScores", status: "running", started_at: new Date() })
    .select("*")
    .single();

  if (jobError) {
    throw new Error(`Failed to create job record: ${jobError.message}`);
  }

  const sessionManager = new SessionManager();
  const scraper = new YaleScraper(sessionManager);

  try {
    await scraper.init("yaleims");
    const html = await scraper.fetch("https://yaleims.com/scores");
    const rows = parseTable(html);

    for (const row of rows) {
      const gameId = row.GameId ?? row.gameId ?? null;
      if (!gameId) {
        continue;
      }

      await serviceClient
        .from("im_games")
        .update({
          home_score: row.HomeScore ? Number(row.HomeScore) : null,
          away_score: row.AwayScore ? Number(row.AwayScore) : null,
          status: row.Status ?? "completed"
        })
        .eq("id", gameId);
    }

    await serviceClient
      .from("scrape_jobs")
      .update({
        status: "completed",
        records_processed: rows.length,
        completed_at: new Date()
      })
      .eq("id", job.id);

    logger.info("IM scores scraped", { count: rows.length });
  } catch (error) {
    await serviceClient
      .from("scrape_jobs")
      .update({
        status: "failed",
        error: String(error),
        completed_at: new Date()
      })
      .eq("id", job.id);

    logger.error("IM scores scrape failed", { error: String(error) });
    throw error;
  } finally {
    await scraper.close();
  }
};
