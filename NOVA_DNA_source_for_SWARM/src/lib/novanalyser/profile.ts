/**
 * NovANALYSER profile resolver — maps session user + intent to analysis profile.
 */
import type { SessionUser } from "@/auth";
import { can } from "@/lib/rbac";
import type { NovAnalyserIntent, NovAnalyserProfile } from "@/lib/novanalyser/types";

export function resolveNovAnalyserProfile(
  user: SessionUser,
  intent: NovAnalyserIntent
): NovAnalyserProfile {
  if (intent === "productivity_self") return "staff";

  if (
    user.role === "SUPER_ADMIN" ||
    user.role === "ADMIN" ||
    user.role === "DIRECTOR" ||
    can(user, "director.dashboard")
  ) {
    return "director";
  }
  if (user.role === "ACCOUNTANT" || can(user, "accounts.dashboard.read")) {
    return "accountant";
  }
  if (
    user.role === "MANAGER" ||
    can(user, "hr.attendance.team") ||
    can(user, "task.edit.team")
  ) {
    return "manager";
  }
  return "staff";
}
