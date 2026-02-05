import { serviceClient } from "@ycs/db";

/**
 * Search people by text query.
 */
export const searchPeople = async (query: string, limit = 50, offset = 0) => {
  const { data, error, count } = await serviceClient
    .from("people")
    .select("*", { count: "exact" })
    .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`searchPeople failed: ${error.message}`);
  }

  return { data: data ?? [], count: count ?? 0, limit, offset };
};

/**
 * Get a person by netId.
 */
export const getPersonByNetId = async (netId: string) => {
  const { data, error } = await serviceClient
    .from("people")
    .select("*")
    .eq("net_id", netId)
    .maybeSingle();

  if (error) {
    throw new Error(`getPersonByNetId failed: ${error.message}`);
  }

  return data ?? null;
};

/**
 * Bulk lookup by netIds.
 */
export const bulkLookupPeople = async (netIds: string[]) => {
  const { data, error } = await serviceClient.from("people").select("*").in("net_id", netIds);

  if (error) {
    throw new Error(`bulkLookupPeople failed: ${error.message}`);
  }

  return data ?? [];
};
