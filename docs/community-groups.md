# Community Groups — Proposed Backend API Contract

> **Status:** Proposed contract (not yet implemented in `kinnoc-api`).  
> In `kinnoc-mobile`, HTTP integration is isolated in [`src/api/http/groups.ts`](../src/api/http/groups.ts) and gated behind `api.capabilities.communityGroups`. Until the backend deploys these routes, `createHttpApi` sets `communityGroups: false` and any direct call returns an `unsupported` error without falling back to mock data.

---

## 1. Overview

A **Community** acts as the parent space (e.g., *TEDx Junior Show*). Inside a community, administrators can create multiple independent **Groups** (e.g., *General Discussion*, *Organising Team*, *Speakers*, *Volunteers*, *Media and Publicity*). Each group has its own membership, unread count, mute preference, and conversation message stream.

All group-level capabilities shown in the UI are driven by the backend-returned `permissions` object on `CommunityGroup` (never inferred on the client alone).

---

## 2. Data Models

### `ApiGroupPermissions`
```json
{
  "canJoin": true,
  "canLeave": true,
  "canEdit": false,
  "canDelete": false,
  "canManageMembers": false,
  "canSendMessages": true
}
```

### `ApiCommunityGroup`
```json
{
  "id": "grp_01",
  "communityId": "comm_01",
  "name": "Organising Team",
  "description": "Core logistics, stage production, and speaker coordination.",
  "avatarUrl": "https://...",
  "iconName": "sparkles",
  "memberCount": 14,
  "joinPolicy": "APPROVAL",
  "membership": "ACTIVE",
  "role": "ADMIN",
  "unreadCount": 3,
  "isMuted": false,
  "isDefault": false,
  "lastMessage": {
    "seq": 42,
    "senderName": "Ada",
    "isMine": false,
    "text": "Soundcheck starts at 9:00 AM.",
    "kind": "TEXT",
    "sentAt": "2026-11-14T18:00:00.000Z"
  },
  "receipts": {
    "deliveredSeq": 42,
    "readSeq": 39
  },
  "permissions": {
    "canJoin": false,
    "canLeave": true,
    "canEdit": true,
    "canDelete": true,
    "canManageMembers": true,
    "canSendMessages": true
  },
  "createdAt": "2026-11-01T10:00:00.000Z"
}
```

- `joinPolicy`: `"OPEN" | "APPROVAL" | "INVITE_ONLY"`
- `membership`: `"NONE" | "ACTIVE" | "REQUESTED"`
- `role`: `"ADMIN" | "MODERATOR" | "MEMBER" | null`

### `ApiGroupMember`
```json
{
  "user": {
    "username": "ada",
    "displayName": "Adaeze",
    "avatarUrl": "https://..."
  },
  "role": "ADMIN",
  "joinedAt": "2026-11-01T10:05:00.000Z"
}
```

---

## 3. REST Endpoints (`/api/v1`)

### Group Discovery & Lifecycle
- `GET /communities/:communityId/groups`  
  Returns `{ items: ApiCommunityGroup[], canCreateGroup?: boolean }`.
- `GET /communities/:communityId/groups/:groupId`  
  Returns `ApiCommunityGroup`.
- `POST /communities/:communityId/groups`  
  Body: `{ name: string, description: string, joinPolicy: "OPEN" | "APPROVAL" | "INVITE_ONLY", avatarKey?: string | null, iconName?: string | null }`  
  Returns `201 Created` with `ApiCommunityGroup`.
- `PATCH /communities/:communityId/groups/:groupId`  
  Body: Partial update of `{ name, description, joinPolicy, avatarKey, iconName }`  
  Returns `200 OK` with `ApiCommunityGroup`.
- `DELETE /communities/:communityId/groups/:groupId`  
  Returns `204 No Content`.

### Group Membership & Preferences
- `POST /communities/:communityId/groups/:groupId/join`  
  Joins an `OPEN` group or submits a join request for an `APPROVAL` group. Returns `ApiCommunityGroup`.
- `POST /communities/:communityId/groups/:groupId/leave`  
  Leaves the group when `permissions.canLeave` is `true`. Returns `204 No Content`.
- `GET /communities/:communityId/groups/:groupId/members?cursor=...`  
  Returns cursor-paginated `Page<ApiGroupMember>`.
- `POST /communities/:communityId/groups/:groupId/members`  
  Body: `{ username: string, role?: "ADMIN" | "MODERATOR" | "MEMBER" }`  
  Adds an existing community member to the group. Returns `ApiGroupMember`.
- `PATCH /communities/:communityId/groups/:groupId/members/:username`  
  Body: `{ role: "ADMIN" | "MODERATOR" | "MEMBER" }`  
  Returns `ApiGroupMember`.
- `DELETE /communities/:communityId/groups/:groupId/members/:username`  
  Removes a member from the group. Returns `204 No Content`.
- `POST /communities/:communityId/groups/:groupId/read`  
  Body: `{ lastMessageId: string | null }`  
  Marks the group conversation read. Returns `204 No Content`.
- `POST /communities/:communityId/groups/:groupId/mute`  
  Body: `{ muted: boolean }`  
  Returns `204 No Content`.

### Group Messaging (Reuses Chat Architecture)
- `GET /groups/:groupId/messages?cursor=...` -> `ApiMessagePage`
- `GET /groups/:groupId/messages/since?seq=...&cursor=...` -> `ApiMessagePage`
- `POST /groups/:groupId/messages` -> `ApiMessage` (supports `clientId`, `text`, `replyToId`, `attachmentKeys`)
- `DELETE /groups/:groupId/messages/:messageId` -> `204 No Content`
- Reactions reuse existing `PUT /messages/:messageId/reactions/:emoji` and `DELETE /messages/:messageId/reactions/:emoji`.

---

## 4. Realtime Events

Group conversations reuse the existing `ConversationEvent` union (`message`, `deleted`, `reactions`, `typing`, `read`, `subscribed`, `receipts`, `ended`, `error`) by subscribing to room/channel ID `group:<groupId>` (or a unified `conversationId`).
