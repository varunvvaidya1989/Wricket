import { getSupabaseClient } from './client';

export interface CricketTasks {
  matches: { id: string; label: string; status: string }[];
  tournaments: { id: string; name: string }[];
}

// These are entry points only. The scoring session still acquires its existing
// server-authorised lease before accepting any scoring command.
export async function getCricketTasks(accountId: string): Promise<CricketTasks> {
  const client = getSupabaseClient();
  const { data: memberships, error: membershipError } = await client.from('tournament_members')
    .select('tournament_id').eq('account_id', accountId).eq('status', 'ACTIVE').in('role', ['OWNER', 'ADMIN', 'SCORER']);
  if (membershipError) throw membershipError;
  const tournamentIds = (memberships ?? []).map(item => item.tournament_id);
  const query = () => client.from('matches').select('id,team_a_id,team_b_id,status,created_at')
    .in('status', ['IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION']).order('created_at', { ascending: false }).limit(5);
  const [own, assigned, tournaments] = await Promise.all([
    query().eq('created_by', accountId),
    tournamentIds.length ? query().in('tournament_id', tournamentIds) : Promise.resolve({ data: [], error: null }),
    client.from('tournaments').select('id,name,settings').eq('created_by', accountId).order('created_at', { ascending: false }),
  ]);
  if (own.error) throw own.error;
  if (assigned.error) throw assigned.error;
  if (tournaments.error) throw tournaments.error;
  const matches = [...new Map([...(own.data ?? []), ...(assigned.data ?? [])].map(match => [match.id, match])).values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const teamIds = [...new Set(matches.flatMap(match => [match.team_a_id, match.team_b_id]))];
  const teams = teamIds.length ? await client.from('teams').select('id,name').in('id', teamIds) : { data: [], error: null };
  if (teams.error) throw teams.error;
  const names = new Map((teams.data ?? []).map(team => [team.id, team.name]));
  return {
    matches: matches.map(match => ({ id: match.id, status: match.status,
      label: `${names.get(match.team_a_id) ?? 'Team A'} vs ${names.get(match.team_b_id) ?? 'Team B'}` })),
    tournaments: (tournaments.data ?? []).filter(item => item.settings?.status !== 'COMPLETED').slice(0, 5)
      .map(item => ({ id: item.id, name: item.name })),
  };
}
