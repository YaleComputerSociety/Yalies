import { serviceClient } from "@ycs/db";

type GameFilters = {
  season?: string;
  sportId?: string;
  status?: string;
};

/**
 * Get games by filters.
 */
export const getGames = async (filters: GameFilters) => {
  let query = serviceClient.from("im_games").select("*");

  if (filters.season) {
    query = query.eq("season", filters.season);
  }
  if (filters.sportId) {
    query = query.eq("sport_id", filters.sportId);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query.order("scheduled_at", { ascending: true });
  if (error) {
    throw new Error(`getGames failed: ${error.message}`);
  }

  return data ?? [];
};
