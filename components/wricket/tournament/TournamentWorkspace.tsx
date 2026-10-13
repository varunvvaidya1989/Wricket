import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/wricket/ui/Text';
import { Card } from '@/components/wricket/ui/Card';
import { Button } from '@/components/wricket/ui/Button';
import { LinkRow } from '@/components/wricket/ui/DesignRows';
import { colors } from '@/lib/wricket/presentation/design';
import { tournamentWorkspace, type WorkspaceAction } from '@/lib/wricket/presentation/tournamentWorkspace';
import type { GeneratedFixtureSetup } from '@/lib/supabase/fixturesApi';
import type { Tournament } from '@/lib/wricket/domain/types';

export function TournamentWorkspace({ tournament, teamCount, setup, onAction }: { tournament: Tournament; teamCount: number; setup: GeneratedFixtureSetup; onAction: (action: WorkspaceAction) => void }) {
  const groupIds = setup.stages.filter(stage => stage.type === 'GROUP').map(stage => String(stage.id));
  const model = tournamentWorkspace(teamCount, tournament.plannedTeamCount, setup.matches, groupIds, Boolean(setup.bracket));
  return <View style={{ gap: 18 }}>
    <Text variant="overline" tone="muted">ORGANISER WORKSPACE</Text>
    <Text variant="h1">{tournament.name}</Text>
    <Card style={{ backgroundColor: '#292719', borderColor: '#50482b' }}>
      <Text variant="overline" style={{ color: colors.gold }}>NEXT TASK</Text>
      <Text variant="h3" style={{ marginTop: 13 }}>{model.next.title}</Text>
      <Text tone="muted" style={{ marginTop: 8 }}>{model.next.detail}</Text>
      <Button title="Open next task" variant="ghost" onPress={() => onAction(model.next.action)} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
    </Card>
    <View>
      <LinkRow title="Registrations" detail="Publication, applications and payment flags" icon="users" onPress={() => onAction('registrations')} />
      <LinkRow title="Teams & rosters" detail={model.teamDetail} icon="users" onPress={() => onAction('teams')} />
      <LinkRow title="Fixture plan" detail={model.fixtureDetail} icon="calendar" onPress={() => onAction('fixtures')} />
      <LinkRow title="Winning bracket" detail={model.bracketDetail} icon="branch" onPress={() => onAction('bracket')} />
      <LinkRow title="Scorer access" detail="Choose who can score tournament matches" icon="bat" onPress={() => onAction('scorers')} />
      <LinkRow title="Tournament details" detail="Venue, private contact and presentation" icon="settings" onPress={() => onAction('details')} />
      <LinkRow title="Sponsors" detail="Your tournament partners" icon="star" onPress={() => onAction('sponsors')} />
    </View>
    <Button title="View tournament" variant="secondary" onPress={() => onAction('view')} />
  </View>;
}
