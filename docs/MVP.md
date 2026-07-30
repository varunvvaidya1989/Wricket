# Wricket MVP and match awards

Wricket MVP is original, versioned derived data built from the authoritative
scorecard. It never replaces runs, wickets, balls, dismissals, or match results.

## Formula and precision

Version `wricket-mvp-v1` retains six decimal places and displays two.

- Batting: bat runs / 10, plus a faster-than-team rate bonus after 3 balls.
- Bowling: position-strength wicket values, the highest per-innings haul
  milestone, a capped normalized efficiency bonus, and maiden equivalents.
- Fielding: catches/stumpings receive 20%; direct run-outs receive 100%;
  assisted run-outs split 100% equally. Caught-and-bowled earns both roles.

All constants and match-length tables are centralized in
`lib/wricket/domain/mvp/config.ts`. Small teams use proportional top/middle
groups of approximately 36%, with the remainder lower order.

## Ranking and awards

Ordering uses unrounded total, winning team, wickets, fielding points, runs,
batting rate, bowling economy, and stable player ID. Exact point ties share a
displayed rank while deterministic `order` selects awards.

Player of the Match chooses the highest winning-team player in the overall top
three, or the overall leader when no winner is in that group. Completed ties
may award the leader; no-results and abandoned matches do not. Fighter of the
Match is the highest losing-team player in the top three and cannot duplicate
Player of the Match.

Tournament totals sum persisted eligible match rows by canonical player ID.
Teams and algorithm versions are preserved. Historical versions are not
silently reinterpreted.

## Lifecycle and backfill

Local finalization saves the scorecard first, then transactionally replaces MVP
rows. Failures are recorded and retryable. Cloud result changes enqueue a
versioned calculation request; only active tournament owners/admins can force
one.

```text
npm run recalculate-mvp -- --match <id>
npm run recalculate-mvp -- --tournament <id> --batch-size 50
npm run recalculate-mvp -- --all --batch-size 50
```

Cloud backfill requires `EXPO_PUBLIC_SUPABASE_URL` and the server-only
`SUPABASE_SERVICE_ROLE_KEY`. Never expose that key in the app.

## Dismissals and limitations

Bowled, caught, LBW, stumped, and hit wicket credit the bowler. Retirements and
run-outs do not. The current event model stores at most two run-out fielders;
the engine accepts any number. A lone fielder is currently treated as a direct
hit. Super-over inputs are excluded. Summary-only data receives only reliably
derivable values; delivery-dependent adjustments are marked unavailable.

Wricket MVP points measure a player’s contribution through batting, bowling and
fielding. Player of the Match gives preference to a highly ranked player from
the winning team, while an exceptional top-ranked performance from the losing
team can still win the award.

Formula changes must create a new version and fixture tests; never mutate the
meaning of an existing version.
