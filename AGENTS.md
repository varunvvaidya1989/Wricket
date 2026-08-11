# Repository Guidelines

## Project Structure & Module Organization

This is an Expo Router React Native application. Route screens live in `app/`; paths define navigation, including dynamic segments such as `app/wricket/match/[id]/`. Reusable views belong in `components/`, with feature-specific UI under `components/wricket/`. Keep business logic in `lib/`, hooks in `hooks/`, and design tokens in `constants/` or `lib/theme/`. Static files are under `assets/`; Supabase configuration and timestamped migrations are in `supabase/`. Tests are colocated as `*.test.ts`.

## Build, Test, and Development Commands

- `npm ci` installs locked dependencies (CI uses Node 20).
- `npm start` launches the Expo development server; use `npm run android`, `ios`, or `web` for a target platform.
- `npm run lint` applies the Expo ESLint configuration.
- `npm run typecheck` checks strict TypeScript without emitting files.
- `npm test` runs the Vitest suite once; `npm run test:watch` supports local iteration.
- `npm run build:check` runs the full CI gate: lint, types, tests, project checks, and web export.

## Coding Style & Naming Conventions

Write strict TypeScript and functional React components. Follow two-space indentation, single quotes, and semicolons; use the Expo ESLint configuration for enforcement. Use `PascalCase` for components and providers, `camelCase` for functions and hooks, and `kebab-case` for multiword routes. Prefer the `@/` alias over deep relative imports. Platform variants use `.native.tsx`, `.ios.tsx`, or `.web.ts`.

## Testing Guidelines

Vitest is the test runner. Place focused `*.test.ts` files beside their modules, as in `lib/wricket/domain/scoring.test.ts`. Add regression tests for domain rules, migrations, synchronization, and validation changes. There is no numeric coverage threshold; cover meaningful behavior. Run `npm test` while developing and `npm run build:check` before opening a pull request.

## Commit & Pull Request Guidelines

Recent commits use concise, imperative summaries such as `Add scoring session schema` and `Fix AdMob Kotlin compatibility`. Keep commits scoped. Pull requests should explain the outcome, risks, and validation; link issues and include screenshots or recordings for UI changes. Highlight new environment variables or migrations. Ensure Mobile CI passes before review.

## Security & Configuration

Copy `.env.example` for local setup and never commit private credentials. Only client-safe values may use `EXPO_PUBLIC_`. Do not edit applied database migrations; add a new timestamped migration, and review row-level security changes carefully.
