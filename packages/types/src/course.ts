export interface Course {
  crn: string;
  season: string;
  code: string;
  title: string;
  description?: string | null;
  instructors: string[];
  times: string[];
  rating?: number | null;
  workload?: number | null;
}

export interface Worksheet {
  id: string;
  userId: string;
  season: string;
  name: string;
  courses: string[];
}
