# SportStage

**SportStage** is a comprehensive sports application platform built with Expo Router and React Native, designed to support multiple racket sports including Tennis, Badminton, Padel, Table Tennis, and Pickleball, with a separate cricket domain.

## Project Overview

SportStage provides a full-featured platform for managing sports competitions, clubs, teams, matches, and MVP (Most Valuable Player) calculations. The application is structured with sport-specific routes under `app/` and shared business logic in `lib/`.

**Key Features:**
- Multi-sport support: Tennis, Badminton, Padel, Table Tennis, Pickleball
- Cricket domain with separate database model
- Club and team management with member invitations and rosters
- Competition and match scheduling
- Sport-specific scoring engine with singles/doubles support
- MVP calculation system with batting, bowling, and fielding statistics
- Feature flags and account-backed participants
- Row-level security (RLS) with Supabase integration
- Web export support for desktop access

## Project Structure

```
app/                    # Expo Router routes (file-based navigation)
  app/                  # Base layout
  badminton/            # Badminton sport module
  padel/                # Padel sport module
  pickleball/           # Pickleball sport module
  table-tennis/         # Table Tennis sport module
  tennis/               # Tennis sport module
  wricket/              # Cricket domain module
  _layout.tsx           # Root layout
  account.tsx           # Account management
  auth.tsx              # Authentication
  ...

components/             # Reusable UI components
  wricket/              # Wricket-specific components
  external-link.tsx
  haptic-tab.tsx
  ...

lib/                    # Business logic
  wricket/              # Cricket domain logic
    domain/
    scoring.test.ts
  sports/               # Sport-specific logic
  theme.ts              # Design tokens
  auth/                 # Authentication logic
  maps/                 # Map integration
  supabase/             # Supabase configuration

supabase/               # Supabase configuration
  config.toml
  migrations/           # Database migrations
  README.md

docs/                   # Documentation
  non-cricket-sports-implementation-roadmap.md  # Phase status
  MVP.md                # MVP calculation formulas
  google-play-release.md
  MVP.md

scripts/                # Utility scripts
  check-architecture.js
  check-env.js
  migrate-auction-yodha-players.mjs
  recalculate-mvp.mjs
  reset-project.js
```

## Build, Test, and Development Commands

| Command | Description |
|---------|-------------|
| `npm ci` | Installs locked dependencies (CI uses Node 20) |
| `npm start` | Launches the Expo development server |
| `npm run android` | Starts app on Android |
| `npm run ios` | Starts app on iOS |
| `npm run web` | Starts app on web |
| `npm run lint` | Applies Expo ESLint configuration |
| `npm run typecheck` | Checks strict TypeScript without emitting files |
| `npm test` | Runs the Vitest suite once |
| `npm run test:watch` | Supports local iteration with Vitest |
| `npm run build:check` | Full CI gate: lint, types, tests, env checks, architecture, and web export |

## Key Scripts

- `npm run reset-project` - Moves starter code and creates blank app directory
- `npm run migrate:auction-yodha-players` - Runs database migration
- `npm run recalculate-mvp` - Recalculates MVP points for matches
  ```bash
  npm run recalculate-mvp -- --match <id>
  npm run recalculate-mvp -- --tournament <id> --batch-size 50
  npm run recalculate-mvp -- --all --batch-size 50
  ```
- `npm run check:env` - Validates environment variables
- `npm run check:architecture` - Validates project architecture

## Coding Style & Naming Conventions

- **TypeScript**: Strict mode enabled
- **Components**: `PascalCase`
- **Functions/Hooks**: `camelCase`
- **Routes**: `kebab-case`
- **Indentation**: Two spaces
- **Quotes**: Single quotes
- **Imports**: Prefer `@/` alias over deep relative imports
- **Platform variants**: `.native.tsx`, `.ios.tsx`, or `.web.ts`

## Testing Guidelines

- **Test runner**: Vitest
- **Test placement**: Colocated `*.test.ts` files beside their modules
- **Example**: `lib/wricket/domain/scoring.test.ts`
- **Coverage**: No numeric threshold; cover meaningful behavior
- **Test types**: Domain rules, migrations, synchronization, validation changes
- Run `npm test` while developing and `npm run build:check` before opening a pull request

## Commit & Pull Request Guidelines

- **Commit messages**: Concise, imperative summaries (e.g., "Add scoring session schema")
- **PR requirements**: Explain outcome, risks, and validation; link issues; include screenshots/recordings for UI changes
- **Highlight**: New environment variables or migrations
- **Mobile CI**: Must pass before review

## Security & Configuration

- Copy `.env.example` for local setup
- **Never commit private credentials**
- Only client-safe values may use `EXPO_PUBLIC_` prefix
- **Do not edit applied database migrations**; add new timestamped migrations
- Review row-level security changes carefully

## Non-Cricket Sports Roadmap

Use `docs/non-cricket-sports-implementation-roadmap.md` as the source of truth for the phased non-cricket sports rollout. Phase statuses:
- `COMPLETE`: implemented, migrated, tested, and committed
- `IN PROGRESS`: implementation started but acceptance criteria not all met
- `BLOCKED`: work cannot continue until dependency is resolved
- `PENDING`: approved scope not yet started

Every completed phase must add a dated implementation-log entry with commit, migrations, tests, and deferred work.

## License

This project is private and proprietary.
