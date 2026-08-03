# NOVA governed aliases — ops runbook

**Principle:** Suggestions and unmatched triage drafts **never** auto-promote. Only `CONFIRMED` rows bind entity resolve. Do **not** invent target IDs.

## Resolver order

1. Exact ERP id  
2. Exact name  
3. **Confirmed** alias (`NovaEntityAlias.status = CONFIRMED`)  
4. Ranked fuzzy → clarify on multi-match  

Seed aliases (`NOVA_SEED_CONFIRMED_ALIASES`) bind **only** in tests / `NOVA_SEED_ALIASES=1` — never production by default.

## Weekly unmatched → alias ritual

1. Open `/system/nova-unmatched` (ADMIN / SUPER_ADMIN / DIRECTOR).  
2. Skim **Triage drafts** for `→ alias` outcomes.  
3. Look up the real party/project/employee in ERP (Customers / Vendors / Projects / Staff).  
4. Copy the **real database id** (cuid), optional code + display name.  
5. On the unmatched page **Alias drafts** table:
   - Paste `targetId` (required) + entity type  
   - **Create draft** → row stays `DRAFT` (resolver ignores it)  
   - Review, then **Confirm** (validates target still exists) or **Reject**  
6. Re-ask the shorthand in NOVA; it should resolve uniquely or clarify.

## Confirm rules (hard)

| Rule | Detail |
|------|--------|
| Real target | Confirm refuses if customer/vendor/project/staff id is missing |
| No invented seeds | Never confirm `seed-project-*` / `seed-customer-*` in prod |
| Audit | `confirmedBy` + `confirmedAt` always set |
| Draft ≠ live | `DRAFT` / `REJECTED` never returned by `findConfirmedNovaAliases` |

## Optional admin seed (real IDs only)

If ops has already verified IDs from DB queries:

```ts
// Admin-only helper — target must exist; never pass fictional ids.
await confirmNovaAliasWithTargetCheck(draftId, opsUserId);
```

There is **no** bulk “import ChatGPT nicknames” path. Prefer one alias at a time from unmatched.

## Failure mode (incomplete UI historically)

If confirm UI was missing, leave aliases as drafts and resolve via this page. Unmatched shorthand without a confirmed alias continues to **clarify / search** — never silent invent.

## Related code

- `src/lib/nova/semantic/aliases.ts`  
- `src/app/(app)/system/nova-unmatched/`  
- Prisma `NovaEntityAlias`
