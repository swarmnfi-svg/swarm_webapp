/**
 * Parent/child party collapse for entity resolve.
 * Customer C0026 + project C0026-P001 for “james school” must not force clarify.
 */

export type HierarchyPartyCand = {
  type: "customer" | "vendor" | "project";
  id: string;
  code: string;
  name: string;
  /** DB customer.id when type=project */
  customerDbId?: string | null;
};

export function normalizePartyHint(hint: string): string {
  return hint.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Project code under customer code: C0026-P001 under C0026. */
export function projectCodeBelongsToCustomer(
  projectCode: string,
  customerCode: string
): boolean {
  const p = projectCode.trim().toUpperCase();
  const c = customerCode.trim().toUpperCase();
  if (!p || !c) return false;
  return p === c || p.startsWith(`${c}-`) || p.startsWith(`${c}_`);
}

export function projectBelongsToCustomer(
  project: HierarchyPartyCand,
  customer: HierarchyPartyCand
): boolean {
  if (project.type !== "project" || customer.type !== "customer") return false;
  if (project.customerDbId && project.customerDbId === customer.id) return true;
  return projectCodeBelongsToCustomer(project.code, customer.code);
}

/**
 * When soft-resolve hits a customer and only that customer's child projects,
 * bind the **customer** (tasks/invoices/outstanding across projects).
 * Returns null when true ambiguity remains (unrelated parties / sibling rivals).
 */
export function collapseRelatedCustomerChildProjects(
  hint: string,
  cands: HierarchyPartyCand[]
): HierarchyPartyCand | null {
  const h = normalizePartyHint(hint);
  if (!h) return null;

  const customers = cands.filter((c) => c.type === "customer");
  const projects = cands.filter((c) => c.type === "project");
  const vendors = cands.filter((c) => c.type === "vendor");
  if (vendors.length > 0) return null;
  if (customers.length === 0) return null;

  // Exact customer name (normalized) preferred when children are the only other hits
  const exactCustomers = customers.filter(
    (c) => normalizePartyHint(c.name) === h
  );
  if (exactCustomers.length === 1) {
    const cust = exactCustomers[0]!;
    const foreignProjects = projects.filter((p) => !projectBelongsToCustomer(p, cust));
    if (foreignProjects.length === 0 && customers.every((c) => c.id === cust.id)) {
      return cust;
    }
  }

  // Single customer + exclusively that customer's projects (contains soft)
  if (customers.length === 1 && projects.length >= 1) {
    const cust = customers[0]!;
    if (projects.every((p) => projectBelongsToCustomer(p, cust))) {
      // Prefer when hint equals customer, OR every project name starts with hint
      // and is longer ( “… 3 cum” suffix children ).
      const nameExact = normalizePartyHint(cust.name) === h;
      const allKidsExtendHint = projects.every((p) => {
        const pn = normalizePartyHint(p.name);
        return pn === h || (pn.startsWith(h) && pn.length > h.length);
      });
      if (nameExact || allKidsExtendHint) return cust;
    }
  }

  // Multiple customers that look related by code family — unsafe; clarify
  return null;
}

/**
 * Unique project whose normalized name equals the hint — even if parent
 * customer also soft-matches — bind the **project**.
 */
export function pickExactNamedProject(
  hint: string,
  cands: HierarchyPartyCand[]
): HierarchyPartyCand | null {
  const h = normalizePartyHint(hint);
  const exactProjects = cands.filter(
    (c) => c.type === "project" && normalizePartyHint(c.name) === h
  );
  if (exactProjects.length === 1) return exactProjects[0]!;
  return null;
}
