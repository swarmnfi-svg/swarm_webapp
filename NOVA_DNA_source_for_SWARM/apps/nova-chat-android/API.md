# NOVA Chat Android — Mobile API Contract

**Version:** `client-v1`  
**Base paths:** BPG `https://erp.empowerbpg.com` · SaaS `https://accounts.empowerapp.in`  
**Auth:** Bearer access token (1 h) + refresh token (30 d)  
**RBAC:** Server-enforced on every route — client must not gate security locally.

---

## Authentication

### POST `/api/client/v1/auth/login`

NOVA Chat Android login (email/password → bearer tokens).

**Request**
```json
{
  "client": "nova-android",
  "platform": "android",
  "appKind": "nova",
  "email": "user@example.com",
  "password": "••••••••",
  "deviceId": "optional-install-id",
  "installId": "optional-install-id"
}
```

**Success — token ready (200)**
```json
{
  "ok": true,
  "apiVersion": "client-v1",
  "status": "token-ready",
  "authMode": "bearer",
  "tokenType": "Bearer",
  "accessToken": "emp1....",
  "refreshToken": "empr_...",
  "expiresIn": 3600,
  "refreshExpiresAt": "2026-08-25T12:00:00.000Z",
  "mfa": { "required": false, "verified": true },
  "serverTime": "2026-07-26T12:00:00.000Z"
}
```

**MFA required (200)**
```json
{
  "ok": true,
  "status": "mfa-required",
  "mfa": {
    "required": true,
    "verified": false,
    "challengeType": "totp",
    "verifyPath": "/api/client/v1/auth/mfa/verify"
  }
}
```

**Errors:** `401 INVALID_CREDENTIALS` · `423 ACCOUNT_LOCKED` · `403 ACCOUNT_DISABLED` · `403 PASSWORD_CHANGE_REQUIRED`

Store tokens in EncryptedSharedPreferences / DataStore. Send access token on all authenticated requests:

```http
Authorization: Bearer emp1....
```

---

### POST `/api/client/v1/auth/token`

Refresh an expired access token.

**Request**
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "empr_..."
}
```

**Success (200)**
```json
{
  "ok": true,
  "apiVersion": "client-v1",
  "authMode": "bearer",
  "tokenType": "Bearer",
  "accessToken": "emp1....",
  "refreshToken": "empr_...",
  "expiresIn": 3600,
  "refreshExpiresAt": "2026-08-25T12:00:00.000Z",
  "serverTime": "2026-07-26T13:00:00.000Z"
}
```

Refresh tokens are single-use (rotated on each refresh).

---

### GET `/api/client/v1/auth/me`

Profile, plane, and NOVA capability flags.

**Headers:** `Authorization: Bearer ...`  
**RBAC:** `staff.self.read`

**Success (200)**
```json
{
  "ok": true,
  "apiVersion": "client-v1",
  "me": {
    "id": "cuid",
    "name": "Alex",
    "email": "alex@example.com",
    "role": "STAFF",
    "grantedPermissions": ["staff.self.read", "ai.assistant.read"],
    "staff": null,
    "plane": "bpg",
    "aiAssistantEnabled": true,
    "novaEnabled": true
  }
}
```

`plane` is derived from host (`bpg` on `erp.empowerbpg.com`, else `saas`).  
`novaEnabled` = platform flag ON **and** user has `ai.assistant.read`.

---

## NOVA Chat

All NOVA routes require `Authorization: Bearer ...` and `ai.assistant.read`.

### POST `/api/client/v1/nova/chat`

Send a message; receive a NOVA reply (same pipeline as web bubble / `answerNovaQuery`).

NovANALYSER tools are available when server has `NOVA_NOVANALYSER_ENABLED=1`.

**Request**
```json
{
  "message": "How many open tasks do I have?",
  "conversationId": "optional-existing-conversation-id",
  "history": [
    { "role": "user", "content": "Earlier question" },
    { "role": "assistant", "content": "Earlier answer" }
  ]
}
```

**Success (200)**
```json
{
  "ok": true,
  "apiVersion": "client-v1",
  "answer": "You have 3 open tasks.",
  "links": [{ "title": "Tasks", "href": "/tasks" }],
  "toolsUsed": ["tasks_summary"],
  "periodLabel": null,
  "conversationId": "conv-id",
  "provenance": {
    "period": "today",
    "sources": ["tasks"],
    "freshness": "live"
  },
  "pack": null,
  "canSaveReport": false,
  "options": [],
  "clarifyKind": null
}
```

Also returns `pack` + `canSaveReport` when a savable snapshot is present, and `options` / `clarifyKind` for clarify chips.

**Errors:** `400` empty message · `403 FORBIDDEN` / `AI_ASSISTANT_DISABLED` · `429` daily quota / concurrency

---

### POST `/api/client/v1/nova/chat/clear`

Reset DialogState for a conversation (same as web Clear). Does not delete message rows.

**Request:** `{ "conversationId": "optional" }`

---

### GET `/api/client/v1/nova/threads`

Inbox list — pinned **NOVA** + **Tasks / Approvals / Updates** (RBAC-gated).

**Success (200)**
```json
{
  "ok": true,
  "apiVersion": "client-v1",
  "threads": [
    {
      "id": "primary",
      "kind": "primary",
      "title": "NOVA",
      "subtitle": "Ask anything about your work",
      "href": "/nova/chat",
      "unread": 0,
      "pinned": true
    },
    {
      "id": "updates",
      "kind": "updates",
      "title": "Updates",
      "subtitle": "Task assigned to you",
      "href": "/nova/updates",
      "unread": 2
    }
  ],
  "totalUnread": 2
}
```

---

### GET `/api/client/v1/nova/threads/{id}/messages`

Thread messages. `id` = `primary` | `tasks` | `approvals` | `updates`.

**Query params:** `cursor` (ISO timestamp) · `limit` (1–100, default 50)

**Primary thread success (200)**
```json
{
  "ok": true,
  "apiVersion": "client-v1",
  "threadId": "primary",
  "conversationId": "conv-id",
  "messages": [
    { "id": "msg-1", "role": "user", "content": "Hi", "at": "2026-07-26T10:00:00.000Z" },
    { "id": "msg-2", "role": "assistant", "content": "Hello!", "at": "2026-07-26T10:00:01.000Z" }
  ],
  "nextCursor": null
}
```

**Updates thread:** messages have `role: "system"`, plus `title`, `href`, `read`.

---

### GET `/api/client/v1/nova/notifications`

Updates channel feed (Notification table, RBAC-filtered).

**Success (200)**
```json
{
  "ok": true,
  "apiVersion": "client-v1",
  "messages": [
    {
      "id": "notif-1",
      "title": "Task assigned",
      "detail": "Review invoice #1234",
      "href": "/tasks/abc",
      "read": false,
      "at": "2026-07-26T09:00:00.000Z",
      "priority": "normal",
      "sourceModule": "tasks"
    }
  ]
}
```

---

## Dev testing (emulator)

| Flavor / build | Base URL |
|--------|----------|
| BPG release / default debug | `https://erp.empowerbpg.com` |
| SaaS release / default debug | `https://accounts.empowerapp.in` |
| Either debug + `-PnovaDebugLocalApi=true` | `http://10.0.2.2:3000` |

**Smoke flow**
```bash
# 1. Login
curl -s -X POST http://localhost:3000/api/client/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"client":"nova-android","platform":"android","appKind":"nova","email":"USER","password":"PASS"}'

# 2. Me
curl -s http://localhost:3000/api/client/v1/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# 3. Threads
curl -s http://localhost:3000/api/client/v1/nova/threads \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# 4. Chat
curl -s -X POST http://localhost:3000/api/client/v1/nova/chat \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"message":"How many open tasks?"}'
```

---

## Reports (Bearer)

Cookie **or** Bearer via `requireClientApiUser` (middleware allowlisted).

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/nova/reports` | List |
| POST | `/api/nova/reports` | Save `{ title?, pack, narrative? }` |
| GET | `/api/nova/reports/{id}?format=txt\|csv\|pdf\|json` | Download |
| DELETE | `/api/nova/reports/{id}` | Delete |
| POST | `/api/nova/reports/{id}/regenerate` | New snapshot id |

---

### POST `/api/client/v1/auth/mfa/verify`

Native TOTP after `mfa-required` login. Body: `{ email, password, code }` → bearer tokens.

---

## Deferred / blocked

- FCM push send (needs Firebase project + `google-services.json` + server key; Android scaffold is no-op)
- WebSocket streaming replies
- Offline Room cache sync

---

## Error envelope

```json
{
  "ok": false,
  "error": "Forbidden",
  "code": "FORBIDDEN",
  "message": "Human-readable detail when present"
}
```

Common codes: `UNAUTHORIZED` · `SESSION_REVOKED` · `MFA_CHALLENGE_REQUIRED` · `FORBIDDEN` · `AI_ASSISTANT_DISABLED` · `INVALID_REFRESH_TOKEN`
