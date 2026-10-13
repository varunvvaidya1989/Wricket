import type { TeamRosterMember } from '@/lib/supabase/teamManagementApi';
import type { Team } from '@/lib/wricket/domain/types';

export function rosterPermissions(accountId: string | undefined, ownerIds: readonly (string | undefined)[], members: readonly TeamRosterMember[]) {
  const owner = Boolean(accountId && ownerIds.includes(accountId));
  const captain = members.find(member => member.status === 'ACTIVE' && member.role === 'CAPTAIN');
  const isCaptain = Boolean(accountId && captain?.accountId === accountId);
  return { owner, isCaptain, canManage: owner || isCaptain,
    roleToAdd: owner && !captain ? 'CAPTAIN' as const : isCaptain ? 'PLAYER' as const : undefined,
    canRemove: (member: TeamRosterMember) => member.status === 'ACTIVE' && (member.role === 'CAPTAIN' ? owner : owner || isCaptain),
  };
}

export function teamDirectorySections(teams: readonly Team[], groups: readonly { id: string; name: string; team_ids: string[] }[]) {
  const assigned = new Set<string>();
  const sections = groups.map(group => ({ id: group.id, title: group.name, teams: teams.filter(team => {
    const included = group.team_ids.includes(team.cloudId ?? team.id) && !assigned.has(team.id);
    if (included) assigned.add(team.id);
    return included;
  }) })).filter(section => section.teams.length);
  const others = teams.filter(team => !assigned.has(team.id));
  if (others.length) sections.push({ id: 'unassigned', title: groups.length ? 'Not grouped yet' : 'Entered teams', teams: others });
  return sections;
}

export function playerInitials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

export function rosterDescription(member: TeamRosterMember): string {
  const role = { BAT: 'Batter', BOWL: 'Bowler', AR: 'All-rounder', WK: 'Wicketkeeper' }[member.playerRole ?? 'AR'];
  return [member.role === 'CAPTAIN' ? 'Captain' : undefined, member.playerRole ? role : 'Role not set', member.isKeeper && member.playerRole !== 'WK' ? 'Wicketkeeper' : undefined].filter(Boolean).join(' · ');
}
