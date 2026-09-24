# SportStage YouTube Live Broadcasting Blueprint

Status: implementation-ready architecture plan; no product code has been implemented  
Prepared: 2026-08-25  
Scope: Expo/React Native mobile app, Supabase control plane, direct device-to-YouTube RTMPS media plane

## 1. Executive Summary

SportStage can add reliable YouTube-powered broadcasting without sending video through SportStage infrastructure, but this is not a JavaScript-only feature. The mobile hot path must be native:

```text
camera + microphone
        |
        v
native GPU compositor <--- typed SportStage score state
        |
        v
hardware H.264 + AAC encoder
        |
        v
FLV/RTMPS directly to YouTube
```

The recommended V1 is:

- Supabase Edge Functions form the control plane for Google OAuth, encrypted token use, YouTube resource creation, lifecycle transitions, authorization, reconciliation, and safe metadata.
- A repository-owned local Expo native module, `sportstage-broadcast`, forms the media plane. Android uses RootEncoder; iOS uses HaishinKit/RTMPHaishinKit. A narrowly scoped technical spike must prove the exact pinned versions and burned-in dynamic overlay before product implementation.
- The broadcaster receives a YouTube RTMPS URL/stream name only after server authorization, keeps it only in native process memory, and transmits video directly to YouTube. It is never stored in AsyncStorage, SQLite, ordinary Postgres columns, analytics, or logs.
- Existing cricket and racket-sport scoring pipelines remain authoritative. The broadcast feature uses adapters and the existing Supabase Realtime invalidation-and-snapshot pattern; it does not create a third scoring engine.
- A provider-neutral session domain supports YouTube in V1 without building speculative multi-provider infrastructure.
- The broadcaster can be separate from the scorer. Same-device scoring is supported through a compact scoring sheet inside the foreground production screen; routing away from an active camera screen is not the primary workflow.
- YouTube `enableAutoStart` and `enableAutoStop` are disabled. SportStage explicitly owns preparation, start, end, and recovery; DVR, recording from start, and embedding are enabled by default. `UNLISTED` is the recommended privacy default.
- Start with 720p30, H.264, AAC-LC, two-second keyframes, and RTMPS. `AUTO` is adaptive bitrate within a fixed 720p encoding profile in V1; it does not change resolution mid-stream.

The critical gate is Phase 0. Do not commit to a production SDK until the spike demonstrates a one-hour stream on representative Android and iOS devices, changing overlays burned into the YouTube replay, RTMPS reconnect, hardware encoding, and acceptable thermals. The React Native wrapper with the best current stack fit is promising but lightly adopted and has no documented overlay API; the production recommendation therefore owns the small native abstraction and pins audited native dependencies.

## 2. Existing SportStage Architecture Findings

### 2.1 Repository topology

The repository contains one Expo application in `mobile/`. There is no separate application server, `ios/`, `android/`, or existing `supabase/functions/` directory. Native projects are generated through Expo's Continuous Native Generation workflow. This plan therefore preserves Expo Router and EAS while adding a local Expo module and config plugin; it does not require abandoning Expo.

| Concern | Current implementation | Broadcasting implication |
|---|---|---|
| Mobile | Expo 54, React Native 0.81.5, React 19.1, strict TypeScript | Custom native code requires development builds/EAS; it cannot run in Expo Go. |
| Architecture | New Architecture enabled | A Fabric/Expo native view is appropriate; dependency compatibility must be proven. |
| Navigation | Expo Router file-based routes | Add shared broadcast routes under `app/broadcast/`; link from both cricket and racket match screens. |
| Backend | Supabase Auth, Postgres Data API/RPC, Realtime, Storage | Add Edge Functions for privileged Google calls; keep Postgres/RLS as durable control-plane state. |
| Auth | Supabase session in AsyncStorage via `AuthProvider` | Use the user's Supabase JWT at Edge Functions; never put Google refresh tokens in this client store. |
| State | Component hooks/context and typed service modules; no Redux/Zustand | Add a route-scoped broadcast controller/reducer, not a new app-wide state framework. |
| Cricket | Pure domain reducer, SQLite local-first storage/outboxes, cloud event pipeline and `match_snapshots` | Reuse `liveMatchApi` snapshot/realtime behavior and cloud sequence. Do not read the scoring UI tree. |
| Racket sports | Generic config/engine for tennis, badminton, padel, pickleball, table tennis; Supabase event log | Reuse `sportScoringApi`, ordered events, replay, and `buildScoreboardView`. |
| Realtime | Supabase Postgres Changes; subscriptions invalidate and reload authoritative state | Add a thin broadcast score-source adapter with snapshot recovery and sequence rejection. |
| Persistence | Expo SQLite for cricket; AsyncStorage for session/device conveniences; Supabase DB/Storage | Broadcast credentials must bypass all local persistence. Session metadata belongs in Supabase. |
| Secrets | Public Supabase client configuration only; no server secret subsystem in repo | Add Edge Function secrets for Google client credentials and a private encrypted token store. |
| Logging/analytics | Sparse `console` calls; no centralized telemetry or crash reporting found | Define a redacting telemetry facade before beta. Telemetry vendor is an OPEN QUESTION. |
| Push | In-app `sport_notifications` data exists; no device-token/push delivery integration found | Push-based operator alerts are V1.1; in-app/live state is V1. |
| CI/deploy | Node 20 CI runs `npm run build:check`; EAS profiles and Supabase migrations | Add native build jobs, Android/iOS smoke builds, Edge Function tests/deploy, and migration tests. |

### 2.2 Existing reusable contracts

Cricket:

- `lib/wricket/domain/types.ts` and `lib/wricket/domain/scoring/*` remain the rules authority.
- `lib/supabase/liveMatchApi.ts` exposes participants, innings, score, commentary, scorecard, the latest sequence, and a Realtime subscription that reloads when `match_snapshots` or `matches` changes.
- `match_events` has server sequence and client-event idempotency; `match_snapshots` holds the latest derived scoreboard/scorecard.
- `cricket_live_snapshots` is a public discovery projection, but its headline is insufficient for the production overlay. It remains useful to spectators.

Racket sports:

- `lib/sports/scoring/types.ts`, `engine.ts`, `configs.ts`, `presentation.ts`, and `viewModel.ts` already normalize five sports through one generic scoring engine.
- `lib/supabase/sportScoringApi.ts` loads the match, ordered `sport_scoring_events`, public metadata, and players, then replays the domain engine. Its subscription watches match, event, and public snapshot changes.
- `sport_public_live_snapshots` is a discovery projection; its headline string is not the source for a frame-by-frame score overlay.

Permissions:

- Cricket permissions are tournament/match contextual: owner, admin, scorer, and standalone access paths.
- Racket permissions are contextual through competition owner/organizer and fixture scorekeeper/referee roles.
- There is no global user mode, which is correct. Broadcast capabilities should be computed from the same relationships plus explicit match-scoped broadcaster assignments.

### 2.3 Constraints and gaps

1. `app.json` locks the application to portrait and explicitly blocks Android `RECORD_AUDIO`. Broadcasting needs explicit camera/microphone usage copy, removal of that block, orientation strategy, foreground-service configuration, and store disclosures.
2. No camera, RTMP publisher, native WebView/YouTube player, or custom native module is installed.
3. No generated native project is committed. Native work must be delivered through a local Expo module/config plugin and verified using development builds.
4. No Edge Functions exist. Server-side OAuth and YouTube calls are entirely new infrastructure.
5. Cricket and racket matches are separate canonical tables. A broadcast session must reference exactly one without pretending there is already a universal match table.
6. The public snapshot projections are designed for discovery, not all overlay fields. Broadcast adapters must use the authoritative detailed read paths.
7. iOS cannot promise continued camera capture after ordinary backgrounding. Android can use a camera/microphone foreground service when started while visible, but Play policy and user notification requirements apply.

## 3. Recommended Architecture

Separate the system into three boundaries.

### Media plane: broadcaster device to YouTube

- Native camera and microphone capture.
- Native GPU composition of the camera image and score bitmap/texture.
- Hardware H.264 and AAC encoding, FLV muxing, direct RTMPS publish.
- No raw frames or encoded media pass through React Native JS, Supabase, or SportStage servers.
- React Native sends small typed overlay updates and control commands; native emits bounded telemetry/state events.

### SportStage control plane: mobile, Supabase, Google APIs

- Mobile invokes authenticated Edge Functions with the current Supabase user JWT.
- Edge Functions re-evaluate contextual match permission on every privileged action.
- Edge Functions alone exchange/refresh/revoke Google tokens and call YouTube APIs.
- Postgres holds sessions, assignments, operations, safe provider identifiers, state/version, and audit events.
- A short reconciliation task polls provider state only during transitions or suspected drift. A hosted Edge Function should not remain open for the broadcast duration; Supabase describes Edge Functions as short-lived and recommends moving long-running work to background workers ([Edge Functions](https://supabase.com/docs/guides/functions)).

### Score plane: existing scoring authority to native overlay

- Existing scoring commands and reducers remain unchanged.
- Existing cloud sequence is the ordering key.
- A route-scoped `BroadcastScoreSource` adapts cricket `CloudLiveMatch` or racket `SportCloudMatchFeed` into a provider-neutral `BroadcastOverlayStateV1`.
- Realtime is an invalidation signal, not the only copy of truth. Initial subscribe, reconnect, sequence gap, and timeout all trigger an authoritative snapshot reload.

### Provider boundary

Only the Edge Function provider adapter knows YouTube endpoint/resource details. Mobile and database domain code use `BroadcastProviderKind`, safe provider resource IDs, and normalized lifecycle/health. V1 implements one adapter and avoids a dynamic plugin system.

## 4. Architecture Diagram

```text
 Scorer device                         Broadcast device
 +----------------------+             +----------------------------------+
 | Existing score UI    |             | Expo Router broadcast route      |
 | cricket/racket rules |             | controller + score adapters      |
 +----------+-----------+             +----------+-----------------------+
            | score command                      | small typed state
            v                                    v
 +----------------------+   Realtime      +-------------------------------+
 | Supabase Postgres    |--------------->| Native sportstage-broadcast   |
 | events + snapshots   |<--snapshot-----| camera/mic/GPU overlay/encoder|
 | RLS + permissions    |                +---------------+---------------+
 +----------+-----------+                                |
            ^                                            | RTMPS
            | metadata/auth                              v
 +----------+-----------+                       +-------------------------+
 | Supabase Edge        |<--YouTube Data API-->| YouTube Live            |
 | Functions            |                       | ingest/transcode/CDN/DVR|
 | OAuth/token/provider |                       | recording/replay        |
 +----------+-----------+                       +-----------+-------------+
            | safe video/session metadata                   |
            v                                               v
 +----------------------+                       +-------------------------+
 | SportStage viewer    |--embedded player---->| YouTube player          |
 | score below player   |                       | or external fallback    |
 +----------------------+                       +-------------------------+
```

Trust boundary notes:

- The broadcaster is the only client that briefly receives the session's RTMPS credential, because direct ingest is impossible otherwise. It receives no Google OAuth token.
- Scorers and viewers never receive ingest credentials.
- Refresh/access tokens exist only inside server execution and encrypted private storage.
- YouTube receives the composed media and configured metadata; SportStage receives only provider identifiers/status, not video bytes.

## 5. Technical Feasibility

### Feasible with explicit gates

Expo supports custom native code through local Expo modules, config plugins, development builds, EAS Build, and Continuous Native Generation ([local module guidance](https://docs.expo.dev/modules/get-started/), [custom native code](https://docs.expo.dev/workflow/customizing/), [config plugins](https://docs.expo.dev/config-plugins/introduction/)). Therefore a move to a permanently hand-managed bare project is not required.

The app cannot use Expo Go for broadcast development or QA. Every relevant developer/tester needs an internal development build. CI must compile both native targets after every native dependency/config-plugin change.

### Phase 0 go/no-go criteria

Proceed only if one pinned implementation proves all of the following:

- rear and front camera preview; microphone/mute; hardware H.264/AAC;
- 480p30, 720p30, and 1080p30 capability probing with graceful fallback;
- dynamic score changes visibly burned into YouTube live output and replay;
- RTMPS TLS/SNI compatibility with YouTube;
- bitrate change without encoder restart; reconnect with a new IDR frame;
- camera switch, zoom, focus/exposure, orientation lock, audio interruptions;
- Android foreground service behavior and iOS foreground-only behavior;
- 60-minute 720p soak without unbounded memory, severe thermal shutdown, or audio/video drift;
- representative low/mid/high Android and old/current supported iPhone coverage;
- license and transitive-dependency review.

If the spike fails on iOS compositing, RTMPS stability, or thermal targets, do not work around it in JS. Either fix/fork the native implementation or reduce V1 device/quality scope.

**OPEN QUESTION:** minimum supported iOS version. Current HaishinKit 2.2.x requires iOS 15+, but SportStage's product support policy is not documented.

## 6. YouTube Integration

### 6.1 OAuth design

Use Google's server-side authorization-code flow. Mobile opens the authorization URL in the system browser; a Supabase Edge callback exchanges the code and redirects to an app deep link containing only an opaque attempt/result ID. Google recommends `state` protection, offline access for refresh tokens, and secure server storage in its [server-side OAuth guide](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps).

Recommended scope:

```text
https://www.googleapis.com/auth/youtube.force-ssl
```

This is the narrowest scope listed by the needed live broadcast/stream write endpoints; avoid the broader `youtube` scope. It is still sensitive and will require a properly configured consent screen and likely verification. Google requires appropriate production/test projects, verified domains, home/privacy pages, minimum scopes, and verification for sensitive scopes ([OAuth policy readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance), [sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)). Service accounts are not supported for ordinary YouTube Data API channel authorization ([YouTube authentication](https://developers.google.com/youtube/v3/guides/authentication)).

Flow:

1. Authenticated client requests `START_CONNECTION` with a one-use idempotency key and return URI.
2. Server creates a random, hashed, one-use OAuth attempt bound to SportStage account, device/session nonce, and a 10-minute expiry.
3. Server returns a Google URL with `access_type=offline`, `include_granted_scopes=true`, `state`, and an explicit consent strategy only when a refresh token is absent.
4. Google calls the Edge callback. Callback validates state before exchange, exchanges the code, calls `channels.list(part=snippet,status&mine=true)`, and resolves the actual channel ID/title/thumbnail.
5. Server encrypts the refresh token or stores it in a private secret store, saves scopes/status, and discards the authorization code/access token after the request or bounded cache lifetime.
6. Browser redirects to `sportstage://broadcast/youtube-result?attempt=<opaque-id>`; mobile fetches the safe result while authenticated.

Token rules:

- Never return an access token or refresh token to mobile.
- Refresh five minutes before expiry or after the first 401, once. Serialize refreshes per provider account to prevent token races. If Google returns a new refresh token, atomically replace the encrypted value.
- Mark `REAUTH_REQUIRED` on `invalid_grant`, revocation, scope loss, or channel mismatch. Preserve sessions/history but block prepare/start.
- Disconnect performs best-effort Google token revocation, deletes the encrypted token, and marks the connection revoked. Logout clears SportStage client state but does not silently revoke an account-level YouTube connection; active-broadcast logout requires end/handoff confirmation.
- Use a separate OAuth client/project for non-production. Never use production tokens in local emulators.

Multiple channels:

- Treat each successfully resolved channel as a separate `BroadcastProviderAccount`.
- Never offer an in-app channel switch based only on a cached label. Reauthorization must return and verify the target channel ID.
- YouTube channel-permission delegates cannot use YouTube APIs through delegated access, according to [YouTube channel permissions](https://support.google.com/youtube/answer/9481328). A channel's actual authorized owner/Brand Account identity must connect it.
- **OPEN QUESTION:** validate Brand Account selection and refresh-token behavior with at least two real multi-channel Google accounts. The public API docs do not guarantee the account-selection UX SportStage needs.

### 6.2 Resource lifecycle

Preparation uses official endpoints in this order:

1. `liveBroadcasts.insert(part=snippet,status,contentDetails)` to create title, optional description, scheduled start, privacy, and defaults ([reference](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/insert)).
2. `liveStreams.insert(part=snippet,cdn,contentDetails,status)` with `ingestionType=rtmp`, explicit resolution/frame rate, and `isReusable=false` ([reference](https://developers.google.com/youtube/v3/live/docs/liveStreams/insert)).
3. `liveBroadcasts.bind(id,streamId,part=id,contentDetails,status)` ([reference](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/bind)).
4. Return `cdn.ingestionInfo.rtmpsIngestionAddress` and `streamName` once to the authorized broadcast operator; concatenate only inside native code. YouTube exposes RTMPS ingestion and stream health/status on the [live stream resource](https://developers.google.com/youtube/v3/live/docs/liveStreams).
5. Device starts ingest. Backend polls until stream status is `active` with acceptable health.
6. User taps Go Live; backend calls `liveBroadcasts.transition(..., broadcastStatus=live)`. YouTube requires an active bound stream before a live transition ([reference](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/transition)). Do not use `testing` in V1 because preview is local and monitor streaming is disabled.
7. End transitions to `complete`, verifies terminal status, then tells native to stop. If the API is temporarily unavailable, keep ingesting and retry; a separate force-stop option stops local media but leaves server reconciliation responsible for completing the provider resource.

Use a fresh non-reusable stream resource per session. This makes a leaked stream name expire with that session and prevents accidental cross-match reuse. On pre-live cancellation, unbind/delete provider resources best-effort. After completion, keep provider video/broadcast IDs but delete the live stream resource if policy and API state permit.

YouTube notes that a broadcast stuck in `testStarting` or `liveStarting` may need deletion and recreation ([broadcast lifecycle](https://developers.google.com/youtube/v3/live/life-of-a-broadcast)). Model this as a failed provider attempt and create a new provider resource set; never mutate IDs invisibly under a live session without an audit event.

### 6.3 Recommended broadcast defaults

| Setting | V1 default | Reason |
|---|---|---|
| `enableAutoStart` | `false` | SportStage does not claim LIVE until permission, ingest, and explicit user action succeed. |
| `enableAutoStop` | `false` | A short mobile network loss must not silently finalize the broadcast. A watchdog resolves abandoned sessions. |
| `enableDvr` | `true` | Viewers can seek while live when YouTube permits it. |
| `recordFromStart` | `true` | Full replay is expected; YouTube requires DVR plus record-from-start for immediate replay behavior. |
| `enableEmbed` | `true` | Required for the in-app viewer, subject to channel/video restrictions. |
| `enableMonitorStream` | `false` | Local native preview replaces a delayed YouTube monitor in V1. |
| `latencyPreference` | `low` | Better score/video alignment than normal without ultra-low's reliability and feature trade-offs. Validate on community networks. |
| `privacyStatus` | `unlisted` | Safer launch default while remaining link-viewable; Public requires explicit selection. |
| made-for-kids flag | explicit organizer choice/policy | Do not infer it solely from player ages. Product/legal must define the attestation. |

Private YouTube video is not equivalent to SportStage match privacy: YouTube controls which signed-in Google users can view private content. Unlisted is also link-access, not access-controlled. The setup screen must explain both.

### 6.4 Channel eligibility, policy, and quota

Before setup completes, verify channel status and map YouTube errors such as `liveStreamingNotEnabled`, `livePermissionBlocked`, concurrent-broadcast limits, invalid transitions, rate limits, and quota failures using the [Live Streaming API errors](https://developers.google.com/youtube/v3/live/docs/errors). YouTube currently requires channel verification, no live-streaming restrictions in the previous 90 days, and a minimum broadcaster age of 16 ([eligibility](https://support.google.com/youtube/answer/2474026)); first-time activation can take up to 24 hours ([encoder live-stream setup](https://support.google.com/youtube/answer/2907883)). Run readiness before match day and show a durable actionable result.

The 50-subscriber restriction documented for streaming through YouTube's own mobile app should not be assumed to govern SportStage's encoder workflow. Validate actual API eligibility/error behavior on intended channels; do not claim eligibility from subscriber count alone.

The Google project has a finite daily YouTube API quota; every request costs quota and current values must be checked in the project/official [quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost). V1 should poll every 2-5 seconds only during short transitions, then every 15-30 seconds while live or only on a health/state reason. Use jittered backoff and reconciliation instead of per-second provider polling.

**OPEN QUESTION:** production project's approved daily quota and current per-method unit costs. Complete a measured quota budget and quota-compliance audit before beta.

### 6.5 Ingestion profiles

YouTube recommends RTMPS, H.264 video, AAC/MP3 audio, constant bitrate, and keyframes at most every two seconds ([encoder settings](https://support.google.com/youtube/answer/2853702)). SportStage should use H.264 AVC and AAC-LC because they have broad hardware support.

| Profile | Video | Initial video bitrate | Audio | Selection rule |
|---|---|---:|---|---|
| `DATA_SAVER` | 854x480, 30 fps | 1.2-1.8 Mbps | AAC-LC, 96 kbps, 44.1/48 kHz | Weak but stable uplink; warn that this is below YouTube's ideal 720p quality. |
| `STANDARD` | 1280x720, 30 fps | 3.0-4.0 Mbps | AAC-LC, 128 kbps | V1 default for Indian 4G/Wi-Fi. |
| `HIGH` | 1920x1080, 30 fps | 6.0-8.0 Mbps | AAC-LC, 128 kbps | Only supported hardware, strong sustained upload, acceptable thermal. |
| `AUTO` | 1280x720, 30 fps | starts 3.0 Mbps; 1.8-4.5 Mbps bounds | AAC-LC, 128 kbps | Default adaptive bitrate; fixed resolution for the session. |

Use a two-second keyframe interval, hardware encoder, CBR-like rate control, Rec.709 color, and an IDR after reconnect. Require measured stable upload of at least 1.5x selected total bitrate before enabling Go Live. Profiles are capability-filtered; unsupported 1080p is not shown.

Changing resolution/frame rate mid-stream conflicts with the YouTube `liveStream.cdn` configuration and is unreliable across encoders. V1 AUTO changes bitrate only. Resolution downgrade requires a clearly signalled encoder restart/reconnect or a new session and belongs in V1.1 after lab validation.

## 7. Mobile Broadcasting Engine

### 7.1 Library comparison

| Option | Current evidence | Overlay fit | Decision |
|---|---|---|---|
| `react-native-nitro-rtmp-publisher` | New Architecture/Expo config plugin, RootEncoder Android, HaishinKit iOS, hardware codecs, ABR/reconnect/thermals, RTMPS; MIT. Its repository documents iOS 15+ and Android 21+ ([repository](https://github.com/Fluxlabs-tech/react-native-nitro-rtmp-publisher)). Adoption is currently very small. | No overlay/watermark API is documented. | Use as Phase 0 acceleration/reference only. Audit/fork/pin if selected; do not accept its JS API as the product boundary. |
| RootEncoder | Mature Android project, about 3k stars, Apache-2.0, RTMP/RTMPS, camera, MediaCodec, filters, bitrate control ([repository](https://github.com/pedroSG94/RootEncoder)). | OpenGL filters can carry a changing bitmap/text overlay. | Recommended Android native foundation, pinned and wrapped. |
| HaishinKit/RTMPHaishinKit | Mature Swift project, about 3.1k stars, BSD-3-Clause, iOS 15+, RTMP/SRT, VideoToolbox/camera/mixer primitives ([repository](https://github.com/HaishinKit/HaishinKit.swift)). | Native mixer/screen objects can compose a rendered score texture; exact performance is a spike gate. | Recommended iOS native foundation, pinned and wrapped. |
| `@api.video/react-native-livestream` | MIT, cross-platform RTMP wrapper, but older architecture/dependency evidence and no documented Expo New Architecture or dynamic burned-in overlay ([repository](https://github.com/apivideo/api.video-reactnative-live-stream)). | Insufficient. | Reject for V1 production. |
| Larix Broadcaster/SDK | Operational broadcaster app is capable; embeddable SDK terms/source are commercial/not repository-controlled. | App overlays exist, but not a seamless SportStage module. | Optional manual diagnostic fallback only; not product architecture. |
| Build capture/codec/RTMP from zero | Full control. | Full control. | Reject: excessive codec, muxing, camera, lifecycle, and device-fragmentation risk. Build only the adapter/compositor around proven engines. |

Third-party popularity is not proof of SportStage compatibility. Pin exact commits/releases, generate an SBOM, retain license notices, and run a quarterly maintenance/security review. Do not automatically float native versions through a caret range.

### 7.2 Owned native module boundary

Create `modules/sportstage-broadcast/` with one Expo module and a Fabric-compatible preview view. Its public contract is independent of either upstream library:

```typescript
type BroadcastEngineConfig = {
  width: number
  height: number
  fps: 30
  videoBitrateBps: number
  audioBitrateBps: number
  audioSampleRateHz: 44100 | 48000
  keyframeIntervalSeconds: 2
  orientation: 'LANDSCAPE' | 'PORTRAIT'
  camera: 'BACK' | 'FRONT'
}

type BroadcastEngineEvent =
  | { type: 'STATE'; state: NativeBroadcastState; reason?: NativeFailureCode }
  | { type: 'HEALTH'; bitrateBps: number; droppedFrameRatio: number; fps: number; queueMs: number }
  | { type: 'THERMAL'; level: 'NOMINAL' | 'FAIR' | 'SERIOUS' | 'CRITICAL' }
  | { type: 'INTERRUPTION'; audio: boolean; video: boolean; cause: string }

interface SportStageBroadcastModule {
  getCapabilities(): Promise<DeviceBroadcastCapabilities>
  requestPermissions(): Promise<BroadcastPermissions>
  configure(config: BroadcastEngineConfig): Promise<void>
  startPreview(): Promise<void>
  setOverlay(serializedState: string): void
  setIngestCredential(credential: OneUseInMemoryCredential): Promise<void>
  startStream(): Promise<void>
  setVideoBitrate(bps: number): Promise<void>
  switchCamera(): Promise<void>
  setMuted(muted: boolean): Promise<void>
  setZoom(value: number): Promise<void>
  stopStream(): Promise<void>
  dispose(): Promise<void>
}
```

The JS API must never expose a getter for the current ingest URL. `setIngestCredential` transfers and clears the JS reference immediately; native redacts `description`/exceptions and zeroes mutable buffers on stop where practical. The unavoidable residual risk is that an authorized, modified client can inspect its own process. Fresh non-reusable keys, authorization, short exposure, and session termination contain that risk.

### 7.3 Native media pipeline

Android:

```text
Camera2/CameraX surface + microphone AudioRecord
 -> RootEncoder/OpenGL surface pipeline
 -> SportStage bitmap/texture filter (updated only when state changes)
 -> MediaCodec H.264 surface encoder + AAC encoder
 -> RootEncoder FLV/RTMPS client
```

iOS:

```text
AVCaptureSession + AVAudioSession
 -> HaishinKit video mixer / Metal-CoreGraphics score texture
 -> VideoToolbox H.264 + AudioConverter/AAC
 -> RTMPHaishinKit RTMPS connection
```

Never move a video frame through JS, serialize a bitmap through the bridge every frame, or capture a React Native view hierarchy as the encoder input. JS emits an overlay state on a score/layout change; native renders/caches a new texture and composites it on every native frame. Coalesce updates to at most 10 per second and normally one per scoring event.

### 7.4 Camera/audio controls and lifecycle

- Configure encoder before opening preview to avoid camera reinitialization races.
- Lock capture orientation for the session. Rotation after PREVIEW requires confirmation and a restart; arbitrary device rotation is ignored.
- Default rear camera, continuous autofocus, stabilization when supported, torch off, 1x zoom. Capability-filter all controls.
- Mute replaces microphone samples with silence; it does not remove the audio track, which avoids player/mux issues.
- Do not add local recording in V1; YouTube already records and local MP4 increases storage/thermal/privacy risk.
- Start Android camera/microphone foreground service while the app is visible and show a persistent system notification. Android restricts background starts and camera/microphone foreground-service use ([Android FGS restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)).
- V1 is foreground-only on iOS. Camera video pauses when backgrounded; Apple only supports multitasking camera capture in limited device/entitlement/background-mode circumstances ([AVCaptureSession capability](https://developer.apple.com/documentation/avfoundation/avcapturesession/ismultitaskingcameraaccesssupported)). Do not claim VoIP background mode for a one-way sports broadcaster.
- On incoming audio interruption, show `AUDIO INTERRUPTED`; continue video if the OS permits, publish silence, and restore only after the system interruption-ended event. A full call/background on iOS moves to reconnect/recovery.
- Register native thermal and battery observers. Reduce bitrate at `SERIOUS`; warn and safely end at `CRITICAL`. Warn at 20% battery and require acknowledgement below 10% before starting.

## 8. Score Overlay Engine

### 8.1 Normalized contract

Keep the domain model discriminated and versioned rather than a loose `NormalizedScoreState`:

```typescript
type BroadcastMatchRef =
  | { kind: 'CRICKET'; id: string }
  | { kind: 'RACKET'; id: string }

type BroadcastParticipant = {
  id: string
  kind: 'TEAM' | 'PLAYER' | 'PAIR'
  displayName: string
  shortName?: string
  colorHex?: string
  logoUrl?: string
}

type BroadcastOverlayStateV1 = {
  schemaVersion: 1
  matchRef: BroadcastMatchRef
  sport: {
    code: 'CRICKET' | 'TENNIS' | 'BADMINTON' | 'PADEL' | 'PICKLEBALL' | 'TABLE_TENNIS'
    displayName: string
  }
  match: {
    status: 'SCHEDULED' | 'LIVE' | 'BREAK' | 'COMPLETED' | 'ABANDONED'
    formatLabel?: string
    phaseLabel?: string
  }
  competition?: { id: string; name: string }
  participants: [BroadcastParticipant, BroadcastParticipant]
  score: CricketBroadcastScoreV1 | RacketBroadcastScoreV1
  indicators: {
    live: boolean
    servingSide?: 0 | 1
    scoreConnection: 'CONNECTED' | 'RECONNECTING' | 'STALE'
  }
  branding: {
    showSportStageMark: boolean
    sponsor?: { name: string; imageUrl: string; altText: string }
  }
  sequence: number
  sourceUpdatedAt: string
  producedAt: string
}
```

`CricketBroadcastScoreV1` contains innings number, batting side, runs, wickets, legal balls, formatted overs, target/runs required/balls remaining when defined, current/required run rate, striker/non-striker and bowler summaries, and bounded recent outcomes. It must derive from existing cricket snapshots/domain formatters.

`RacketBroadcastScoreV1` contains the sport's unit labels, current point display, completed/current unit scores, sets/games/units won, server side and player, doubles server number/court where relevant, and derived set/match-point flags. It must derive through the existing config/engine/presentation layer, not sport-specific arithmetic in broadcast code.

### 8.2 Renderer architecture

Use one native layout engine with sport formatters, not six unrelated native implementations:

```text
BroadcastOverlayStateV1
 -> sport formatter
    CricketBroadcastOverlayFormatter
    TennisBroadcastOverlayFormatter
    BadmintonBroadcastOverlayFormatter
    PadelBroadcastOverlayFormatter
    PickleballBroadcastOverlayFormatter
    TableTennisBroadcastOverlayFormatter
 -> template layout
    MINIMAL | BROADCAST | COMPACT
 -> native display list/texture
 -> GPU compositor
```

React Native adapters decide meaning; native templates decide pixels. The serialized native display model should use already-formatted bounded strings and numeric layout tokens, which avoids duplicating sport rules in Kotlin and Swift.

### 8.3 Three V1 overlay modes

| Mode | Contents | Preferred placement |
|---|---|---|
| `MINIMAL` | short participants, primary score, phase/over/unit, server/striker marker, LIVE | top-left score bug; least obstruction |
| `BROADCAST` | competition, both participants, primary/secondary score, sport context, status, SportStage mark | upper or lower full-width bar selected around field framing |
| `COMPACT` | two-line mobile-readable score, one context value, LIVE | top-center; optimized for portrait/mobile playback |

Only the formatter exposes relevant fields. Cricket never shows server; tennis never shows wickets. Sponsor graphics are V1.1 because asset review, safe-area behavior, and advertising policy require additional governance; V1 schema keeps the extension point.

Layout rules:

- Work in normalized 0..1 canvas coordinates and recompute at the encoder resolution.
- Keep content at least 5% from all edges. Prefer the upper third because YouTube player controls obscure the lower portion.
- Landscape 16:9 is the recommended V1 orientation. The engine and templates support portrait 9:16, but portrait release is gated behind Phase 0 device/policy results.
- Minimum effective text height is 24 px at 720p, contrast target 4.5:1, and information uses icon/shape plus color.
- Generate short names once with deterministic truncation; allow a manual match short name later. Never shrink primary score below the minimum to fit a long name.
- Cache logo/sponsor assets before preview, validate MIME/dimensions, and never fetch them in the video-frame path. Missing assets fall back to initials/brand text.
- Animate only short opacity/position transitions; no continuous JS animation. Disable nonessential motion under thermal/network stress.

### 8.4 Overlay freshness

No new scoring event is not staleness; play can pause naturally. Mark the score `STALE` only when the score transport is disconnected and no successful snapshot refresh has occurred for 30 seconds. Retain the last confirmed score and show a small stale indicator; never reset to 0-0. Hide/show overlay is a presentation toggle only and must not stop synchronization.

## 9. Realtime Score Architecture

### 9.1 Source adapters

```typescript
interface BroadcastScoreSource {
  loadSnapshot(): Promise<BroadcastScoreEnvelope>
  subscribe(listener: (reason: ScoreInvalidation) => void): () => void
}

type BroadcastScoreEnvelope = {
  schemaVersion: 1
  matchRef: BroadcastMatchRef
  sequence: number
  generatedAt: string
  sourceUpdatedAt: string
  state: BroadcastOverlayStateV1
}
```

- Cricket adapter wraps `liveMatchApi.load`/`subscribe` and maps the latest cloud snapshot sequence.
- Racket adapter wraps `sportScoringApi.feed`/`subscribe`, replays ordered events through the current engine, then maps `buildScoreboardView`.
- A same-device local adapter may show a committed local cricket update earlier, but only after SQLite/outbox durability. Cloud state later confirms/replaces it. Racket same-device updates after the authoritative command acknowledgement unless its existing command flow explicitly provides a safe optimistic reducer.

### 9.2 Channels, ordering, and recovery

Reuse existing table subscriptions and filters. The broadcast wrapper can use diagnostic channel names:

```text
broadcast-score:cricket:<match-id>:<instance-id>
broadcast-score:racket:<scoring-match-id>:<instance-id>
```

The name is not an authorization boundary; RLS and table filters are. Event payloads are invalidations, not the canonical overlay payload.

Protocol:

1. Load snapshot.
2. Subscribe.
3. Immediately load again after `SUBSCRIBED` to close the load/subscribe race.
4. Coalesce invalidations for 50-100 ms and reload.
5. Apply only sequence `>= current`; ignore an equal duplicate unless metadata freshness requires a connection-state update. Never apply a lower sequence.
6. If an event indicates a jump, reload the complete snapshot/feed. A sequence jump is valid when multiple events coalesce; it is not filled by inventing events.
7. On channel error/timeout, retain score, mark `RECONNECTING`, and retry with full jitter at 1, 2, 4, 8, 15, then 30 seconds.
8. While Realtime is unhealthy, poll an authoritative snapshot every 15 seconds. Stop fallback polling after a successful subscribed reload.
9. On app foreground/network change, recreate the channel and reload regardless of cached state.

At-least-once delivery, duplicate invalidations, out-of-order callbacks, and missed notifications are therefore harmless. Timestamps are for display/telemetry, never ordering; the server sequence orders scoring state.

### 9.3 Same-device versus separate-device

Separate device is the lower-risk production mode: scorer and broadcaster run their existing focused screens, and the broadcast device consumes cloud state.

Same device must keep the native camera view mounted and foreground. Add a compact score-control bottom sheet to the production route that delegates to existing command/session services. Do not clone score rules or navigate to the normal full-screen scorer while live. If a sport's safe command component cannot be embedded in the phase, V1 explicitly recommends a second scoring device for that sport rather than shipping a partial duplicate.

Conflict behavior is identical to ordinary scoring: the server lease/sequence/RPC remains authoritative. The overlay shows the last accepted snapshot and the scoring control surfaces the existing lease/conflict error.

## 10. Backend Architecture

### 10.1 Edge Function layout

```text
supabase/functions/
  _shared/
    auth.ts                 # user JWT context and response errors
    validation.ts           # strict request schemas and limits
    idempotency.ts          # operation begin/replay/finalize
    broadcast-permissions.ts
    broadcast-state-machine.ts
    crypto.ts               # token envelope encryption interface
    redaction.ts
    providers/
      types.ts
      youtube.ts
      youtube-errors.ts
  youtube-oauth/
    index.ts                # START, RESULT, LIST, VERIFY, DISCONNECT + callback
  broadcasts/
    index.ts                # CREATE/PREPARE/CLAIM_INGEST/START/END/etc.
  broadcast-reconcile/
    index.ts                # secret-authenticated bounded reconciliation batch
```

Functions called by mobile keep JWT verification enabled and use the user's auth context. Supabase's current guidance sends the signed-in user's JWT in `Authorization` and applies user-scoped/RLS access; privileged clients must remain server-only ([securing Edge Functions](https://supabase.com/docs/guides/functions/auth), [authorization headers](https://supabase.com/docs/guides/functions/auth-headers)). The OAuth callback is unauthenticated at the gateway only because Google calls it; it authenticates with one-use state and performs no action if state validation fails.

### 10.2 Transaction and provider-call pattern

External HTTP calls cannot be atomically committed with Postgres. Use an operation saga:

1. Insert/get a unique `broadcast_operations` row by `(actor, idempotency_key, operation_kind)`.
2. Lock session row, validate capability, requested transition, and expected version; commit intent state.
3. Call YouTube with operation correlation metadata.
4. Lock row again, persist provider result and state/event; mark operation succeeded with a sanitized replayable response.
5. If the function dies between steps, reconciler resumes based on operation state and provider IDs. Never blindly issue another `insert`.

All resource creation sends/stores enough provider ID as soon as it is known. A partial prepare is cleaned by compensation or adopted on retry. Provider calls have short timeouts and bounded retries only for safe/idempotent reads; mutations rely on operation reconciliation.

### 10.3 Reconciliation

Run every minute while any session is `PROVIDER_PREPARING`, `GOING_LIVE`, `LIVE`, `RECONNECTING`, or `ENDING`, using a scheduler/cron to invoke a secret-authenticated bounded function. It:

- selects a small batch with `FOR UPDATE SKIP LOCKED` or a claim RPC;
- refreshes the relevant provider account and reads broadcast/stream status;
- repairs normalized state, detects revoked auth, and finalizes completed broadcasts;
- marks sessions abandoned only after heartbeat grace and provider evidence;
- emits audit events but never secrets.

Do not hold an Edge invocation open or poll continuously. **OPEN QUESTION:** confirm the production Supabase plan's function/cron limits and choose an external worker if reconciliation volume or duration exceeds them.

## 11. Database Design

Use `public` for RLS-protected safe domain metadata, and a non-exposed `private` schema for secret references/token ciphertext and privileged functions. Supabase Vault encrypts secrets on disk and preserves encrypted backups ([Vault](https://supabase.com/docs/guides/database/vault)); an external KMS/envelope encryption service is preferable if rotation/audit requirements outgrow Vault. Edge Function application secrets such as Google client secret and token-encryption key belong in managed function secrets, never Git ([Supabase function secrets](https://supabase.com/docs/guides/functions/secrets)).

### 11.1 Enums

```text
broadcast_provider_kind: YOUTUBE
broadcast_session_status:
  DRAFT, PROVIDER_PREPARING, READY, INGEST_CONNECTING, INGEST_ACTIVE,
  GOING_LIVE, LIVE, RECONNECTING, ENDING, ENDED, CANCELLED, FAILED
broadcast_privacy: PUBLIC, UNLISTED, PRIVATE
broadcast_orientation: LANDSCAPE, PORTRAIT
broadcast_quality_profile: AUTO, DATA_SAVER, STANDARD, HIGH
broadcast_overlay_theme: MINIMAL, BROADCAST, COMPACT
broadcast_assignment_role: BROADCASTER
broadcast_operation_status: STARTED, SUCCEEDED, FAILED, RECONCILE_REQUIRED
```

`AUTH_REQUIRED`, `YOUTUBE_ERROR`, and `NETWORK_LOST` are failure/recovery reasons, not mutually exclusive durable session states.

### 11.2 Tables

`broadcast_provider_accounts` (safe public metadata):

```text
id uuid PK
account_id uuid FK sportstage account/profile owner
provider broadcast_provider_kind
provider_subject_id text nullable (hashed or private if not needed by client)
provider_channel_id text not null
channel_title text not null
channel_thumbnail_url text nullable
granted_scopes text[] not null
token_status ACTIVE | REAUTH_REQUIRED | REVOKED
last_verified_at timestamptz
created_at, updated_at, revoked_at timestamptz
unique(account_id, provider, provider_channel_id) where revoked_at is null
```

`private.broadcast_provider_credentials`:

```text
provider_account_id uuid PK/FK
encrypted_refresh_token bytea OR vault_secret_id uuid
key_version integer
token_fingerprint text                  # non-secret correlation only
created_at, rotated_at timestamptz
```

No mobile role gets schema usage or select rights. Do not put secret-returning views in `public`.

`broadcast_assignments`:

```text
id uuid PK
cricket_match_id uuid nullable FK matches
sport_scoring_match_id uuid nullable FK sport_scoring_matches
account_id uuid not null
role BROADCASTER
can_start boolean default true
can_manage boolean default true
can_end boolean default true
assigned_by uuid not null
assigned_at, revoked_at timestamptz
CHECK exactly one match FK is non-null
unique active assignment per match/account
```

`broadcast_sessions`:

```text
id uuid PK
cricket_match_id uuid nullable FK matches
sport_scoring_match_id uuid nullable FK sport_scoring_matches
provider broadcast_provider_kind not null
provider_account_id uuid FK broadcast_provider_accounts
provider_broadcast_id text nullable
provider_stream_id text nullable
provider_video_id text nullable
status broadcast_session_status not null
status_version bigint not null default 0
failure_code text nullable
failure_detail_safe text nullable
provider_lifecycle_status text nullable
provider_stream_status text nullable
provider_health_status text nullable
privacy broadcast_privacy not null
orientation broadcast_orientation not null
quality_profile broadcast_quality_profile not null
actual_width, actual_height, actual_fps integer nullable
configured_video_bitrate_bps integer nullable
overlay_theme broadcast_overlay_theme not null
overlay_schema_version integer not null default 1
overlay_visible boolean not null default true
score_sequence_at_start bigint nullable
last_score_sequence bigint nullable
scheduled_at, ready_at, ingest_started_at, provider_live_at timestamptz nullable
started_at, end_requested_at, ended_at timestamptz nullable
last_heartbeat_at timestamptz nullable
started_by, ended_by uuid nullable
replay_status text nullable
replay_url text nullable                 # safe watch URL only; may derive instead
is_embeddable boolean nullable
created_at, updated_at timestamptz
CHECK exactly one match FK is non-null
CHECK numeric capability fields have safe ranges
```

Use two nullable foreign keys plus an exactly-one check because it preserves referential integrity across the current separate cricket/racket tables. Expose a TypeScript discriminated `BroadcastMatchRef`; do not add a fake polymorphic foreign key.

Indexes:

- unique partial active session on `cricket_match_id` for nonterminal statuses;
- unique partial active session on `sport_scoring_match_id` for nonterminal statuses;
- `(provider_account_id, created_at desc)`;
- `(status, updated_at)` for reconciliation;
- unique `(provider, provider_broadcast_id)` and `(provider, provider_stream_id)` when non-null.

`broadcast_session_health` is a one-row-per-session upsert, not an unbounded heartbeat log:

```text
session_id uuid PK/FK
native_state, video_connection, score_connection text
current_bitrate_bps, measured_upload_bps bigint nullable
fps numeric, dropped_frame_ratio numeric, encoder_queue_ms integer nullable
thermal_level, battery_level text/numeric nullable
observed_at timestamptz not null
```

`broadcast_events` is append-only audit/timeline metadata:

```text
id uuid PK, session_id uuid FK, sequence bigint
type text, source CLIENT | BACKEND | YOUTUBE | SCORE
actor_account_id uuid nullable
payload jsonb not null default '{}'
match_event_id uuid nullable
match_sequence bigint nullable
video_elapsed_ms_estimate bigint nullable
encoder_pts_ms bigint nullable
sync_confidence text nullable
discontinuity_id uuid nullable
occurred_at, received_at timestamptz
correlation_id uuid, idempotency_key uuid nullable
unique(session_id, sequence)
```

`broadcast_operations` stores action idempotency and saga progress. `broadcast_oauth_attempts` stores only a hash of state, account, expiry, used timestamp, return target, and sanitized result. Both have short retention.

### 11.3 What is deliberately not a table

`BroadcastConnection` is an in-memory native engine concept. Persist only current sampled health and lifecycle events. Never persist raw frames, packet buffers, RTMPS addresses containing credentials, stream names/keys, access tokens, OAuth codes, authorization headers, or refresh tokens in public/ordinary columns.

All public tables enable RLS. Safe read views use `security_invoker`; any `security definer` helper is placed in `private`, fixes `search_path`, revokes public execute, and exposes only an explicit safe RPC.

## 12. API Design

Follow the repository's Supabase convention rather than adding a fictional standalone REST server. Mobile calls:

```typescript
supabase.functions.invoke('youtube-oauth', { body: { action, ... } })
supabase.functions.invoke('broadcasts', { body: { action, ... } })
```

The HTTP paths are `/functions/v1/youtube-oauth` and `/functions/v1/broadcasts`. Responses use:

```typescript
type ApiResult<T> =
  | { ok: true; data: T; correlationId: string }
  | { ok: false; error: { code: BroadcastApiError; message: string; retryable: boolean; field?: string }; correlationId: string }
```

Never include a provider raw response in a client error.

### 12.1 YouTube connection actions

| Action | Purpose/auth | Request | Safe response | Validation/errors/idempotency |
|---|---|---|---|---|
| `START_CONNECTION` | Any signed-in SportStage account starts OAuth | `idempotencyKey`, `returnUri` from allow-list | `attemptId`, `authorizationUrl`, `expiresAt` | Validate session/URI/rate; replay same live attempt for key. Errors `AUTH_REQUIRED`, `INVALID_RETURN_URI`, `RATE_LIMITED`. |
| OAuth `CALLBACK` | Google browser callback; state-authenticated | `code`, `state`, provider error | 302 to allow-listed app URI with opaque attempt ID | State hash/TTL/one-use mandatory; code never appears in deep link/log. Idempotent by attempt. |
| `GET_CONNECTION_RESULT` | Attempt owner | `attemptId` | connection summary or pending/actionable error | No token fields. Safe to poll with backoff. |
| `LIST_CONNECTIONS` | Signed-in owner; optionally session grantee sees selected safe summary | none | IDs/channel labels/status/verified time | RLS/ownership; not a live API call on every screen. |
| `VERIFY_CONNECTION` | Connection owner | `providerAccountId`, `idempotencyKey` | refreshed safe status/channel | Rate-limited; one refresh/retry. `YOUTUBE_REAUTH_REQUIRED`, `CHANNEL_MISMATCH`. |
| `DISCONNECT` | Connection owner; extra confirmation if active session | `providerAccountId`, `idempotencyKey` | revoked status | Reject or explicitly hand off/end active sessions. Best-effort revoke; delete secret. |

### 12.2 Broadcast actions

| Action | Purpose/auth | Request | Safe response | Validation/errors/idempotency |
|---|---|---|---|---|
| `CREATE` | Create DRAFT; requires `MATCH_BROADCAST_START` | `matchRef`, provider account, privacy, orientation, quality, overlay, `idempotencyKey` | session summary/version | Validate exactly one existing match, startable status, provider grant, enums, no active session. Unique key and active-session constraint. |
| `UPDATE_DRAFT` | Change setup; start/manage capability | `sessionId`, `expectedVersion`, editable fields, `idempotencyKey` | updated summary/version | Only DRAFT/READY before ingest; optimistic version. |
| `PREPARE` | Create/bind YouTube resources; start capability | `sessionId`, `expectedVersion`, provider metadata, `idempotencyKey` | READY summary, never OAuth tokens | Match not completed; provider active; quota; valid metadata. Saga-idempotent. Errors mapped from YouTube. |
| `CLAIM_INGEST` | Deliver credential to assigned active operator only | `sessionId`, `expectedVersion`, `deviceInstanceId`, `idempotencyKey` | `ingestAddress`, `streamName`, `expiresAt/claimId` | START/MANAGE capability, selected provider account grant, allowed state. One response per claim; never cache response in analytics/DB. Re-fetch from YouTube on authorized recovery rather than DB. |
| `REPORT_ENGINE_STATE` | Transition durable intent from bounded native facts | session/version, native state, sanitized metrics, idempotency | normalized session/next action | Throttle health to 10-15 s; state events immediate. Server never trusts this to declare YouTube LIVE. |
| `START` | Explicit YouTube live transition | session/version/idempotency | `GOING_LIVE` or `LIVE` summary | Requires recent heartbeat, native connected, YouTube stream active/healthy, capability. Saga-idempotent. |
| `STATUS` | Read and optionally refresh safe state | session ID, `refreshProvider=false` | session + three connection states + safe video ID | Read permission/visibility. Provider refresh privileged/rate-limited. GET-equivalent action is idempotent. |
| `REFRESH_INGEST` | Crash/reconnect recovery | session/version/device/idempotency | credential once | Only nonterminal/pre-end state and authorized operator. Audit every issue. |
| `END` | Complete YouTube broadcast | session/version/idempotency, reason | ENDING/ENDED summary | `MATCH_BROADCAST_END`; repeat returns terminal response. Do not end from stale client version without server re-check. |
| `CANCEL` | Cancel before provider LIVE | session/version/idempotency | CANCELLED | PREPARING/READY/CONNECTING only; compensate provider resources. |
| `FORCE_LOCAL_STOPPED` | Record that client had to stop media | session/version/reason/idempotency | reconciliation status | Does not claim provider complete; backend reconciles. |

Common validation:

- UUID/length/enum/metadata limits; strip control characters; YouTube title/description built server-side from trusted match values plus bounded user fields.
- Re-query contextual permission, match status, provider ownership/grant, session state/version, and rate limit on every mutation.
- `Idempotency-Key` UUID is required for every mutation and scoped to actor+operation. The same key with different request hash is `IDEMPOTENCY_CONFLICT`.
- Map errors to stable codes: `FORBIDDEN`, `MATCH_NOT_FOUND`, `MATCH_NOT_BROADCASTABLE`, `ACTIVE_BROADCAST_EXISTS`, `VERSION_CONFLICT`, `INVALID_TRANSITION`, `YOUTUBE_REAUTH_REQUIRED`, `YOUTUBE_LIVE_NOT_ENABLED`, `YOUTUBE_PERMISSION_BLOCKED`, `YOUTUBE_CONCURRENT_LIMIT`, `YOUTUBE_QUOTA_EXCEEDED`, `YOUTUBE_STREAM_NOT_ACTIVE`, `PROVIDER_TEMPORARY`, `INGEST_CLAIM_DENIED`, `RATE_LIMITED`.

Viewer-safe current/replay metadata should be available through RLS-safe `get_match_broadcast(match kind/id)` RPC/view, not a secret-bearing Edge call. It returns video ID, normalized live/replay state, embeddability, and timestamps only when existing match visibility allows it.

## 13. Permissions

Add capabilities, not a global mode:

```text
MATCH_BROADCAST_START
MATCH_BROADCAST_MANAGE
MATCH_BROADCAST_END
```

Server-side evaluation matrix:

| Existing/contextual relationship | Start | Manage | End | Policy |
|---|---:|---:|---:|---|
| Cricket tournament owner/admin or standalone owner | yes | yes | yes | Existing match-management authority. |
| Racket competition owner/active organizer | yes | yes | yes | Existing competition-management authority. |
| Explicit active broadcaster assignment | assigned flags | assigned flags | assigned flags | Primary camera-operator mechanism. |
| Session starter | if originally authorized | yes | yes | Revalidate assignment/context; revocation can remove access. |
| Cricket scorer | no by role alone | no | no | Scoring permission does not imply consent to publish video; assign broadcaster explicitly. |
| Racket scorekeeper/referee | no by role alone | no | no | Same separation of duties. |
| Captain/team manager | no | no | no | Can be explicitly assigned; not automatically authorized. |
| Viewer/member/follower | no | no | no | Read safe metadata only according to match visibility. |

This is intentionally more conservative than treating every scorer/official as a broadcaster. Recording and publishing is a materially broader action. Product may later let competition owners opt into a policy that auto-grants scorers, but the database capability still remains contextual.

Provider account consent is independent of match permission:

- To create a session with one's own channel, actor needs `MATCH_BROADCAST_START` and owns the provider account.
- To let a camera operator use an organizer's channel, the provider-account owner creates/selects the session and explicitly assigns the operator to that session/match. The operator receives only the one-session ingest credential, never the organizer's OAuth token.
- A provider connection must never become generally usable by all competition organizers because one match was authorized.

Implementation uses a private `can_account_broadcast(match, capability)` SQL helper/RPC and repeats critical checks in the Edge Function immediately before provider calls. UI capability queries are hints, not enforcement. Assignment changes and all start/end attempts create audit events.

## 14. Broadcast State Machine

### 14.1 Durable states and authorities

| State | Meaning | Primary authority |
|---|---|---|
| `DRAFT` | Local/server setup exists; no provider resources guaranteed | SportStage backend |
| `PROVIDER_PREPARING` | Resource saga in progress/reconcilable | SportStage backend + YouTube evidence |
| `READY` | Broadcast/stream are created and bound | Backend after YouTube confirmation |
| `INGEST_CONNECTING` | Credential claimed; native attempting RTMPS | Backend intent + native report |
| `INGEST_ACTIVE` | Native connected and YouTube stream is active | YouTube stream status, reconciled by backend |
| `GOING_LIVE` | Explicit transition requested | Backend operation + YouTube lifecycle |
| `LIVE` | YouTube reports live | YouTube, normalized/persisted by backend |
| `RECONNECTING` | Session remains provider-live but device ingest is unavailable/degraded | Backend from native heartbeat + provider status |
| `ENDING` | Completion saga running | Backend intent + YouTube lifecycle |
| `ENDED` | Provider complete and replay metadata retained | YouTube, persisted by backend |
| `CANCELLED` | Pre-live session intentionally abandoned | Backend |
| `FAILED` | Unrecoverable attempt; safe reason stored | Backend after reconciliation |

Native state is separate: `IDLE`, `PREVIEWING`, `CONNECTING`, `STREAMING`, `RECONNECTING`, `STOPPING`, `STOPPED`, `ERROR`. UI combines durable, native, score-channel, and YouTube health rather than collapsing them into a misleading single spinner.

### 14.2 Allowed transitions

```text
DRAFT -> PROVIDER_PREPARING -> READY -> INGEST_CONNECTING -> INGEST_ACTIVE
                                                              |
                                                              v
                                                        GOING_LIVE -> LIVE
                                                                         |
                                                                         v
                                                                  RECONNECTING
                                                                         |
                                                                         +-> LIVE

READY/INGEST_CONNECTING/INGEST_ACTIVE -> CANCELLED
LIVE/RECONNECTING -> ENDING -> ENDED
nonterminal -> FAILED (unrecoverable and reconciled)
```

Rules:

- `LIVE` requires provider lifecycle `live`; a malicious/stale mobile event cannot set it.
- `ENDED` requires provider complete or a recorded terminal policy decision after provider deletion/not-found. Local encoder stopped is not sufficient.
- `AUTH_REQUIRED`, `NETWORK_LOST`, and `YOUTUBE_ERROR` are `failure_code`/connection conditions. Auth required during DRAFT/READY pauses the action; it does not rewrite session history.
- `FAILED` is terminal for that provider attempt. Retry creates a new session (or an explicitly linked `retry_of_session_id`) so audit/provider identifiers remain comprehensible.
- Every transition executes under row lock with `expectedVersion`, increments `status_version`, and appends one event in the same transaction.
- If a callback/operation result is older than the row version or contradicts a terminal state, record it as ignored provider evidence; never regress state.

### 14.3 End and abandonment behavior

Normal end:

1. UI confirms and sends `END`; backend locks state and records `ENDING`.
2. Backend transitions YouTube to `complete` while ingest remains briefly available.
3. On provider success, response instructs native to stop, clears native credential, and persists `ENDED`/replay processing.
4. If client disappears, YouTube is already complete. If provider completion temporarily fails, keep ingest and show retry; `FORCE LOCAL STOP` is a separate clearly warned action.

Abandoned/crashed live broadcaster:

- Last heartbeat older than 30 seconds marks connection unknown/reconnecting, not ended.
- Reconciler checks YouTube status. Give an owner-configured/default 3-minute recovery grace while provider remains live/no-data.
- Notify active organizers in-app when available. An authorized user can recover on another device or end.
- After grace, backend attempts complete and records `ABANDONED_BY_WATCHDOG`. **OPEN QUESTION:** validate YouTube's actual no-data timeout and pick the grace using field tests; it is not a stable public contract.

## 15. Broadcaster UX

### 15.1 Entry points

Add a `Live video` action to:

- cricket live/scorecard match action menus (`app/wricket/match/[id]/live.tsx` and score/scorecard contextual actions);
- shared racket cloud feed/score screen headers (`SportCloudMatchFeedScreen` and `SportCloudLiveScoreScreen`);
- match management/competition detail surfaces for authorized organizers.

Do not add six duplicate route implementations. They all push a shared route:

```text
/broadcast/setup?matchKind=cricket&matchId=...
/broadcast/setup?matchKind=racket&matchId=...
```

The server decides whether the action is enabled. Spectators see `Watch live/replay`, not setup.

### 15.2 Setup

Screen sections:

1. Match summary and a visible recording/consent acknowledgement.
2. YouTube channel card: connected channel, readiness, connect/change/disconnect.
3. Privacy: Unlisted (recommended), Public, Private with plain-language access consequences.
4. Quality: Auto (recommended), Data Saver, Standard 720p, High 1080p only if supported.
5. Orientation: Landscape recommended. Portrait appears only when release-gated; orientation is locked after preview.
6. Scoreboard: Minimal, Broadcast, Compact with static examples.
7. Microphone default on with an explicit venue-consent reminder.

`Continue to preview` runs local permission/capability checks, provider readiness, match permission, battery/thermal check, and an upload preflight. Provider resources may be prepared only after the user accepts recording consent, to avoid orphan quota/resources.

### 15.3 Preview

Preview is the actual native composition path, not a React Native imitation. It shows:

- camera plus burned-in overlay;
- mic, camera, zoom/focus, overlay hide/style;
- selected channel/privacy/quality;
- three compact health chips: Device/Network, Score, YouTube;
- preflight upload result and expected data rate;
- `GO LIVE` as the only primary action.

The button remains disabled until native preview is ready, recent score snapshot loaded, permissions granted, provider READY, RTMPS connected/YouTube stream active, and no critical battery/thermal warning. A stale but last-known score may be allowed only after explicit acknowledgement.

### 15.4 Live production

Use a full-screen native preview with two unobtrusive control zones:

- Top: red LIVE + duration, network quality/bitrate, score connection, YouTube status.
- Bottom collapsed controls: camera switch, mute, overlay, zoom, more, End.
- Expanded health sheet: current/target bitrate, fps, dropped frames, score last-sync, YouTube health, battery/thermal, safe diagnostics copy (no credentials).
- Optional scoring sheet for same-device mode, implemented by delegating to existing commands.

Do not show an ingest URL/key, raw YouTube error object, viewer chat, or a dense dashboard. YouTube concurrent viewer count may be delayed/quota-consuming and is V1.1 unless it can be obtained at a safe cadence.

Back gesture/route change while live shows `Keep broadcasting` or `End broadcast`; it cannot silently unmount the native view. Lock-screen/background warnings are platform specific. Android continues under foreground service for short accidental backgrounding; iOS immediately shows a system-safe app-switcher cover, marks reconnecting, and restores in foreground.

### 15.5 Ended

Confirmation includes the irreversible YouTube consequence. Result screen shows duration, terminal state, channel, and replay status:

```text
Broadcast ended
Replay is processing on YouTube
[Watch replay] [Back to match]
```

Views are omitted if not reliably available. If completion is pending, say `Finishing on YouTube` and keep a retry/status action. Never claim a replay is ready solely because ingest stopped.

## 16. Viewer UX

### 16.1 In-app approach

Add `react-native-webview` and a small owned YouTube IFrame wrapper for native; use the IFrame API directly on web. The mobile app currently has no WebView/player dependency, so this is new. The wrapper must set a legitimate origin/base URL/referrer, meet the minimum player dimensions, keep controls visible, avoid overlays over the YouTube player, and disable background playback. These are required by YouTube's [minimum functionality rules](https://developers.google.com/youtube/terms/required-minimum-functionality), [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference), and [player parameters](https://developers.google.com/youtube/player_parameters).

YouTube retired the old Android native Player API; use the cross-platform IFrame/WebView route, with `Open in YouTube` as fallback. Autoplay is off. Only one player can autoplay/play on a screen. Ads and YouTube branding/controls are not obscured.

The score appears below the player as the normal SportStage live UI. It is also burned into the video, but SportStage must not place its own interactive overlay on top of YouTube playback.

### 16.2 Match states

- Provider LIVE + match-visible: red Live badge, participant headline, `WATCH LIVE`, player, live score below.
- Session GOING_LIVE/RECONNECTING: `Live video is connecting` with score still visible; do not show a broken player loop.
- Provider ENDED, replay processing: disabled `Replay processing` state with periodic/manual refresh.
- Replay ready/embeddable: `WATCH REPLAY` and embedded player.
- Embedding denied/private auth/error: explanation plus `Open in YouTube` when allowed.
- No broadcast: existing match experience unchanged.

**OPEN QUESTION:** private-video viewing requirements and whether SportStage's target users will be authenticated to authorized YouTube accounts inside the embedded player. Until proven, recommend Unlisted for controlled link-sharing and clearly disclose link leakage risk.

## 17. Network & Failure Handling

### 17.1 Independent health models

```typescript
type BroadcastHealth = {
  video: 'CONNECTING' | 'GOOD' | 'WEAK' | 'RECONNECTING' | 'FAILED'
  score: 'CONNECTED' | 'RECONNECTING' | 'STALE'
  youtube: 'PREPARING' | 'READY' | 'LIVE' | 'COMPLETE' | 'ERROR'
  bitrateBps?: number
  droppedFrameRatio?: number
  uploadCapacityBps?: number
}
```

Never derive YouTube LIVE from an RTMPS socket alone. Never stop video solely because the score channel is unhealthy.

### 17.2 Adaptive bitrate

- Measure actual sent bitrate, encoder queue duration, dropped frames, RTMP send congestion, and network interface changes.
- Reduce target by about 20-30% when the send queue/congestion persists for 3-5 seconds; never below the profile floor without warning.
- Recover slowly: require 20-30 seconds stable headroom and increase by at most 10% per step.
- Prefer dropping non-key video frames to growing memory/latency. Preserve audio continuity where possible.
- Avoid oscillation using hysteresis and a minimum interval between bitrate changes.
- Show `Weak` when actual sustained capacity is below 1.2x target, dropped frames exceed 5% over 10 seconds, or reconnects repeat.

### 17.3 RTMPS loss

Encoding can continue only for a tiny bounded interval needed for reconnect mechanics. V1 does not implement a long local retransmission buffer: YouTube live ingest is not designed to accept old real-time packets, and buffering increases latency, memory, and thermal load. Keep at most 2-3 seconds of encoded packets if the native library requires it; otherwise drop during outage, reconnect, request an IDR, and accept a gap in the recording.

Retry with full jitter at roughly 0.5, 1, 2, 4, 8, then 10-second caps for a 90-second automatic budget. Network-interface change triggers an immediate safe reconnect rather than waiting for the timer. Preserve the same session/stream key while authorized. After the automatic budget, keep the YouTube session recoverable and present Retry/End; backend watchdog owns eventual completion.

### 17.4 Score loss

Video continues and the last confirmed score remains burned in. UI shows `Score reconnecting`; after 30 seconds of failed snapshot reads, overlay adds a small stale indicator. Realtime reconnect plus full snapshot removes it. The broadcaster can hide the overlay but cannot edit score values in a broadcaster-only UI.

### 17.5 Background, calls, battery, thermal

| Event | Android | iOS |
|---|---|---|
| Short background/app switch | Camera/mic foreground service may continue with persistent notification; service must start while app is visible and comply with current OS/Play declarations. | Video capture is not guaranteed; mark reconnecting, pause/lose video, cover app switcher snapshot, restore/reconnect in foreground. |
| Lock screen | Treat as unsupported for production video; show pre-warning and reconnect/end behavior. | Capture pauses; recover in foreground. |
| Incoming call/audio focus loss | Publish silence or pause per focus; retain video/socket when allowed; restore on focus event. | Handle AVAudioSession interruption; likely video/background disruption; reconnect after call. |
| Low battery | Warn at <=20%; persistent critical warning at <=10%; do not abruptly end unless OS does. | Same. |
| Serious thermal | Step down bitrate, disable animation/torch, offer 480p restart if needed. | Same. |
| Critical thermal | End safely before OS termination, persist reason, complete provider if reachable. | Same. |

Cross-platform copy must be truthful: Android resiliency does not imply iOS background video support.

## 18. Security

### 18.1 Data boundary

| Location | Allowed | Forbidden |
|---|---|---|
| Mobile JS | Supabase session, safe session/channel/video metadata, score, one-time ingest response only long enough to transfer native | Google access/refresh tokens, persisted RTMPS credentials, Google client secret, service/secret key |
| Native memory | Active RTMPS address/stream name, encoder state, bounded packets | Disk persistence, readable getters, crash/log serialization |
| Public Postgres | RLS-safe provider account labels, sessions, assignments, events, sampled health | OAuth tokens/codes, stream name/key, full ingest URL, secret keys |
| Private storage | Encrypted refresh token or Vault reference, token key version/fingerprint | Broad grants to client roles, decrypted-token views in exposed schema |
| Edge Function secrets | Google client ID/secret, encryption key/KMS credentials, Supabase server secret | Checked-in `.env`, client bundle, response payloads |
| Logs/analytics | IDs, normalized state/error code, metrics, correlation and hashed device instance | Authorization header, OAuth code/state plaintext, tokens, stream URL/name/key, raw provider request/response |

### 18.2 Threat review

| Threat | Control | Residual risk |
|---|---|---|
| OAuth token theft | Server-side flow, state/TTL/one-use callback, encrypted private token, least scope, rotation/revocation, no client token | Compromised backend/KMS remains high impact; audit and incident runbook required. |
| Stream-key leakage | Fresh non-reusable stream per session, issue only to authorized device, memory-only, redaction, no UI, complete/delete after use | A rooted/modified authorized device can extract its active key. Limit session lifetime and revoke quickly. |
| Broadcast another match | Server checks exact canonical match and contextual capability every action; FK/check constraints and audit | A legitimately privileged organizer can still misuse recording authority; consent and audit govern it. |
| Replay/idempotency abuse | User JWT, state nonce, operation UUID+request hash, session version, one-use ingest claims, rate limits | Compromised live user session can act within its permissions until revoked. |
| Malicious client fakes LIVE | Backend trusts YouTube lifecycle, not client state; service key stays server-only | Provider API lag may delay UI but cannot falsely authorize. |
| Leaked logs/crash reports | Central redaction before telemetry, typed safe errors, CI secret-pattern tests, disable native URL logs | Third-party native dependencies must be audited for debug logging. |
| Secret persistence in screenshots/app switcher | Never render secrets; Android secure flag on broadcast route if needed; iOS privacy cover on inactive | iOS user screenshots cannot be universally prohibited; no secret is visible. |
| DB privilege escalation | RLS, private secret schema, security-invoker views, fixed-search-path private definers, migration SQL tests | Misconfigured future migrations; keep automated privilege assertions. |
| Provider revocation mid-stream | Refresh/read maps `invalid_grant`; block new credentials; reconcile current provider state and prompt reconnect/end | Existing RTMP ingest might continue until YouTube terminates/completes it. |
| API/quota abuse | Per-user/match/IP rate limits, bounded metadata, quotas, idempotency, anomaly alerts | Distributed authenticated abuse needs operational blocking. |

Do not implement certificate pinning as a substitute for platform TLS; it adds rotation/outage risk. Use HTTPS/RTMPS, supported TLS stacks, secure device defaults, and server authorization.

### 18.3 Token encryption choice

Recommended V1: application-level envelope encryption in Edge Functions, with a production KMS-managed key if available; store ciphertext, nonce/tag, and key version in `private`. Supabase Vault is an acceptable initial alternative if its operational access/rotation model is approved. The refresh-token row is never selected by a user-scoped client. Access tokens remain ephemeral and may be cached server-side only encrypted and shorter than their expiry.

**OPEN QUESTION:** organization-approved KMS/secrets product, key-rotation schedule, incident owner, and retention/deletion SLA.

## 19. Privacy

Before enabling camera preview/prepare, show a recording notice and organizer attestation that they have authority/consent to record the participants and venue. While active:

- a persistent red LIVE indicator appears on the operator screen;
- spectator/match surfaces display `This match is being live streamed`;
- microphone status is always visible;
- location is not inserted into the YouTube title/description by default;
- no face recognition, biometric inference, or raw video copy is created by SportStage V1.

Private SportStage matches require explicit policy. Public/unlisted YouTube delivery can defeat match privacy; block Public, and potentially all YouTube broadcasting, unless the organizer acknowledges the mismatch. Private YouTube playback must be field-tested before being offered as equivalent access control.

Minors require a documented organizer/guardian consent process, child-safety escalation, retention/deletion procedure, and YouTube audience selection. The broadcaster must meet YouTube's minimum age. This is a product/legal policy, not a checkbox inferred from roster birthdays.

Update:

- privacy policy: camera/microphone, Google/YouTube sharing, OAuth credentials, replay retention, deletion/revocation, minors, spectator notice, and data processors;
- Terms/organizer agreement: recording rights, prohibited content, takedown, venue/local-law responsibility;
- App Store privacy details and camera/microphone purpose strings;
- Google Play Data Safety, prominent disclosure/consent where required, camera/microphone and foreground-service type declarations;
- support process to disconnect YouTube, delete SportStage connection metadata, and request video removal from the actual YouTube channel.

**OPEN QUESTION:** target launch countries, governing recording/child law, legal-approved consent copy, replay retention ownership, takedown SLA, and whether SportStage or channel owner is controller for each data flow. Obtain counsel before public beta.

## 20. Observability

Introduce a provider-neutral `lib/observability` facade so product code does not directly call a vendor. Emit structured events with `session_id`, match kind/id, provider, app/build/device class, operation, normalized state, correlation ID, safe provider reason, latency, and metrics.

Events:

```text
broadcast_setup_opened       broadcast_prepare_attempt/succeeded/failed
broadcast_start_attempt      broadcast_started      broadcast_failed
broadcast_end_attempt        broadcast_ended        broadcast_watchdog_ended
youtube_auth_started         youtube_auth_succeeded youtube_auth_failed
rtmp_connect_attempt         rtmp_connected         rtmp_disconnected
rtmp_reconnected             rtmp_retry_exhausted
score_sync_connected         score_sync_disconnected score_sync_recovered
quality_downgraded           thermal_warning        battery_warning
viewer_opened                replay_ready
```

Metrics/histograms:

- prepare/start/end latency and success rate;
- time RTMP socket connected to YouTube stream active to provider LIVE;
- broadcast duration and unexpected-end rate;
- actual/target bitrate, fps, dropped-frame ratio, encoder queue, reconnect count/duration;
- score snapshot/realtime connection and score-to-overlay latency;
- battery delta/hour, thermal transitions, memory high-water mark;
- OAuth failure reasons, reauth rate, quota/rate-limit failures;
- sessions stuck in transitional states and replay-processing age.

Sampling:

- Lifecycle/security events: 100%.
- Per-10/15-second health aggregate: keep during beta, later sample successful sessions; immediately flush boundary/failure summaries.
- Never emit each video frame, network packet, or unchanged score event.

Initial alerts:

- provider start failure >5% over 15 minutes with adequate volume;
- `GOING_LIVE` >2 minutes or `ENDING` >5 minutes;
- quota exhaustion or auth failures above baseline;
- unexpected disconnect/reconnect spike by app/native version or Android model;
- crash-free broadcast sessions below 99.5%; ANR-free below 99.8%;
- score-sync P95 above 2 seconds or disconnected >30 seconds in >5% of sessions.

**OPEN QUESTION:** telemetry/crash vendor, data residency, retention, on-call system, and current baseline volumes. No such centralized tooling was found in the repository.

## 21. Performance

These are V1 release targets, validated on the supported device matrix rather than the simulator:

| Metric | Target |
|---|---|
| Preview/render | stable 30 fps; encoded delivery >=27 fps over a healthy 10-minute window |
| Dropped frames | <2% normal P95 session; <5% during classified weak network, excluding reconnect gaps |
| Overlay renderer | state-to-native texture P95 <100 ms; no frame-path JS work |
| Same-device score-to-overlay | P95 <300 ms after local durable/accepted command |
| Separate-device score-to-overlay | P95 <1.5 s from server event commit on healthy connections |
| Score recovery | latest authoritative snapshot within 3 s P95 after Realtime resubscribe |
| Native RTMPS connect | <8 s P95 on healthy network |
| Tap Go Live to provider LIVE | <20 s P95 after ingest already active; validate against YouTube variability |
| Transient reconnect | <10 s P95 for outages shorter than 5 s |
| Memory | no growth trend over 120 minutes; app RSS <350 MB on a 4 GB Android target at 720p |
| CPU | hardware codec mandatory; no sustained severe thermal state in 60-minute 720p test |
| Battery | <=25% per hour target at 720p30 on reference mid-range devices, screen at controlled brightness |
| Crash-free sessions | >=99.5% beta, target >=99.8% after stabilization |
| ANR-free sessions | >=99.8% |

CPU percentages differ too much across devices to be a useful universal gate. Record per-device CPU/GPU and use thermal/frame/battery outcomes. 1080p is capability- and soak-gated, not a universal promise.

## 22. Testing

### 22.1 Unit and property tests

- State machine: every allowed/forbidden transition, stale version, terminal idempotency, provider/client races.
- Permissions: all cricket/racket contextual roles, assignment/revocation, provider-account grant, standalone/competition match paths.
- Overlay adapters: golden fixtures for every sport/status; long names, missing players, tie-break/deuce, innings break, target, abandonment, completed match.
- Score protocol: duplicates, lower sequence, jumps, reconnect/load race, coalescing, stale transport, corrupted payload/version.
- Provider adapter: request shape, defaults, token refresh serialization, sanitized error mapping, quota backoff, partial saga recovery.
- Redaction: property/fuzz tests ensure token, OAuth code, `streamName`, `rtmps://...`, and Authorization values never enter logs/errors.
- Quality controller: hysteresis, floor/ceiling, thermal precedence, no oscillation.

### 22.2 Database and Edge integration

- SQL migration/pgTAP-style tests for RLS, client-role denial of private schema, contextual capability, exactly-one FK, active-session uniqueness, append sequence, idempotency conflict, safe public reads.
- Local Supabase tests for authenticated user functions, OAuth state expiry/replay, provider-account isolation, transaction rollback, reconciliation claims.
- A fake provider server for deterministic CI, plus adapter contract recordings stripped of secrets.
- Dedicated Google/YouTube test project and dedicated verified test channels. There is no YouTube Live sandbox, so run unlisted end-to-end tests with cleanup and quota budgets.
- Test refresh after access-token expiry, revoked grant, changed scope, wrong Brand channel, live not enabled, concurrent live limit, quota exhaustion, stuck transitions, delayed replay.

OAuth apps in testing can have token-lifetime/authorized-user restrictions. The production-readiness test must use the intended verified configuration, not only developer accounts.

### 22.3 Native/module tests

- Kotlin/Swift tests for config validation, redaction, state events, credential cleanup, overlay layout bounds, bitmap/texture caching.
- Native example/harness streams a test pattern, timecode, audio tone, and changing synthetic score. Download/inspect allowed test replay manually or through permitted tooling to prove burn-in and A/V sync.
- Contract tests ensure identical JS API/error codes on both platforms.
- CNG/config-plugin tests apply prebuild twice and assert idempotent manifests/plist/Gradle/Pod configuration.
- Release builds, not debug only; debug performance is not representative.

### 22.4 Mobile/manual matrix

Device classes:

- low-end Android, 4 GB RAM, entry MediaCodec/GPU;
- mid-range Android representing the primary Indian audience;
- flagship Samsung/Pixel-class Android;
- oldest supported iPhone (tentatively iOS 15 capable);
- current iPhone.

Include major Android vendors/SoCs from actual analytics once available. **OPEN QUESTION:** supported-device minimums and current production distribution.

Scenarios:

- camera/mic permission allow, deny, one-time, settings revoke;
- front/rear, focus, zoom, mute, torch, long names, missing logos, three templates, both supported orientations;
- 30/60/120-minute streams, direct sun/heat, charging, low battery, storage pressure;
- app background/foreground, lock, call, alarm, audio route change, Bluetooth connect/disconnect;
- force kill/crash and recover/end on same and second device;
- scorer same device, separate device, two competing scorers/lease conflict, score device offline/reconnect;
- match completes/abandons while live; assignment revoked; SportStage logout; YouTube disconnect;
- embedded live/replay, fullscreen, external fallback, ads/controls, accessibility screen reader around player.

### 22.5 Network matrix

Use a controllable network shaper and real field carriers:

```text
Wi-Fi -> 5G, 5G -> 4G, 4G -> no network, no network -> 4G
100/250/500 ms latency, 1/3/5/10% packet loss, jitter, DNS/TLS failure
upload caps below/at/above profile bitrate, captive portal, NAT change
video path lost while Supabase works; Supabase lost while RTMPS works; both lost
```

Assert bounded memory, bitrate behavior, separate health indicators, no false LIVE/ENDED, score snapshot recovery, recording gap behavior, and no credential leakage in native/JS/Supabase/telemetry logs.

## 23. Cost/Scaling

YouTube absorbs the dominant video costs: public RTMPS ingress, transcoding, live CDN distribution, DVR, recording, and replay delivery. SportStage costs remain control-plane sized:

- Edge Function invocations for OAuth, prepare/start/end, status/reconciliation, and bounded heartbeats;
- YouTube API quota administration, verification, and potential compliance work rather than a per-gigabyte video bill;
- Postgres rows for accounts/sessions/events/operations and small sampled health upserts;
- Realtime messages for existing score updates and one broadcaster subscription per match;
- secret/KMS operations and encrypted storage;
- logs, metrics, crash reporting, alerting, and support;
- optional in-app/push notifications in later phases.

A useful planning model per broadcast is:

```text
Edge calls ~= OAuth amortized + 1 create + 1 prepare + 1 claim + 1 start
             + ceil(duration_seconds / heartbeat_interval)
             + provider reconciliation reads + 1 end + replay checks

Realtime messages ~= score invalidations x active broadcast devices
DB writes ~= lifecycle events + sampled health + timeline markers
```

Use health upserts every 10-15 seconds, not an append-only heartbeat row. Retain full lifecycle/audit and timeline markers; aggregate/delete high-frequency operational samples under a documented policy. Realtime score traffic is small compared with video and is already part of the scoring architecture.

If SportStage hosted video, it would additionally pay and operate global ingest, TLS/RTMP edges, transcoding ladders, GPU/CPU capacity, segment packaging, origin storage, CDN egress, DVR, replay processing, player compatibility, abuse moderation, and 24/7 media reliability. That is orders of magnitude more operational scope even before multi-region redundancy. YouTube's branding, ads, policy, quota, latency, and platform dependency are the corresponding trade-offs.

**OPEN QUESTION:** expected concurrent broadcasts, average duration, score-event rate, spectator count, Supabase plan/region, telemetry retention, and YouTube project quota. Do not publish a currency estimate until these inputs and current vendor pricing are known.

## 24. V1 Scope

### V1: must ship

- One YouTube provider, one channel connection selected per session.
- Backend-only OAuth/refresh tokens, channel readiness, connect/disconnect.
- Fresh unlisted/public/private YouTube broadcast and non-reusable stream creation/binding; explicit start/end.
- Direct RTMPS from one Android/iOS phone with rear/front camera, mic/mute, zoom, landscape, H.264/AAC, 480p/720p/1080p profiles where supported, adaptive bitrate within fixed resolution.
- Burned-in multi-sport score overlay using three shared templates and six sport formatters.
- Separate-device score sync for every supported sport using existing Realtime and snapshot paths.
- Same-device compact scoring only where existing command services can be safely embedded; otherwise an explicit second-device requirement, documented by sport.
- Match-scoped broadcaster assignment/capabilities, session/audit/state machine, idempotent APIs, recovery/reconciliation.
- Broadcast setup, actual-pipeline preview, production screen, three health states, confirmed end.
- In-app live/replay YouTube viewer with external fallback and score below the player.
- Network reconnect, bitrate degradation, score stale/recovery, Android FGS, truthful iOS foreground limitation, call/battery/thermal handling.
- Security/privacy disclosure, redacted telemetry, serious automated/manual/field test gates.

Release may stage sport support behind existing feature flags after cricket + tennis prove the two score-model families. The architecture must be complete for all six; a sport is not enabled until its golden overlays and full match-state test suite pass.

### V1.1: important improvements

- Portrait production release if spike/UX results pass.
- Resolution downshift through a controlled reconnect.
- Sponsor logo governance and approved graphic assets.
- Scheduled preflight/readiness reminders and push alerts.
- Delayed YouTube concurrent-viewer count at a quota-safe cadence.
- Operator handoff between devices, with explicit claim/revoke flow.
- Richer replay status/takedown tooling and organizer broadcast history.
- Local diagnostic recording/test-pattern mode, not user-facing full recording by default.
- Better automated device denylist/quality recommendations from telemetry.

### Future

- Custom RTMP, Facebook, or SportStage-hosted provider adapters.
- Multiple/external cameras, remote director, commentator mix, graphics operator.
- Animated sponsor graphics, lineups, lower thirds, ticker, team-controlled themes.
- Instant replay, automatic highlights, AI clip selection, Player Passport clips.
- Multi-destination restreaming, which would require a server media plane or provider service.
- Web broadcaster where browser capture/encoding support meets product reliability.

## 25. Future Architecture

### 25.1 Minimal provider abstraction

Put this interface inside Edge Function server code, not shared mobile domain code:

```typescript
interface BroadcastProvider {
  createBroadcast(input: ProviderBroadcastInput): Promise<ProviderBroadcast>
  createIngest(input: ProviderIngestInput): Promise<ProviderIngestResource>
  bind(input: ProviderBindingInput): Promise<void>
  getStatus(ids: ProviderResourceIds): Promise<ProviderStatus>
  transitionLive(ids: ProviderResourceIds): Promise<ProviderStatus>
  transitionComplete(ids: ProviderResourceIds): Promise<ProviderStatus>
  deletePreLiveResources(ids: ProviderResourceIds): Promise<void>
  resolveReplay(ids: ProviderResourceIds): Promise<ProviderReplay>
}
```

It normalizes lifecycle/errors but does not pretend all future providers create and bind separate resources. The session row stores provider-neutral fields plus safe opaque IDs. YouTube-specific request/response shapes stay in `providers/youtube.ts`; do not add unused provider tables, dynamic registration, or generalized OAuth strategies in V1.

Future `CustomRtmpProvider` might return organizer-supplied ingest settings and no viewer ID; `SportStageVideoProvider` might create a server ingest and signed playback ID. Those differences belong in capabilities returned by the adapter, not assumptions in the match model.

### 25.2 Automatic-highlight readiness

Store timeline metadata in V1, but do not create clips:

- provider live actual start time and SportStage session start/end;
- score event ID/client event ID and authoritative sequence;
- server event occurrence/commit time, broadcaster receipt time, and overlay-applied time;
- encoder presentation timestamp when the new overlay becomes active;
- reconnect/discontinuity boundaries and an ID for each media-clock segment;
- estimated video elapsed milliseconds and confidence/source.

The ideal marker is recorded by native when a score-state version first appears on an encoded frame:

```text
score event sequence 482
server committed       15:04:10.120Z
broadcaster received   15:04:10.640Z
first encoded overlay  PTS 00:38:21.366
discontinuity          3
```

Do not compute clip timestamps from current wall clock minus advertised YouTube latency. Player latency varies. Future highlight processing can align provider archive time using `provider_live_at`, encoder PTS markers, and discontinuities, then refine with provider metadata/content analysis. Cricket and racket highlight rules consume the existing domain event streams (six/four/wicket/milestone/winning shot; set/match point/winner), not text scraped from overlay video.

### 25.3 Scale path

- Replace Postgres Changes with a purpose-built broadcast-score topic only if measured fan-out/authorization warrants it; preserve sequence/snapshot protocol.
- Move reconciliation from scheduled Edge batches to a durable queue/worker when concurrency or API delays approach hosted function limits.
- Partition/archive `broadcast_events` by time only after measured volume.
- Introduce a provider capability matrix before a second provider, not before.
- A SportStage-hosted or multi-destination media plane is a separate architecture program with ingest regions, transcode, storage, CDN, moderation, and signed playback.

## 26. Repository/File-Level Changes

### 26.1 Existing files to modify

| Existing path | Modification |
|---|---|
| `app.json` | Add config plugin; camera/microphone purpose strings; remove Android blocked `RECORD_AUDIO`; add Android FGS permissions/service config through plugin; define orientation behavior/deep-link scheme. Do not enable iOS VoIP background mode. |
| `eas.json` | Add/confirm broadcast development/internal profiles and native environment configuration without secrets in source. Preserve the user's current unrelated edits. |
| `package.json` | Add local Expo module/autolinking support as generated, `react-native-webview`, scripts for native type/build checks and Edge tests. Pin native wrapper versions. |
| `app/_layout.tsx` | Register broadcast setup/production/result/viewer routes and safe modal/back behavior. |
| `app/wricket/match/[id]/live.tsx` | Add capability-aware Go Live/Watch Live-Replay entry and recording banner. |
| `app/wricket/match/[id]/score.tsx` | Add production entry/same-device handoff without duplicating cricket scoring commands. |
| `app/wricket/match/[id]/scorecard.tsx` | Add safe viewer/replay action when metadata exists. |
| `components/sports/scoring/SportCloudLiveScoreScreen.tsx` | Add shared authorized broadcast action and optionally expose embeddable compact scoring control contract. |
| `components/sports/platform/SportCloudMatchFeedScreen.tsx` | Add live/replay viewer card and recording banner. |
| `components/sports/platform/SportStageLiveScreen.tsx` | Show safe live-video badge/action from broadcast projection without per-card provider calls. |
| `components/providers/AuthProvider.tsx` | Warn/block simple logout during active local broadcast; clear local broadcast memory on final logout. Do not revoke YouTube automatically. |
| `lib/supabase/client.ts` | No secret changes; optionally add typed Edge invocation helper only. Never add service/secret keys. |
| `lib/supabase/liveMatchApi.ts` | Expose/reuse a stable snapshot-load/subscription contract and timestamps needed by cricket broadcast adapter; preserve existing consumers. |
| `lib/supabase/sportScoringApi.ts` | Expose/reuse stable feed sequence/subscription status for racket adapter; preserve event replay authority. |
| `lib/sports/scoring/presentation.ts` / `viewModel.ts` | Add only genuinely reusable presentation fields such as match/set-point indicators; no broadcast-specific scoring rules. |
| `lib/theme/*` | Add broadcast-control semantic colors/tokens; encoded native overlay tokens live in versioned broadcast theme data. |
| `.github/workflows/mobile-ci.yml` | Add Edge/function tests, config-plugin prebuild checks, and native Android/iOS compile jobs on appropriate runners. Keep existing lint/type/test gates. |
| `supabase/config.toml` | Configure authenticated functions and the OAuth callback exception intentionally; document secret-authenticated reconciler. |
| `supabase/README.md` | Add local Edge Function setup, non-secret env template names, migration/deploy/reconciliation runbook. |

The exact best cricket action component may be factored during implementation after inspecting screen boundaries; do not copy the full score screen into broadcast code.

### 26.2 New mobile TypeScript modules

```text
app/broadcast/
  setup.tsx
  [sessionId]/preview.tsx
  [sessionId]/live.tsx
  [sessionId]/ended.tsx
  youtube-result.tsx

components/broadcast/
  BroadcastSetupForm.tsx
  BroadcastPreview.tsx
  BroadcastControls.tsx
  BroadcastHealthStrip.tsx
  BroadcastEndDialog.tsx
  BroadcastScoreSheet.tsx
  MatchBroadcastCard.tsx
  YouTubePlayer.tsx

lib/broadcast/
  types.ts
  stateMachine.ts
  capabilities.ts
  qualityController.ts
  controller.ts
  secureCredentialHandoff.ts
  overlay/
    types.ts
    adapter.ts
    cricket.ts
    racket.ts
    formatters/
      cricket.ts
      tennis.ts
      badminton.ts
      padel.ts
      pickleball.ts
      tableTennis.ts
  scoreSync/
    types.ts
    cricketSource.ts
    racketSource.ts
    coordinator.ts
  api/
    broadcastApi.ts
    youtubeConnectionApi.ts
    errors.ts
  viewer/
    useMatchBroadcast.ts

lib/observability/
  index.ts
  redaction.ts
```

Use `.native.tsx`/web variants only where platform behavior differs, particularly the YouTube player and native preview. Keep domain adapters unit-testable without the Expo module.

### 26.3 New local Expo module

```text
modules/sportstage-broadcast/
  expo-module.config.json
  app.plugin.js
  src/
    SportStageBroadcastModule.ts
    SportStageBroadcastView.tsx
    types.ts
  android/src/main/java/.../
    SportStageBroadcastModule.kt
    SportStageBroadcastView.kt
    BroadcastEngine.kt
    OverlayRenderer.kt
    CredentialHolder.kt
    BroadcastForegroundService.kt
  ios/
    SportStageBroadcastModule.swift
    SportStageBroadcastView.swift
    BroadcastEngine.swift
    OverlayRenderer.swift
    CredentialHolder.swift
  plugin/
    withSportStageBroadcast.ts
  example/ or test-harness/
```

The plugin owns only generated native configuration and is idempotent. It adds exact permissions/services/plist strings, dependency pins, privacy manifest entries where required, and does not write generated `ios/`/`android/` into the source workflow unless the team later chooses to commit them.

### 26.4 New Supabase files

```text
supabase/functions/_shared/...           # described in section 10
supabase/functions/youtube-oauth/index.ts
supabase/functions/broadcasts/index.ts
supabase/functions/broadcast-reconcile/index.ts

supabase/migrations/<timestamp>_add_broadcast_domain.sql
supabase/migrations/<timestamp>_add_broadcast_permissions.sql
supabase/migrations/<timestamp>_add_broadcast_realtime_and_views.sql
supabase/migrations/<timestamp>_add_broadcast_retention.sql

supabase/tests/<timestamp>_broadcast_domain.test.sql
supabase/tests/<timestamp>_broadcast_permissions.test.sql
supabase/tests/<timestamp>_broadcast_secrets.test.sql
supabase/tests/<timestamp>_broadcast_lifecycle.test.sql
```

Do not put Edge Functions under `lib/` or a hypothetical backend package. The repository's deployed server surface is Supabase.

## 27. Database Migrations

Apply additive migrations in this dependency order:

### Migration A: domain and constraints

- Create enums, `broadcast_provider_accounts`, `private.broadcast_provider_credentials`, assignments, sessions, session health, events, operations, OAuth attempts.
- Create exact-one-match constraints, range checks, FKs, partial active-session indexes, provider-ID uniqueness, operation uniqueness.
- Enable RLS immediately on every `public` table. Revoke all access to private credential table/schema from `anon`/`authenticated`.
- Add `updated_at` triggers consistent with repository conventions.

### Migration B: capabilities and RLS

- Add private fixed-search-path helpers to resolve SportStage account from `auth.uid()` and evaluate cricket/racket contextual relationships.
- Add safe RPCs to assign/revoke broadcaster with owner/organizer checks.
- Add safe read policies: provider-account owner; assigned operator only sees selected channel metadata; session managers; spectators only through match-visibility projection.
- Edge privileged mutation uses server secret after separately checking user-context capability. Do not authorize from `raw_user_meta_data`.

### Migration C: safe projection/realtime

- Add `match_broadcasts_public` or two source-specific security-invoker views unified by a safe RPC, containing video ID/state/timestamps only.
- Add only safe session/projection tables to `supabase_realtime`. The broadcaster does not need token/credential tables in Realtime.
- Add trigger/transaction functions to append state events and publish/update match broadcast discovery metadata.

### Migration D: retention and reconciliation support

- Add operation/OAuth-attempt cleanup function and indexes for stale transitional sessions.
- Add scheduler invocation only after function secret/auth and staging tests.
- Retention proposal: OAuth attempts 24 hours; completed operation response bodies 7-30 days; sampled health current row only; lifecycle/timeline events aligned to match/video retention; revoked credential row deleted immediately except non-secret audit.

Rollback strategy:

1. Feature flag broadcast entry points off and stop reconciler schedule.
2. Do not drop tables while any YouTube session is nonterminal; reconcile/end them first.
3. Functions tolerate missing optional newer columns during staged deploy or deploy database before code.
4. Reverse grants/views/triggers before dropping schema objects. Enums require explicit dependency cleanup and are not the first rollback lever.
5. Preserve session/provider IDs/audit through the legal retention window even if UI rolls back; secrets can and should be revoked/deleted.
6. Each SQL migration gets a structural test similar to the repository's existing migration tests plus SQL authorization tests.

Example critical constraints:

```sql
check (num_nonnulls(cricket_match_id, sport_scoring_match_id) = 1)

create unique index one_active_cricket_broadcast
on broadcast_sessions (cricket_match_id)
where cricket_match_id is not null
  and status not in ('ENDED', 'CANCELLED', 'FAILED');

create unique index one_active_racket_broadcast
on broadcast_sessions (sport_scoring_match_id)
where sport_scoring_match_id is not null
  and status not in ('ENDED', 'CANCELLED', 'FAILED');
```

Never include `stream_name`, `stream_key`, `ingestion_address`, `access_token`, `refresh_token`, or `oauth_code` columns in public tables.

## 28. Implementation Phases

Every phase ends with a releasable internal artifact and explicit gate. Do not build polished UX ahead of media feasibility.

### Phase 0 - Media and policy spike

**Objective:** prove camera + changing static/synthetic overlay + H.264/AAC + RTMPS + YouTube across both platforms.

**Dependencies:** dedicated verified test channels, EAS developer credentials, representative devices, selected pinned RootEncoder/HaishinKit and/or Nitro wrapper candidate, legal license review.

**Backend work:** a temporary developer-only/manual way to supply a disposable test stream credential; no production OAuth. Document YouTube resource setup and cleanup.

**Mobile work:** local Expo module skeleton, native preview, encoder, RTMPS, GPU overlay, health events, camera/mic permissions, 480/720/1080 capabilities, test harness.

**Database work:** none.

**UI work:** engineering harness only with preview, start/stop, quality, synthetic changing score, safe redacted diagnostics.

**Tests:** 60-minute and 120-minute soaks, overlay visible in live/replay, A/V sync, reconnect/network switch, camera switch/mute, background/call/thermal, release builds, license/SBOM.

**Acceptance:** all Phase 0 criteria in section 5 pass at 720p on the support matrix; no JS frame path; no secret logs; exact dependency pins and patch ownership are documented.

**Risks:** dynamic overlay API missing, iOS mixer cost, upstream wrapper immaturity, RTMPS/SNI bugs, thermal/device codec failure. Failure blocks product implementation or narrows support.

### Phase 1 - Broadcast domain, permissions, and backend skeleton

**Objective:** establish safe provider-neutral persistence, capabilities, state machine, idempotency, and Edge architecture before Google tokens.

**Dependencies:** Phase 0 go; final V1 role/consent policy and minimum OS decision.

**Backend work:** shared auth/validation/redaction/idempotency/state modules; CREATE/UPDATE/STATUS with fake provider; reconciliation skeleton.

**Mobile work:** typed API/domain clients and controller reducer; feature flag remains internal/off.

**Database work:** Migrations A/B, RLS, operation/event transactions, provider-neutral safe projection scaffold.

**UI work:** no production camera flow; internal session inspector.

**Tests:** state-machine property/unit tests, SQL RLS/capability matrix, idempotency/race tests, secret-schema denial, Edge auth tests.

**Acceptance:** unauthorized roles cannot create/manage/end or read another channel connection; duplicate actions are stable; active session uniqueness and race handling pass.

**Risks:** two match models cause authorization gaps; server-secret bypass mistakes. Mitigate with shared capability test fixtures across both families.

### Phase 2 - YouTube OAuth and provider lifecycle

**Objective:** connect/verify/revoke a channel and prepare/start/end an unlisted test broadcast without YouTube Studio.

**Dependencies:** Google Cloud production/test projects, consent configuration, redirect/deep links, approved encryption/KMS choice, quota visibility.

**Backend work:** OAuth start/callback/result/list/verify/disconnect; token encryption/refresh; YouTube adapter; PREPARE/CLAIM/START/END/CANCEL; error mapping; reconciler.

**Mobile work:** system-browser connect flow, safe deep-link result, channel/readiness UI, API integration without native credential persistence.

**Database work:** provider account/credential usage, OAuth attempts, provider IDs, operation recovery, scheduler after staging proof.

**UI work:** connection settings and internal lifecycle status screens.

**Tests:** OAuth state/replay/revocation/expiry, Brand channel, live eligibility, quota/rate, partial create/bind, transition/end, replay readiness, raw-response redaction.

**Acceptance:** authorized tester connects, creates/binds/starts/ends through SportStage; tokens never reach client/logs; crash between provider steps reconciles; disconnect deletes the usable credential.

**Risks:** OAuth verification, channel eligibility/Brand permissions, quota, provider transition drift. Keep beta internal until verified.

### Phase 3 - Production native broadcaster

**Objective:** turn the Phase 0 engine into the stable owned module and connect it to session lifecycle.

**Dependencies:** Phases 0-2, exact YouTube ingest profiles, store permission copy, Android FGS policy.

**Backend work:** ingest claims/reissue, bounded engine reports, health upsert, provider stream-active gating.

**Mobile work:** production native module API, capability filter, in-memory credential handoff, preview/live lifecycle, camera controls, ABR, reconnect, background/interruption/thermal/battery behavior.

**Database work:** session health and claim/audit events; never stream credentials.

**UI work:** engineering production screen with three health sources.

**Tests:** native contract/config plugin, device/network matrix, no unbounded buffers, crash/recovery, 2-hour soak, release EAS builds.

**Acceptance:** device can prepare and explicitly start/end a YouTube broadcast, maintains targets, recovers transient loss, and backend/provider state stays correct through app kill.

**Risks:** Android fragmentation, iOS foreground limitations, dependency regressions. Use device gates, pins, CI native builds, and a remote feature kill switch.

### Phase 4 - Dynamic score overlay and same/separate devices

**Objective:** burn authoritative, recoverable multi-sport score state into outgoing video.

**Dependencies:** Phase 3, stable existing scoring APIs, overlay visual tokens/golden designs.

**Backend work:** safe detailed snapshot RPC only if existing APIs cannot provide required authorized state; no new scoring writes. Timeline marker ingestion.

**Mobile work:** score-source coordinator; cricket/racket adapters; six formatters; three templates; native display-list serializer/renderer; same-device score-sheet integration where safe.

**Database work:** optional safe score projection/RPC and marker fields; reuse scoring sequences/events.

**UI work:** template picker, score connection/stale state, overlay toggle, compact scoring sheet.

**Tests:** golden overlays for all match phases/sports/resolutions/names; duplicate/out-of-order/gap/reconnect; same/separate-device field session; YouTube replay burn-in proof.

**Acceptance:** healthy separate-device score commit appears in encoded output within target; missed Realtime recovers to latest snapshot; no rule duplication; all enabled sports pass golden state suite.

**Risks:** insufficient racket snapshot shape, race with cricket local-first optimistic state, text/layout complexity. Solve in adapters/projections, not duplicate reducers.

### Phase 5 - Broadcaster and viewer product UX

**Objective:** deliver Match -> Live Video -> Setup -> Preview -> Go Live -> End -> Replay and spectator playback.

**Dependencies:** Phases 2-4, approved consent/privacy copy, player policy implementation.

**Backend work:** safe current/replay projection, replay processing/embeddability checks, match association, user-safe errors.

**Mobile work:** shared Router routes, controller recovery, navigation guards, WebView/IFrame viewer and external fallback, feature flags.

**Database work:** public projection/realtime migration, visibility policies.

**UI work:** setup/preview/live/end screens, match action/cards, recording indicator, spectator live/replay states, accessibility.

**Tests:** route/role/visibility matrix, private/unlisted/public copy, autoplay/fullscreen/ads/controls, process recreation, logout, accessibility and localization-ready truncation.

**Acceptance:** an authorized organizer completes the full flow without Studio; a permitted spectator watches live then replay; hidden/private matches do not leak safe video IDs outside policy.

**Risks:** embedded private video/auth, policy violations, route unmount during stream. Keep external fallback and robust guard.

### Phase 6 - Reliability, observability, and controlled beta

**Objective:** make failure visible, recoverable, measurable, and supportable under real field conditions.

**Dependencies:** end-to-end product flow, telemetry vendor, support/on-call owners, dedicated beta competitions.

**Backend work:** production reconciliation schedule, alerts/dashboards, quotas/rate limits, retention, operator tools, kill switch.

**Mobile work:** final ABR heuristics, network/battery/thermal UX, redacted diagnostics, remote config/denylist, crash recovery.

**Database work:** retention jobs and operational indexes based on query plans/volume.

**UI work:** actionable failure copy, health sheet, reauth/retry/handoff/end recovery.

**Tests:** full chaos/network/device/soak matrix, penetration/privacy review, store pre-review, 20+ supervised real matches across carriers/devices before wider rollout.

**Acceptance:** performance/SLO targets met; no critical secret/privacy findings; quota budget supports rollout; support can diagnose by correlation ID without credentials.

**Risks:** field networks/heat and failure-tail behavior. Roll out by feature flag/device capability/competition cohort.

### Phase 7 - Multi-sport release hardening

**Objective:** graduate each sport and portrait/advanced overlays only after sport-specific quality proof.

**Dependencies:** stable beta metrics and golden fixture coverage.

**Backend work:** no provider redesign; only safe metadata/policy extensions.

**Mobile work:** formatter polish, rare states, orientation where approved, device-specific fixes.

**Database work:** none unless measured query/index need.

**UI work:** sport-specific labels and visual QA, not divergent workflows.

**Tests:** full event/rule matrices, real matches per sport, long names/doubles/rare completions, replay review.

**Acceptance:** every enabled sport meets the same reliability/performance/privacy gates; feature flags permit independent rollback.

**Risks:** rare scoring formats and rollout scope. Enable sport by sport rather than a single all-or-nothing launch.

## 29. Failure Matrix

| Failure | Broadcaster/viewer experience | Automatic recovery | Operator action / durable result |
|---|---|---|---|
| Camera permission denied | Setup explains camera is required; no preview | None | Open Settings/retry; no provider resource before consent when possible. |
| Microphone denied | Offer silent stream only if policy/product approves; otherwise block | Re-check on foreground | Settings/retry; audit permission category, never user content. |
| Unsupported encoder/profile | Unsupported quality hidden or clear capability error | Fall back 1080->720->480 before prepare | Choose supported profile; no crash. |
| YouTube OAuth cancelled | Return to channel card unchanged | None | Reconnect later. |
| OAuth state expired/replayed | Generic secure restart message | None | Start a new flow; log safe security event. |
| Refresh token expired/revoked | `Reconnect YouTube`; existing match/scoring unaffected | One serialized refresh attempt | Reauthorize; connection `REAUTH_REQUIRED`. |
| Wrong/changed YouTube channel | Show expected versus returned safe channel label | Verify on OAuth completion/status | Confirm new connection; never silently retarget session. |
| Channel live not enabled | Readiness card gives activation instructions | Re-verify manually/later | Activate/verify channel; may take up to 24h. |
| Channel restricted/age blocked | Clear YouTube eligibility error | None | Use eligible authorized channel; no bypass. |
| Concurrent-live limit | Setup/start blocked with provider reason | Recheck after other stream ends | End other broadcast or choose another eligible channel. |
| YouTube quota exhausted | Preparation/status unavailable; active RTMP may continue | Backoff; reconciler resumes after quota | Do not spam retry; alert operations/request quota. |
| Partial broadcast create | Preparing/recovery message | Saga adopts/cleans provider resource | Retry same idempotency key; no duplicate hidden resources. |
| Bind rejected | Setup fails before credential issue | Bounded safe reconciliation | Recreate provider attempt if terminal; retain audit. |
| RTMP TLS/connect rejected | Preview stays local; `Video: Can't connect` | Jittered retry | Verify endpoint/config/channel; user can cancel. |
| YouTube stream no data | Go Live disabled, actionable connection status | Poll briefly; RTMP retry | Check uplink/profile; retry without creating duplicate. |
| YouTube transition invalid/stuck | `YouTube could not go live` | Re-read status; operation reconcile | If stuck per provider guidance, cancel attempt and create new resource set. |
| Weak upload | `Network: Weak`, bitrate/drops shown | ABR reduces bitrate within floor | Accept degraded quality or end/restart Data Saver. |
| Temporary RTMP loss | Video chip `Reconnecting`; score may remain connected | Bounded retry, drop stale packets, new IDR | Retry/End after budget; replay contains a gap. |
| Network interface switch | Short reconnect indicator | Immediate reconnect then backoff | None if recovered. |
| Long total internet loss | Last overlay/preview local; provider status unknown | Client retry + backend watchdog | Recover before grace or authorized end; durable reason. |
| Score Realtime lost only | Video continues; last score + reconnecting/stale badge | Recreate subscription, snapshot; 15s fallback poll | Hide overlay if desired; never enter score manually as broadcaster. |
| Duplicate/out-of-order score notice | No visible regression | Ignore lower/equal sequence; reload snapshot | None. |
| Score lease/conflict | Same-device scorer shows existing conflict; overlay last accepted | Existing scoring recovery | Resolve through existing scorer workflow. |
| App background Android | Persistent broadcast notification and live warning | FGS maintains short/background stream where OS allows | Return to production screen; OS kill follows crash recovery. |
| App background iOS | Video interruption/reconnecting warning on return | Reopen camera/RTMP in foreground | Return promptly or end; do not promise background video. |
| Incoming call | Audio interrupted/silenced; possibly reconnect video | OS interruption callbacks | Resume/reconnect after call. |
| Critical thermal | Prominent countdown/safe stop | Bitrate reduction first; then end | Cool device; replay persists to last provider data. |
| Low battery/device shutdown | Warnings; sudden shutdown possible | Watchdog/reconcile | Recover on another device or backend ends after grace. |
| App crash/force kill | YouTube may show no data; viewers see reconnecting/gap | Backend sees missed heartbeat; native/session recovery on reopen | Authorized recovery/ingest reissue or end; no local key restore. |
| Assignment revoked live | Operator controls become restricted; avoid abrupt unsafe cut | Backend denies next mutation/credential refresh | Owner ends/takes over; policy decides existing local grace. |
| Match completes before stream | Prompt `Match ended - end video?` | No automatic immediate end | Broadcaster/owner ends; watchdog policy later. |
| End API temporarily fails | Keep media running with `Finishing failed - Retry` | Same idempotency key/reconciler | Retry; optional force local stop with clear warning. |
| Client stops before YouTube complete | Viewer may remain no-data/processing | Reconciler completes provider | Durable `FORCE_LOCAL_STOPPED`, eventual terminal status. |
| Replay processing delayed | `Replay processing` | Low-frequency status reconciliation | Open YouTube later; alert if beyond threshold. |
| Embed disabled/private player error | In-app explanation | Detect safe player/provider result | Open in YouTube if permitted. |
| Supabase unavailable, RTMP healthy | Video can continue; score becomes stale; controls degraded | Retry control/score independently | Do not end solely on control-plane outage; recovery/end when back. |
| Telemetry unavailable | No user impact | Bounded queue/drop; never block media | Lifecycle state remains in DB where possible. |

## 30. Architecture Decisions

### ADR-1: YouTube instead of SportStage-hosted video

**Decision:** YouTube owns V1 ingest, transcode, CDN, DVR, recording, replay, and player.

**Alternatives considered:** self-hosted media stack, commercial video API, external Larix-only workflow.

**Why:** smallest infrastructure/operational surface and familiar viewing while SportStage proves product demand.

**Trade-offs:** YouTube branding/ads/policy, OAuth verification, quota, channel eligibility, playback privacy limitations, less latency/control.

**Future impact:** provider-neutral session and adapter permit a later service; media capabilities must be modeled rather than assumed.

### ADR-2: RTMPS direct from device

**Decision:** the broadcaster publishes directly to YouTube RTMPS.

**Alternatives considered:** SportStage proxy/restream server, RTMP without TLS, launching an external broadcaster app.

**Why:** avoids SportStage media bandwidth/latency/cost and protects media in transit while retaining an in-app workflow.

**Trade-offs:** ingest credential necessarily enters authorized device memory; mobile uplink determines quality; no server-side restream/multi-destination.

**Future impact:** a multi-destination feature needs a distinct relay/media-plane program.

### ADR-3: Burned-in native score overlay

**Decision:** compose score before hardware encode in native GPU pipeline.

**Alternatives considered:** React Native overlay only over local/player view; server-side composition; screen capture of RN UI.

**Why:** YouTube live and replay must both contain the score; native composition avoids JS frame cost and server media proxy.

**Trade-offs:** Kotlin/Swift renderer work and golden cross-platform visual tests; graphic changes need native-aware release.

**Future impact:** versioned display-state/templates support graphics evolution and highlight timestamp markers.

### ADR-4: Existing Realtime as invalidation plus authoritative snapshot

**Decision:** reuse Supabase Postgres Changes and current score APIs; sequence and reload make delivery resilient.

**Alternatives considered:** new WebSocket service, send complete overlay JSON in every score event, poll only.

**Why:** aligns with `liveMatchApi`/`sportScoringApi`, avoids duplicate scoring/realtime systems, and handles missed/out-of-order messages.

**Trade-offs:** reloads cost more than applying every delta; racket feeds may need a structured safe snapshot optimization later.

**Future impact:** transport can change without changing envelope/sequence/snapshot semantics.

### ADR-5: Owned Expo module over a direct third-party React Native API

**Decision:** own `sportstage-broadcast`; wrap pinned RootEncoder and HaishinKit, using the Nitro wrapper only as evaluated source/accelerator.

**Alternatives considered:** direct Nitro dependency, api.video wrapper, fully custom codecs/RTMP, leaving Expo.

**Why:** exact overlay, credential, lifecycle, telemetry, and New Architecture needs require a stable SportStage boundary; underlying native engines are mature.

**Trade-offs:** native expertise and maintenance burden; upstream integration patches belong to SportStage.

**Future impact:** engines can be replaced behind one JS contract; Expo CNG/EAS remains viable.

### ADR-6: Thin provider abstraction

**Decision:** one server-side interface with a single YouTube adapter and normalized capability/status types.

**Alternatives considered:** YouTube fields throughout domain/mobile; comprehensive plugin framework today.

**Why:** avoids lock-in without speculative tables/configuration.

**Trade-offs:** second provider will refine the interface; not every YouTube concept has a universal mapping.

**Future impact:** add capability-specific behavior, migrations, and adapter contract tests when a real second provider is funded.

### ADR-7: Server-only YouTube credentials

**Decision:** OAuth code exchange/refresh/revocation and tokens stay in Edge Functions/private encrypted storage; client receives only per-session ingest credentials.

**Alternatives considered:** Google SDK/token store on device, plaintext Postgres token, client Data API calls.

**Why:** limits token theft/blast radius and centralizes permission/quota/audit/revocation.

**Trade-offs:** backend/KMS and OAuth callback/reconciliation complexity; broadcaster still necessarily sees the stream name in process memory.

**Future impact:** provider account grants/handoff remain server governed.

### ADR-8: Separate-device first, same-device via embedded commands

**Decision:** optimize for a separate camera operator; same-device keeps camera mounted and embeds existing scoring commands in a compact sheet.

**Alternatives considered:** require two devices always; route to the full scorer; reimplement score controls in broadcast module.

**Why:** separate device is operationally reliable, while embedded delegation supports low-resource matches without a second rules engine.

**Trade-offs:** same-device UI/camera/thermal load and sport-by-sport integration complexity; some sports may initially recommend two devices.

**Future impact:** a remote director or dedicated graphics operator naturally extends the separate-device model.

## 31. Risks & Mitigations

| Rank | Risk | Mitigation / gate |
|---|---|---|
| CRITICAL | Native overlay/RTMPS engine is unstable or cannot burn dynamic overlays efficiently on both platforms | Phase 0 go/no-go before product/backend polish; own wrapper; pin/fork; two-hour soak and YouTube replay proof; narrow device/quality scope if needed. |
| CRITICAL | OAuth token or stream credential leakage | Server-only OAuth, encrypted private store, fresh non-reusable streams, in-memory one-use handoff, typed redaction, secret-pattern tests, native dependency log audit, revocation incident runbook. |
| HIGH | Google OAuth sensitive-scope verification delays/denial | Start consent/verifications in Phase 0; accurate home/privacy/domain/demo/test users; use minimum scope; no public launch dependency hidden until late. |
| HIGH | Channels are not live-enabled, are restricted, or Brand/delegate behavior surprises users | Readiness flow days before match, actionable errors, dedicated test accounts, explicit channel-ID verification, document delegates unsupported. |
| HIGH | YouTube quota exhausted or method cost assumptions wrong | Measure current method costs, transition-only polling, caching/backoff, quota dashboards/alerts, request audit/increase before rollout. |
| HIGH | Poor uplink causes gaps/unwatchable video | 720p default, upload preflight and 1.5x headroom, ABR/hysteresis, Data Saver, short reconnect/drop buffering, independent score/video UI, field carrier beta. |
| HIGH | Android hardware/OS fragmentation | Capability probe, hardware codec denylist/remote flags, broad device lab, vendor/SoC telemetry, native release CI, 1080 capability gate. |
| HIGH | Battery drain/thermal shutdown in outdoor matches | Hardware codecs/GPU composition, 720p30 default, thermal ABR and critical safe stop, brightness guidance, long outdoor/charging soaks. |
| HIGH | iOS background behavior contradicts user expectations | Foreground-only product contract, visible warnings/privacy cover, reconnect flow, no VoIP misuse, no claim of parity with Android FGS. |
| HIGH | State races create duplicate/stuck YouTube resources | Durable state/version, idempotency key/request hash, operation saga, early provider-ID persistence, scheduled reconciliation and partial-create tests. |
| HIGH | Broadcast leaks a private match or records minors without valid consent | Conservative privacy default, explicit attestation/banner, contextual permission separate from scoring, block/ack privacy mismatch, legal review/takedown process. |
| MEDIUM | Score overlay is stale/wrong after missed events | Existing sequence, invalidation+snapshot, lower-sequence rejection, subscribe-load race closure, polling fallback, visible stale state. |
| MEDIUM | New native dependency conflicts with Expo/RN upgrades | Local abstraction, exact pins, CNG plugin tests, native build matrix, planned upgrade qualification; do not upgrade Expo and media engines together near release. |
| MEDIUM | Embedded YouTube player violates policies or fails private videos | IFrame/WebView minimum functionality, no overlay/control obstruction/autoplay, external fallback, policy test checklist. |
| MEDIUM | Edge Functions are insufficient for sustained reconciliation | Short bounded actions, scheduled batches, measure plan limits; migrate only reconciler to durable worker/queue if needed. |
| MEDIUM | Same-device scoring destabilizes camera or duplicates logic | Keep camera route mounted, delegate to existing command services, enable sport by sport, recommend separate device when not safe. |
| MEDIUM | Low-adoption Nitro wrapper becomes unmaintained | Do not bind product to its API; audit/use as source only, own wrapper, use mature underlying engines, maintain fork capability. |
| LOW | Overlay styling diverges across platforms | One serialized display model/theme version, native golden snapshots at target resolutions, shared design tokens. |
| LOW | Viewer counts or replay readiness are delayed | Treat as optional/eventually consistent; never block end; omit misleading values. |

## 32. Open Questions

The following cannot be established from the repository or stable official contracts and must be resolved explicitly:

### Product and policy

- **OPEN QUESTION:** launch countries, recording/child-safety legal requirements, organizer consent text, guardian process, takedown owner/SLA, and privacy-controller roles.
- **OPEN QUESTION:** whether private SportStage matches may use Unlisted YouTube, must use Private, or are prohibited from V1 broadcast.
- **OPEN QUESTION:** default replay retention and whether disconnect/account deletion should attempt deleting YouTube videos or only revoke SportStage access.
- **OPEN QUESTION:** whether scorers/officials can ever inherit broadcast capability by competition policy; this plan defaults to explicit assignment.
- **OPEN QUESTION:** exact same-device sport coverage at launch versus recommended two-device operation.
- **OPEN QUESTION:** portrait is V1 or V1.1 after spike; the architecture supports it, but landscape is the reliability default.

### Platform and devices

- **OPEN QUESTION:** minimum iOS/Android versions and current production device/SoC/RAM distribution. HaishinKit 2.2.x implies iOS 15+.
- **OPEN QUESTION:** target Android FGS behavior: long background continuation or only short accidental-background grace, and resulting Play declaration.
- **OPEN QUESTION:** approved native dependency/fork ownership, vulnerability/SBOM process, and engineer responsible for Kotlin/Swift maintenance.
- **OPEN QUESTION:** whether the Nitro publisher passes SportStage's overlay, RTMPS, thermal, adoption, and transitive-license spike; no documented dynamic overlay API was found.

### Google/YouTube

- **OPEN QUESTION:** Google production OAuth verification approval/timeline and verified-domain/privacy readiness.
- **OPEN QUESTION:** real Brand Account/multiple-channel selection behavior for target accounts; delegated channel permissions do not support API access.
- **OPEN QUESTION:** production channel eligibility distribution and process to activate live streaming at least 24 hours before matches.
- **OPEN QUESTION:** approved YouTube daily quota, current per-method costs, concurrent stream limits, and requested launch headroom.
- **OPEN QUESTION:** measured no-data timeout/recovery behavior, stuck-transition frequency, low-latency end-to-end delay, and replay-ready delay.
- **OPEN QUESTION:** embedded Private video authentication on target Android/iOS/web viewer flows.
- **OPEN QUESTION:** organizer policy/UI for the YouTube made-for-kids setting.

### Infrastructure and operations

- **OPEN QUESTION:** KMS versus Supabase Vault, key rotation/incident response, secret retention, and data residency.
- **OPEN QUESTION:** Supabase plan, Edge/Realtime/cron limits, project region, backup/restore behavior for private encrypted tokens.
- **OPEN QUESTION:** telemetry/crash/alert vendor, on-call ownership, log retention/residency, and production baseline SLOs.
- **OPEN QUESTION:** expected concurrent broadcasts, duration, score-event volume, viewers, and rollout cohorts needed for cost/quota sizing.
- **OPEN QUESTION:** whether an in-app/push notification delivery system will be available for watchdog/operator alerts; none was found.

## 33. Final Recommended Implementation Sequence

1. Approve V1 boundaries: YouTube only, landscape default, separate-device first, Unlisted default, explicit broadcaster assignment, iOS foreground-only.
2. Start Google Cloud/OAuth verification, channel readiness, privacy/legal, and store-policy tracks immediately; they run in parallel with engineering and can block launch.
3. Execute Phase 0 on the existing Expo 54/New Architecture app. Prove native dynamic burn-in to YouTube live/replay on both platforms before adding production schema/UX.
4. Record the exact engine decision and dependency pins. If using Nitro source, wrap/fork it; keep the SportStage-owned module API.
5. Add broadcast domain migrations, contextual capabilities/RLS, state machine, operations, audit, and fake-provider Edge tests.
6. Implement server-only YouTube OAuth/provider adapter, encrypted refresh-token storage, explicit prepare/start/end, error normalization, and reconciliation.
7. Connect the native module to one-time ingest claims, health reporting, ABR/reconnect, and lifecycle recovery.
8. Build score adapters on existing `liveMatchApi` and `sportScoringApi`; ship cricket and tennis fixtures first to prove both domain families, then complete four other formatters.
9. Add three native overlay templates and golden tests at 480p/720p/1080p; prove changing scores in the actual YouTube replay.
10. Build shared setup/preview/live/end routes and match entry points. Add same-device compact scoring only through existing command services.
11. Add RLS-safe current/replay projection and policy-compliant embedded YouTube viewer with external fallback.
12. Add telemetry/redaction, reconciliation alerts, chaos/network/device/thermal tests, operator runbooks, and remote kill flags.
13. Run supervised internal and closed beta matches; gate by native version, device capability, competition cohort, and sport.
14. Enable sports and advanced quality/orientation incrementally only after their acceptance/SLO evidence passes.

# Implementation Checklist

## Phase 0 - Technical feasibility

- [ ] Confirm V1 product, privacy, orientation, role, and OS-support decisions.
- [ ] Create dedicated verified YouTube test channels and measure activation lead time.
- [ ] Start Google OAuth consent/verification and legal/store policy workstreams.
- [ ] Audit/pin RootEncoder, HaishinKit/RTMPHaishinKit, and the Nitro candidate; produce SBOM/license record.
- [ ] Scaffold the local Expo module and idempotent config plugin in a branch.
- [ ] Prove release-build camera/mic -> GPU overlay -> H.264/AAC -> RTMPS -> YouTube on Android.
- [ ] Prove the same pipeline on iOS.
- [ ] Prove dynamic overlay changes in live output and replay, not only local preview.
- [ ] Pass reconnect, camera switch, mute, A/V sync, 60/120-minute, battery, and thermal tests.
- [ ] Record go/no-go, exact dependency commits, supported devices/profiles, and remaining native patches.

## Phase 1 - Domain and authorization

- [ ] Add provider/session/assignment/health/event/operation/OAuth-attempt migrations.
- [ ] Add exact-one-match, partial-active-session, provider-ID, range, and idempotency constraints.
- [ ] Add private credential schema and prove client roles cannot access it.
- [ ] Add contextual start/manage/end capability helpers for cricket and racket models.
- [ ] Add assignment/revocation RPCs and audit events.
- [ ] Add complete RLS and SQL authorization/race tests.
- [ ] Implement and test the provider-neutral state machine and expected-version transitions.
- [ ] Implement shared Edge auth, validation, idempotency, redaction, and safe errors with a fake provider.

## Phase 2 - YouTube control plane

- [ ] Configure separate development/staging/production Google OAuth clients and exact redirect URIs.
- [ ] Implement OAuth start/state/callback/result/list/verify/disconnect.
- [ ] Implement approved envelope encryption/Vault access and refresh serialization/rotation.
- [ ] Implement `channels.list` channel resolution/readiness and Brand/multiple-channel tests.
- [ ] Implement YouTube create broadcast/create stream/bind/status/transition/complete/delete adapter.
- [ ] Apply recommended DVR/embed/privacy/latency/auto-start/auto-stop defaults.
- [ ] Implement saga/idempotency recovery for every partial provider mutation.
- [ ] Implement one-session ingest claim/reissue without DB/local/log persistence.
- [ ] Implement bounded reconciliation, quota-safe polling, and provider error mapping.
- [ ] Pass unlisted end-to-end lifecycle, revocation, quota, restriction, and replay tests.

## Phase 3 - Native production broadcaster

- [ ] Finalize stable `sportstage-broadcast` JS/native API and capability discovery.
- [ ] Add camera/microphone permission copy and remove Android audio block.
- [ ] Implement Android RootEncoder surface/compositor/FGS/RTMPS integration.
- [ ] Implement iOS HaishinKit mixer/compositor/RTMPS integration without VoIP misuse.
- [ ] Implement secure native credential holder and redacted error/log paths.
- [ ] Implement camera switch, focus/zoom, mute-as-silence, orientation lock, and cleanup.
- [ ] Implement native health, battery, thermal, interruption, and connection events.
- [ ] Implement adaptive bitrate hysteresis and bounded reconnect/no-long-buffer policy.
- [ ] Add CNG/config-plugin idempotency and Android/iOS native compile CI.
- [ ] Pass device/network/soak/crash/recovery release-build gates.

## Phase 4 - Score and overlay

- [ ] Define/freeze `BroadcastOverlayStateV1` and versioned native display model.
- [ ] Implement cricket adapter from `liveMatchApi`/authoritative snapshot.
- [ ] Implement racket adapter from `sportScoringApi` and existing replay/view model.
- [ ] Implement subscribe-load ordering, sequence rejection, coalescing, reconnect, and polling fallback.
- [ ] Implement six sport formatters without score-rule duplication.
- [ ] Implement Minimal, Broadcast, and Compact native templates.
- [ ] Add safe areas, truncation, contrast, font-size, missing-asset, and portrait-ready layout rules.
- [ ] Add score connected/reconnecting/stale indicators while retaining last confirmed score.
- [ ] Add encoder-PTS/score-sequence/discontinuity timeline markers.
- [ ] Add same-device scoring sheet only through existing command services.
- [ ] Pass all-sport golden/state/reconnect tests and YouTube replay burn-in verification.

## Phase 5 - Product UX and viewer

- [ ] Add shared Expo Router setup/preview/live/ended/OAuth-result routes.
- [ ] Add capability-aware Live Video actions to cricket and shared racket match surfaces.
- [ ] Add recording consent, channel readiness, privacy explanations, quality, orientation, and template setup.
- [ ] Make preview use the actual native composition pipeline and preflight gates.
- [ ] Add uncluttered live controls and independent Video/Score/YouTube health.
- [ ] Add navigation, logout, app-state, end-confirmation, and crash-recovery guards.
- [ ] Add safe public/current/replay projection governed by existing match visibility.
- [ ] Add policy-compliant IFrame/WebView viewer and external YouTube fallback.
- [ ] Add match recording indicator, live/reconnecting/replay-processing/replay states.
- [ ] Pass permissions, roles, visibility, accessibility, player policy, and deep-link tests.

## Phase 6 - Reliability and launch

- [ ] Select/configure telemetry, crash reporting, dashboards, and alert routing.
- [ ] Implement centralized structured telemetry and automated secret-redaction tests.
- [ ] Enable production reconciler schedule, stale-state alerts, retention, and cleanup.
- [ ] Create support diagnostics/runbooks for auth, quota, RTMP, stuck states, and takedown.
- [ ] Add remote feature flags/kill switch by platform, native version, device, sport, and cohort.
- [ ] Complete threat model, penetration review, privacy/legal review, OAuth verification, and store declarations.
- [ ] Measure YouTube quota and request approved headroom before rollout.
- [ ] Run full network chaos, carrier, device fragmentation, heat, battery, call/background, and two-hour tests.
- [ ] Run at least 20 supervised real-match beta sessions across representative sports/carriers/devices.
- [ ] Verify performance/SLO and crash-free/ANR targets before expanding the cohort.
- [ ] Enable one sport/cohort at a time with a documented rollback/end-active-session procedure.

## V1.1/future readiness

- [ ] Validate portrait production and controlled resolution downshift before enabling them.
- [ ] Define sponsor asset/content policy before sponsor overlays.
- [ ] Add operator handoff with explicit credential-claim revocation.
- [ ] Add push alerts only after a real device-token/delivery subsystem exists.
- [ ] Retain score-event/encoder-PTS/discontinuity metadata and validate highlight alignment, without generating V1 clips.
- [ ] Revisit the provider interface only when a funded second provider has concrete capability requirements.
