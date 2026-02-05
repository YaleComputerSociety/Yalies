export interface ScraperJob {
  id: string;
  jobType: string;
  status: "pending" | "running" | "completed" | "failed";
  payload: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: string | null;
  timestamps: {
    createdAt?: string;
    startedAt?: string;
    completedAt?: string;
  };
}
