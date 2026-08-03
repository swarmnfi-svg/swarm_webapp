/**
 * Skill — vendor_bank_open (extracted from nova-tools; behaviour identical).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/nova/prisma-readonly";
import { canSeeVendorBankDetails } from "@/lib/vendor-bank";
import { vendorListWhere } from "@/lib/vendor-visibility";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

function finalizeFrom(
  facts: NovaSkillHandlerResult["fact"][],
  links: NovaToolLink[]
): NovaSkillHandlerResult {
  const fact = facts[facts.length - 1]!;
  if (fact?.ok && fact.data && typeof fact.data === "object") {
    return {
      fact: {
        ...fact,
        data: withFactProvenance(fact.data as Record<string, unknown>, {
          period: null,
          sources: ["vendor"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runVendorBankOpen(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user } = ctx;
  const name = "vendor_bank_open";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  // Same gate as vendor page / SoD bank write path (vendorbank.read | bank.viewfullaccount | flag).
  if (!canSeeVendorBankDetails(user)) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Missing vendor bank visibility",
    });
    return finalize();
  }
  const visible = vendorListWhere(user, { active: true });
  const hasBankDetails: Prisma.VendorWhereInput = {
    OR: [
      { bankAccountNumber: { not: null } },
      { ifsc: { not: null } },
      { upiId: { not: null } },
    ],
  };
  const [activeVendorCount, withBankDetails] = await Promise.all([
    Promise.resolve(prisma.vendor.count({ where: visible })).catch(() => 0),
    Promise.resolve(
      prisma.vendor.count({ where: vendorListWhere(user, { active: true, ...hasBankDetails }) })
    ).catch(() => 0),
  ]);
  const missingBankDetails = Math.max(0, activeVendorCount - withBankDetails);
  facts.push({
    tool: name,
    ok: true,
    data: {
      screen: "Vendors",
      href: "/vendors",
      activeVendorCount,
      withBankDetails,
      missingBankDetails,
      note:
        "Presence counts only — open Vendors to view or edit beneficiary details (NOVA does not reveal bank identifiers).",
    },
  });
  links.push({ title: "Vendors", href: "/vendors" });
  return finalize();
}
