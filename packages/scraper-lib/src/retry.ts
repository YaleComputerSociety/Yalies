const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry a function with exponential backoff.
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delayMs: number
): Promise<T> => {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      attempt += 1;
      if (attempt < maxAttempts) {
        await sleep(delayMs * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError ?? new Error("Retry failed");
};
