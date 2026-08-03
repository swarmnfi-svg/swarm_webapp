import { describe, expect, it } from "vitest";
import {
  getNovaSkill,
  hasNovaSkill,
  listNovaSkillToolIds,
  listNovaSkills,
  novaDataClassesForTools,
  novaSkillPrefersDeterministic,
} from "@/lib/nova/skills/registry";
import { provenanceFromFacts, withFactProvenance } from "@/lib/nova/skills/provenance";
import {
  filterProvidersForDataClasses,
  sensitivityFromDataClasses,
} from "@/lib/nova/provider-policy";
import {
  isNovaSensitiveTools,
  redactNovaMessageForStore,
} from "@/lib/nova/memory";
import type { NovaLlmProvider } from "@/lib/ai/llm";

describe("NOVA skill registry (Phase 1 + 2.102 / 2.107)", () => {
  it("registers HR / finance / ops / open / search skills", () => {
    const ids = listNovaSkillToolIds().sort();
    expect(ids).toEqual(
      [
        "accounts_snapshot",
        "appearance_open",
        "approvals_summary",
        "attendance_late_summary",
        "attendance_month",
        "audit_log_open",
        "automation_open",
        "backup_open",
        "bank_accounts_summary",
        "bank_recon_summary",
        "bank_sms_open",
        "cash_banking",
        "cbg_pipeline",
        "cbg_quotations_summary",
        "collection_attention",
        "collection_delay_estimate",
        "credit_notes_summary",
        "customer_outstanding",
        "customers_summary",
        "daily_brief",
        "delivery_summary",
        "director_dashboard_summary",
        "documents_open",
        "documents_search",
        "entity_360",
        "grn_summary",
        "gst_docs_summary",
        "gstr_snapshot",
        "incentives_summary",
        "kpi_report",
        "kpi_summary",
        "leave_summary",
        "links_open",
        "month_performance",
        "my_work_summary",
        "notifications_open",
        "nova_analysis",
        "nova_pulse_search",
        "nova_trend",
        "order_book_summary",
        "overdue_invoices",
        "overtime_summary",
        "payment_requests_summary",
        "pending_workflow_counts",
        "portal_open",
        "proactive_insights",
        "profitability_summary",
        "project_command",
        "project_health",
        "projects_summary",
        "purchase_bills_summary",
        "purchase_orders_summary",
        "purchase_requests_summary",
        "receipts_summary",
        "receivables_summary",
        "regularisation_summary",
        "reports_snapshot",
        "salary_summary",
        "sales_orders_summary",
        "sales_summary",
        "search_entities",
        "settings_open",
        "staff_advances_summary",
        "staff_expense_summary",
        "staff_summary",
        "stock_summary",
        "system_tools_open",
        "tally_status",
        "tasks_summary",
        "vendor_bank_open",
        "vendors_summary",
        "whatsapp_open",
      ]
    );
  });

  it("exposes contract metadata (permissions, risk, data classes, examples)", () => {
    const att = getNovaSkill("attendance_late_summary");
    expect(att).toBeDefined();
    expect(att!.domain).toBe("hr");
    expect(att!.riskLevel).toBe("read");
    expect(att!.dataClasses).toContain("hr_attendance");
    expect(att!.permissions.length).toBeGreaterThan(0);
    expect(att!.examples.length).toBeGreaterThan(0);
    expect(att!.preferDeterministic).toBe(true);

    const sales = getNovaSkill("sales_summary");
    expect(sales!.domain).toBe("finance");
    expect(sales!.dataClasses).toContain("finance_money");
    expect(sales!.riskLevel).toBe("read");

    expect(getNovaSkill("sales_orders_summary")!.domain).toBe("finance");
    expect(getNovaSkill("purchase_orders_summary")!.domain).toBe("finance");
    expect(getNovaSkill("accounts_snapshot")!.domain).toBe("finance");
    expect(getNovaSkill("gstr_snapshot")!.domain).toBe("finance");
    expect(getNovaSkill("director_dashboard_summary")!.domain).toBe("finance");
    expect(getNovaSkill("leave_summary")!.domain).toBe("hr");
    expect(getNovaSkill("salary_summary")!.domain).toBe("hr");
    expect(getNovaSkill("staff_summary")!.domain).toBe("hr");
    expect(getNovaSkill("vendors_summary")!.domain).toBe("finance");
    expect(getNovaSkill("customers_summary")!.domain).toBe("finance");
    expect(getNovaSkill("pending_workflow_counts")!.domain).toBe("ops");
    expect(getNovaSkill("approvals_summary")!.domain).toBe("ops");
    expect(getNovaSkill("grn_summary")!.domain).toBe("ops");
    expect(getNovaSkill("tasks_summary")!.domain).toBe("ops");
    expect(getNovaSkill("projects_summary")!.domain).toBe("ops");
    expect(getNovaSkill("documents_open")!.domain).toBe("system");
    expect(getNovaSkill("documents_search")!.domain).toBe("system");
    expect(getNovaSkill("search_entities")!.domain).toBe("meta");
    expect(getNovaSkill("daily_brief")!.domain).toBe("ops");
  });

  it("marks late lists, payment queues, delivery, opens as deterministic-first", () => {
    expect(novaSkillPrefersDeterministic("attendance_late_summary")).toBe(true);
    expect(novaSkillPrefersDeterministic("overtime_summary")).toBe(true);
    expect(novaSkillPrefersDeterministic("regularisation_summary")).toBe(true);
    expect(novaSkillPrefersDeterministic("payment_requests_summary")).toBe(true);
    expect(novaSkillPrefersDeterministic("pending_workflow_counts")).toBe(true);
    expect(novaSkillPrefersDeterministic("approvals_summary")).toBe(true);
    expect(novaSkillPrefersDeterministic("vendors_summary")).toBe(true);
    expect(novaSkillPrefersDeterministic("delivery_summary")).toBe(true);
    expect(novaSkillPrefersDeterministic("documents_open")).toBe(true);
    expect(novaSkillPrefersDeterministic("documents_search")).toBe(true);
    expect(novaSkillPrefersDeterministic("appearance_open")).toBe(true);
    expect(novaSkillPrefersDeterministic("daily_brief")).toBe(true);
    expect(novaSkillPrefersDeterministic("sales_summary")).toBe(false);
    expect(novaSkillPrefersDeterministic("salary_summary")).toBe(false);
    expect(hasNovaSkill("stock_summary")).toBe(true);
    expect(hasNovaSkill("search_entities")).toBe(true);
  });

  it("lists only read-risk skills (no silent writes)", () => {
    for (const s of listNovaSkills()) {
      expect(s.riskLevel).toBe("read");
    }
  });

  it("unions data classes for provider routing", () => {
    const dcs = novaDataClassesForTools(["sales_summary", "leave_summary"]);
    expect(dcs).toEqual(expect.arrayContaining(["finance_money", "hr_pii"]));
  });
});

describe("NOVA fact provenance", () => {
  it("attaches sources + freshness on fact data", () => {
    const data = withFactProvenance(
      { period: "today", peopleWithLate: 0 },
      { period: "today", sources: ["hr_attendance_daily"], freshness: "2026-07-12T00:00:00.000Z" }
    );
    expect(data.sources).toEqual(["hr_attendance_daily"]);
    expect(data.freshness).toBe("2026-07-12T00:00:00.000Z");
    expect(data.period).toBe("today");
  });

  it("builds answer provenance from facts", () => {
    const prov = provenanceFromFacts(
      [
        {
          tool: "attendance_late_summary",
          ok: true,
          data: {
            period: "today",
            sources: ["hr_attendance_daily"],
            freshness: "2026-07-12T01:00:00.000Z",
          },
        },
      ],
      ["attendance"]
    );
    expect(prov.period).toBe("today");
    expect(prov.sources).toEqual(expect.arrayContaining(["hr_attendance_daily", "attendance"]));
    expect(prov.freshness).toBe("2026-07-12T01:00:00.000Z");
  });
});

describe("NOVA provider policy by data class", () => {
  const providers: NovaLlmProvider[] = [
    {
      id: "groq",
      apiKey: "g",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "llama",
    },
    {
      id: "openrouter",
      apiKey: "o",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "free",
    },
    {
      id: "custom",
      apiKey: "c",
      baseUrl: "https://llm.internal.example/v1",
      model: "local",
    },
  ];

  it("classifies finance/hr as financial/personal", () => {
    expect(sensitivityFromDataClasses(["finance_money"])).toBe("financial");
    expect(sensitivityFromDataClasses(["hr_pii"])).toBe("personal");
    expect(sensitivityFromDataClasses(["ops_summary"])).toBe("ops");
  });

  it("prefers local then approved cloud for FINANCIAL; drops openrouter", () => {
    const filtered = filterProvidersForDataClasses(providers, ["finance_money"]);
    expect(filtered.map((p) => p.id)).toEqual(["custom", "groq"]);
  });

  it("keeps full chain for public/ops", () => {
    const filtered = filterProvidersForDataClasses(providers, ["ops_summary"]);
    expect(filtered.map((p) => p.id)).toEqual(["groq", "openrouter", "custom"]);
  });
});

describe("NOVA conversation memory redaction", () => {
  it("flags salary tools as sensitive", () => {
    expect(isNovaSensitiveTools(["salary_summary"])).toBe(true);
    expect(isNovaSensitiveTools(["sales_summary"])).toBe(false);
  });

  it("strips amounts on sensitive store text", () => {
    const out = redactNovaMessageForStore("Salary paid ₹1,25,000.00 net pay 125000", {
      sensitive: true,
    });
    expect(out).not.toMatch(/₹1,25/);
    expect(out).toMatch(/\[amount\]|\[pay\]/);
  });
});
