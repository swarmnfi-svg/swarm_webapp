# Reply to Swarm team — Centralized Auth Plan

**Source reviewed:** `CENTRALIZED_AUTH_PLAN.md`  
**Date:** 2026-07-23  
**From:** Mike / emPOWER

---

## Verdict

**Accept-with-changes — please do not build as written.**

The direction is partly right: shared human identity, app operational data stays local, and no cookie SSO across root domains. The concrete topology is wrong. As written, the plan invents a Swarm-owned IdP and misnames our product plane.

### Nomenclature (mandatory)

| Your plan wording | Our name | Reality |
|-------------------|----------|---------|
| `accounts.swarm.co.in` / new `swarm-accounts` IdP | **Wrong** — use **emPOWER SaaS** identity | Live auth host: **`accounts.empowerapp.in`**. Shared identity DB: **emPOWER SaaS Railway Postgres**. |
| `empowerapp.in` as React + Express ERP | **Wrong** | Apex **`empowerapp.in`** = marketing. Auth app = **emPOWER SaaS** on **`accounts.empowerapp.in`**. |
| Ambiguous **"emPOWER ERP"** | Split the names | **emPOWER SaaS** = shared-login plane. **BIOPOWER** = `erp.empowerbpg.com` — **separate identity**. |

### Top corrections

1. **Drop `accounts.swarm.co.in` as identity SoT.** Shared login DB = **emPOWER SaaS Railway Postgres**.
2. **Do not treat `empowerapp.in` as the ERP/auth app.**
3. **Never point shared login at BIOPOWER** (`erp.empowerbpg.com`).
4. Keep app operational DBs local — fine.
5. Auth-code / OIDC-style SSO as a layer on SaaS identity.

### Blockers for revised plan

1. **DDL owner:** emPOWER SaaS Prisma owns identity schema; Swarm is consumer only.
2. **Password hash:** bcrypt rounds **12** / `passwordHash`.
3. **MFA:** Will Swarm honor SaaS `mfaEnabled` / factors before issuing JWT?
4. **Protocol:** Auth-code with IdP host = **`accounts.empowerapp.in`**.

### Unchanged — Partner API

Partner pull stays **org-scoped API keys**. Do not block Partner API on centralized human login.
