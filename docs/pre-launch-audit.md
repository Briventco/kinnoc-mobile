# Kinnoc mobile pre-launch audit

**Date:** 30 October 2026. **Branch:** `feature/api-integration`, with uncommitted changes.

**Stack:**

- Expo SDK 58 (`expo@58.0.16`), React Native 0.88, React 19.3 and TypeScript 6.
- Expo Router 58, with typed routes and the React Compiler.
- TanStack Query 5, supabase-js 2 and socket.io-client 4.
- No keyboard library: the app uses React Native's own `KeyboardAvoidingView`.

**Verdict:** NOT READY. The blockers are configuration and device testing, not code. See [section 6](#6-apk-readiness).

## 1. Findings

Severity follows impact on a controlled APK test. "Fixed" means changed in this branch and covered by the checks in [section 3](#3-checks-run). A visual fix still needs the device checks in [section 5](#5-device-checks-still-required).

### High

| # | Finding | Evidence and root cause | Status |
| --- | --- | --- | --- |
| H1 | **Android keyboard covers text fields.** Affects chat, comments, compose, edit profile, community forms and auth. | Each screen used `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`. Android draws edge to edge from SDK 54 onwards, which disables `adjustResize`, so nothing moved the field. | Fixed: one `KEYBOARD_BEHAVIOR = 'padding'` for both platforms ([useKeyboardVisible.ts](../src/lib/useKeyboardVisible.ts)). Each screen has a single avoiding view, so offsets cannot add up. |
| H2 | **A gap between the composer and the keyboard.** | The composer always padded for the home indicator or navigation bar (`max(insets.bottom, 8)`), even when the keyboard covers them. On a recent iPhone that's a 34 pt gap. | Fixed: `useBottomBarInset` drops to 8 pt while the keyboard is open. Applies to the chat composer, comment composer and compose toolbar. |
| H3 | **New messages could appear off-screen.** | The inverted list used `maintainVisibleContentPosition={{ minIndexForVisible: 0 }}` with no `autoscrollToTopThreshold`. That holds the current view in place, so a new message lands below it. Sending didn't scroll either. | Fixed: new messages stay in view within 120 px of the newest one. Sending always scrolls to the newest. When scrolled up, a "Jump to latest" button shows a count of new messages, and the reader isn't moved. |
| H4 | **Users can't set interests on the real backend.** | The API supports `GET /interests` and `PUT /users/me/interests`, but the app hid interest editing in HTTP mode and only had a free-text field for sample data. Interests were read but never written. | Fixed: a catalogue picker in Edit profile (up to 20, empty allowed), saved with `PUT /users/me/interests` and read back from `GET /users/me`. |
| H5 | **No in-app account deletion, and no Terms or Privacy links.** | No route or screen exists. The welcome and sign-up screens mention Terms and a Privacy Policy without linking them (`TODO(legal)` in `welcome.tsx`). | **Not fixed. Needs the backend and legal.** Google Play requires in-app account deletion for apps that create accounts. See [section 4](#4-backend-and-external-dependencies). |

### Medium

| # | Finding | Evidence and root cause | Status |
| --- | --- | --- | --- |
| M1 | **Chat history loaded behind a spinner.** | Showed `CenteredSpinner` while loading. | Fixed: `MessageSkeleton`, shaped like bubbles, which respects reduced motion. It also shows while the community itself loads. |
| M2 | **A double tap on Send could send a message twice.** | Two taps in one frame both see the text before it's cleared. Each send gets a new `clientId`, so the server keeps both. | Fixed: an identical send within 1 s is dropped. Retrying a failed message reuses its `clientId`, which was already correct. |
| M3 | **Stale screens after returning to the app.** | TanStack Query's `focusManager` wasn't connected to `AppState`. | Fixed in [query.ts](../src/lib/query.ts): stale queries refetch when the app comes to the foreground. |
| M4 | **Sign-out could leave the session on the device.** | supabase-js returns early, keeping the stored session, when its token has expired and the refresh fails (for example, offline). The next launch then signed the user back in. | Fixed: on any sign-out error, the stored session is removed directly. |
| M5 | **Startup could hang on a stalled network.** | Supabase Auth calls (session restore, refresh, sign-in) used `fetch` with no timeout, holding the branded startup screen indefinitely. | Fixed: a 20 s limit on `/auth/v1/` requests only. Storage uploads keep no limit. |
| M6 | **Unneeded microphone permission on Android.** | `expo-image-picker` adds `RECORD_AUDIO` by default (SDK 58 docs). The app never records audio. | Fixed: `"microphonePermission": false` in `app.json`. |
| M7 | **Cached data kept across an account switch.** | The cache was cleared only on sign-out, not when a different user's session arrived without one. | Fixed: cleared whenever the user ID changes ([session.ts](../src/auth/session.ts)). |
| M8 | **No EAS configuration.** | There was no `eas.json` and no `android.package`. `.env.local` is git-ignored, so EAS cloud builds would not get the API or Supabase settings and would open on "Kinnoc isn't configured". | Partly fixed: `eas.json` with an internal APK profile reading **EAS environment variables**. **The package ID is your decision** (section 7). |
| M9 | **Dependencies behind.** | `expo-doctor` reports 14 packages a patch version behind (`expo` 58.0.16 → 58.0.21). | Not changed. Run `npx expo install --fix` when disk space allows. |

### Low and informational

| # | Finding | Status |
| --- | --- | --- |
| L1 | Content links (posts, messages, events, profile website) opened with no scheme check, and one used `Linking.openURL`. | Fixed: `openExternal` opens only http(s), always in the in-app browser. |
| L2 | `npm audit`: 12 advisories (4 high), all in build-time Expo CLI tooling (`@expo/cli` → `zod`, `node-forge`, `xcode` → `uuid`). None is in the app bundle. | Not fixed. `npm audit fix --force` would downgrade Expo. They're addressed by Expo releases. |
| L3 | No connection banner across the app. Chat shows "Connecting…" and failed sends show "Not sent" with retry. | Not fixed. A global offline banner needs `@react-native-community/netinfo`. It wasn't added without a measured need. |
| L4 | Render's free instance sleeps. The first request after sleep can exceed the 15 s client timeout. | Mitigated: reads retry twice. A first sign-in after sleep may show a retryable error. |
| L5 | Onboarding shows sample communities. | Informational: a static illustration hidden from screen readers, not data. |
| I1 | Secrets: none in git history. `.env*` files are ignored. The bundled Supabase key is the **publishable** key. The built Android and iOS bundles contain no service-role or secret key. | No issue. |
| I2 | Tokens: stored in the Keychain or Keystore via `expo-secure-store` (chunked). No `console` logging in `src`. Release builds refuse sample data, preview sign-in and non-https API URLs. | No issue. |

## 2. Lifecycles traced

- **Startup:** the native splash (`expo-splash-screen`, configured in `app.json`) stays up until fonts load and the session is restored, with a 3 s cap. A matching in-app splash covers any longer restore, now bounded by M5. Routes are guarded with `Stack.Protected`, so an expired session lands on sign-in with no loop.
- **Chat:**
  - **Sending:** an optimistic bubble keyed by `clientId` is shown immediately; the server's copy replaces it.
  - **Failures:** a failed send stays as "Not sent" with retry, and the retry reuses the same `clientId`.
  - **Order:** live messages, catch-up after a reconnect, and history pages merge by `seq`.
  - **Leaving and switching:** each conversation has its own cache key, and losing access removes that conversation's cached messages.
  - **History:** older messages load page by page.
- **Profile:**
  - **Reads:** your profile comes from `GET /users/me`, and your posts from `/users/me/posts`.
  - **Photo:** stored in the `avatars` bucket (2 MB square JPEG); the old file is deleted after the new one is saved.
  - **Interests:** see H4.
- **Account deletion:** none (H5).

## 3. Checks run

| Check | Before | After |
| --- | --- | --- |
| `npx tsc --noEmit` | clean | clean |
| `npx expo lint` | clean | clean |
| `npx jest` | 150 passed, 14 suites | **157 passed, 16 suites** |
| `npx expo export` (Android + iOS) | not run (disk full) | both bundle (Hermes, 6.5 MB each) |
| Secret scan of the built bundle | not run | no service-role or secret keys |
| `npm audit --omit=dev` | n/a | 12 build-tool advisories (L2) |
| `npx expo-doctor` | n/a | 1 failed check: 14 packages out of date (M9) |
| iOS simulator (iPhone 15 Pro, Expo Go 58) | n/a | the app launches and renders onboarding. Nothing beyond that could be driven. |

New regression tests:

- **Account switch and sign-out:** `src/auth/__tests__/session.test.ts` covers clearing the cache on an account switch, removing the session after an offline sign-out, and the auth request timeout.
- **Links:** `src/lib/__tests__/links.test.ts` covers the scheme filter.
- **Interests:** `api.test.ts` covers `PUT /users/me/interests`.

## 4. Backend and external dependencies

1. **Account deletion:** the API needs an endpoint such as `DELETE /users/me`. It should delete or anonymise the profile, memberships, posts, comments and messages according to your retention policy, and remove Storage files (avatars, post media). The app can then add Settings → Delete account. Play also needs a **web** deletion link.
2. **Terms and Privacy Policy:** URLs are needed. The app will link them from Welcome, Sign up and Settings.
3. **Interests during onboarding:** optional. The API already supports it (`PUT /users/me/interests` after `POST /profiles`). It's only built in Edit profile so far.
4. **Not in the API yet** (already hidden in the app): following, saved items, notifications and push, stories, reactions, message photos, mute and pin, blocking and reporting.

## 5. Device checks still required

These weren't done. Expo Go on the simulator can't be tapped or typed into from here, and no Android emulator or device is available.

- **Android device (gesture and 3-button navigation):** for chat, comments, compose, edit profile and sign-in, check that the field sits directly above the keyboard, with no gap and nothing covered. Check that a multiline message grows and Send stays reachable.
- **iPhone with a home indicator:** the same, including that no gap appears above the keyboard. Check compose and edit profile in modal presentation.
- **Chat scrolling:**
  - Send a message while scrolled up: it should jump to the newest.
  - Receive messages at the bottom: they should stay in view.
  - Receive messages while reading history: you should stay put, with "N new" showing.
  - Load older pages: there should be no jump.
- **Network:** test airplane mode during a send ("Not sent" then retry, with no duplicate), a reconnect, sign-out while offline then relaunch (it must stay signed out), and first launch while Render is asleep.
- **Interests:** pick, save, pull to refresh, sign out and in, and reinstall. The interests should come back from the server each time.
- **Accessibility:** TalkBack and VoiceOver on chat (bubbles, the jump button, Send), largest font size, and reduced motion.

## 6. APK readiness

**NOT READY** for controlled testing.

- **The code is ready for a test build:** checks pass, both bundles compile, and the app launches.
- **But it can't be built yet:**
  - There's no `android.package`.
  - There's no EAS project.
  - The build's environment variables aren't set.
- **The device checks haven't been done.** The fixes most likely to need adjusting, H1 to H3, are visual.
- **Account deletion (H5)** is not a blocker for a small internal APK, but it must exist before any Play Store track open to the public.

## 7. Next steps to a test APK

1. **Choose the Android package ID.** It's permanent on Google Play (for example `com.brivent.kinnoc`). Add it to `app.json` under `expo.android.package`.
2. **Link the EAS project:** run `bunx eas-cli init`, which adds `extra.eas.projectId` to `app.json`.
3. **Set the build's public settings** for the `preview` environment, using the **development** API and Supabase project, with no secrets:
   ```
   bunx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_MODE --value http --visibility plaintext
   bunx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://kinnoc-api.onrender.com/api/v1 --visibility plaintext
   bunx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value <project URL> --visibility plaintext
   bunx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <publishable key> --visibility plaintext
   ```
4. **Free disk space,** then run `npx expo install --fix` and re-run typecheck, lint and tests.
5. **Build the internal APK:** `bunx eas-cli build --profile preview --platform android`. Let EAS generate and keep the Android keystore. Don't use the `production` profile.
6. **Install the APK** on two or three Android devices with test accounts only, and work through [section 5](#5-device-checks-still-required).
