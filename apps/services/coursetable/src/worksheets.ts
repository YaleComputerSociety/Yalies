import {
  createWorksheet,
  deleteWorksheet,
  getWorksheetsByUser,
  updateWorksheet
} from "@ycs/db";
import type { Worksheet } from "@ycs/types";

/**
 * Get all worksheets for a user.
 */
export const listWorksheets = async (userId: string) => getWorksheetsByUser(userId);

/**
 * Create a worksheet for a user.
 */
export const createWorksheetService = async (
  userId: string,
  season: string,
  name: string,
  courses: string[]
) => createWorksheet(userId, season, name, courses);

/**
 * Update a worksheet.
 */
export const updateWorksheetService = async (
  id: string,
  updates: Partial<Pick<Worksheet, "name" | "courses">>
) => updateWorksheet(id, updates);

/**
 * Delete a worksheet.
 */
export const deleteWorksheetService = async (id: string) => deleteWorksheet(id);
