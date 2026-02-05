import { getCourseByKey, getCoursesBySeason, searchCourses } from "@ycs/db";

/**
 * Get courses by season with filters.
 */
export const getCoursesBySeasonService = async (
  season: string,
  limit = 100,
  offset = 0
) => getCoursesBySeason(season, limit, offset);

/**
 * Search for courses by text.
 */
export const searchCoursesService = async (query: string, limit = 50, offset = 0) =>
  searchCourses(query, limit, offset);

/**
 * Get a course with additional details.
 */
export const getCourseWithDetails = async (season: string, crn: string) =>
  getCourseByKey(season, crn);
