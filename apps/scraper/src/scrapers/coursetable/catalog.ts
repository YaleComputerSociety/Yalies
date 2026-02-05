import { SessionManager } from "@ycs/auth";
import { getCoursesBySeason, upsertCourses } from "@ycs/db";
import { createLogger } from "@ycs/logger";
import { YaleScraper, diffData, parseTable } from "@ycs/scraper-lib";
import { serviceClient } from "@ycs/db";

const logger = createLogger("scraper-coursetable-catalog");

/**
 * Scrape the CourseTable catalog and upsert courses.
 */
export const scrapeCourseCatalog = async (season: string): Promise<void> => {
  const { data: job, error: jobError } = await serviceClient
    .from("scrape_jobs")
    .insert({ job_type: "coursetableCatalog", status: "running", started_at: new Date() })
    .select("*")
    .single();

  if (jobError) {
    throw new Error(`Failed to create job record: ${jobError.message}`);
  }

  const sessionManager = new SessionManager();
  const scraper = new YaleScraper(sessionManager);

  try {
    await scraper.init("coursetable");
    const html = await scraper.fetch("https://courses.yale.edu");
    const rows = parseTable(html);

    const scrapedCourses = rows.map((row) => ({
      crn: String(row.CRN ?? row.crn ?? ""),
      season,
      code: String(row.Code ?? row.code ?? ""),
      title: String(row.Title ?? row.title ?? ""),
      description: row.Description ? String(row.Description) : null,
      instructors: [],
      times: []
    }));

    const existing = await getCoursesBySeason(season, 5000, 0);
    const diff = diffData(existing.data, scrapedCourses, "crn");
    await upsertCourses(scrapedCourses);

    await serviceClient
      .from("scrape_jobs")
      .update({
        status: "completed",
        records_processed: scrapedCourses.length,
        result: diff,
        completed_at: new Date()
      })
      .eq("id", job.id);

    logger.info("Course catalog scraped", { season, ...diff });
  } catch (error) {
    await serviceClient
      .from("scrape_jobs")
      .update({
        status: "failed",
        error: String(error),
        completed_at: new Date()
      })
      .eq("id", job.id);

    logger.error("Course catalog scrape failed", { error: String(error) });
    throw error;
  } finally {
    await scraper.close();
  }
};
