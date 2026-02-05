import { SessionManager } from "@ycs/auth";
import { createLogger } from "@ycs/logger";
import { YaleScraper, parseTable } from "@ycs/scraper-lib";
import { serviceClient } from "@ycs/db";

const logger = createLogger("scraper-coursetable-evaluations");

/**
 * Scrape course evaluations and update course ratings.
 */
export const scrapeCourseEvaluations = async (): Promise<void> => {
  const { data: job, error: jobError } = await serviceClient
    .from("scrape_jobs")
    .insert({ job_type: "coursetableEvaluations", status: "running", started_at: new Date() })
    .select("*")
    .single();

  if (jobError) {
    throw new Error(`Failed to create job record: ${jobError.message}`);
  }

  const sessionManager = new SessionManager();
  const scraper = new YaleScraper(sessionManager);

  try {
    await scraper.init("coursetable");
    const html = await scraper.fetch("https://coursetable.com/evaluations");
    const rows = parseTable(html);

    for (const row of rows) {
      const crn = String(row.CRN ?? row.crn ?? "");
      const season = String(row.Season ?? row.season ?? "");
      const rating = row.Rating ? Number(row.Rating) : null;
      const workload = row.Workload ? Number(row.Workload) : null;

      if (!crn || !season) {
        continue;
      }

      await serviceClient
        .from("courses")
        .update({ rating, workload, scraped_at: new Date() })
        .eq("crn", crn)
        .eq("season", season);
    }

    await serviceClient
      .from("scrape_jobs")
      .update({
        status: "completed",
        records_processed: rows.length,
        completed_at: new Date()
      })
      .eq("id", job.id);

    logger.info("Course evaluations scraped", { count: rows.length });
  } catch (error) {
    await serviceClient
      .from("scrape_jobs")
      .update({
        status: "failed",
        error: String(error),
        completed_at: new Date()
      })
      .eq("id", job.id);

    logger.error("Course evaluations scrape failed", { error: String(error) });
    throw error;
  } finally {
    await scraper.close();
  }
};
