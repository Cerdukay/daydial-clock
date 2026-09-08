# DayDial — Radial Daily Planner

See your whole day as colorful arcs around an analog clock. Drag to move, pinch to resize, and plan in seconds.

## Features

- **Radial clock face** — events appear as arcs on a 24-hour circular timeline
- **Multi-layer lanes** — up to 4 concentric layers for overlapping events
- **Recurring events** — daily, weekdays, weekly, monthly with per-occurrence overrides
- **Reminders & push notifications** — FCM push for authenticated users, Web Notifications for guests
- **iCal import/export** — RFC 5545 compatible `.ics` file support
- **14 languages** — English, Turkish, Spanish, French, German, Hindi, Indonesian, Arabic, Russian, Chinese, Japanese, Korean, Italian, Vietnamese, Portuguese (BR)
- **Guest mode** — full offline planning with localStorage, upgradeable to cloud sync
- **Cloud sync** — Clerk auth and Neon Postgres sync across devices
- **Dark/light/system theme** — adaptive color schemes
- **PWA + Android native** — installable web app and Capacitor Android package

## Tech Stack

- **Framework**: TanStack Start (React 19, TanStack Router, Vite)
- **Database**: Neon Lakebase Postgres (via Neon Data API, PostgREST-compatible)
- **Auth**: Clerk (JWT-based, verified against JWKS)
- **Notifications**: Firebase Cloud Messaging + server-side reminder scheduler
- **Mobile**: Capacitor (Android)
- **Styling**: Tailwind CSS v4
- **Testing**: Vitest (unit) + Playwright (E2E)
- **Language**: TypeScript

## Development

```sh
npm i
npm run dev
```

## Build

### Web (SSR)

```sh
npm run build      # production build → .output/
npm run preview    # preview production build
```

### Android (Capacitor)

```sh
npm run build:capacitor   # SPA build → dist/
npx cap sync              # sync web assets to native project
npx cap open android      # open in Android Studio
```

Before building the Android app for push notifications, place your Firebase `google-services.json` at `android/app/google-services.json` (see `google-services.json.example` for the expected structure).

## Testing

```sh
npm test           # unit tests (Vitest)
npm run test:e2e   # E2E tests (Playwright)
```

## Project Structure

```
src/
  lib/
    daydial/        # core planner logic (events, recurrence, store)
    notifications/  # push & local notification system
    calendar/       # iCal import/export
    i18n/           # internationalization dictionaries
  components/       # React UI components
  routes/           # TanStack Router file-based routes
  integrations/
    neon/           # Neon Data API client, schema types, Clerk middleware
neon/
  migrations/       # database schema & RLS policies
server/
  send-reminders/   # standalone reminder scheduler (Node)
android/            # Capacitor Android native project
e2e/                # Playwright E2E tests
```

## License

This project is proprietary. All rights reserved.
