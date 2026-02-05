import { SessionManager } from "@ycs/auth";
import { createLogger } from "@ycs/logger";
import { YaleScraper, parseTable } from "@ycs/scraper-lib";
import { serviceClient } from "@ycs/db";

const logger = createLogger("scraper-yalies-directory");

/**
 * Scrape the Yale directory and upsert people.
 */
export const scrapeYaliesDirectory = async (): Promise<void> => {
  const { data: job, error: jobError } = await serviceClient
    .from("scrape_jobs")
    .insert({ job_type: "yaliesDirectory", status: "running", started_at: new Date() })
    .select("*")
    .single();

  if (jobError) {
    throw new Error(`Failed to create job record: ${jobError.message}`);
  }

  const sessionManager = new SessionManager();
  const scraper = new YaleScraper(sessionManager);

  try {
    await scraper.init("yalies");
    const html = await scraper.fetch("https://directory.yale.edu");
    const rows = parseTable(html);

    const people = rows.map((row) => ({
      net_id: row.NetId ?? row.netId ?? null,
      email: row.Email ?? row.email ?? null,
      name: row.Name ?? row.name ?? "",
      college: row.College ?? row.college ?? null,
      year: row.Year ? Number(row.Year) : null,
      scraped_at: new Date()
    }));

    if (people.length > 0) {
      const { error } = await serviceClient
        .from("people")
        .upsert(people, { onConflict: "net_id" });
      if (error) {
        throw new Error(`Upsert people failed: ${error.message}`);
      }
    }

    await serviceClient
      .from("scrape_jobs")
      .update({
        status: "completed",
        records_processed: people.length,
        completed_at: new Date()
      })
      .eq("id", job.id);

    logger.info("Directory scraped", { count: people.length });
  } catch (error) {
    await serviceClient
      .from("scrape_jobs")
      .update({
        status: "failed",
        error: String(error),
        completed_at: new Date()
      })
      .eq("id", job.id);

    logger.error("Directory scrape failed", { error: String(error) });
    throw error;
  } finally {
    await scraper.close();
  }
};
