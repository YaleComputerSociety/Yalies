import { serviceClient } from "../client.js";
import type { Worksheet } from "@ycs/types";

/**
 * Fetch worksheets for a user.
 */
export const getWorksheetsByUser = async (userId: string): Promise<Worksheet[]> => {
  const { data, error } = await serviceClient
    .from("worksheets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getWorksheetsByUser failed: ${error.message}`);
  }

  return (data ?? []).map((worksheet) => ({
    id: worksheet.id,
    userId: worksheet.user_id,
    season: worksheet.season,
    name: worksheet.name,
    courses: worksheet.courses ?? []
  }));
};

/**
 * Create a worksheet.
 */
export const createWorksheet = async (
  userId: string,
  season: string,
  name: string,
  courses: string[]
): Promise<Worksheet> => {
  const { data, error } = await serviceClient
    .from("worksheets")
    .insert({
      user_id: userId,
      season,
      name,
      courses
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`createWorksheet failed: ${error.message}`);
  }

  return {
    id: data.id,
    userId: data.user_id,
    season: data.season,
    name: data.name,
    courses: data.courses ?? []
  };
};

/**
 * Update a worksheet.
 */
export const updateWorksheet = async (
  id: string,
  updates: Partial<Pick<Worksheet, "name" | "courses">>
): Promise<Worksheet> => {
  const { data, error } = await serviceClient
    .from("worksheets")
    .update({
      name: updates.name,
      courses: updates.courses
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`updateWorksheet failed: ${error.message}`);
  }

  return {
    id: data.id,
    userId: data.user_id,
    season: data.season,
    name: data.name,
    courses: data.courses ?? []
  };
};

/**
 * Delete a worksheet.
 */
export const deleteWorksheet = async (id: string): Promise<void> => {
  const { error } = await serviceClient.from("worksheets").delete().eq("id", id);

  if (error) {
    throw new Error(`deleteWorksheet failed: ${error.message}`);
  }
};
