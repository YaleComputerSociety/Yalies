import { serviceClient } from "../client.js";
import type { Course } from "@ycs/types";

type CourseQueryResult = {
  data: Course[];
  count: number;
  limit: number;
  offset: number;
};

/**
 * Fetch courses by season with pagination.
 */
export const getCoursesBySeason = async (
  season: string,
  limit = 100,
  offset = 0
): Promise<CourseQueryResult> => {
  const { data, error, count } = await serviceClient
    .from("courses")
    .select("*", { count: "exact" })
    .eq("season", season)
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`getCoursesBySeason failed: ${error.message}`);
  }

  return {
    data: (data ?? []).map((course) => ({
      crn: course.crn,
      season: course.season,
      code: course.code,
      title: course.title,
      description: course.description,
      instructors: course.instructors ?? [],
      times: course.times ?? [],
      rating: course.rating,
      workload: course.workload
    })),
    count: count ?? 0,
    limit,
    offset
  };
};

/**
 * Fetch a single course by season + crn.
 */
export const getCourseByKey = async (season: string, crn: string): Promise<Course | null> => {
  const { data, error } = await serviceClient
    .from("courses")
    .select("*")
    .eq("season", season)
    .eq("crn", crn)
    .maybeSingle();

  if (error) {
    throw new Error(`getCourseByKey failed: ${error.message}`);
  }

  return data
    ? {
        crn: data.crn,
        season: data.season,
        code: data.code,
        title: data.title,
        description: data.description,
        instructors: data.instructors ?? [],
        times: data.times ?? [],
        rating: data.rating,
        workload: data.workload
      }
    : null;
};

/**
 * Upsert a list of courses.
 */
export const upsertCourses = async (courses: Course[]): Promise<void> => {
  if (courses.length === 0) {
    return;
  }

  const { error } = await serviceClient.from("courses").upsert(
    courses.map((course) => ({
      crn: course.crn,
      season: course.season,
      code: course.code,
      title: course.title,
      description: course.description ?? null,
      instructors: course.instructors,
      times: course.times,
      rating: course.rating ?? null,
      workload: course.workload ?? null
    })),
    { onConflict: "crn,season" }
  );

  if (error) {
    throw new Error(`upsertCourses failed: ${error.message}`);
  }
};

/**
 * Search courses by text query.
 */
export const searchCourses = async (
  query: string,
  limit = 50,
  offset = 0
): Promise<CourseQueryResult> => {
  const { data, error, count } = await serviceClient
    .from("courses")
    .select("*", { count: "exact" })
    .or(`title.ilike.%${query}%,code.ilike.%${query}%,description.ilike.%${query}%`)
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`searchCourses failed: ${error.message}`);
  }

  return {
    data: (data ?? []).map((course) => ({
      crn: course.crn,
      season: course.season,
      code: course.code,
      title: course.title,
      description: course.description,
      instructors: course.instructors ?? [],
      times: course.times ?? [],
      rating: course.rating,
      workload: course.workload
    })),
    count: count ?? 0,
    limit,
    offset
  };
};
