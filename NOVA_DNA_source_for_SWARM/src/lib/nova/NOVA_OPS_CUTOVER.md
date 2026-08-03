# NOVA ops cutover — DBA readonly + report bucket

**Audience:** DBA / Railway deployer / ops  
**Product rule:** NOVA skills never write operational ERP. This cutover hardens that at the **database role** and documents the **report object prefix**.  
**Code already ready:** `prisma-readonly.ts`, `scripts/nova-readonly-role-scaffold.sql`, `semantic/readonly-cutover.ts`, `reports/object-keys.ts`  
**Version policy:** Docs + code. Ops checklist here; product ships (My reports / upload / retention) bump semver (e.g. **3.0.1**). No ERP migrations required for readonly cutover.

**Related:** [`NOVA_3_IMPLEMENTATION.md`](./NOVA_3_IMPLEMENTATION.md) §7 / §10 · [`NOVA_FULL_AUDIT_CHECKLIST.md`](./NOVA_FULL_AUDIT_CHECKLIST.md) RO3–RO5 / RP6 · checklist export `NOVA_READONLY_CUTOVER_CHECKLIST`

---

## 0. Preconditions

| Check | Notes |
|-------|--------|
| Sprint 3 report plane usable | Save Month pack → list → download ACL re-check → regenerate = new id |
| Skills import gate | CI: skills use `@/lib/nova/prisma-readonly` only |
| App role URL | Production `DATABASE_URL` stays the **writable** app role (NOVA plane + ERP writes for humans) |
| Object storage | Production already has `STORAGE_PROVIDER=s3` + `STORAGE_*` (same bucket as uploads/backups is OK) |

**Do not** run role DDL from the app process. Apply as Postgres owner / DBA only.

---

## 1. Create Postgres role `nova_readonly` (SELECT-only)

### 1.1 Decide grant scope

Skills use Prisma across finance / HR / ops masters. Practical production default:

1. **CONNECT** + **USAGE** on `public`
2. **SELECT** on all current tables (and sequences not required for reads)
3. **Default privileges** so future migrations stay readable
4. **REVOKE SELECT** on auth/session secret tables (recommended)

There are **no dedicated SQL views** required for cutover today. If DBA later adds approved views (e.g. `nova.v_*`), grant `SELECT` on those views and optionally revoke base tables skills no longer need.

### 1.2 Apply (psql as owner)

Replace password, database name, and schema if your Railway Postgres differs. Prisma tables live in **`public`** with PascalCase names matching models (`"Session"`, `"User"`, …).

```sql
-- === NOVA readonly role (review before prod) ===
-- Source of truth for steps: this doc; scaffold pointer: scripts/nova-readonly-role-scaffold.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nova_readonly') THEN
    CREATE ROLE nova_readonly LOGIN PASSWORD 'CHANGE_ME_STRONG';
  END IF;
END
$$;

-- Substitute the real DB name from DATABASE_URL (Railway often uses a generated name — not always empower_app_db)
GRANT CONNECT ON DATABASE "<db_name>" TO nova_readonly;

GRANT USAGE ON SCHEMA public TO nova_readonly;

-- Approved surface (v1): all operational + NOVA plane tables, SELECT only
GRANT SELECT ON ALL TABLES IN SCHEMA public TO nova_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO nova_readonly;

-- Optional: future sequences if any raw SQL needs them (Prisma skill path usually does not)
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nova_readonly;

-- Recommended REVOKEs — session tokens / MFA secrets must not be readable via skill URL
REVOKE SELECT ON TABLE "Session" FROM nova_readonly;
REVOKE SELECT ON TABLE "UserMfaFactor" FROM nova_readonly;

-- Optional hardening (uncomment if skills never need these rows):
-- REVOKE SELECT ON TABLE "BackupRecord" FROM nova_readonly;
-- REVOKE SELECT ON TABLE "User" FROM nova_readonly;  -- only if User reads are unused; Staff/skills may need User joins — verify first

-- Confirm role cannot write
-- (smoke in §4)
```

**Password:** generate offline (`openssl rand -base64 32`), store in Railway secret only — never commit.

**NOVA plane tables** (`NovaConversation`, `NovaMessage`, `NovaEntityAlias`, `NovaReport`): SELECT for the readonly role is fine; **INSERT/UPDATE/DELETE** must remain only on the app `DATABASE_URL` role (`memory.ts`, `aliases.ts`, `report-service.ts`).

### 1.3 Connection string shape

```text
postgresql://nova_readonly:<password>@<host>:<port>/<database>?sslmode=require
```

Use the same host/DB as `DATABASE_URL`, different **user**. Prefer Railway’s private networking hostname if the web service already uses it for `DATABASE_URL`.

---

## 2. Railway env — `NOVA_READONLY_DATABASE_URL` (+ optional REQUIRE)

On the **empower** web service → **Variables** (same service that runs Next.js):

| Variable | Required | Value |
|----------|----------|--------|
| `NOVA_READONLY_DATABASE_URL` | **Yes** for isolation cutover | URL from §1.3 |
| `NOVA_READONLY_REQUIRE` | Optional | Set to `1` **only after** §4 smoke passes |

### Behavior (`src/lib/nova/prisma-readonly.ts`)

| State | Effect |
|-------|--------|
| URL set | Skills use dedicated readonly datasource |
| URL missing, `NOVA_READONLY_REQUIRE` unset | Fall back to `DATABASE_URL` (local/CI / pre-cutover) |
| URL missing, `NOVA_READONLY_REQUIRE=1`, `NODE_ENV=production` | **Fail closed** — client construction throws |

### Deploy note

- Setting env vars alone may restart the service — that is OK; it is **not** an app version bump.
- Prefer **one** release trigger per change (`git push` **or** `railway up`, never both). For env-only cutover, Railway variable save + redeploy is enough; no code change required.
- Leave `NOVA_READONLY_REQUIRE` **unset** until SELECT smoke and write-deny smoke are green.

### Checklist order (from `readonly-cutover.ts`)

1. Report plane live  
2. Role created  
3. Env URL set  
4. Import gate still green  
5. Smoke reads + write deny  
6. Plane writes still on app role  
7. Optional `NOVA_READONLY_REQUIRE=1`

---

## 3. Report bucket (R2/S3) + download + retention

### 3.1 Bucket / prefix (handoff)

| Item | Default |
|------|---------|
| Bucket | Existing production `STORAGE_BUCKET` (Tigris / R2 / S3-compatible) |
| Provider vars | `STORAGE_PROVIDER=s3`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_REGION` (often `auto`) |
| NOVA prefix | **`nova/reports/`** only — never write ERP ledger objects under this prefix |
| Key shape | `nova/reports/{tenantId}/{ownerUserId}/{reportId}/{kind}` |
| Kinds | `snapshot.json`, `report.txt`, `report.csv`, `report.pdf` |

Helpers: `src/lib/nova/reports/object-keys.ts` (`NOVA_REPORT_OBJECT_PREFIX`, `buildNovaReportObjectKeys`).

**App writes today:** `NovaReport` rows + envelope/`objectKeys` metadata via `@/lib/prisma`. Artifact bytes are rendered on download from the frozen `packSnapshot` (API stream). **Bucket upload + retention cron are still open** — keys are shaped so ops can cut over without renaming.

### 3.2 Download paths

| Path | Status | Security |
|------|--------|----------|
| `GET /api/nova/reports` | Live | List; per-item RBAC |
| `GET /api/nova/reports/[id]?format=txt\|csv\|json\|pdf` | Live | Owner (or ADMIN/SUPER_ADMIN) + **current** `permissionsUsed` re-check + not expired |
| Signed URL to bucket object | **Not shipped** (`@aws-sdk/s3-request-presigner` not wired) | When enabled: mint short-TTL GET URL **only after** same RBAC re-check as `getNovaReportForDownload`; never public ACL on `nova/reports/**` |

**Recommended signed-URL policy (when implemented):**

- TTL **60–300 seconds**
- Method GET only; content-disposition attachment
- Key must match envelope `objectKeys` for that report id
- Deny if `expiresAt` passed or permission revoked

Until then, keep **app-mediated** download (current). Upload cutover can still put objects for durability/backup without changing the public API.

### 3.3 Retention defaults (code)

From `report-service.ts` / `defaultNovaReportExpiresAt`:

| Sensitivity | Default retention | Cap |
|-------------|-------------------|-----|
| `standard` | **90 days** | — |
| `sensitive` / `restricted` | **30 days** (or `retentionDays` if lower) | **≤ 30** |

- `NovaReport.expiresAt` is set at save; download returns **403** when expired.
- **Retention job (3.0.1+):** `purgeExpiredNovaReports` + `POST /api/nova/reports/cron` (optional `NOVA_REPORTS_CRON_SECRET`, else `BACKUP_CRON_SECRET`). Deletes expired rows **and** matching bucket keys under `nova/reports/...` when `STORAGE_*` is configured; does not touch other prefixes (`uploads/`, `backups/`). Wire Railway cron when ready — code path is live.
- Chat memory retention is separate (`memory.ts` sensitive shorter window) — not the report bucket job.

### 3.4 Upload cutover (code + ops)

1. Confirm `isObjectStorageConfigured()` true on web service.  
2. On save (**3.0.1+**): best-effort `putObject` for snapshot/txt/csv/pdf under `buildNovaReportObjectKeys` after envelope freeze (`reports/artifact-storage.ts`). DB row remains source of truth if upload is skipped.  
3. Keys already persisted in `NovaReport.objectKeys` / envelope.  
4. Cron: `WHERE expiresAt < now()` → delete objects → delete row (`reports/retention.ts`).  
5. Smoke: save → `HeadObject` / list prefix → download still RBAC-gated.

**Invariant:** report save path must never INSERT/UPDATE operational ERP tables — metadata + optional bucket only (`RP7`).

---

## 4. Verification / smoke

**Preferred one-shot (physical role):** connect with the dedicated Railway RO URL — never `DATABASE_URL`.

```bash
# Pull RO URL from Railway secrets / dashboard (do not commit). Then:
NOVA_READONLY_DATABASE_URL='postgresql://nova_readonly:…@host:5432/<db>?sslmode=require' \
  npm run smoke:nova-readonly
# same as: npx tsx scripts/nova-readonly-role-smoke.ts
```

Exit `2` if the env var is missing or equals `DATABASE_URL`. Exit `1` if SELECT fails or any INSERT/UPDATE/DELETE/DDL succeeds. Pass means the role can read and is denied writes/DDL.

Companion SQL (psql owner drift + nova_readonly deny statements): [`scripts/nova-readonly-role-smoke.sql`](../../../scripts/nova-readonly-role-smoke.sql).

This smoke does **not** replace `@/lib/nova/prisma-readonly` — skills keep using that client; the script opens a one-shot client on the RO URL only.

### 4.1 Role privileges (psql as owner)

```sql
-- Login capability
SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = 'nova_readonly';

-- Table privileges sample
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'nova_readonly'
  AND table_schema = 'public'
ORDER BY table_name
LIMIT 50;

-- Session must NOT be selectable
SELECT has_table_privilege('nova_readonly', '"Session"', 'SELECT') AS session_select;  -- expect false
SELECT has_table_privilege('nova_readonly', '"SalesInvoice"', 'SELECT') AS invoice_select; -- expect true (name may vary — pick a real ERP table)
SELECT has_table_privilege('nova_readonly', '"NovaReport"', 'INSERT') AS nova_insert; -- expect false
```

### 4.2 Write deny (connect as `nova_readonly`)

Prefer `npm run smoke:nova-readonly`. Manual equivalent:

```sql
-- Must fail
INSERT INTO "NovaReport" (id, "tenantId", "ownerUserId", title, "packId", "packVersion",
  "schemaVersion", "envelopeSchemaVersion", envelope, "packSnapshot", narrative,
  sensitivity, "dataAsOf", "expiresAt", checksum, "objectKeys")
VALUES ('smoke_deny', 'default', 'x', 'x', 'month_performance', '1', 1, 1,
  '{}'::jsonb, '{}'::jsonb, 'x', 'standard', now(), now() + interval '1 day', 'x', '[]'::jsonb);

UPDATE "Customer" SET "customerName" = "customerName" WHERE false;
DELETE FROM "SalesInvoice" WHERE false;
CREATE TABLE "__nova_ro_smoke_deny___ddl" (id text PRIMARY KEY);
```

Expect: `permission denied` (or equivalent). **Never** run destructive statements as the app role for this smoke.

### 4.3 Read smoke (as `nova_readonly`)

```sql
SELECT count(*) FROM "NovaReport";
SELECT count(*) FROM "Customer";
-- Optional pack-related tables you know exist:
-- SELECT 1 FROM "Project" LIMIT 1;
```

### 4.4 App / Railway smoke

1. Set `NOVA_READONLY_DATABASE_URL` (REQUIRE still off). Redeploy/restart.  
2. Health: `GET https://erp.empowerbpg.com/api/health` — note version; env-only change need not bump semver.  
3. Director session: ask **“How is this month going?”** (Month pack) — must return facts.  
4. Save report → `GET /api/nova/reports` → download `?format=txt` (and pdf/csv).  
5. Confirm conversations / aliases / new `NovaReport` rows still persist (app role writes).  
6. Optionally: temporary wrong password in readonly URL → skill reads fail loudly; restore.  
7. After green: set `NOVA_READONLY_REQUIRE=1` and restart once.

### 4.5 Bucket smoke (when upload lands)

```bash
# List NOVA prefix only (creds from STORAGE_*)
aws s3 ls "s3://$STORAGE_BUCKET/nova/reports/" --endpoint-url "$STORAGE_ENDPOINT"
```

Expect keys only under `nova/reports/{tenant}/{owner}/{id}/…`. Download API must still 403 after permission revoke even if the object exists.

### 4.6 Railway grant drift (after migrations)

Prisma migrations often create new tables as the **owner/app** role. If `ALTER DEFAULT PRIVILEGES … GRANT SELECT ON TABLES TO nova_readonly` was never applied (or was applied under a different grantor), skills lose SELECT on new tables — or, worse, a manual grant accidentally adds INSERT/UPDATE/DELETE.

**When to re-check:** after every production `prisma migrate deploy`, schema push, or DBA grant change.

**Owner audit (section B in `scripts/nova-readonly-role-smoke.sql`):**

| Check | Expect |
|-------|--------|
| `pg_roles` for `nova_readonly` | `rolcanlogin`, not superuser / createdb / createrole |
| `table_privileges` write types for grantee `nova_readonly` | **0 rows** |
| `has_database_privilege(…, 'CREATE')` | false |
| `Customer` / ERP / `NovaReport` SELECT | true |
| `"Session"` / `"UserMfaFactor"` SELECT | false |

**Repair (owner, review before prod):**

```sql
GRANT SELECT ON ALL TABLES IN SCHEMA public TO nova_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO nova_readonly;
REVOKE SELECT ON TABLE "Session" FROM nova_readonly;
REVOKE SELECT ON TABLE "UserMfaFactor" FROM nova_readonly;
```

Then re-run `npm run smoke:nova-readonly` with the Railway `NOVA_READONLY_DATABASE_URL`.

**Env drift:** if Railway `NOVA_READONLY_DATABASE_URL` is unset while `NOVA_READONLY_REQUIRE=1`, the app fails closed (`prisma-readonly.ts`). If REQUIRE is off, skills silently fall back to writable `DATABASE_URL` — treat that as isolation regression even when the DB role itself is still correct.

---

## 5. Rollback

| Step | Action |
|------|--------|
| App fallback | Unset `NOVA_READONLY_REQUIRE`; unset or clear `NOVA_READONLY_DATABASE_URL` → skills fall back to `DATABASE_URL` |
| Role | Leave role in place (harmless) or `REVOKE ALL` / `DROP ROLE` after no connections |
| Bucket | Objects under `nova/reports/` are isolated; deleting prefix does not affect ERP uploads |

---

## 6. Owner checklist (sign-off)

| # | Item | Owner | ☐ |
|---|------|-------|---|
| 1 | `nova_readonly` created + SELECT grants + Session/MFA revoke | DBA | |
| 2 | Write deny proven (`npm run smoke:nova-readonly` + §4.6 drift) | DBA | |
| 3 | `NOVA_READONLY_DATABASE_URL` on Railway web service | Deployer | |
| 4 | Month pack + report download smoke | Steward / Deployer | |
| 5 | `NOVA_READONLY_REQUIRE=1` (optional, after smoke) | Deployer | |
| 6 | `STORAGE_*` confirmed; prefix `nova/reports/` reserved | Ops | |
| 7 | Retention defaults (90 / ≤30); cron route live — schedule Railway job | Ops | |
| 8 | No `package.json` bump solely for ops-doc-only commits | Deployer | |

---

*Ops handoff only. No operational ERP writes. Fold into deployer-owned release when convenient.*
