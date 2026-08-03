/**
 * Phase E — permission-filtered document metadata retrieval (read-only).
 * Not a free RAG agent: filename/module search only; DB still wins on money.
 * Never returns file bodies, balances, or invented ledger totals.
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import {
  detailPathForModule,
  isDocumentModule,
  type DocumentModule,
} from "@/lib/document-modules";
import { filterDocumentsByRecordAcl, readableDocumentModules } from "@/lib/documents-hub";
import { canAccessNovaDocuments } from "@/lib/ai/nova-suggest";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

function extractSearchHint(query: string): string {
  const q = query
    .replace(
      /\b(search|find|look\s*up|lookup|show|list|open|get|fetch|display|give|tell|check|for|about|documents?|files?|attachments?|vault|pdf|contract|photos?|pictures?|images?|site|plant|kindly|please|share|available|related|other|any|have)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  return q.slice(0, 80);
}

export async function runDocumentsSearch(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, entityHint, entityFilterName, resolvedEntityDbId, resolvedEntityType } =
    ctx;
  const name = "documents_search";
  const links: NovaToolLink[] = [];

  if (!canAccessNovaDocuments(user) || !can(user, "documents.read")) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing documents.read — document search is closed without grant",
      },
    };
  }

  const allowedModules = readableDocumentModules(user);
  if (allowedModules.length === 0) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "No document modules are readable for your role",
      },
    };
  }

  const hint = (
    entityFilterName?.trim() ||
    entityHint?.trim() ||
    extractSearchHint(query)
  ).slice(0, 80);

  const projectScoped =
    resolvedEntityType === "project" &&
    resolvedEntityDbId &&
    (allowedModules as string[]).includes("PROJECT");

  // Customer bind: match CUSTOMER vault by recordId (and that customer's PROJECT
  // docs) — stronger than filename-contains alone when DialogState / resolve bound an id.
  let customerProjectIds: string[] = [];
  if (
    resolvedEntityType === "customer" &&
    resolvedEntityDbId &&
    (allowedModules as string[]).includes("PROJECT")
  ) {
    customerProjectIds = (
      await prisma.project.findMany({
        where: { customerId: resolvedEntityDbId },
        select: { id: true },
        take: 100,
      })
    ).map((p) => p.id);
  }

  const customerScoped =
    resolvedEntityType === "customer" &&
    resolvedEntityDbId &&
    ((allowedModules as string[]).includes("CUSTOMER") || customerProjectIds.length > 0);

  const recordScopeOr = [
    ...(projectScoped
      ? [{ module: "PROJECT" as const, recordId: resolvedEntityDbId! }]
      : []),
    ...(customerScoped && (allowedModules as string[]).includes("CUSTOMER")
      ? [{ module: "CUSTOMER" as const, recordId: resolvedEntityDbId! }]
      : []),
    ...(customerScoped && customerProjectIds.length > 0
      ? [{ module: "PROJECT" as const, recordId: { in: customerProjectIds } }]
      : []),
    ...(hint.length >= 2 && (projectScoped || customerScoped)
      ? [{ fileName: { contains: hint, mode: "insensitive" as const } }]
      : []),
  ];

  const where = {
    archived: false,
    module: { in: allowedModules },
    ...(recordScopeOr.length > 0
      ? { OR: recordScopeOr }
      : hint.length >= 2
        ? { fileName: { contains: hint, mode: "insensitive" as const } }
        : {}),
  };

  const [moduleFloorCount, candidates] = await Promise.all([
    prisma.document.count({ where: { archived: false, module: { in: allowedModules } } }),
    prisma.document.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      take: 24,
      select: {
        id: true,
        module: true,
        recordId: true,
        fileName: true,
        fileType: true,
        uploadedAt: true,
      },
    }),
  ]);

  const rows = (await filterDocumentsByRecordAcl(user, candidates)).slice(0, 8);
  const totalInScope = moduleFloorCount;

  const citations = rows.map((r) => {
    const mod = isDocumentModule(r.module) ? (r.module as DocumentModule) : null;
    const recordHref = mod ? detailPathForModule(mod, r.recordId) : "/documents";
    return {
      documentId: r.id,
      fileName: r.fileName,
      module: r.module,
      recordId: r.recordId,
      fileType: r.fileType,
      uploadedAt: r.uploadedAt?.toISOString?.() ?? null,
      href: recordHref,
      citation: `${r.fileName} (${r.module})`,
    };
  });

  for (const c of citations.slice(0, 5)) {
    links.push({ title: c.fileName, href: c.href });
  }
  links.push({ title: "Documents", href: "/documents" });

  const empty = citations.length === 0;
  return {
    fact: {
      tool: name,
      ok: true,
      data: withFactProvenance(
        {
          searchHint: hint || null,
          allowedModuleCount: allowedModules.length,
          totalInScope,
          matchCount: citations.length,
          entityType: resolvedEntityType,
          recordScoped: Boolean(projectScoped || customerScoped),
          citations,
          empty,
          note: empty
            ? hint
              ? `No permission-visible documents matching “${hint}”. Numbers still come from ERP skills — not from files.`
              : "No permission-visible documents to list. Open Documents to browse."
            : `Showing ${citations.length} file(s) you can access (metadata only — not ledger totals).`,
          moneyDisclaimer:
            "Document search never authors invoice/receipt/GST totals — use finance skills for amounts.",
        },
        { sources: ["document"] }
      ),
    },
    links,
  };
}
