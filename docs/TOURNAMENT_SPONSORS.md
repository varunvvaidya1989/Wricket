# Tournament sponsors

Organizers can manage one or multiple sponsors from **Tournament → Manage sponsors**. The same editor serves cricket, badminton, tennis, padel, pickleball and table tennis, including cloud leagues. Cricket tournaments must finish cloud sync first.

## Organizer workflow

1. Open a tournament and select **Manage sponsors**, then **Add sponsor**.
2. Enter a name and sponsor label, such as Title sponsor, Gold partner or Equipment partner. Optionally add a description, website and logo.
3. Set display order; lower numbers appear first. Equal priorities retain creation order.
4. Choose tournament pages, match feeds and/or share cards. Turn **Show sponsor** off to keep a hidden draft.
5. Save. Edit existing sponsors or remove them using the confirmation step.

All entered details are intended for publication. This feature does not collect private contacts, contracts, payment details or sponsorship amounts.

Logos accept PNG, JPEG and WebP up to 5 MB. Websites use HTTPS; bare domains are normalized. Sponsor names remain visible when a logo cannot load. A failed save preserves the form for retry. Concurrent edits/removals are rejected using a database version, rather than overwriting another organizer's work; refresh and reopen the current record before retrying a stale edit.

## Display locations

| Surface | Behavior |
| --- | --- |
| Cricket tournament | Sponsor section in the tournament header, above fixtures/table/team/stat tabs |
| Cricket tournament live hub | Sponsor section above the list of live matches |
| All five racquet competition screens | Shared sponsor section, available across tournament tabs |
| Cricket match spectator screen | Sponsors in the scrolling feed, outside the scoring controls |
| All five racquet match feeds | Sponsors below the scoreboard |
| Existing cricket tournament image export | Visible sponsors with the share placement; waits for sponsor data and logo loading before capture |

Share placement is saved for all sports; image export currently exists only for cricket. It does not create a new image-export flow for racquet sports. Previously exported images cannot be changed or withdrawn by editing a sponsor.

Focused pages refresh sponsors every 60 seconds and on app resume/refocus. Signed logo links expire after five minutes. A previously issued link can remain usable until it expires, even after visibility/access changes.

## Persistence and authorization

- `public.tournament_sponsors` has exactly one foreign key parent: `cricket_tournament_id` or `sport_competition_id`. Parent deletion cascades sponsor records.
- Cricket tournament owners can write; racquet competition owners and active, unexpired delegated organizers can write. Scorers, captains, entrants and spectators do not gain sponsor management rights from those roles.
- Reads follow existing tournament access. Cricket tournament data is readable by signed-in users under the existing application policy; private racquet competitions retain their existing participant/organizer restrictions. Hidden sponsors are readable only by managers. Anonymous access is not added.
- Clients cannot change sponsor IDs, parents, timestamps or versions. A trigger increments the version on each update. Updates and deletes include the expected version and parent ID.
- `sponsor-logos` is a private Storage bucket. Uploads are scoped to a tournament path and require management permission. Reads require a readable sponsor reference or management permission. Referenced images cannot be deleted through the client, protecting another record that shares the same logo.
- Replacing/removing an individual sponsor attempts to remove its old, unused logo after the database write succeeds. Interrupted uploads, uncertain network writes, failed cleanup and whole-tournament deletion may leave unreferenced private files. Periodically remove unreferenced objects through the Storage API using an authorized server maintenance job, with a grace period for in-flight saves. Never delete rows directly from `storage.objects`; no scheduled maintenance job is installed by this change.

Implementation: `lib/sponsors/types.ts`, `lib/supabase/tournamentSponsorsApi.ts`, `hooks/useTournamentSponsors.ts`, and `components/sponsors/`.

## Deployment

The migration is **prepared, not applied to the live project**:

`supabase/migrations/20260922142523_add_tournament_sponsors.sql`

It creates the sponsor table, indexes, restricted grants, RLS policies, version trigger and private logo bucket. No new application environment variables are required.

For the intended linked environment, review pending migrations first:

```sh
npx supabase db push --linked --dry-run
```

After reviewing the target and migration list, apply through the normal release process:

```sh
npx supabase db push --linked
npx supabase db advisors --linked --type security
```

Deploy the application after the schema. Before releasing Android, exercise the native image picker, large-image rejection, background/resume refresh, scrolling with the keyboard, sponsor links and native cricket poster sharing on a device.

## Verification

Run `npm run build:check` for lint, TypeScript, all tests, environment/architecture checks and web export.

The sponsor suite contains 37 tests covering normalization, placement filtering, safe URLs, API error handling, conditional writes, image validation and database authorization. `sponsorPolicies.test.ts` executes the actual new migration and existing competition authorization functions in PGlite PostgreSQL, with minimal parent/auth/storage fixtures. It tests owner/delegated/expired/outsider/anonymous access, private/hidden sponsors, logo read/write/delete rules, stale writes, immutable parents and cascade deletion.

Browser smoke checks passed in Edge at mobile (390 px) and desktop (1440 px) widths using mocked API responses: create multiple sponsors, required-field validation, image picker/upload, save failure with retained draft and retry, editing, hidden sponsors, spectator access, match placement filtering, cancel removal and confirmed removal. No real account data or live database was changed. Screenshots: [mobile editor](sponsors/editor-mobile.png), [desktop tournament](sponsors/tournament-desktop.png), [match feed](sponsors/match-feed.png).

These executable policy tests do not replace a full Supabase staging migration or Storage-service integration test. The local Docker engine was unavailable during implementation; the production migration and native-device verification remain release steps.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [PGlite test database](https://pglite.dev/docs/).
