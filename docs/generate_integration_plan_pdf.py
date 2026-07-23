"""Generate swarm.co.in Platform Master Integration Plan PDF."""
from fpdf import FPDF
from datetime import date

OUTPUT = r"c:\Users\seena\Downloads\swarm_co_in_Integration_Plan.pdf"


class PlanPDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(100, 100, 100)
            self.cell(0, 8, "swarm.co.in Platform - Master Integration Plan", align="L")
            self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")

    def cover(self):
        self.add_page()
        self.set_font("Helvetica", "B", 22)
        self.set_text_color(0, 80, 60)
        self.ln(40)
        self.multi_cell(0, 12, "swarm.co.in Platform")
        self.ln(4)
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 10, "Master Integration Plan")
        self.ln(8)
        self.set_font("Helvetica", "", 11)
        self.set_text_color(80, 80, 80)
        self.multi_cell(0, 6, "emPOWER ERP + SWARM IoT + Nova AI + Universal Telemetry API")
        self.ln(6)
        self.multi_cell(0, 6, f"Generated: {date.today().strftime('%d %B %Y')}")
        self.ln(20)
        self.set_font("Helvetica", "I", 10)
        self.multi_cell(0, 5, "nanoFarm / emPOWER - Internal Planning Document")

    def section_title(self, title):
        self.ln(4)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(0, 100, 60)
        self.multi_cell(0, 8, title)
        self.ln(2)
        self.set_draw_color(0, 168, 107)
        self.set_line_width(0.4)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def sub_title(self, title):
        self.ln(2)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6, title)
        self.ln(1)

    def body(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5, text)
        self.ln(2)

    def bullet(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.cell(6, 5, "-")
        self.multi_cell(0, 5, text)
        self.ln(1)

    def table_row(self, cols, widths, bold=False):
        self.set_font("Helvetica", "B" if bold else "", 9)
        h = 6
        for i, (col, w) in enumerate(zip(cols, widths)):
            self.cell(w, h, col[:80], border=1)
        self.ln(h)


def build_pdf():
    pdf = PlanPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.cover()

    # 1. North Star
    pdf.add_page()
    pdf.section_title("1. North Star")
    pdf.body(
        "swarm.co.in is the unified front door for a multi-tenant SaaS platform combining "
        "emPOWER ERP (finance, GST, HR, Nova AI), SWARM IoT (plant monitoring for swarm_access users), "
        "and a Universal Telemetry Engine extensible to Solar, Smart Meters, and Microgrids."
    )
    pdf.sub_title("Hard Rules (Non-Negotiable)")
    rules = [
        ("Signup/login at portal", "swarm_website on swarm.co.in"),
        ("Super Admin grants access", "New users status PENDING until approved"),
        ("SWARM user to ERP", "Allowed when erp_access also granted"),
        ("ERP user to SWARM", "BLOCKED - no SWARM app login, no SWARM UI in ERP"),
        ("SWARM for ERP", "API only - ERP + Nova read telemetry via backend proxy"),
        ("Future devices", "Same normalized telemetry schema"),
    ]
    w = [55, 125]
    pdf.table_row(["Rule", "Implementation"], w, bold=True)
    for r, impl in rules:
        pdf.table_row([r, impl], w)

    # 2. Platform Mind Map
    pdf.add_page()
    pdf.section_title("2. Platform Mind Map")
    mind_map = """swarm.co.in (Central Platform SaaS Engine)
  1. Identity & Auth Hub
     - User registration & email verification (SES)
     - Centralized SSO session (.swarm.co.in HttpOnly cookie)
     - Product access matrix (erp_access, swarm_access)
     - Multi-tenant Organization & Company directory

  2. Platform Administration (Super Admin Console)
     - User lifecycle: PENDING -> ACTIVE -> SUSPENDED
     - Product provisioning: ERP | SWARM | Both
     - Tenant & asset mapper: Company <-> Plant <-> Device groups
     - Billing, tier limits, feature toggles (later)

  3. emPOWER ERP Engine
     - Core ERP (Finance, Inventory, HR, GST, Tally)
     - Embedded IoT monitoring dashboards (read-only proxy cards)
     - Nova AI Assistant (NL query, cross-module analytics, IoT tool calling)

  4. SWARM IoT & Telemetry Engine (swarm_webapp microservice)
     - Device Management Console (swarm_access users only)
     - Universal Telemetry Ingestion Pipeline (ESP, Solar, Smart Meters)

  5. Security, Storage & Observability
     - Row-Level Security (RLS) on PostgreSQL
     - TimescaleDB for telemetry; Service JWT on /internal/v1/*"""
    pdf.set_font("Courier", "", 8)
    pdf.set_text_color(30, 30, 30)
    pdf.multi_cell(0, 4, mind_map)
    pdf.ln(4)

    # 3. Access Workflow
    pdf.add_page()
    pdf.section_title("3. Unified Access & Provisioning Workflow")
    pdf.body(
        "1. User visits swarm.co.in and signs up or logs in.\n"
        "2. Account created with status PENDING, erp_access=false, swarm_access=false.\n"
        "3. Super Admin reviews and grants erp_access, swarm_access, or both.\n"
        "4. Super Admin assigns organization_id, company_id, and plant_ids.\n"
        "5. User is routed to pending screen, SWARM app, ERP app, or app switcher."
    )
    pdf.sub_title("Product Access Matrix")
    access_cols = ["User Type", "swarm", "erp", "SWARM App", "ERP App", "IoT Cards", "Nova"]
    access_w = [32, 14, 14, 22, 22, 22, 22]
    pdf.table_row(access_cols, access_w, bold=True)
    rows = [
        ("Pending", "No", "No", "No", "No", "No", "No"),
        ("SWARM operator", "Yes", "No", "Yes", "No", "No", "No"),
        ("SWARM + ERP", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes"),
        ("ERP-only", "No", "Yes", "No", "Yes", "Yes", "Yes"),
        ("Super Admin", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes"),
    ]
    for row in rows:
        pdf.table_row(list(row), access_w)

    pdf.sub_title("Post-Login Routing")
    routes = [
        ("PENDING", "swarm.co.in/pending-access"),
        ("swarm_access only", "swarm.swarm.co.in (swarm_webapp)"),
        ("erp_access only", "erp.swarm.co.in (emPOWER ERP)"),
        ("Both", "App switcher; remember last app"),
        ("Super Admin", "Platform admin + both apps"),
    ]
    pdf.table_row(["Session State", "Destination"], [50, 130], bold=True)
    for state, dest in routes:
        pdf.table_row([state, dest], [50, 130])

    # 4. Domain Map
    pdf.add_page()
    pdf.section_title("4. Domain Map")
    domains = [
        ("swarm.co.in / www", "swarm_website - marketing, signup, login", "Public"),
        ("swarm.swarm.co.in", "swarm_webapp React UI", "swarm_access required"),
        ("erp.swarm.co.in", "emPOWER ERP", "erp_access required"),
        ("api.swarm.co.in", "emPOWER public/client API", "Per-route auth"),
        ("telemetry.internal", "SWARM /internal/v1/*", "Service JWT only"),
        ("erp.empowerbpg.com", "Legacy BPG tenant alias", "Hostname to org map"),
    ]
    pdf.table_row(["Host", "Serves", "Access Gate"], [45, 85, 50], bold=True)
    for d in domains:
        pdf.table_row(list(d), [45, 85, 50])
    pdf.body("Auth cookie: HttpOnly session on .swarm.co.in for cross-subdomain SSO.")

    # 5. ERP to SWARM API Connection
    pdf.add_page()
    pdf.section_title("5. ERP to SWARM API Connection")
    pdf.body(
        "emPOWER ERP connects to swarm_webapp server-to-server only. "
        "The ERP browser never calls SWARM directly. emPOWER backend issues a "
        "short-lived Service JWT (or service API key) and proxies requests to "
        "SWARM /internal/v1/telemetry/* endpoints."
    )
    pdf.sub_title("Auth Methods")
    pdf.table_row(["Layer", "Connection", "Auth"], [40, 70, 70], bold=True)
    auth_rows = [
        ("ERP UI to emPOWER", "User session", "Login cookie / JWT (erp_access)"),
        ("emPOWER to SWARM", "Backend proxy", "Service JWT or service API key"),
        ("ESP to SWARM", "IoT ingest", "Device API key per org/plant"),
    ]
    for row in auth_rows:
        pdf.table_row(list(row), [40, 70, 70])

    pdf.sub_title("Service JWT Claims")
    pdf.set_font("Courier", "", 9)
    pdf.multi_cell(0, 5, '{ "orgId", "companyId", "scope": "telemetry.read", "plantIds": [] }')
    pdf.ln(4)

    pdf.sub_title("Internal Telemetry API Routes")
    api_routes = [
        "GET /internal/v1/telemetry/latest?org_id&plant_id&metric=",
        "GET /internal/v1/telemetry/history?org_id&plant_id&from&to&metric=",
        "GET /internal/v1/telemetry/alerts?org_id&plant_id&status=ACTIVE",
        "GET /internal/v1/telemetry/health/{plantId}",
        "GET /internal/v1/telemetry/plants?org_id&company_id=",
        "GET /internal/v1/telemetry/energy?org_id&site_id=  (Phase 3)",
    ]
    for route in api_routes:
        pdf.bullet(route)

    pdf.sub_title("emPOWER Proxy Mirror Routes")
    proxy_routes = [
        "GET /api/integrations/telemetry/latest",
        "GET /api/integrations/telemetry/history",
        "GET /api/integrations/telemetry/alerts",
        "GET /api/integrations/telemetry/health/{plantId}",
        "GET /api/integrations/telemetry/plants",
    ]
    for route in proxy_routes:
        pdf.bullet(route)

    # 6. Nova AI + Telemetry
    pdf.add_page()
    pdf.section_title("6. Nova AI + Universal Telemetry Pipeline")
    pdf.body(
        "Nova AI never queries SWARM databases directly. All IoT reads go through "
        "the Telemetry Gateway with a normalized metric schema so Solar and Smart "
        "Meters plug in later without changing Nova core tool logic."
    )
    pdf.sub_title("Normalized Telemetry Schema")
    pdf.set_font("Courier", "", 8)
    schema = (
        '{\n  "org_id": "org_12345",\n  "company_id": "co_abc",\n'
        '  "device_id": "esp_node_07",\n  "device_type": "SWARM_TEMP",\n'
        '  "plant_id": "plant_42",\n  "timestamp": "2026-07-22T09:00:00Z",\n'
        '  "metrics": { "temperature_c": 38.5, "humidity_pct": 62.0, "methane_ppm": 120 }\n}'
    )
    pdf.multi_cell(0, 4, schema)
    pdf.ln(4)

    pdf.sub_title("Nova AI Tool Definitions")
    pdf.table_row(["Nova Tool", "emPOWER Proxy", "SWARM Gateway"], [45, 65, 70], bold=True)
    nova_tools = [
        ("get_latest_sensor_telemetry", "/api/integrations/telemetry/latest", "/internal/v1/telemetry/latest"),
        ("get_telemetry_history", "/api/integrations/telemetry/history", "/internal/v1/telemetry/history"),
        ("get_active_alerts", "/api/integrations/telemetry/alerts", "/internal/v1/telemetry/alerts"),
        ("get_plant_health", "/api/integrations/telemetry/health", "/internal/v1/telemetry/health/{id}"),
        ("get_energy_summary", "/api/integrations/telemetry/energy", "/internal/v1/telemetry/energy"),
    ]
    for row in nova_tools:
        pdf.table_row(list(row), [45, 65, 70])

    pdf.sub_title("Device Types (Future Expansion)")
    pdf.table_row(["device_type", "Metrics", "Phase"], [50, 90, 40], bold=True)
    devices = [
        ("SWARM_TEMP, SWARM_GAS", "temperature, methane, pressure", "1"),
        ("SOLAR_INVERTER", "kw_output, efficiency, status", "3"),
        ("SMART_METER", "kwh_import, kwh_export, voltage", "3"),
        ("EV_CHARGER", "kw_demand, session_kwh", "4"),
    ]
    for row in devices:
        pdf.table_row(list(row), [50, 90, 40])

    # 7. Security
    pdf.add_page()
    pdf.section_title("7. Security & Multi-Tenancy")
    sec = [
        ("Data isolation", "Every request carries org_id; PostgreSQL RLS on both DBs"),
        ("Zero direct SWARM exposure", "ERP browser never calls SWARM; backend proxy only"),
        ("UI enforcement", "swarm_access required for swarm.swarm.co.in"),
        ("Nova sandbox", "Tools scoped to user org_id + plant_ids"),
        ("IoT ingest", "Device API keys bound to org_id + plant_id"),
        ("Service JWT", "Short-lived; org-scoped telemetry.read scope"),
    ]
    pdf.table_row(["Pillar", "Implementation"], [50, 130], bold=True)
    for p, impl in sec:
        pdf.table_row([p, impl], [50, 130])

    pdf.sub_title("Block ERP to SWARM (Enforcement Layers)")
    blocks = [
        "Portal: erp-only users never see SWARM link",
        "swarm.swarm.co.in: reject session without swarm_access",
        "SWARM /api/*: user JWT must include swarm_access=true",
        "ERP UI: no iframes, links, or embeds of swarm_webapp",
        "CORS: SWARM denies browser requests from ERP on /internal/*",
    ]
    for b in blocks:
        pdf.bullet(b)

    # 8. Repos
    pdf.sub_title("Repository Responsibilities")
    pdf.table_row(["Repo", "Role", "Users"], [35, 85, 60], bold=True)
    repos = [
        ("swarm_website", "Marketing + auth portal", "Everyone"),
        ("swarm_webapp", "SWARM UI + Telemetry Gateway + IoT", "swarm_access; ERP via API"),
        ("emPOWER ERP", "ERP + Nova + proxy + Super Admin", "erp_access; Super Admin"),
    ]
    for row in repos:
        pdf.table_row(list(row), [35, 85, 60])

    # 9. AWS
    pdf.add_page()
    pdf.section_title("8. AWS Target Architecture (ap-south-1)")
    aws = [
        ("Portal static site", "S3 + CloudFront"),
        ("emPOWER ERP", "ECS Fargate, RDS Postgres, Redis"),
        ("SWARM microservice", "ECS Fargate, Spring Boot"),
        ("Telemetry time-series", "TimescaleDB on RDS"),
        ("MQTT", "EMQX on ECS or AWS IoT Core"),
        ("Email", "SES"),
        ("Secrets", "Secrets Manager"),
    ]
    pdf.table_row(["Component", "Service"], [70, 110], bold=True)
    for c, s in aws:
        pdf.table_row([c, s], [70, 110])
    pdf.body("Deploy to AWS after Phase 1-2 auth and telemetry contracts work on Railway/local.")

    # 10. Phases
    pdf.add_page()
    pdf.section_title("9. Implementation Phases")

    pdf.sub_title("Phase 1 - Central Portal & Provisioning (2-4 weeks)")
    pdf.body("Goal: Real auth, pending gate, Super Admin approval, routing.")
    p1 = [
        "Central Auth API on emPOWER (signup, login, Google OAuth, .swarm.co.in cookie)",
        "Upgrade swarm_website auth.js - replace localStorage with API calls",
        "Pending gate and pending-approval page",
        "Super Admin console - grant erp_access / swarm_access, assign org/plants",
        "Post-login routing and SWARM login gate (reject without swarm_access)",
    ]
    for t in p1:
        pdf.bullet(t)
    pdf.body("Exit: Signup -> pending -> admin grants -> user opens correct app.")

    pdf.sub_title("Phase 2 - Telemetry Proxy, ERP Dashboards & Nova AI (4-8 weeks)")
    pdf.body("Goal: ERP reads sensor data; Nova queries telemetry via tools.")
    p2 = [
        "Multi-tenancy: Organization, Membership, Company; organization_id on SWARM",
        "Telemetry Gateway: /internal/v1/telemetry/* over TimescaleDB",
        "emPOWER proxy routes with Service JWT",
        "ERP IoT module: embedded dashboard cards (read-only)",
        "Nova AI tools wired to telemetry proxy",
        "Company <-> Plant linking; isolation test suite (0 tolerance)",
        "OpenAPI spec for Internal Telemetry API + Nova tools",
    ]
    for t in p2:
        pdf.bullet(t)
    pdf.body("Exit: ERP user sees sensor cards; Nova answers temperature queries; cannot open SWARM.")

    pdf.sub_title("Phase 3 - Cloud IoT & Energy Expansion (2-3 months)")
    p3 = [
        "Cloud ESP pairing via EMQX + device registry",
        "Universal Device Adapter (SWARM first, Solar/Meter stubs)",
        "Nova energy tools; AWS staging on swarm.co.in",
        "SES alert notifications",
    ]
    for t in p3:
        pdf.bullet(t)

    pdf.sub_title("Phase 4 - Commercial & Platform Maturity (ongoing)")
    p4 = [
        "Billing (Razorpay/Stripe) -> org entitlements",
        "BPG Railway to AWS prod migration",
        "Observability, edge gateways, CA partner portal, usage meters",
    ]
    for t in p4:
        pdf.bullet(t)

    # 11. Data Model
    pdf.add_page()
    pdf.section_title("10. Data Model (emPOWER Source of Truth)")
    model = """User { id, email, name, passwordHash, status: PENDING|ACTIVE|SUSPENDED }
UserProductAccess { userId, erp_access: bool, swarm_access: bool }
Organization { id, slug, name, planId }
OrganizationMembership { userId, orgId, role }
Company { id, organizationId, name, gstin, swarm_plant_id? }
SwarmPlantAssignment { userId, plantId }  // swarm_access users only"""
    pdf.set_font("Courier", "", 9)
    pdf.multi_cell(0, 5, model)
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 10)
    pdf.body("SWARM DB mirrors userId + plant assignments; emPOWER is authoritative.")

    # 12. KPIs & Risks
    pdf.section_title("11. KPIs & Risks")
    pdf.sub_title("KPIs")
    kpis = [
        ("API latency p95", "< 400 ms"),
        ("Tenant data leakage", "0 tolerance; 100% isolation suite pass"),
        ("Nova tool accuracy", "Scoped to user plants only"),
        ("Dashboard refresh", "30 s for plant ops"),
    ]
    pdf.table_row(["Metric", "Target"], [80, 100], bold=True)
    for m, t in kpis:
        pdf.table_row([m, t], [80, 100])

    pdf.sub_title("Key Risks")
    risks = [
        ("localStorage auth on portal", "Phase 1 blocker - server auth before prod"),
        ("ERP user bookmarks SWARM URL", "swarm_access middleware rejects"),
        ("Nova cross-tenant prompt injection", "Server injects org_id; ignore LLM tenant IDs"),
        ("ESP LAN pairing in cloud", "Phase 3 cloud pairing"),
    ]
    pdf.table_row(["Risk", "Mitigation"], [70, 110], bold=True)
    for r, m in risks:
        pdf.table_row([r, m], [70, 110])

    # 13. Bottom Line
    pdf.add_page()
    pdf.section_title("12. Bottom Line")
    bottom = [
        ("swarm.co.in", "Unified front door - signup, login, marketing"),
        ("Super Admin", "Approves users; assigns ERP, SWARM, or both"),
        ("swarm_webapp", "SWARM UI + Telemetry Gateway + IoT ingest"),
        ("emPOWER ERP", "Business app + IoT cards + Nova AI"),
        ("Telemetry API", "Normalized read-model; SWARM today, Solar tomorrow"),
        ("One-way rule", "SWARM to ERP allowed; ERP to SWARM blocked"),
        ("ERP to SWARM link", "Service JWT / API key via emPOWER backend proxy only"),
    ]
    pdf.table_row(["Layer", "What It Is"], [45, 135], bold=True)
    for layer, what in bottom:
        pdf.table_row([layer, what], [45, 135])

    pdf.ln(8)
    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(80, 80, 80)
    pdf.multi_cell(
        0, 5,
        "Phase 1 (portal + provisioning) unlocks everything else. "
        "Phase 2 (telemetry + Nova) delivers ERP+sensor value. "
        "Phase 3+ scales devices and AWS."
    )

    pdf.output(OUTPUT)
    print(f"PDF generated: {OUTPUT}")


if __name__ == "__main__":
    build_pdf()
