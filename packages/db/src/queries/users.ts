import { serviceClient } from "../client.js";
import type { User } from "@ycs/types";

/**
 * Fetch a user by netId.
 */
export const getUserByNetId = async (netId: string): Promise<User | null> => {
  const { data, error } = await serviceClient
    .from("users")
    .select("*")
    .eq("net_id", netId)
    .maybeSingle();

  if (error) {
    throw new Error(`getUserByNetId failed: ${error.message}`);
  }

  return data
    ? {
        id: data.id,
        netId: data.net_id,
        email: data.email,
        name: data.name,
        college: data.college,
        year: data.year
      }
    : null;
};

/**
 * Insert or update a user record.
 */
export const upsertUser = async (user: User): Promise<User> => {
  const { data, error } = await serviceClient
    .from("users")
    .upsert(
      {
        id: user.id,
        net_id: user.netId,
        email: user.email,
        name: user.name,
        college: user.college,
        year: user.year
      },
      { onConflict: "net_id" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`upsertUser failed: ${error.message}`);
  }

  return {
    id: data.id,
    netId: data.net_id,
    email: data.email,
    name: data.name,
    college: data.college,
    year: data.year
  };
};

/**
 * Fetch a user by id.
 */
export const getUserById = async (userId: string): Promise<User | null> => {
  const { data, error } = await serviceClient
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`getUserById failed: ${error.message}`);
  }

  return data
    ? {
        id: data.id,
        netId: data.net_id,
        email: data.email,
        name: data.name,
        college: data.college,
        year: data.year
      }
    : null;
};
