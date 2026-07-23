"""Generate SWARM Project Working Flow PDF."""
from fpdf import FPDF
from datetime import date

OUTPUT = "docs/SWARM_Project_Working_Flow.pdf"


class FlowPDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(100, 100, 100)
            self.cell(0, 8, "SWARM by nanoFarm - Project Working Flow", align="L")
            self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")

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
        x = self.get_x()
        self.cell(6, 5, "-")
        self.multi_cell(0, 5, text)
        self.set_x(x)

    def numbered(self, n, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.cell(8, 5, f"{n}.")
        self.multi_cell(0, 5, text)
        self.ln(1)

    def code_block(self, text):
        self.set_fill_color(245, 245, 245)
        self.set_font("Courier", "", 9)
        self.set_text_color(20, 20, 20)
        for line in text.split("\n"):
            self.cell(0, 5, "  " + line, ln=True, fill=True)
        self.ln(2)


def build():
    pdf = FlowPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Cover
    pdf.ln(30)
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(0, 100, 60)
    pdf.cell(0, 12, "SWARM", align="C", ln=True)
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(0, 8, "AI-IoT Plant Health Monitoring System", align="C", ln=True)
    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Project Working Flow", align="C", ln=True)
    pdf.ln(10)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 6, "by nanoFarm", align="C", ln=True)
    pdf.cell(0, 6, f"Generated: {date.today().strftime('%d %B %Y')}", align="C", ln=True)
    pdf.ln(20)
    pdf.set_font("Helvetica", "I", 10)
    pdf.multi_cell(
        0,
        5,
        "This document describes how the SWARM web application works end-to-end: "
        "local setup, user roles, device pairing, sensor data flow, emPOWER Partner API "
        "integration, and daily operations.",
        align="C",
    )

    # 1. Overview
    pdf.add_page()
    pdf.section_title("1. Project Overview")
    pdf.body(
        "SWARM is a web platform for monitoring biogas and waste-to-energy plants. "
        "It collects live sensor data from ESP8266 hardware hubs, stores readings in a database, "
        "displays dashboards and analytics, generates alerts, and provides AI-based health recommendations."
    )
    pdf.sub_title("Supported plant types")
    for pt in [
        "Biogas Plant",
        "Bio-CNG Plant",
        "Sanitation Plant",
        "STP Plant",
        "Organic Waste Plant",
        "Waste-to-Energy Plant",
    ]:
        pdf.bullet(pt)

    pdf.sub_title("Main application modules")
    modules = [
        "Dashboard - live plant health and sensor readings",
        "Plants - create and configure projects (hardware profiles)",
        "Sensor Nodes - register installed hardware per plant",
        "Connect Device - pair ESP8266 sensor hubs on the local network",
        "Analytics - historical charts (hour/day/week/month)",
        "Alerts - threshold breaches with acknowledge/resolve workflow",
        "AI Recommendations - rule-based plant health analysis",
        "Predictive Maintenance - equipment health predictions",
        "Reports - generate plant reports (PDF/Excel/CSV)",
        "Users - role-based user and access management",
        "Settings - system thresholds and notification config (Super Admin)",
        "Help - in-app ESP connection manual",
    ]
    for m in modules:
        pdf.bullet(m)

    # 2. Architecture
    pdf.add_page()
    pdf.section_title("2. System Architecture")
    pdf.sub_title("Technology stack")
    pdf.bullet("Frontend: React 18, Vite, Material UI, Recharts")
    pdf.bullet("Backend: Spring Boot 3, Java 17, JWT authentication")
    pdf.bullet("Database: MySQL 8 (Docker) or H2 in-memory (local dev)")
    pdf.bullet("IoT ingress: REST API (/api/iot/data, /api/iot/batch) and MQTT (Mosquitto)")
    pdf.bullet("Firmware: ESP8266 + DHT11 (temp/humidity) + MQ5 (methane/gas)")

    pdf.sub_title("Repository structure")
    pdf.code_block(
        "swarm_webapp/\n"
        "  backend/     Spring Boot REST API\n"
        "  frontend/    React web dashboard\n"
        "  database/    MySQL schema\n"
        "  firmware/    ESP8266 Arduino sketch\n"
        "  docker/      MQTT and deployment configs\n"
        "  docs/        Documentation"
    )

    pdf.sub_title("High-level data flow")
    pdf.numbered(
        1,
        "ESP8266 hub reads DHT11 and MQ5 sensors every 5 seconds on the plant LAN.",
    )
    pdf.numbered(
        2,
        "ESP pushes readings to SWARM backend via POST /api/iot/batch every 30 seconds.",
    )
    pdf.numbered(
        3,
        "Backend stores readings, evaluates alert thresholds, and runs AI health analysis.",
    )
    pdf.numbered(
        4,
        "Dashboard and Analytics pages fetch data via authenticated REST APIs.",
    )
    pdf.numbered(
        5,
        "Users acknowledge alerts and review AI recommendations through the web UI.",
    )
    pdf.numbered(
        6,
        "emPOWER ERP pulls telemetry via Partner API (/api/partner/v1) using org API keys.",
    )

    # 3. Local setup
    pdf.add_page()
    pdf.section_title("3. How to Run Locally")
    pdf.sub_title("Option A - Quick development (recommended)")
    pdf.body("Uses H2 in-memory database. No Docker or MySQL required.")
    pdf.sub_title("Terminal 1 - Start backend")
    pdf.code_block(
        "cd backend\n"
        ".\\mvnw.cmd spring-boot:run \"-Dspring-boot.run.profiles=dev\"\n"
        "API: http://localhost:8080/api"
    )
    pdf.sub_title("Terminal 2 - Start frontend")
    pdf.code_block(
        "cd frontend\n"
        "npm install\n"
        "npm run dev\n"
        "Web app: http://localhost:3000"
    )
    pdf.body("Or double-click START-BACKEND.bat and START-WEBSITE.bat in the project root.")

    pdf.sub_title("Option B - Full stack with Docker")
    pdf.code_block("docker-compose up -d")
    pdf.bullet("Frontend: http://localhost (port 80)")
    pdf.bullet("Backend API: http://localhost:8080/api")
    pdf.bullet("MySQL: port 3306 | MQTT: port 1883")

    pdf.sub_title("Default login credentials")
    pdf.bullet("Super Admin: admin@biopower.com / admin123")
    pdf.bullet("Plant Admin: manager@biopower.com / manager123")
    pdf.bullet("Operator: operator@biopower.com / operator123")

    # 4. User roles
    pdf.add_page()
    pdf.section_title("4. User Roles and Access")
    pdf.sub_title("Super Admin (platform owner)")
    pdf.bullet("Full access to all plants and users")
    pdf.bullet("Configure project hardware profiles (which sensors each plant uses)")
    pdf.bullet("Register sensor hardware on Sensor Nodes page")
    pdf.bullet("Create pending ESP sensor sets for operators")
    pdf.bullet("Access System Settings")
    pdf.bullet("Delete plants")

    pdf.sub_title("Plant Admin (site manager)")
    pdf.bullet("Manage plants assigned to them")
    pdf.bullet("Manage operators for their plants")
    pdf.bullet("Pair ESP devices and assign to operators")
    pdf.bullet("View dashboard, analytics, alerts, AI, reports")
    pdf.bullet("Cannot configure SaaS hardware profiles or system settings")

    pdf.sub_title("Operator (field technician)")
    pdf.bullet("View dashboard scoped to assigned plants and sensor nodes")
    pdf.bullet("Connect and pair ESP devices on-site")
    pdf.bullet("View analytics, alerts, AI recommendations")
    pdf.bullet("Cannot manage plants, users, or register hardware")

    # 5. Super admin workflow
    pdf.add_page()
    pdf.section_title("5. Super Admin - Full Project Setup Flow")
    pdf.numbered(1, "Log in at http://localhost:3000 with admin@biopower.com")
    pdf.numbered(2, "Go to Plants > Add Plant")
    pdf.numbered(
        3,
        "Fill plant details: name, type, location, capacity, feedstock, installation date.",
    )
    pdf.numbered(
        4,
        "Under Project hardware (SaaS), select sensor bundle:",
    )
    pdf.bullet("ESP Hub: Temperature, Humidity, Methane (DHT11 + MQ5)")
    pdf.bullet("3 Transmitters: Pressure, Flow, Temperature transmitters")
    pdf.numbered(5, "Save the plant. Only enabled sensors appear on that plant's dashboard.")
    pdf.numbered(
        6,
        "Optional: Edit plant > Installed sensors section to add individual sensor nodes.",
    )
    pdf.numbered(7, "Go to Users > Add User")
    pdf.numbered(8, "Set role to Operator, assign exactly one plant.")
    pdf.numbered(
        9,
        "Click Create pending ESP sensor set (creates Pending ESP Temperature/Humidity/Gas nodes).",
    )
    pdf.numbered(10, "Assign those sensor node IDs to the operator. Save user.")
    pdf.numbered(
        11,
        "Flash ESP8266 firmware (firmware/swarm_esp8266_hub/swarm_esp8266_hub.ino) with device password.",
    )
    pdf.numbered(12, "Field user pairs device via Connect Device (see Section 7).")

    # 6. Plant admin workflow
    pdf.add_page()
    pdf.section_title("6. Plant Admin Workflow")
    pdf.numbered(1, "Log in as manager@biopower.com (or assigned Plant Admin account).")
    pdf.numbered(2, "Review assigned plants on Dashboard. Select plant from dropdown.")
    pdf.numbered(3, "Create or edit plants (within assigned scope).")
    pdf.numbered(4, "Manage operators: Users page > add/edit operators for your plants.")
    pdf.numbered(5, "Pair ESP devices: Connect Device > enter ESP IP and password > Pair.")
    pdf.numbered(6, "Monitor live readings, health score, and active alerts on Dashboard.")
    pdf.numbered(7, "Use Analytics for historical trends.")
    pdf.numbered(8, "Acknowledge and resolve alerts on Alerts page.")
    pdf.numbered(9, "Review AI Recommendations for plant health suggestions.")
    pdf.numbered(10, "Generate reports from Reports page.")

    # 7. ESP pairing
    pdf.add_page()
    pdf.section_title("7. ESP8266 Device Pairing Flow")
    pdf.body(
        "The Connect Device page uses a 3-step wizard: Connect to ESP, Check sensors, Pair with SWARM."
    )

    pdf.sub_title("Phase A - Admin first flash (one time per board)")
    pdf.numbered(1, "Open firmware/swarm_esp8266_hub/swarm_esp8266_hub.ino in Arduino IDE.")
    pdf.numbered(2, "Set DEVICE_PASSWORD (default: 1234). Flash ESP8266 over USB.")
    pdf.numbered(3, "Give device password to the field operator.")

    pdf.sub_title("Phase B - Field Wi-Fi setup (phone)")
    pdf.numbered(1, "Power on ESP. On phone, turn off mobile data.")
    pdf.numbered(2, "Join Wi-Fi hotspot: SWARM-Setup-<chipId> (password = device password).")
    pdf.numbered(3, "Open http://192.168.4.1/setup in browser.")
    pdf.numbered(4, "Enter site Wi-Fi SSID and password. ESP joins plant network.")
    pdf.numbered(5, "Note the ESP LAN IP (e.g. 192.168.1.45) from serial monitor or router.")

    pdf.sub_title("Phase C - Pair in SWARM web app")
    pdf.numbered(1, "Log in > Connect Device.")
    pdf.numbered(2, "Step 1: Enter ESP IP address and device password. Click Connect.")
    pdf.numbered(3, "Backend proxies ESP /api/status to verify DHT11 and MQ5 health.")
    pdf.numbered(4, "Step 2: Review sensor status (temperature, humidity, gas readings).")
    pdf.numbered(5, "Step 3: Select plant, optional operator assignment, SWARM server URL.")
    pdf.numbered(
        6,
        "SWARM URL must be your PC LAN IP (e.g. http://192.168.1.10:8080/api), NOT localhost.",
    )
    pdf.numbered(7, "Click Pair with SWARM.")
    pdf.numbered(
        8,
        "Backend claims pending sensor nodes (or creates new ones) and configures ESP via /swarm/configure.",
    )
    pdf.numbered(9, "ESP begins pushing data every 30 seconds. Go to Dashboard to verify live readings.")

    # 8. Sensor data flow
    pdf.add_page()
    pdf.section_title("8. Sensor Data Flow (Technical)")
    pdf.sub_title("Ingestion paths")
    pdf.bullet("REST: POST /api/iot/data (single reading)")
    pdf.bullet("REST: POST /api/iot/batch (multiple readings - used by ESP firmware)")
    pdf.bullet("MQTT: topic biopower/sensors/# (when MQTT enabled)")

    pdf.sub_title("On each reading received")
    pdf.numbered(1, "IoTDataService validates plant ID, node ID, and sensor type.")
    pdf.numbered(2, "Reading saved to sensor_readings table with timestamp.")
    pdf.numbered(3, "Sensor node last_reading_at and status updated to ACTIVE.")
    pdf.numbered(4, "AlertService checks thresholds (pH, temperature, pressure, gas flow, etc.).")
    pdf.numbered(5, "If threshold breached, alert created with severity CRITICAL/WARNING/INFORMATION.")
    pdf.numbered(6, "AiHealthService analyzes latest readings and updates health score.")

    pdf.sub_title("Dashboard refresh")
    pdf.bullet("Dashboard auto-refreshes every 30 seconds.")
    pdf.bullet("Manual Sync button pulls live data from ESP via backend proxy.")
    pdf.bullet("Only sensors in the plant hardware profile are shown.")

    # 9. Alerts and AI
    pdf.add_page()
    pdf.section_title("9. Alerts, AI, and Notifications")
    pdf.sub_title("Alert workflow")
    pdf.numbered(1, "Alert triggered when sensor value crosses configured threshold.")
    pdf.numbered(2, "Alert appears on Dashboard (top 5) and Alerts page.")
    pdf.numbered(3, "Bell icon in navbar shows active alert count.")
    pdf.numbered(4, "User clicks Acknowledge to mark as seen.")
    pdf.numbered(5, "User clicks Resolve when issue is fixed.")
    pdf.numbered(6, "Scheduled job checks for sensor timeout (offline after 10 minutes).")

    pdf.sub_title("AI health engine (rule-based)")
    pdf.body("AiHealthService analyzes current readings and detects:")
    pdf.bullet("Acidification (low pH) - reduce feedstock, increase mixing")
    pdf.bullet("Overfeeding (high pH) - reduce organic loading")
    pdf.bullet("Gas yield reduction (low methane) - check sensors and temperature")
    pdf.bullet("Underfeeding (low gas flow) - increase feedstock gradually")
    pdf.bullet("Plant instability (temperature out of 30-42 C range)")
    pdf.body("Outputs: health score (0-100), status, and actionable recommendations.")

    pdf.sub_title("Predictive maintenance")
    pdf.body(
        "Maintenance page shows equipment predictions (pump, blower, agitator, compressor, sensor) "
        "with remaining useful life and estimated failure dates."
    )

    # 10. emPOWER integration
    pdf.add_page()
    pdf.section_title("10. emPOWER ERP Integration (Partner API)")
    pdf.body(
        "SWARM is a standalone IoT product. emPOWER ERP integrates as a server-side API client only. "
        "There is no Swarm UI embed in emPOWER, no user sync, and no Central Auth on emPOWER for P2."
    )

    pdf.sub_title("Product boundaries")
    pdf.bullet("SWARM owns: sensor ingest, devices, plants, alerts, AI health, ESP pairing, MQTT")
    pdf.bullet("emPOWER owns: BOM, batches, stock, labour, invoices, contribution/costing")
    pdf.bullet("Mapping device to hub/line stays on emPOWER (MeterDeviceMap)")
    pdf.bullet("emPOWER vaults org API key server-side; browser never calls SWARM directly")

    pdf.sub_title("Partner API authentication")
    pdf.bullet("Base path: /api/partner/v1")
    pdf.bullet("Auth header: Authorization: Bearer <api_key>")
    pdf.bullet("Separate from JWT user login; keys stored as SHA-256 hashes")
    pdf.bullet("One API key scoped to one partner organization")
    pdf.bullet("Plant access limited by org plant allow-list")

    pdf.sub_title("Sandbox credentials (local dev)")
    pdf.code_block(
        "Organization: org_biopower_pilot\n"
        "API key:      swk_sandbox_biopower_dev_2026\n"
        "Health check: GET /api/partner/v1/health"
    )

    pdf.sub_title("Partner API endpoints (read-only, pull)")
    partner_eps = [
        ("GET /partner/v1/health", "Ping + org binding"),
        ("GET /partner/v1/plants", "Plant catalog"),
        ("GET /partner/v1/devices", "Device catalog (device_id = node_{id})"),
        ("GET /partner/v1/telemetry/latest", "Latest sensor readings"),
        ("GET /partner/v1/telemetry/history", "Paginated history with cursor"),
        ("GET /partner/v1/telemetry/alerts", "Active and historical alerts"),
        ("GET /partner/v1/telemetry/health/{plantId}", "Plant health summary"),
        ("GET /partner/v1/aggregates/daily", "Daily aggregates for costing"),
    ]
    for ep, purpose in partner_eps:
        pdf.bullet(f"{ep} - {purpose}")

    pdf.sub_title("emPOWER pull workflow (~15 min cron)")
    pdf.numbered(1, "emPOWER Admin saves SWARM base URL + API key in org vault.")
    pdf.numbered(2, "emPOWER backend calls GET /partner/v1/health to verify connection.")
    pdf.numbered(3, "Cron job pulls plants, devices, latest readings or daily aggregates.")
    pdf.numbered(4, "emPOWER maps device_id to hub/line/metricType via MeterDeviceMap.")
    pdf.numbered(5, "Unmapped devices are dropped on emPOWER side.")
    pdf.numbered(6, "emPOWER applies quality flags and builds local daily aggregates.")
    pdf.numbered(7, "NOVA skills answer contribution questions using local aggs + ERP costs.")

    pdf.sub_title("What emPOWER will NOT call")
    pdf.bullet("POST /api/iot/batch (device ingest only)")
    pdf.bullet("Connect Device / pairing APIs")
    pdf.bullet("User admin or mutating Swarm config APIs")

    pdf.sub_title("Super Admin - manage partner keys (JWT)")
    pdf.bullet("GET /api/admin/partner/organizations")
    pdf.bullet("POST /api/admin/partner/organizations")
    pdf.bullet("POST /api/admin/partner/api-keys")
    pdf.bullet("DELETE /api/admin/partner/api-keys/{id}")

    pdf.body("Full Partner API reference: docs/PARTNER_API.md")

    # 11. Page navigation map
    pdf.add_page()
    pdf.section_title("11. Application Page Map")
    pages = [
        ("/login", "Login - email/password authentication"),
        ("/signup", "Signup - creates Operator account"),
        ("/dashboard", "Dashboard - live plant monitoring (all roles)"),
        ("/plants", "Plants - CRUD and hardware config (Admin)"),
        ("/sensors", "Sensor Nodes - hardware registration (Super Admin)"),
        ("/connect-device", "Connect Device - ESP pairing wizard"),
        ("/analytics", "Analytics - historical charts"),
        ("/alerts", "Alerts - manage threshold alerts"),
        ("/ai", "AI Recommendations - health analysis"),
        ("/maintenance", "Predictive Maintenance"),
        ("/reports", "Reports - generate and download"),
        ("/users", "Users - user management (Admin)"),
        ("/settings", "Settings - system config (Super Admin)"),
        ("/notifications", "Notification Center"),
        ("/help", "Help - ESP connection manual"),
    ]
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(45, 6, "Route", border=1)
    pdf.cell(0, 6, "Description", border=1, ln=True)
    pdf.set_font("Helvetica", "", 9)
    for route, desc in pages:
        pdf.cell(45, 6, route, border=1)
        pdf.cell(0, 6, desc, border=1, ln=True)

    # 12. API reference (key endpoints)
    pdf.add_page()
    pdf.section_title("12. Key API Endpoints")
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(55, 6, "Endpoint", border=1)
    pdf.cell(25, 6, "Auth", border=1)
    pdf.cell(0, 6, "Purpose", border=1, ln=True)
    pdf.set_font("Helvetica", "", 9)
    endpoints = [
        ("POST /api/auth/login", "Public", "User login, returns JWT token"),
        ("GET /api/plants", "JWT", "List plants (scoped by role)"),
        ("POST /api/plants", "Admin", "Create plant with hardware profile"),
        ("POST /api/sensor-nodes", "Admin", "Register sensor node"),
        ("POST /api/devices/pair", "JWT", "Pair ESP8266 to plant"),
        ("POST /api/devices/sync-readings", "JWT", "Pull live ESP data"),
        ("POST /api/iot/batch", "Public", "ESP firmware data ingest"),
        ("GET /api/dashboard/{plantId}", "JWT", "Live dashboard data"),
        ("GET /api/analytics/{plantId}", "JWT", "Historical sensor data"),
        ("GET /api/alerts", "JWT", "List alerts"),
        ("PATCH /api/alerts/{id}/resolve", "JWT", "Resolve alert"),
        ("GET /api/ai/recommendations/{plantId}", "JWT", "AI health recommendations"),
        ("GET /api/maintenance/{plantId}", "JWT", "Predictive maintenance data"),
        ("POST /api/reports/generate", "JWT", "Generate report"),
        ("GET /api/settings", "Super Admin", "System settings"),
        ("GET /api/partner/v1/health", "API Key", "Partner ping (emPOWER)"),
        ("GET /api/partner/v1/plants", "API Key", "Partner plant catalog"),
        ("GET /api/partner/v1/devices", "API Key", "Partner device catalog"),
        ("GET /api/partner/v1/telemetry/latest", "API Key", "Latest readings"),
        ("GET /api/partner/v1/aggregates/daily", "API Key", "Daily aggregates"),
    ]
    for ep, auth, purpose in endpoints:
        pdf.cell(55, 6, ep, border=1)
        pdf.cell(25, 6, auth, border=1)
        pdf.cell(0, 6, purpose, border=1, ln=True)

    pdf.ln(6)
    pdf.body("Full API reference: docs/API.md | Partner API: docs/PARTNER_API.md")

    # End
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 6, "End of document", align="C")

    pdf.output(OUTPUT)
    print(f"Created: {OUTPUT}")


if __name__ == "__main__":
    build()
