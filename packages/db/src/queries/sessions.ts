import { serviceClient } from "../client.js";

type SessionRecord = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  user?: {
    id: string;
    net_id: string;
    email?: string | null;
    name?: string | null;
  } | null;
};

/**
 * Create a new session.
 */
export const createSession = async (
  userId: string,
  token: string,
  expiresAt: string
): Promise<SessionRecord> => {
  const { data, error } = await serviceClient
    .from("sessions")
    .insert({
      user_id: userId,
      token,
      expires_at: expiresAt
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`createSession failed: ${error.message}`);
  }

  return data as SessionRecord;
};

/**
 * Validate a session token and return the session with user.
 */
export const validateSession = async (token: string): Promise<SessionRecord | null> => {
  const { data, error } = await serviceClient
    .from("sessions")
    .select("*, user:users(*)")
    .eq("token", token)
    .gte("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw new Error(`validateSession failed: ${error.message}`);
  }

  return data as SessionRecord | null;
};

/**
 * Delete a session token.
 */
export const deleteSession = async (token: string): Promise<void> => {
  const { error } = await serviceClient.from("sessions").delete().eq("token", token);

  if (error) {
    throw new Error(`deleteSession failed: ${error.message}`);
  }
};
