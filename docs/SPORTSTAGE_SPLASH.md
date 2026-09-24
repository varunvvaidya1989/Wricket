# SportStage launch screen

The startup design uses the existing `sportstage-mark-rounded-512.png` asset, the app's green accent, and Space Grotesk typography. No new logo, bitmap artwork, font or runtime dependency is introduced.

Previews: [phone](splash/mobile.png), [desktop](splash/desktop.png), [landscape](splash/landscape.png).

## Visual design

- Deep green-black background (`colors.bg`, `#0B100E`) with faint track outlines and small corner marks.
- Centered brand tile in a lightly rotated outline, followed by a white/green SportStage wordmark.
- “Every sport. One stage.” tagline; all six sports listed below the loading indicator.
- Compact composition for short screens and landscape; safe-area spacing for native devices.
- A 680 ms entrance and 220 ms exit, with a small indeterminate activity rail while the session loads. The rail does not imply measured progress.
- Reduced-motion mode presents the static composition and removes the entrance/exit delay.

## Startup behavior

The native launch screen uses the same logo asset and background, with a 144-point image. It remains in place while fonts load and hides when the React launch boundary has laid out.

`SportStageLaunchBoundary` wraps the existing access gate. Session restoration and route preparation now run while the introduction plays, replacing the previous 1.5-second wait before authentication initialization. The splash exits once the introduction and initial session check finish, including when that check returns an error. Navigation within the mounted app does not replay the introduction.

The underlying application cannot receive taps or accessibility focus while covered by the splash. Animation loops and system accessibility subscriptions are cleaned up on unmount. The global page/section loaders are unchanged.

## Files

- `components/branding/AnimatedSportStageSplash.tsx`: responsive artwork, motion and reduced-motion support.
- `components/branding/SportStageLaunchBoundary.tsx`: startup overlay and native splash handoff.
- `app/_layout.tsx`: launch boundary integration; fonts and existing route configuration preserved.
- `components/providers/RootAccessGate.tsx`: launch rendering delegated to the boundary; route authorization unchanged.
- `app.json`: native splash background and logo size.

## Release verification

Verified with `npm run build:check`: lint, TypeScript, all 522 tests, configuration/architecture checks and the production web export passed. Browser checks passed for delayed authentication, a normal signed-in launch, failed-session recovery, reduced motion and navigation without replaying the splash. Layouts were checked at 390 x 844, 320 x 568, 844 x 390 and 1440 x 1000, with no viewport overflow or browser runtime errors. Authentication responses were mocked for these checks.

Native splash configuration is compiled into the app; verify Android cold start, warm start and deep links in the next installed preview/production build. Browser screenshots validate the React splash, not the Android system launch screen. Expo Go does not reproduce the standalone launch experience accurately; see [Expo's splash-screen guidance](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).
