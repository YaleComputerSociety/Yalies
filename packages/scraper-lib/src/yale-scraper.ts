import { chromium, type Browser, type Page } from "playwright";
import { SessionManager } from "@ycs/auth";
import { createLogger } from "@ycs/logger";

const logger = createLogger("yale-scraper");

/**
 * Playwright wrapper that injects donated sessions for Yale systems.
 */
export class YaleScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private sessionId: string | null = null;

  constructor(private readonly sessionManager: SessionManager) {}

  /**
   * Launch browser and inject donated session cookies.
   */
  async init(targetSystem: string): Promise<void> {
    const session = await this.sessionManager.getSession(targetSystem);
    if (!session) {
      throw new Error(`No active sessions for ${targetSystem}`);
    }

    this.sessionId = session.sessionId;
    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext();
    const cookies = JSON.parse(session.cookies) as Array<Record<string, unknown>>;
    await context.addCookies(cookies);
    this.page = await context.newPage();
  }

  /**
   * Navigate to a URL and return HTML, detecting CAS redirects.
   */
  async fetch(url: string): Promise<string> {
    if (!this.page) {
      throw new Error("Scraper not initialized");
    }

    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    const currentUrl = this.page.url();
    if (currentUrl.includes("/cas/") || currentUrl.includes("cas/login")) {
      if (this.sessionId) {
        await this.sessionManager.markSessionExpired(this.sessionId);
      }
      throw new Error("CAS redirect detected, session expired");
    }

    return this.page.content();
  }

  /**
   * Close browser resources.
   */
  async close(): Promise<void> {
    try {
      await this.page?.close();
    } catch (error) {
      logger.warn("Failed to close page", { error: String(error) });
    }

    try {
      await this.browser?.close();
    } catch (error) {
      logger.warn("Failed to close browser", { error: String(error) });
    }
  }
}
