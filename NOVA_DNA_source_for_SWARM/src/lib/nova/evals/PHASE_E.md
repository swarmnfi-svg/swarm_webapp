# Phase E — Document intelligence (read-only)

**Skill:** `documents_search`  
**Gate:** fail closed without `documents.read`; module filter via `readableDocumentModules`.

## Rules

1. Metadata + citations only (filename, module, record link) — no file bodies in chat.
2. DB/finance skills still win on money/attendance/GST totals.
3. Soft-deny when Staff lack `documents.read`.
4. Empty module ACL → deny (no cross-module leak).

## Tests

`npx vitest run src/lib/nova/skills/system/documents-search.test.ts`
