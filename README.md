# kinnoc-mobile

Official Kinnoc mobile application for communities, conversations, social feeds, and discovering opportunities.

**Find your people. Join the conversation. Discover what's next.** Built by Brivent Global Innovations Limited
with React Native, Expo (SDK 58) and TypeScript, for iOS and Android.

> **Status: development preview.** Sign-in, accounts, communities and community chat run against the
> **Kinnoc API** (`EXPO_PUBLIC_API_MODE=http`). The rest of the app (feed, Discover, notifications, stories, saved)
> exists only on built-in **sample data** (`mock`, the default) until the API offers it. The deployed API at
> `kinnoc-api.onrender.com` uses the **development** Supabase project. See [Current status](#current-status).

## Getting started

Requirements: Node 20+ and npm. For a simulator, Xcode (iOS) or Android Studio; or Expo Go on a phone.

```bash
npm install
cp .env.example .env.local   # optional; defaults run on sample data
npm start                    # then press i (iOS), a (Android), or scan the QR code with Expo Go
```

To use the Kinnoc API, set in `.env.local` (never committed):

```bash
EXPO_PUBLIC_API_MODE=http
EXPO_PUBLIC_API_URL=https://kinnoc-api.onrender.com/api/v1
EXPO_PUBLIC_SUPABASE_URL=<the API's Supabase project URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<that project's anon / publishable key>
```

That deployment uses the development Supabase project: sign in with test accounts only. The first request after
the Render instance has slept can take up to a minute.

Everything the app uses runs in **Expo Go**; no development build is needed yet.

In preview sign-in, any well-formed email with a password works (sign-up needs 8+ characters with letters and
numbers). To see the error states: the password `wrong-password` fails sign-in, the email `taken@example.com`
fails sign-up, and a chat message containing `/fail` fails to send so you can try retry.

### Commands

| Command | What it does |
| --- | --- |
| `npm start` | Start the Metro dev server |
| `npm run ios` / `npm run android` | Start and open on a simulator or emulator |
| `npm run lint` | ESLint (`eslint-config-expo`, includes React Compiler rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (Jest, `jest-expo`): HTTP client, mappers, routes, Socket.IO client, message cache, mock adapter |
| `npm run test:live` | Integration test against a running API (see below). Skipped unless its variables are set |
| `npx expo-doctor` | Check dependency and config health |

## Environment variables

All variables are `EXPO_PUBLIC_*`, which means they are **compiled into the app and readable by anyone** who has it.
Only public configuration belongs here: never database URLs, Supabase service-role keys or other server secrets.

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_MODE` | `mock` (default, sample data) or `http` (Kinnoc API) |
| `EXPO_PUBLIC_API_URL` | Base URL of the Kinnoc API including its prefix, required for `http`. Chat uses the same host (Socket.IO path `<prefix>/socket.io`). Must be https in release builds |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The API's Supabase project (public URL and anon key): sign-in, and uploads of community images to Storage with the user's own session. When both are set, real sign-in replaces the preview |
| `EXPO_PUBLIC_ALLOW_PREVIEW` | `true` allows sample data / preview sign-in in a release build (internal test builds only) |

A release build with missing configuration shows a "Kinnoc isn't configured" screen instead of running on sample
data. The HTTP API also refuses to run with the preview sign-in.

## Project structure

```
src/
  app/                    Expo Router routes (every file is a screen)
    _layout.tsx           providers, fonts, splash, auth and onboarding guards
    onboarding.tsx        three-step intro
    (auth)/               welcome, sign-in, sign-up, forgot-password
    (app)/(tabs)/         Feed (index), Communities, Discover, Profile + custom bottom bar
    (app)/community/[id]  conversation (index) and community details (info)
    (app)/…               post/[id], discover/[id], compose, notifications, saved, settings/*
  api/
    contract.ts           KinnocApi interface: the only API the UI sees
    types.ts              domain models (payload shapes)
    errors.ts             ApiError + plain-language messages
    realtime.ts           RealtimeClient interface for conversations
    http/                 Kinnoc API adapter: fetch client, routes, payload mappers, Socket.IO chat, image upload
    mock/                 development adapter and SAMPLE fixtures
  auth/                   AuthService interface, Supabase and preview adapters, secure storage, AuthProvider
  services/index.ts       picks real vs development implementations (the only place that does)
  features/account/       account gate: provisioning and profile setup after sign-in
  features/<area>/        hooks (TanStack Query) and feature components
  components/             shared UI: Text, Button, Avatar, Tabs, Field, Header, States, Toast, Overlays, BottomTabBar
  theme/                  design tokens and type styles from the Kinnoc Design System
  lib/                    query client and keys, cache helpers, formatting, media picker, preferences
  config/env.ts           typed public configuration and release-build checks
docs/api-contract.md      how the app uses the Kinnoc API: routes, auth, realtime, gaps
assets/images/brand/      official Kinnoc marks (blue symbol, white symbol, blue lockup)
```

## Architecture notes

- **Navigation:** Expo Router. `Stack.Protected` guards switch between onboarding, auth and the signed-in app;
  deep links to protected screens redirect. The bottom bar is custom (JS tabs) and docked: the navigator reserves its
  height plus the home-indicator inset, so content never scrolls under it. Labelled icons, active tab in action blue
  with a logo-blue tick. It hides on pushed screens and while the keyboard is open.
- **Data:** TanStack Query is the single server-state library. Mutations (likes, saves, reactions, sends,
  read state) update the cache optimistically, snapshot first, roll back on error, and reconcile with the
  server's response so cached data never silently overrides newer data. Lists use cursor pagination.
- **Messaging:** sends are optimistic with `Sending → Sent` or `Not sent. Tap to retry`; retries reuse the
  `clientId`, which the API de-duplicates. Live events arrive over Socket.IO through `RealtimeClient` and merge
  into the same cache; after every reconnect the conversation fetches what it missed by sequence number.
  Duplicates are dropped by ID, client ID and `seq`. Details in [docs/api-contract.md](docs/api-contract.md#realtime).
- **Capabilities:** `api.capabilities` says what the connected backend supports. Controls for anything it does not
  (reactions, photos in chat, mute/pin, the feed composer, follower counts) are hidden, and screens that need a
  missing feature say it "isn't available yet" rather than showing an error.
- **Mock isolation:** fixtures live only in `src/api/mock/`, Settings → Development shows when they are in use,
  and only `src/services/index.ts` imports an adapter. (Metro still bundles the mock module in `http` builds;
  it is never executed there.)
- **Sessions:** tokens are kept only in `expo-secure-store` (Keychain/Keystore), chunked for size. Passwords are
  never stored. Sign-out clears the session and the whole query cache. On web (dev only) sessions are memory-only.
- **Design system:** colours, type, radii and component rules come from the Kinnoc Design System
  (white paper, navy ink, one blue pulse; no red). Fonts are Bricolage Grotesque and Figtree via
  `@expo-google-fonts` (only the six weights used are bundled). If fonts fail to load the app continues on the
  system font.

## Current status

**Connected to the Kinnoc API (`http` mode):**

- Supabase sign-in and sign-up, account provisioning, profile setup (username and name), session refresh and
  retry on expired tokens, sign-out on rejected sessions.
- Communities: discovery of public communities with search, category filter and pagination; details for every
  visibility; create and edit (owner) with avatar and cover images uploaded to Supabase Storage; join, request
  to join, cancel a request, accept or decline an invitation, leave; invitations and requests listed above the
  inbox; members list with role changes, removal and ownership transfer; join-request review; invitations by
  username and revocation. Permissions follow the API's role matrix; the API enforces them.
- Chat: history with paging, live delivery over Socket.IO, typing, replies, deletion by the sender or a
  moderator/owner, read positions and unread counts, catch-up after reconnecting, recovery from token expiry,
  and the join gate returning when membership ends.
- Verified: `npm run test:live` passed against `https://kinnoc-api.onrender.com/api/v1` with a development test
  account (provisioning, discovery, a private test community, live delivery, idempotent retry, catch-up, reply,
  deletion and its live event, read position, validation errors). The screens in `http` mode have **not** yet
  been walked through on a device or simulator against the live API.

**Sample data only (`mock` mode):** feed, posts, stories, Discover, notifications, saved items, reactions,
photos in chat, mute/pin, follows and the extra profile fields. The API does not offer these yet.

**Live test:** `npm run test:live` with `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `KINNOC_TEST_EMAIL` and `KINNOC_TEST_PASSWORD` set in the shell. It writes test
data: one private, invite-only community named "Kinnoc mobile integration test" (reused on later runs; the API
cannot delete communities) and messages it then deletes. Run it only against the development project.

**Needs the backend or further work:**

- The API features listed in [docs/api-contract.md](docs/api-contract.md#not-in-the-api-yet), and the API
  capabilities the app does not use yet ([list](docs/api-contract.md#backend-capabilities-the-app-does-not-use-yet)),
  including profile photos and other people's profiles.
- The inbox refreshes every 15 s; only open conversations receive live events.
- Password reset currently sends the Supabase email; completing the reset happens on the Supabase-configured
  site, not in the app.
- **Push notifications are not implemented.** They need `expo-notifications`, APNs/FCM credentials, device-token
  registration and server delivery.
- Terms and Privacy Policy links (URLs not yet published).
- Keyboard handling uses `KeyboardAvoidingView` so the app stays Expo Go-compatible; moving to
  `react-native-keyboard-controller` (needs a development build) would smooth the chat composer on Android.
- No component or end-to-end UI tests yet (Maestro is the next step).
- `npx expo-doctor` reports eight Expo packages one patch release behind SDK 58's latest; run
  `npx expo install --fix` separately.
- iOS `bundleIdentifier` / Android `package` are not set; choose them before the first EAS build.
- On the iOS 26.3 simulator used for testing, emoji render as "?" boxes system-wide (Safari too), so it is a
  simulator issue, not the app. Confirm emoji on a physical device.
