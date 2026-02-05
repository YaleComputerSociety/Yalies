import crypto from "node:crypto";
import { env } from "@ycs/config";
import { serviceClient } from "@ycs/db";
import { createLogger } from "@ycs/logger";

type StoredSession = {
  id: string;
  donor_net_id: string;
  encrypted_cookies: string;
  target_systems: string[];
  status: "active" | "expired" | "revoked";
  expires_at: string;
  last_used_at?: string | null;
};

const logger = createLogger("session-manager");

const ALGORITHM = "aes-256-gcm";

const getKey = (): Buffer => Buffer.from(env.ENCRYPTION_KEY, "utf-8").subarray(0, 32);

const encrypt = (value: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

const decrypt = (value: string): string => {
  const raw = Buffer.from(value, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
};

/**
 * Manage donated sessions used for scraping.
 */
export class SessionManager {
  /**
   * Get the next valid session for a target system.
   */
  async getSession(targetSystem: string): Promise<{ sessionId: string; cookies: string } | null> {
    const { data, error } = await serviceClient
      .from("donated_sessions")
      .select("*")
      .eq("status", "active")
      .contains("target_systems", [targetSystem])
      .gt("expires_at", new Date().toISOString())
      .order("last_used_at", { ascending: true })
      .limit(1);

    if (error) {
      throw new Error(`getSession failed: ${error.message}`);
    }

    const session = (data ?? [])[0] as StoredSession | undefined;
    if (!session) {
      return null;
    }

    const cookies = decrypt(session.encrypted_cookies);
    await serviceClient
      .from("donated_sessions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", session.id);

    return { sessionId: session.id, cookies };
  }

  /**
   * Store a donated session for future use.
   */
  async donateSession(
    donorNetId: string,
    cookies: unknown,
    targetSystems: string[],
    expiresAt: string
  ): Promise<string> {
    const encryptedCookies = encrypt(JSON.stringify(cookies));

    const { data, error } = await serviceClient
      .from("donated_sessions")
      .insert({
        donor_net_id: donorNetId,
        encrypted_cookies: encryptedCookies,
        target_systems: targetSystems,
        status: "active",
        expires_at: expiresAt
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`donateSession failed: ${error.message}`);
    }

    return data.id as string;
  }

  /**
   * Mark a session as expired.
   */
  async markSessionExpired(sessionId: string): Promise<void> {
    const { error } = await serviceClient
      .from("donated_sessions")
      .update({ status: "expired" })
      .eq("id", sessionId);

    if (error) {
      throw new Error(`markSessionExpired failed: ${error.message}`);
    }
  }

  /**
   * Check session health and log if sessions are low.
   */
  async healthCheck(): Promise<{ activeCount: number }> {
    const { count, error } = await serviceClient
      .from("donated_sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    if (error) {
      throw new Error(`healthCheck failed: ${error.message}`);
    }

    const activeCount = count ?? 0;
    if (activeCount < 2) {
      logger.warn("Low active session count", { activeCount });
    }

    return { activeCount };
  }
}
