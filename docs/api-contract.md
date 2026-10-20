# Kinnoc API contract (mobile ↔ backend)

This is what the mobile app expects from the Kinnoc API service. The TypeScript source of truth is
[`src/api/contract.ts`](../src/api/contract.ts) (operations) and [`src/api/types.ts`](../src/api/types.ts)
(payloads); [`src/api/http/index.ts`](../src/api/http/index.ts) maps each operation to the routes below.
Change all three together.

## Conventions

- **Base URL:** `EXPO_PUBLIC_API_URL`, e.g. `https://api.kinnoc.app/v1`.
- **Auth:** every request carries `Authorization: Bearer <Supabase access token>`. The backend verifies the
  JWT with Supabase and maps `sub` to a Kinnoc user. The app never talks to Postgres or Prisma directly and
  holds no service keys.
- **JSON** request and response bodies; dates are ISO-8601 strings in UTC.
- **Pagination:** list endpoints take `?cursor=` and return `{ "items": [...], "nextCursor": "..." | null }`.
  Cursors are opaque to the app.
- **Errors:** non-2xx responses return `{ "error": { "message": "...", "fields": { "field": "message" } } }`.
  Status codes the app handles: 400/422 validation, 401 (signs the user out), 403, 404, 409, 429, 5xx (shown with Retry).
- **Idempotency:** message sends include a client-generated `clientId`; the server must return the existing
  message if it sees the same `clientId` twice (retries after a timeout).

## Access rules the server must enforce

The app hides these screens client-side, but only the server can actually enforce them:

- Messages of a community are readable and writable **only by members** (`403` otherwise).
- Joining a `private` community creates a `pending` membership; moderators approve it.
- Users can only edit or delete their own posts and profile.
- `GET /users/:id/communities` returns only public memberships for other people.
- Story frames expire 24 hours after posting and are only shown to people who share a community with the author.

## Endpoints

| Operation | Method & path | Body / query | Returns |
| --- | --- | --- | --- |
| Current profile | `GET /me` | | `Profile` |
| Update profile | `PATCH /me` | `ProfileUpdate` | `Profile` |
| Another profile | `GET /users/:id` | | `Profile` |
| User's posts | `GET /users/:id/posts` | `cursor` | `Page<Post>` |
| User's communities | `GET /users/:id/communities` | | `CommunitySummary[]` |
| Feed | `GET /feed` | `scope=for-you\|following\|communities`, `cursor` | `Page<Post \| CommunityUpdate>` (tagged by `kind`) |
| Post | `GET /posts/:id` | | `Post` |
| Create post | `POST /posts` | `{ text, communityId \| null, mediaIds[] }` | `Post` |
| Delete post | `DELETE /posts/:id` | | 204 |
| Like / unlike | `PUT` / `DELETE /posts/:id/like` | | `{ likeCount }` |
| Comments | `GET /posts/:id/comments` | `cursor` | `Page<Comment>` |
| Add comment | `POST /posts/:id/comments` | `{ text }` | `Comment` |
| Upload media | `POST /media` | multipart `file` | `MediaAsset` |
| Inbox | `GET /me/inbox` | | `InboxEntry[]` (one per joined community, pinned first, then most recent) |
| Browse communities | `GET /communities` | `q`, `cursor` | `Page<CommunitySummary & { membership }>` |
| Community | `GET /communities/:id` | | `Community` |
| Join | `PUT /communities/:id/membership` | | `Community` (membership `member` or `pending`) |
| Leave | `DELETE /communities/:id/membership` | | 204 |
| Mute / pin | `PATCH /communities/:id/membership` | `{ muted }` or `{ pinned }` | 204 |
| Mark read | `POST /communities/:id/read` | `{ lastMessageId \| null }` (null = latest) | 204 |
| Messages | `GET /communities/:id/messages` | `cursor` (newest first) | `Page<Message>` |
| Send message | `POST /communities/:id/messages` | `{ clientId, text, replyToId, mediaIds[] }` | `Message` (echoes `clientId`) |
| React | `PUT` / `DELETE /messages/:id/reactions/:emoji` | | `Reaction[]` |
| Discover home | `GET /discover/home` | | `DiscoverHome` |
| Discover list | `GET /discover` | `filter=all\|events\|opportunities\|resources`, `q`, `cursor` | `Page<DiscoverItem>` (tagged by `kind`) |
| Discover item | `GET /discover/:id` | | `DiscoverItem` |
| Notifications | `GET /me/notifications` | `cursor` | `Page<AppNotification>` |
| Unread count | `GET /me/notifications/unread-count` | | `{ count }` |
| Mark one read | `POST /me/notifications/:id/read` | | 204 |
| Mark all read | `POST /me/notifications/read-all` | | 204 |
| Preferences | `GET` / `PUT /me/notification-preferences` | `NotificationPreferences` | `NotificationPreferences` |
| Stories | `GET /stories` | | `StoryReel[]`: the viewer's own reel first (may have no frames), then unseen, then seen |
| Post a story | `POST /stories` | `{ mediaId, caption \| null }` | `StoryReel` (the viewer's) |
| Story frame seen | `POST /stories/frames/:id/seen` | | 204 |
| Saved | `GET /me/saved` | `cursor` | `Page<SavedItem>` |
| Save / unsave | `PUT` / `DELETE /me/saved/:kind/:id` | `kind` = `post` \| `discover` | 204 |

Per-viewer fields (`likedByMe`, `savedByMe`, `isMine`, `membership`, `unreadCount`, `reactedByMe`, `status`)
are computed for the authenticated user.

## Realtime (not yet chosen)

The app consumes a `RealtimeClient` ([`src/api/realtime.ts`](../src/api/realtime.ts)) per open conversation,
receiving `message`, `reactions`, `typing` and `read` events, and sending typing pings. Any authenticated
transport works (Supabase Realtime with RLS, or a WebSocket on the API service) as long as it only delivers a
community's events to its members. Until it exists, the HTTP build polls the inbox and open conversation every 15 s.

## Not in the contract yet

Push-notification device registration, reporting and blocking, following people, profile photos (needs `POST /media`
wired to the profile), and community creation.
