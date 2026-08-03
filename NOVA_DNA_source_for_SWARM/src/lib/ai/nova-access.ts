/**
 * NOVA RBAC access-mode helpers (shared by nova-tools + skills; no tool dispatch).
 */
import { can, type AccessUser } from "@/lib/rbac";

/** Leave list scope for NOVA — leave.approve / employee.read are team, not org-wide. */
export function novaLeaveAccessMode(user: AccessUser): "all" | "team" | "self" | "none" {
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") return "all";
  if (can(user, "hr.leave.read") || can(user, "hr.attendance.read")) return "all";
  if (
    can(user, "hr.leave.approve") ||
    can(user, "hr.attendance.team") ||
    can(user, "hr.employee.read")
  ) {
    return "team";
  }
  if (can(user, "hr.leave.create")) return "self";
  return "none";
}

/** Task list scope — task.edit.team is team-lead, not admin-all. */
export function novaTaskAccessMode(user: AccessUser): "all" | "team" | "self" | "none" {
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN" || can(user, "task.admin")) {
    return "all";
  }
  if (can(user, "task.edit.team") || can(user, "task.reports.read")) return "team";
  if (can(user, "task.read.self")) return "self";
  return "none";
}

/** Pending purchase-bill counts — read alone is own bills; verify/approve get org queue. */
export function novaPurchaseBillPendingScope(
  user: AccessUser
): "org" | "own" | "denied" {
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") return "org";
  if (can(user, "purchasebill.verify") || can(user, "purchasebill.approve")) return "org";
  if (can(user, "purchasebill.read")) return "own";
  return "denied";
}
