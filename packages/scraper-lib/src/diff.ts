type DiffResult = {
  added: number;
  updated: number;
  removed: number;
};

/**
 * Compare arrays of records by key field.
 */
export const diffData = <T extends Record<string, unknown>>(
  existing: T[],
  scraped: T[],
  keyField: keyof T
): DiffResult => {
  const existingMap = new Map(existing.map((item) => [item[keyField], item]));
  const scrapedMap = new Map(scraped.map((item) => [item[keyField], item]));

  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const [key, value] of scrapedMap.entries()) {
    if (!existingMap.has(key)) {
      added += 1;
      continue;
    }

    const existingValue = existingMap.get(key);
    if (JSON.stringify(existingValue) !== JSON.stringify(value)) {
      updated += 1;
    }
  }

  for (const key of existingMap.keys()) {
    if (!scrapedMap.has(key)) {
      removed += 1;
    }
  }

  if (existing.length > 0 && removed / existing.length > 0.2) {
    throw new Error("Diff sanity check failed: >20% of records removed");
  }

  return { added, updated, removed };
};
