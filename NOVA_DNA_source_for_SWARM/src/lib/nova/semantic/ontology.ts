/**
 * BIOPOWER ontology v1 — entity types + relations for planner / aliases / recipes.
 * Scoped to BIOPOWER-critical types; not a universal ERP ontology.
 */

export type NovaEntityTypeId =
  | "customer"
  | "vendor"
  | "project"
  | "employee"
  | "invoice"
  | "purchase_order"
  | "purchase_request"
  | "cbg_quotation"
  | "tally_connection"
  | "attendance_day";

export type NovaEntityType = {
  id: NovaEntityTypeId;
  label: string;
  /** Prisma / domain model hint */
  sourceModel: string;
  /** Stable business code field when present */
  codeField?: string;
  nameField?: string;
  aliasable: boolean;
  relations: Array<{
    to: NovaEntityTypeId;
    via: string;
    cardinality: "one" | "many";
  }>;
};

export const NOVA_ONTOLOGY_V1: readonly NovaEntityType[] = [
  {
    id: "customer",
    label: "Customer",
    sourceModel: "Customer",
    codeField: "customerId",
    nameField: "customerName",
    aliasable: true,
    relations: [
      { to: "project", via: "customerId", cardinality: "many" },
      { to: "invoice", via: "customerId", cardinality: "many" },
    ],
  },
  {
    id: "vendor",
    label: "Vendor",
    sourceModel: "Vendor",
    codeField: "vendorId",
    nameField: "vendorName",
    aliasable: true,
    relations: [
      { to: "purchase_order", via: "vendorId", cardinality: "many" },
      { to: "purchase_request", via: "vendorId", cardinality: "many" },
    ],
  },
  {
    id: "project",
    label: "Project",
    sourceModel: "Project",
    codeField: "projectId",
    nameField: "projectName",
    aliasable: true,
    relations: [
      { to: "customer", via: "customerId", cardinality: "one" },
      { to: "invoice", via: "projectId", cardinality: "many" },
      { to: "purchase_order", via: "projectId", cardinality: "many" },
      { to: "cbg_quotation", via: "projectName/client", cardinality: "many" },
    ],
  },
  {
    id: "employee",
    label: "Employee / staff",
    sourceModel: "StaffProfile",
    codeField: "staffCode",
    nameField: "fullName",
    aliasable: true,
    relations: [
      { to: "attendance_day", via: "staffId", cardinality: "many" },
    ],
  },
  {
    id: "invoice",
    label: "Sales invoice",
    sourceModel: "SalesInvoice",
    codeField: "invoiceNumber",
    aliasable: false,
    relations: [
      { to: "customer", via: "customerId", cardinality: "one" },
      { to: "project", via: "projectId", cardinality: "one" },
    ],
  },
  {
    id: "purchase_order",
    label: "Purchase order",
    sourceModel: "PurchaseOrder",
    codeField: "poNumber",
    aliasable: false,
    relations: [
      { to: "vendor", via: "vendorId", cardinality: "one" },
      { to: "project", via: "projectId", cardinality: "one" },
    ],
  },
  {
    id: "purchase_request",
    label: "Purchase request",
    sourceModel: "PurchaseRequest",
    codeField: "prNumber",
    aliasable: false,
    relations: [
      { to: "vendor", via: "vendorId", cardinality: "one" },
      { to: "project", via: "projectId", cardinality: "one" },
    ],
  },
  {
    id: "cbg_quotation",
    label: "CBG quotation",
    sourceModel: "CbgQuotation",
    codeField: "quotationNo",
    nameField: "projectName",
    aliasable: false,
    relations: [
      { to: "project", via: "projectName", cardinality: "one" },
      { to: "customer", via: "clientName", cardinality: "one" },
    ],
  },
  {
    id: "tally_connection",
    label: "Tally connection",
    sourceModel: "TallyConnection",
    nameField: "name",
    aliasable: false,
    relations: [],
  },
  {
    id: "attendance_day",
    label: "Attendance day",
    sourceModel: "HrAttendanceDaily",
    aliasable: false,
    relations: [{ to: "employee", via: "staffId", cardinality: "one" }],
  },
];

const BY_ID = new Map(NOVA_ONTOLOGY_V1.map((e) => [e.id, e]));

export function getNovaEntityType(id: NovaEntityTypeId): NovaEntityType | undefined {
  return BY_ID.get(id);
}

export function listNovaEntityTypes(): readonly NovaEntityType[] {
  return NOVA_ONTOLOGY_V1;
}

export function listAliasableNovaEntityTypes(): NovaEntityType[] {
  return NOVA_ONTOLOGY_V1.filter((e) => e.aliasable);
}

/** Gate A ontology checklist ids. */
export const NOVA_ONTOLOGY_GATE_A_IDS: readonly NovaEntityTypeId[] = [
  "customer",
  "vendor",
  "project",
  "employee",
  "invoice",
  "purchase_order",
  "purchase_request",
  "cbg_quotation",
  "tally_connection",
  "attendance_day",
];
