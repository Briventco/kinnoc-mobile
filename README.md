# kinnoc-mobile

Official Kinnoc mobile application for communities, conversations, social feeds, and discovering opportunities.

**Find your people. Join the conversation. Discover what's next.** Built by Brivent Global Innovations Limited
with React Native, Expo (SDK 58) and TypeScript, for iOS and Android.

> **Status: development preview.** The app runs end to end on built-in **sample data** and a **preview sign-in**
> that is *not* real authentication. Both are shown under Settings → Development and are blocked in release builds unless
> explicitly allowed. It has not yet been connected to the Kinnoc backend. See [Current status](#current-status).

## Getting started

Requirements: Node 20+ and npm. For a simulator, Xcode (iOS) or Android Studio; or Expo Go on a phone.

```bash
npm install
cp .env.example .env.local   # optional; defaults run on sample data
npm start                    # then press i (iOS), a (Android), or scan the QR code with Expo Go
```

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
| `npx expo-doctor` | Check dependency and config health |

## Environment variables

All variables are `EXPO_PUBLIC_*`, which means they are **compiled into the app and readable by anyone** who has it.
Only public configuration belongs here: never database URLs, Supabase service-role keys or other server secrets.

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_MODE` | `mock` (default, sample data) or `http` (Kinnoc API) |
| `EXPO_PUBLIC_API_URL` | Base URL of the Kinnoc API, required for `http` |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase Auth project (public URL and anon key). When both are set, real sign-in replaces the preview |
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
    http/                 real adapter (fetch client + routes)
    mock/                 development adapter and SAMPLE fixtures
  auth/                   AuthService interface, Supabase and preview adapters, secure storage, AuthProvider
  services/index.ts       picks real vs development implementations (the only place that does)
  features/<area>/        hooks (TanStack Query) and feature components
  components/             shared UI: Text, Button, Avatar, Tabs, Field, Header, States, Toast, Overlays, BottomTabBar
  theme/                  design tokens and type styles from the Kinnoc Design System
  lib/                    query client and keys, cache helpers, formatting, media picker, preferences
  config/env.ts           typed public configuration and release-build checks
docs/api-contract.md      endpoints and payloads the backend needs to provide
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
- **Messaging:** sends are optimistic with `Sending → Sent/Read` or `Not sent. Tap to retry`; retries reuse the
  `clientId`. Realtime events arrive through `RealtimeClient` and merge into the same cache, so plugging in a
  transport needs no screen changes.
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

**Working on sample data:** splash, onboarding (persisted), welcome, sign-up/sign-in/reset (validation, loading,
errors), Feed (stories row with full-screen viewer and posting a photo story, three tabs, composer, posts with media, likes, replies, share, save, community updates,
pagination, pull to refresh), Communities inbox (search, All/Unread/Discover, unread/typing/mention/pinned/muted,
long-press actions), community discovery and join/request/leave, conversation (history paging, date separators,
grouping, replies, reactions, link previews, photo attachments, delivery and retry states, members-only gate),
Discover (This week strip, type-led sections, filters, search, detail with external links), Profile (posts, saved,
communities, interests), edit profile, Notifications (grouped, mark one/all read), Saved, settings, notification
preferences, privacy information, sign-out. Verified with `tsc`, ESLint, `expo-doctor` and an iOS/Android production
bundle.

**Needs the backend or further work:**

- Kinnoc API service implementing [docs/api-contract.md](docs/api-contract.md); the HTTP adapter is untested against it.
- Supabase Auth adapter is implemented but untested against the Kinnoc project. Password reset currently sends the
  Supabase email; completing the reset happens on the Supabase-configured site, not in the app.
- Realtime transport for conversations (polling every 15 s in `http` mode until then).
- **Push notifications are not implemented.** They need `expo-notifications`, APNs/FCM credentials, device-token
  registration and server delivery. In-app notifications work separately.
- Profile photo upload, following people, reporting and blocking, other people's profiles.
- Terms and Privacy Policy links (URLs not yet published).
- Keyboard handling uses `KeyboardAvoidingView` so the app stays Expo Go-compatible; moving to
  `react-native-keyboard-controller` (needs a development build) would smooth the chat composer on Android.
- No automated tests yet; next step is unit tests for `lib/format`, cache helpers and the mock adapter, then
  component tests for the inbox and conversation.
- iOS `bundleIdentifier` / Android `package` are not set; choose them before the first EAS build.
- On the iOS 26.3 simulator used for testing, emoji render as "?" boxes system-wide (Safari too), so it is a
  simulator issue, not the app. Confirm emoji on a physical device.
