import { serviceClient } from "@ycs/db";

/**
 * Get standings for a season and sport.
 */
export const getStandings = async (season: string, sportId: string) => {
  const { data, error } = await serviceClient
    .from("im_teams")
    .select("*")
    .eq("season", season)
    .eq("sport_id", sportId)
    .order("points", { ascending: false });

  if (error) {
    throw new Error(`getStandings failed: ${error.message}`);
  }

  return data ?? [];
};

/**
 * Get a team's schedule by team id.
 */
export const getTeamSchedule = async (teamId: string) => {
  const { data, error } = await serviceClient
    .from("im_games")
    .select("*")
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order("scheduled_at", { ascending: true });

  if (error) {
    throw new Error(`getTeamSchedule failed: ${error.message}`);
  }

  return data ?? [];
};
