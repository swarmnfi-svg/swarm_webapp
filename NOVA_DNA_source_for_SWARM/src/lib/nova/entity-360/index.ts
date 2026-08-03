/**
 * Entity 360 — NOVA skill entry point.
 *
 * When a query names a specific ERP record by its code, this skill recognises
 * the identifier, resolves what kind of entity it is, and produces a
 * consolidated cross-module summary scoped to the asking user's permissions.
 *
 * Extension point: add a new `case` below (and a supported pattern in
 * `recognize.ts`) to cover other entity kinds (project, customer, vendor, …).
 */
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import { recognizeEntity360Id } from "@/lib/nova/entity-360/recognize";
import { buildPaymentRequest360Fact } from "@/lib/nova/entity-360/payment-request-360";

const TOOL = "entity_360";

export async function runEntity360(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const ref = recognizeEntity360Id(ctx.query);
  if (!ref) {
    return {
      fact: {
        tool: TOOL,
        ok: true,
        data: {
          notRecognized: true,
          message:
            "Tell me a specific record code — e.g. a payment request like **C0028-P001-E002** or **OTH/26-27/0011** — and I'll pull the full picture.",
        },
      },
    };
  }

  switch (ref.kind) {
    case "payment_request":
      return buildPaymentRequest360Fact(ctx.user, ref.id);
    default:
      return {
        fact: {
          tool: TOOL,
          ok: true,
          data: {
            unsupportedKind: ref.kind,
            identifier: ref.id,
            message: `I recognised **${ref.id}** but a 360 view for ${ref.kind.replace(/_/g, " ")} isn't available yet.`,
          },
        },
      };
  }
}

export {
  recognizeEntity360Id,
  recognizeAllEntity360Ids,
  queryNamesEntity360,
  entity360KindIsSupported,
  type Entity360Kind,
  type Entity360Ref,
} from "@/lib/nova/entity-360/recognize";
export { buildPaymentRequest360Fact } from "@/lib/nova/entity-360/payment-request-360";
