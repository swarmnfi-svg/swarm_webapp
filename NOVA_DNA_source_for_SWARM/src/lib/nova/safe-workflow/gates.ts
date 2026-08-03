/**
 * Feature gate for NOVA safe workflow open (navigate + prefill only).
 *
 * Env: NOVA_SAFE_WORKFLOW_OPEN
 *   - 1 / true / on  → enabled for all roles
 *   - 0 / false / off → disabled for everyone
 *   - unset          → enabled for Admin / Super Admin / Director only
 */

export type NovaSafeWorkflowGateUser = {
  role?: string | null;
};

function envTrim(name: string): string {
  return (process.env[name] || "").trim().toLowerCase();
}

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "DIRECTOR"]);

export function isNovaSafeWorkflowOpenEnabled(
  user?: NovaSafeWorkflowGateUser | null
): boolean {
  const env = envTrim("NOVA_SAFE_WORKFLOW_OPEN");
  if (env === "0" || env === "false" || env === "off") return false;
  if (env === "1" || env === "true" || env === "on") return true;
  const role = (user?.role || "").trim().toUpperCase();
  return ADMIN_ROLES.has(role);
}
