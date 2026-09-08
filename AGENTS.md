<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Build & Test Commands

- **Dev server**: `npm run dev`
- **Web build (SSR)**: `npm run build`
- **Capacitor SPA build**: `npm run build:capacitor`
- **Capacitor sync**: `npm run cap:sync`
- **Unit tests**: `npm test` (Vitest, 146 tests)
- **E2E tests**: `npm run test:e2e` (Playwright, 5 tests)
- **Lint**: `npm run lint`

## Architecture

- **Web**: TanStack Start (React 19 + TanStack Router + Vite) with SSR
- **Mobile**: Capacitor wraps a client-only SPA build (`vite.capacitor.config.ts`)
- **Database**: Neon Lakebase Postgres via Neon Data API (PostgREST-compatible, `@neondatabase/postgrest-js`)
- **Auth**: Clerk (`@clerk/react`) — JWT passed to Neon Data API for RLS
- **Notifications**: FCM push (auth users) + Web Notifications (guests) + server-side reminder scheduler (`server/send-reminders/`)
- **Calendar**: RFC 5545 iCal import/export (`src/lib/calendar/`)

## Key Files

- `src/lib/daydial/store.tsx` — central data store, guest/auth modes
- `src/lib/notifications/` — push & local notification system
- `src/lib/calendar/` — iCal export (`ical.ts`) and import (`ical-import.ts`)
- `src/integrations/neon/client.ts` — Neon Data API client (Clerk JWT auth)
- `src/integrations/neon/types.ts` — Database schema types
- `src/integrations/neon/clerk-middleware.ts` — Clerk JWT verification for server functions
- `neon/migrations/` — Neon SQL migrations (RLS policies, idempotency table)
- `server/send-reminders/` — standalone Node script for scheduled FCM push
- `capacitor.config.ts` — Capacitor app configuration
- `vite.capacitor.config.ts` — Vite config for the client-only SPA build
- `android/` — Capacitor Android native project

## Android Setup

1. Place `google-services.json` from Firebase Console at `android/app/google-services.json`
2. Run `npm run cap:sync` to build and sync web assets
3. Open in Android Studio: `npx cap open android`

