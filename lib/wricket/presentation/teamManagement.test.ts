import { describe, expect, it } from 'vitest';
import { playerInitials, rosterDescription, rosterPermissions, teamDirectorySections } from './teamManagement';
import type { TeamRosterMember } from '@/lib/supabase/teamManagementApi';
import type { Team } from '@/lib/wricket/domain/types';
const captain: TeamRosterMember = { accountId: 'captain', playerId: 'c', name: 'A Captain', role: 'CAPTAIN', status: 'ACTIVE', joinedAt: '', playerRole: 'AR' };
const player: TeamRosterMember = { accountId: 'player', playerId: 'p', name: 'A Player', role: 'PLAYER', status: 'ACTIVE', joinedAt: '', playerRole: 'BAT' };
const team = (id: string, cloudId: string): Team => ({ id, cloudId, name: id, shortName: id, colorHex: '#fff', tournamentId: 't', createdAt: 0, syncStatus: 'SYNCED' });
describe('team management permissions', () => {
  it('lets both entity and tournament owners assign an absent captain', () => {
    for (const id of ['owner', 'organizer']) expect(rosterPermissions(id, ['owner', 'organizer'], []).roleToAdd).toBe('CAPTAIN');
  });
  it('preserves captain-only player addition while allowing owner removal of both roles', () => {
    const permissions = rosterPermissions('owner', ['owner'], [captain, player]);
    expect(permissions.roleToAdd).toBeUndefined();
    expect(permissions.canRemove(captain)).toBe(true);
    expect(permissions.canRemove(player)).toBe(true);
  });
  it('lets a captain add/remove players, but cannot remove a captain', () => {
    const permissions = rosterPermissions('captain', ['owner'], [captain, player]);
    expect(permissions.roleToAdd).toBe('PLAYER');
    expect(permissions.canRemove(player)).toBe(true);
    expect(permissions.canRemove(captain)).toBe(false);
  });
  it.each(['player', 'viewer', undefined])('does not grant management to %s', account => {
    const permissions = rosterPermissions(account, ['owner', undefined], [captain, player]);
    expect(permissions.canManage).toBe(false);
    expect(permissions.canRemove(player)).toBe(false);
  });
  it('removes management when captain membership is removed', () => {
    expect(rosterPermissions('captain', ['owner'], [{ ...captain, status: 'REMOVED' }]).canManage).toBe(false);
  });
});
describe('team directory and roster presentation', () => {
  it('groups by cloud identity, retaining unassigned teams and avoiding duplicate rows', () => {
    const sections = teamDirectorySections([team('local-a', 'a'), team('local-b', 'b'), team('local-c', 'c')], [
      { id: 'ga', name: 'Group A', team_ids: ['a'] }, { id: 'gb', name: 'Group B', team_ids: ['a', 'b'] },
    ]);
    expect(sections.map(section => [section.title, section.teams.map(row => row.id)])).toEqual([['Group A', ['local-a']], ['Group B', ['local-b']], ['Not grouped yet', ['local-c']]]);
  });
  it('does not invent group assignments or a roster for an empty tournament', () => {
    expect(teamDirectorySections([], [])).toEqual([]);
    expect(teamDirectorySections([team('one', 'a')], [])[0].title).toBe('Entered teams');
  });
  it('uses initials and actual captain/player/keeper roles', () => {
    expect(playerInitials('  Arjun   Ramanathan  ')).toBe('AR');
    expect(rosterDescription(captain)).toBe('Captain · All-rounder');
    expect(rosterDescription({ ...player, isKeeper: true })).toBe('Batter · Wicketkeeper');
    expect(rosterDescription({ ...player, playerRole: undefined })).toBe('Role not set');
  });
});
