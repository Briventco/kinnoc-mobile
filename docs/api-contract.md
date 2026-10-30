# Kinnoc API integration (mobile ↔ backend)

The mobile app talks to the **Kinnoc API** (`kinnoc-api` repository). That repository's documentation is the
source of truth for routes, payloads, rules and errors:

- `README.md` (API conventions, identity, endpoints)
- `docs/api-contract.md` (conventions, and the feed: posts, likes, comments, post media)
- `docs/communities.md` (communities, membership, roles, images)
- `docs/chat.md` (messages, read positions, Delivered and Seen receipts, inbox, Socket.IO protocol)

In the app, screens see only [`src/api/contract.ts`](../src/api/contract.ts) and the domain types in
[`src/api/types.ts`](../src/api/types.ts). [`src/api/http/`](../src/api/http/) implements that contract against
the API and maps every payload field explicitly ([`mappers.ts`](../src/api/http/mappers.ts)).

## Connection

| | Value |
| --- | --- |
| HTTP base URL | `EXPO_PUBLIC_API_URL`, e.g. `https://kinnoc-api.onrender.com/api/v1` |
| Socket.IO | origin of the API URL, namespace `/chat`, path `<API prefix>/socket.io` (derived in `src/config/env.ts`) |
| Auth | `Authorization: Bearer <Supabase access token>` on HTTP; `auth: { token }` in the Socket.IO handshake, never the query string |
| Success / error | `{ "data": … }` / `{ "error": { code, message, details, requestId } }`; the app branches on `error.code` |

The app holds only public configuration: the API URL, the Supabase project URL and the anon (publishable) key.
It never connects to Postgres or Prisma and holds no service-role key.

## Sessions and errors

- After sign-in and on every launch the app calls `POST /users/provision` (idempotent). A missing profile
  shows a "Set up your profile" step that calls `POST /profiles`; the API ignores names kept in Supabase
  sign-up metadata.
- A `401` with `AUTH_TOKEN_EXPIRED`/`AUTH_TOKEN_INVALID` refreshes the Supabase session and retries once;
  only a second `401` signs the user out. `503 AUTH_UNAVAILABLE` never signs out.
- The Socket.IO handshake fetches a current token on every (re)connect. After `session:expired` the client
  reconnects with a refreshed token; handshake refusals for expired tokens are retried with a fresh one, others
  (suspended, unprovisioned) stop the connection.
- `ApiError.serverCode` carries the API code; [`errors.ts`](../src/api/errors.ts) turns the codes users can hit
  (for example `OWNER_CANNOT_LEAVE`, `INVITATION_REQUIRED`, `RATE_LIMITED`) into plain language.

## Contract operations → API routes

| Operation | Route |
| --- | --- |
| `account.load` / `account.createProfile` | `POST /users/provision` / `POST /profiles` then `GET /users/me` |
| `profile.me` | `GET /users/me` (+ `GET /users/me/inbox` for the community count) |
| `profile.posts` | `GET /users/me/posts?cursor=` (own), `GET /profiles/:username/posts?cursor=` (others) |
| `profile.update` | `PATCH /profiles/me` (`displayName`, `bio`) |
| `discover.home` | `GET /events?limit=12` (upcoming, soonest first): starting within 7 days → "This week", the rest → "Upcoming events" |
| `discover.list` | `GET /events?q=&cursor=` (`q` sent from 2 characters). Opportunities and resources are unsupported |
| `discover.get` | `GET /events/:idOrSlug` (published or cancelled; `EVENT_NOT_FOUND` otherwise) |
| `communities.browse` | `GET /communities?q=&category=&cursor=` (public only; `q` sent from 2 characters) |
| `communities.categories` | `GET /interests` |
| `communities.get` / `create` / `update` | `GET` / `POST /communities` / `PATCH /communities/:ref` |
| `communities.join` | `POST /communities/:ref/join`, then `GET /communities/:ref` |
| `communities.leave` / `cancelRequest` / `declineInvitation` | `POST …/leave` / `DELETE …/join-request` / `DELETE …/invitation` |
| `communities.mine` | `GET /users/me/communities?status=ACTIVE\|REQUESTED\|INVITED` |
| `communities.members` / `setRole` / `removeMember` / `transferOwnership` | `GET …/members`, `PATCH`/`DELETE …/members/:username`, `POST …/transfer-ownership` |
| `communities.joinRequests` / `approveRequest` / `rejectRequest` | `GET …/join-requests`, `POST …/join-requests/:username/approve\|reject` |
| `communities.invitations` / `invite` / `revokeInvitation` | `GET`/`POST …/invitations`, `DELETE …/invitations/:username` |
| `communities.inbox` / `markRead` | `GET /users/me/inbox` / `POST …/read { lastMessageId? }` |
| `messages.list` / `since` | `GET …/messages?cursor=` (newest first) / `GET …/messages?after=<seq>` then `?cursor=` (oldest first) |
| `messages.send` / `remove` | `POST …/messages { text, clientId, replyToId? }` / `DELETE …/messages/:id` |
| `media.uploadCommunityImage` | Supabase Storage upload to `community-media/<user id>/<uuid>.jpg` with the user's session; the key is sent as `avatarKey`/`coverKey` |
| `feed.list` | `GET /feed?scope=public` (For you tab) / `GET /feed?scope=communities` (Communities tab), `&cursor=` |
| `feed.community` | `GET /communities/:ref/posts?cursor=` |
| `feed.get` / `create` / `update` / `remove` | `GET /posts/:id` / `POST /posts { text, clientId, communityId?, media?, link? }` / `PATCH /posts/:id { text?, link? }` / `DELETE /posts/:id` |
| `feed.setLiked` | `PUT` / `DELETE /posts/:id/like` → `{ likeCount, likedByMe }` |
| `feed.comments` / `replies` | `GET /posts/:id/comments` / `GET /posts/:id/comments/:commentId/replies` (oldest first) |
| `feed.comment` / `editComment` / `removeComment` | `POST /posts/:id/comments { text, clientId, parentId? }` / `PATCH` / `DELETE /posts/:id/comments/:commentId` |
| `media.uploadPostImage` | Supabase Storage upload to `post-media/<user id>/<uuid>.jpg` with the user's session; the key, width and height go in the post's `media` |

## Feed

- **Screens.** Feed tab: For you (`scope=public`) and Communities (`scope=communities`); the Following tab,
  stories and saving are hidden because the API has no follows, stories or saved items. Post detail: comments
  with one level of replies. Community info → Posts: one community's posts. Compose: new posts (to everyone or a
  community the viewer is an active member of) and editing a post's text and link.
- **Pagination.** `nextCursor` only; the next page is requested once at a time and not while a refresh is
  reloading, and lists drop any item that appears twice.
- **Creating posts** ([`drafts.ts`](../src/features/feed/drafts.ts)). Photos are re-encoded as JPEG (longest edge
  1600 px, ≤ 5 MB) and uploaded first; the post is created only with keys storage accepted. A failed post can be
  retried: uploaded photos are not uploaded again, and the same `clientId` is sent while the draft is unchanged, so
  a lost response cannot create a duplicate. A changed draft or a new post gets a new `clientId`. Links are checked
  like the API checks them (absolute http(s), ≤ 2048 characters, no credentials).
- **Likes** ([`likes.ts`](../src/features/feed/likes.ts)). Shown at once; one request per post at a time, and a
  burst of taps ends in the state of the last tap. A refusal returns the post to the server's state.
- **Comments.** `clientId` per comment, reused for retries of the same text. Replying to a reply joins its
  thread (the API allows one level). Authors edit; authors, the post's author and community owners and moderators
  delete. Counts are re-read from `GET /posts/:id` after each change.
- **Deleted posts.** `POST_NOT_FOUND` from any action removes the post from every list.

## Realtime

[`src/api/http/socket.ts`](../src/api/http/socket.ts) implements `RealtimeClient` with `socket.io-client`:

- One connection, opened by the first open conversation, closed 30 s after the last one and while the app
  is in the background.
- `subscribe` on every (re)connect; its acknowledgement's `lastSeq` triggers catch-up
  (`GET …/messages?after=<newest cached seq>`, following `nextCursor`). Sequence numbers have no gaps, so
  nothing is missed.
- Events: `message`, `message:deleted`, `typing` (shown for 5 s), `read` (the viewer's own position, synced
  across devices), `receipts`, `subscription:ended` (membership ended: the conversation closes and the join gate
  returns).
- Duplicates from live delivery, catch-up and send responses are merged by ID, client ID and `seq`
  ([`messageCache.ts`](../src/features/communities/messageCache.ts)). Messages are sent over HTTP, which is
  idempotent by `clientId`.
- The inbox subscribes to every community it lists while it is on screen, and also refreshes every 30 s
  (15 s without a live connection).

### Delivered and Seen

- **State.** Each conversation's `receipts: { deliveredSeq, readSeq }` (aggregates across the other active
  members) are taken from message pages (history and catch-up), the inbox, the `subscribe` acknowledgement and
  `receipts` events, and kept per conversation in the query cache. Each position keeps its highest value, so a
  page requested before a live event cannot move ticks back ([`receipts.ts`](../src/features/communities/receipts.ts)).
- **Ticks** on the viewer's own messages (and their last message in the inbox): Seen (two blue ticks) when
  `seq <= readSeq`, two grey ticks when `seq <= deliveredSeq`, otherwise one tick. Without receipts (an older API)
  one tick. Other people's messages show no status.
- **Acknowledging delivery.** When live messages from others arrive, the socket client sends
  `delivered { communityId, seq }` with the highest `seq` received, batched over 500 ms, one in flight per
  community. While offline only that one number per community waits, and it is sent after reconnecting; a
  timeout is retried, a refusal for lost membership is dropped, and sign-out clears everything. History,
  catch-up and inbox requests already count as delivery on the server.

## Backend capabilities the app does not use yet

- Socket sends (`message:send`): HTTP sends are used instead (same idempotency and broadcast).
- Profile photo upload (`avatars` bucket, `PATCH /profiles/me { avatarKey }`), profile visibility settings,
  `PUT /users/me/interests` and `GET /profiles/:username` (other people's profiles).
- Unlisted communities are reachable by ID, but the app has no share link or deep link for them yet.
- Other people's profiles: posts show the author's name and photo but do not link to a profile, because the app
  has no screen for other people's profiles yet.
- Image `alt` text on posts: the app sends none yet.
- Platform moderators deleting general posts: the app does not know the viewer's platform role, so it offers
  deletion only to authors and community owners and moderators.

## Not in the API yet

Following people and a following or personalised feed, saved posts, reply
previews on feed posts (`topReply`), link previews, editing a post's photos, Discover opportunities and resources, saving events, notifications and push,
stories, reactions, message attachments, mentions, mute and pin, headline/location/website on profiles,
community deletion, bans and reports.
In `http` mode `api.capabilities` hides those controls, and screens that depend on them show
"… isn't available yet" instead of an error. The sample-data build (`EXPO_PUBLIC_API_MODE=mock`) still shows them.
