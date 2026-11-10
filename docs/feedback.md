# Feedback and suggestions (mobile ↔ backend)

The backend's source of truth is the `kinnoc-api` feedback module (`src/feedback/`, its `docs/feedback.md` and
migration `20261107120000_feedback`, on branch `feature/feedback`). This page describes what the app sends and
reads. The routes are defined in one place, `FEEDBACK_ROUTES` in [`src/api/http/index.ts`](../src/api/http/index.ts),
and payloads are mapped field by field in [`mappers.ts`](../src/api/http/mappers.ts) (`toFeedbackBody`,
`toFeedbackSummary`, `toFeedbackDetail`).

Until the deployed API has these routes, a route-level `404 NOT_FOUND` (not `FEEDBACK_NOT_FOUND`) is reported to
screens as `unsupported`. The Feedback screen then says sending feedback isn't available yet and disables the
categories. Nothing is mocked in `http` mode. The sample-data build (`EXPO_PUBLIC_API_MODE=mock`) has an in-memory
implementation for development.

All routes use the usual envelope (`{ data }` / `{ error: { code, message, details, requestId } }`) and the
caller's Supabase bearer token. The submitter is always the signed-in account; it is never sent in the body. A user
can read only their own submissions.

## `POST /feedback`: submit

Request body:

```jsonc
{
  "category": "GENERAL | BUG_REPORT | FEATURE_REQUEST | USER_EXPERIENCE",
  "subject": "3–150 characters after trimming, no control characters",
  "description": "10–5000 characters after trimming; newlines and tabs allowed, other control characters not",
  "attachments": [ { "key": "<user id>/<uuid>.jpg" } ],  // optional, at most 5, `{ key }` ONLY (see below)
  "platform": "IOS | ANDROID | WEB | OTHER",               // optional; the app sends device fields for bug reports only
  "appVersion": "0.1.0",                                     // optional, 1–50 characters
  "osVersion": "18.2",                                       // optional, 1–50 characters
  "clientId": "uuid"                                         // optional on the API; the app always sends one
}
```

- **Unknown properties are rejected**, including inside attachment objects: the API's validation pipe uses
  `forbidNonWhitelisted`. Sending `mimeType` or `sizeBytes` with an attachment fails with `400 VALIDATION_FAILED`.
  The app does not send `deviceModel` (optional on the API), because it doesn't read it.
- **Idempotency:** a retry with the same `clientId` returns the original submission with `200`. A new submission
  returns `201`. The app keeps the same `clientId` while the draft is unchanged, so a retry after a lost response never
  creates a duplicate.
- **Errors the app handles:**
  - `VALIDATION_FAILED`, with `details: [{ field, errors }]`, shown next to the field.
  - `INVALID_ATTACHMENT`: the file is missing, not in the caller's folder, the wrong type, too large, already
    attached elsewhere, or Storage is unavailable on the server.
  - `RATE_LIMITED`: the API accepts 5 submissions per user per hour, per API instance.

Response: the submission in the detail shape below.

## `GET /users/me/feedback?cursor=&limit=`: the caller's submissions, newest first

The app sends only `cursor`. The API also accepts `status` and `category` filters.

```jsonc
{
  "items": [
    {
      "id": "uuid",
      "category": "BUG_REPORT",
      "subject": "…",
      "status": "RECEIVED | UNDER_REVIEW | IN_PROGRESS | RESOLVED | CLOSED",
      "responseCount": 1,
      "lastResponseAt": "ISO date | null",   // not used by the app
      "createdAt": "ISO date",
      "updatedAt": "ISO date"
    }
  ],
  "nextCursor": "string | null"
}
```

## `GET /feedback/:id`: one submission with the team's replies

```jsonc
{
  // …every summary field above, plus:
  "description": "…",
  "appVersion": "0.1.0 | null",
  "platform": "IOS | null",
  "osVersion": "18.2 | null",
  "deviceModel": "string | null",          // not used by the app
  "attachments": [
    { "bucket": "feedback-attachments", "storageKey": "<user id>/<uuid>.jpg", "mimeType": "image/jpeg", "sizeBytes": 183422 }
  ],                                       // in submission order; no URL
  "responses": [ { "id": "uuid", "body": "…", "createdAt": "ISO date" } ]   // oldest first
}
```

- A non-UUID ID, someone else's submission, or one that doesn't exist all return `404 FEEDBACK_NOT_FOUND`. The app
  shows "This feedback isn't available" for each.
- Replies come without their author and are shown as "Kinnoc team". The submitter's view never includes internal
  notes, the assignee or the activity log. The API builds it from a separate select, and the app also maps fields one
  by one, so anything else would be dropped. A test checks this.

## Attachments

1. The user picks screenshots with the existing image picker (images only, up to 5).
2. Each one is re-encoded as JPEG (longest edge 2400 px, at most 10 MB).
3. It is uploaded directly to the **private** `feedback-attachments` bucket, at `<user id>/<uuid>.jpg`, with the
   user's own Supabase session, `contentType: 'image/jpeg'` and **`upsert: false`**. A file is never replaced; the
   bucket's policies don't allow replacing or deleting files.
4. Only the object `key` is sent in `POST /feedback`.
5. The API checks each key in `storage.objects` and takes the file's type and size from Storage's own metadata:
   - the key must be in the caller's folder and the object must have been uploaded by the caller (`owner_id`);
   - the type must be JPEG, PNG, WebP or PDF, and the size between 1 byte and 10 MB;
   - a file can be attached to one submission only.
   The bucket enforces the same type and size limits on upload.
6. To show attachments, the app creates a 1-hour signed URL for each `storageKey` with the user's session
   (`createSignedUrl`), which the bucket's "owners read" policy allows. The bucket isn't public, and the API returns
   no URLs.

The app's bucket name is fixed at `feedback-attachments`, which must match the API's `SUPABASE_FEEDBACK_BUCKET`
(the default). The bucket also accepts PDFs, but the app has no document picker; adding one would need
`expo-document-picker` and a new native build.

## Notifications and deep links

When an administrator replies (`POST /admin/feedback/:id/responses`), the API creates a `FEEDBACK_RESPONSE`
notification. It has no actor, the title "The Kinnoc team replied to your feedback", the reply's first 140
characters as the body, and `targetUrl: "/feedback/<id>"`. It follows the user's "system" notification preferences.
In the app the type maps to the `feedback` notification kind, and the target is the route
`src/app/(app)/feedback/[id].tsx`:

- **App open:** the live notification socket refreshes the notification list and any open feedback screen. Tapping
  the notification opens the submission and marks the notification read.
- **Web push (app in the background or closed):** the push carries `data.url` = `/feedback/<id>`. The service worker
  opens or focuses that path, and Vercel's SPA rewrite serves it.
- **Links:** universal links and custom-scheme links (`https://kinnoc.app/feedback/<id>`,
  `kinnoc://feedback/<id>`) normalise to the same route.
- **Signed out:** `destinationAfterSignIn` keeps `/feedback/<id>` as the pending destination for 15 minutes, and the
  root layout opens it after sign-in. The route is in the protected `(app)` group, behind the account gate.

The app has no native (APNs/FCM) push, so on iOS and Android a closed app is reached through the in-app notification
list and links, the same as every other notification type.

## Deployment requirements (backend)

- Merge and deploy the feedback module, and apply migration `20261107120000_feedback`. The bucket and its storage
  policies are created only on Supabase, where `kinnoc_private.is_active_admin()` already exists.
- Leave `SUPABASE_FEEDBACK_BUCKET` set to `feedback-attachments`.
- The API's database role must be able to read `storage.objects`. Otherwise every attachment is refused with
  `INVALID_ATTACHMENT` ("Attachments are not available on this server"), while text-only feedback still works.
