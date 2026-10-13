# Racquet player analytics

Each sport's existing Stats route opens the performance lab. Its domain module
is in `lib/sports/analytics/`: Tennis focuses on serve/return and baseline
finishes; Badminton on attacks and net finishes; Padel on overhead and wall
finishes; Table Tennis on service and opening finishes; Pickleball on side-outs,
kitchen and transition finishes. Modules own vocabulary, rally thresholds and
signature metrics while sharing deterministic event analysis.

## Recording

Turn on **Point details** in a live scoring screen. Tap the winning side, select
an outcome, optionally add rally length, final stroke, hitter position, serve
attempt (Tennis/Padel), and the player responsible, then press **Record point**.
Cancel saves nothing. One confirmation appends one POINT through the existing
lease/sequence-protected command. Quick scoring remains available.

The optional `payload.analytics` schema is:

```ts
{
  version: 1,
  rallyLength?: number, // integer 0–999; all contacts including serve
  stroke?: string, // sport module vocabulary
  zone?: string, // final hitter's position, not ball landing position
  serveAttempt?: 1 | 2,
  actorProfileId?: string // a linked player on the outcome's responsible side
}
```

Error responsibility belongs to the losing side. Winners belong to the winning
side. Singles attribution is derived from the sole linked player; doubles
finishes require explicit attribution. Invalid and future-version observations
are ignored. No database migration is required. Existing event access policies
and authorized append commands still apply.

## Reading the diagrams

- Trend bars: percentage of rallies won per match; tap for exact counts/result.
- Match story: select a recent match and play, pause, step, or tap a rally.
  The totals represent rallies, including side-outs, rather than official score.
- Serve/return flow: outcomes while the player's side served or received.
- Pressure: a game-winning opportunity for either side before the rally,
  calculated using actual rule options, caps and sudden death. Break conversion
  excludes tie-break games.
- Rally rhythm: short/long win rates use only recorded lengths. Thresholds
  are stated on screen and configured independently for each sport.
- Court zones: share of mapped, individually attributed winning finishes.
- Toolkit: share of winning finishes with a known stroke. It does not measure
  success per attempted stroke. Signature figures are observed counts.
- Coverage: observations recorded divided by active rallies in the filter.
  Missing data is unknown; absent samples show a dash, not a false rate of zero.

Motion follows the device's reduced-motion preference. Playback is initiated
by the player; reduced-motion mode provides manual stepping. Charts include
text values and accessibility labels, so color and animation are supplementary.
The replay ribbon virtualizes its items for long matches.

Filters operate on the latest 100 accessible participating/scored matches;
periods use the last match update. Linked identity, not display name, groups
players, opponents and partners. Verified wins require both completed status
and a completed scoring replay. Walkovers/retirements without a complete point
log do not contribute a fabricated tactical win. Invalid logs are excluded
with a visible count. Undone points disappear on recomputation.

## Manual verification

1. Open each sport's Stats screen on web and a native device. Check narrow
   layouts, empty history, loading/error/retry, and player/filter changes.
2. Record quick and detailed points; confirm one point per press. Test cancel,
   invalid rally length, unknown observations, winner and error attribution.
3. In doubles, record a finish without attribution and then one with a player;
   confirm pair rates include both and player shot figures include only the latter.
4. Undo a detailed point and check charts, counts and replay update.
5. Tap court zones and trend bars; play, pause, step and switch replay matches.
   Toggle reduced motion, navigate away while playing and check screen-reader labels.
6. Check no-ad/golden points, tie breaks, badminton caps and pickleball side-outs.

Device/browser interaction verification has not been performed in this change.

Automated validation passed on 2026-10-13: `npm run build:check`, including
159 test files / 916 tests and a production web export of 119 routes. Ten new
domain/API tests cover analytics correctness and event observation handling.
