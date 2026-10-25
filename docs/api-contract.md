# Kinnoc API integration (mobile ↔ backend)

The mobile app talks to the **Kinnoc API** (`kinnoc-api` repository). That repository's documentation is the
source of truth for routes, payloads, rules and errors:

- `README.md` (API conventions, identity, endpoints)
- `docs/communities.md` (communities, membership, roles, images)
- `docs/chat.md` (messages, read positions, inbox, Socket.IO protocol)

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
| `profile.update` | `PATCH /profiles/me` (`displayName`, `bio`) |
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

## Realtime

[`src/api/http/socket.ts`](../src/api/http/socket.ts) implements `RealtimeClient` with `socket.io-client`:

- One connection, opened by the first open conversation, closed 30 s after the last one and while the app
  is in the background.
- `subscribe` on every (re)connect; its acknowledgement's `lastSeq` triggers catch-up
  (`GET …/messages?after=<newest cached seq>`, following `nextCursor`). Sequence numbers have no gaps, so
  nothing is missed.
- Events: `message`, `message:deleted`, `typing` (shown for 5 s), `read` (the viewer's own position, synced
  across devices), `subscription:ended` (membership ended: the conversation closes and the join gate returns).
- Duplicates from live delivery, catch-up and send responses are merged by ID, client ID and `seq`
  ([`messageCache.ts`](../src/features/communities/messageCache.ts)). Messages are sent over HTTP, which is
  idempotent by `clientId`.
- The inbox is not covered by socket events (they go to subscribers of an open conversation), so it refreshes
  every 15 s.

## Backend capabilities the app does not use yet

- Socket sends (`message:send`): HTTP sends are used instead (same idempotency and broadcast).
- Profile photo upload (`avatars` bucket, `PATCH /profiles/me { avatarKey }`), profile visibility settings,
  `PUT /users/me/interests` and `GET /profiles/:username` (other people's profiles).
- Unlisted communities are reachable by ID, but the app has no share link or deep link for them yet.

## Not in the API yet

Feed and posts, Discover, notifications and push, stories, saved items, reactions, message attachments,
mentions, mute and pin, follows, headline/location/website on profiles, community deletion, bans and reports.
In `http` mode `api.capabilities` hides those controls, and screens that depend on them show
"… isn't available yet" instead of an error. The sample-data build (`EXPO_PUBLIC_API_MODE=mock`) still shows them.
