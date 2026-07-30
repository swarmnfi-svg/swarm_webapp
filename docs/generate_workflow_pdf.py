"""Generate SWARM Project Workflow & Usage PDF."""
from datetime import date
from fpdf import FPDF

OUTPUT = "docs/SWARM_Project_Workflow_and_Usage.pdf"


class WorkflowPDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(100, 100, 100)
            self.cell(0, 8, "SWARM Project Workflow & Usage Guide", align="L")
            self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")

    def section_title(self, title):
        self.ln(3)
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

    def note(self, text):
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(80, 80, 80)
        self.multi_cell(0, 5, f"Note: {text}")
        self.ln(2)

    def code_block(self, lines):
        self.set_fill_color(245, 245, 245)
        self.set_font("Courier", "", 9)
        self.set_text_color(30, 30, 30)
        for line in lines:
            self.cell(0, 5, "  " + line, ln=True, fill=True)
        self.ln(2)

    def table(self, headers, rows, col_widths=None):
        if not col_widths:
            w = 190 / len(headers)
            col_widths = [w] * len(headers)
        self.set_font("Helvetica", "B", 9)
        self.set_fill_color(230, 245, 238)
        for i, h in enumerate(headers):
            self.cell(col_widths[i], 7, h, border=1, fill=True)
        self.ln()
        self.set_font("Helvetica", "", 9)
        for row in rows:
            line_h = 6
            x0, y0 = self.get_x(), self.get_y()
            heights = []
            for i, cell in enumerate(row):
                nb = self.get_string_width(str(cell)) / max(1, col_widths[i] - 2)
                heights.append(max(1, int(nb) + 1) * line_h)
            max_h = max(heights) if heights else line_h
            if y0 + max_h > 270:
                self.add_page()
                y0 = self.get_y()
            x = x0
            for i, cell in enumerate(row):
                self.set_xy(x, y0)
                self.multi_cell(col_widths[i], line_h, str(cell), border=1)
                x += col_widths[i]
            self.set_xy(x0, y0 + max_h)
        self.ln(3)


def build():
    pdf = WorkflowPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    # Cover
    pdf.ln(24)
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(0, 100, 60)
    pdf.cell(0, 12, "SWARM", align="C", ln=True)
    pdf.set_font("Helvetica", "", 13)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(0, 8, "Industrial IoT Control, Reporting & AI Platform", align="C", ln=True)
    pdf.ln(8)
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 10, "Project Workflow & Usage Guide", align="C", ln=True)
    pdf.ln(10)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 6, "by nanoFarm", align="C", ln=True)
    pdf.cell(0, 6, f"Version: {date.today().strftime('%d %B %Y')}", align="C", ln=True)
    pdf.ln(12)
    pdf.set_font("Helvetica", "I", 10)
    pdf.multi_cell(
        0,
        5,
        "Reference deployment: Tata Steel West Bokaro Biomethanation Plant\n"
        "Production: https://app.swarm.co.in",
        align="C",
    )

    # TOC
    pdf.add_page()
    pdf.section_title("Table of Contents")
    for item in [
        "1. Project Overview",
        "2. System Architecture Workflow",
        "3. End-to-End Data Flow",
        "4. Plant HMI Workflow",
        "5. ESP Sensor Hub Onboarding",
        "6. Daily Usage by Role",
        "7. Development Workflow",
        "8. Deployment Workflow",
        "9. Key URLs & Credentials",
        "10. Project Structure",
    ]:
        pdf.bullet(item)

    # 1 Overview
    pdf.add_page()
    pdf.section_title("1. Project Overview")
    pdf.body(
        "SWARM is a cloud + edge Industrial IoT platform for biogas, waste-to-energy, "
        "and sanitation plants. It combines real-time monitoring, interactive plant HMI, "
        "alerts, AI recommendations, predictive maintenance, and multi-plant management."
    )
    pdf.sub_title("Core modules")
    pdf.table(
        ["Layer", "Module", "Purpose"],
        [
            ["Cloud", "Dashboard", "Plant health, sensors, alerts, analytics"],
            ["Cloud", "Reports / AI", "Automated reports, recommendations, maintenance"],
            ["Edge", "swarm-connect", "Device pairing (ESP, PLC, MQTT)"],
            ["Edge", "swarm-hmi", "Interactive PFD / P&ID HMI"],
            ["Edge", "swarm-control", "Equipment state machines and interlocks"],
            ["Edge", "swarm-io", "Sensor and field I/O ingestion"],
            ["Field", "ESP / PLC / Sensors", "Physical plant instrumentation"],
        ],
        [28, 42, 120],
    )
    pdf.sub_title("Current phase")
    pdf.bullet("Phase 1-2: Simulation mode - HMI commands update server state only")
    pdf.bullet("Phase 3 (planned): Real PLC / Modbus / MQTT field integration")

    # 2 Architecture
    pdf.section_title("2. System Architecture Workflow")
    pdf.body("High-level flow from field to operator:")
    pdf.code_block(
        [
            "FIELD DEVICES          EDGE (SWARM Core)              CLOUD (SWARM App)",
            "-------------          -----------------              -----------------",
            "ESP8266/ESP32    -->   swarm-io / REST ingest   -->   Dashboard",
            "PLC / MQTT       -->   swarm-connect            -->   Analytics",
            "Sensors          -->   swarm-hmi (local PFD)    -->   Plant HMI (React)",
            "                       swarm-control (logic)    -->   Alerts / AI / Reports",
        ]
    )
    pdf.sub_title("Technology stack")
    pdf.table(
        ["Layer", "Technology"],
        [
            ["Frontend", "React 18, Material UI, Recharts"],
            ["Backend", "Spring Boot 3, Java 17, JWT"],
            ["Database", "MySQL 8"],
            ["IoT", "REST API, MQTT (optional)"],
            ["HMI runtime", "biogas-pfd.html + swarm-hmi.js (iframe)"],
            ["Deploy", "Docker, Railway, Nginx"],
        ],
        [45, 145],
    )

    # 3 Data flow
    pdf.add_page()
    pdf.section_title("3. End-to-End Data Flow")
    pdf.sub_title("Sensor data ingestion")
    pdf.numbered(1, "Field device (ESP hub, PLC, or gateway) reads sensor values.")
    pdf.numbered(2, "Data sent via POST /api/iot/data or MQTT topic biopower/sensors/#.")
    pdf.numbered(3, "Backend stores readings and links them to plant + sensor node.")
    pdf.numbered(4, "Dashboard and Plant HMI poll latest values (~4-8 seconds).")
    pdf.numbered(5, "Alert engine checks thresholds; notifications appear in bell icon.")
    pdf.sub_title("HMI command flow (simulation)")
    pdf.numbered(1, "Operator clicks block control or master bus in Plant HMI UI.")
    pdf.numbered(2, "React iframe sends postMessage to swarm-hmi.js.")
    pdf.numbered(3, "Frontend calls POST /api/hmi/{plantId}/commands or /master.")
    pdf.numbered(4, "Backend updates hmi_equipment_state and hmi_plant_state tables.")
    pdf.numbered(5, "UI refreshes; pipe flow animation follows active equipment blocks.")
    pdf.note("Commands do not reach real PLCs until Phase 3 integration.")

    # 4 HMI workflow
    pdf.section_title("4. Plant HMI Workflow")
    pdf.body(
        "The Plant HMI at /plant-hmi shows the Tata Steel West Bokaro biomethanation "
        "process flow diagram with 8 equipment control blocks."
    )
    pdf.sub_title("Operator workflow")
    pdf.numbered(1, "Log in and open Plant HMI from sidebar or /plant-hmi.")
    pdf.numbered(2, "Plant Admin: Energize master output bus (plant power on).")
    pdf.numbered(3, "Select equipment block buttons: Belt Conveyor, Crusher, Pre Treatment, Motor, Main Digester, Slurry Storage, Treatment Water, Equalization.")
    pdf.numbered(4, "Monitor live FIT/PIT/LIT readings in bottom panel (hover on diagram for tag tooltips).")
    pdf.numbered(5, "Watch animated pipe flow (water, slurry, gas) based on running blocks.")
    pdf.numbered(6, "Use HMI tabs: Overview, zone pages, alarms, trends, diagnostics, audit.")
    pdf.sub_title("Block control mapping")
    pdf.table(
        ["UI Block", "Tag", "Equipment"],
        [
            ["Belt Conveyor", "BC101", "Feed belt"],
            ["Crusher", "CH101", "Crusher"],
            ["Pre Treatment Tank", "P-101B", "Duty feed pump PW"],
            ["Motor", "AG101", "Pre-treatment mixer / fan"],
            ["Main Digester", "AG102", "Digester agitator"],
            ["Slurry Storage", "P102", "Slurry pump"],
            ["Treatment Water", "P104", "Treatment water pump"],
            ["Equalization", "P103", "Equalization pump"],
        ],
        [55, 30, 105],
    )
    pdf.sub_title("Status colours (bus energized)")
    pdf.table(
        ["Colour", "Meaning"],
        [
            ["Green", "Running"],
            ["Red", "Stopped"],
            ["Yellow", "Fault"],
            ["Grey", "Bus de-energized"],
        ],
        [40, 150],
    )

    # 5 ESP onboarding
    pdf.add_page()
    pdf.section_title("5. ESP Sensor Hub Onboarding")
    pdf.body("Workflow to connect a SWARM MODEL ESP hub (DHT11 + MQ5) to a plant:")
    pdf.numbered(1, "Admin: set Device Unique ID in firmware and flash ESP once.")
    pdf.numbered(2, "On site: connect phone to Wi-Fi AP SWARM-Setup-<chipId> (password = Unique ID).")
    pdf.numbered(3, "Open http://192.168.4.1/setup - enter Unique ID and site Wi-Fi credentials.")
    pdf.numbered(4, "In SWARM app: Connect Device - enter ESP LAN IP + device password.")
    pdf.numbered(5, "Pair device to plant; verify readings on Dashboard.")
    pdf.note("Full screenshots: docs/ESP_SENSOR_HUB_MANUAL.md")

    # 6 Daily usage by role
    pdf.section_title("6. Daily Usage by Role")
    pdf.sub_title("Super Admin")
    pdf.bullet("Manage users, system settings, MQTT/email thresholds")
    pdf.bullet("Full access to all plants, HMI controls, reports")
    pdf.sub_title("Plant Admin")
    pdf.bullet("Manage assigned plants and sensor nodes")
    pdf.bullet("Control Plant HMI (energize bus, start/stop equipment)")
    pdf.bullet("Pair ESP devices, acknowledge alerts, generate reports")
    pdf.sub_title("Operator")
    pdf.bullet("View dashboard, HMI, analytics, alerts")
    pdf.bullet("Cannot send HMI commands or manage plants/users")
    pdf.sub_title("Typical daily operator flow")
    pdf.numbered(1, "Open Dashboard - check plant health score and active alerts.")
    pdf.numbered(2, "Open Plant HMI - verify equipment status and instrument readings.")
    pdf.numbered(3, "Review Alerts - acknowledge and resolve issues.")
    pdf.numbered(4, "Check AI Recommendations - follow suggested actions.")
    pdf.numbered(5, "Generate or download daily/weekly report if required.")

    # 7 Development workflow
    pdf.add_page()
    pdf.section_title("7. Development Workflow")
    pdf.sub_title("Prerequisites")
    pdf.bullet("Java 17+, Node.js 18+, MySQL 8 (or Docker)")
    pdf.sub_title("Start locally")
    pdf.code_block(
        [
            "# Terminal 1 - Backend",
            "cd backend",
            r".\mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=dev",
            "",
            "# Terminal 2 - Frontend",
            "cd frontend",
            "npm install",
            "npm run dev",
        ]
    )
    pdf.sub_title("Key dev URLs")
    pdf.table(
        ["URL", "Purpose"],
        [
            ["http://localhost:3000", "React app"],
            ["http://localhost:3000/plant-hmi", "Plant HMI"],
            ["http://localhost:3000/help", "In-app user manual"],
            ["http://localhost:8080/api", "REST API"],
        ],
        [75, 115],
    )
    pdf.sub_title("HMI development")
    pdf.bullet("Edit PFD: frontend/public/hmi/biogas-pfd.html")
    pdf.bullet("Edit logic: frontend/public/hmi/swarm-hmi.js")
    pdf.bullet("React bridge: frontend/src/components/hmi/BiogasPlantDiagram.jsx")
    pdf.bullet("Backend API: backend/.../HmiController.java, HmiService.java")
    pdf.sub_title("Git workflow")
    pdf.numbered(1, "Make changes on feature branch or main.")
    pdf.numbered(2, "Test locally (backend + frontend + HMI).")
    pdf.numbered(3, "Commit and push to remote (swarm / origin).")
    pdf.numbered(4, "Railway auto-deploys frontend and backend from main.")

    # 8 Deployment
    pdf.section_title("8. Deployment Workflow")
    pdf.sub_title("Docker (local / on-prem)")
    pdf.code_block(["docker-compose up -d", "Access: http://localhost"])
    pdf.sub_title("Railway (cloud)")
    pdf.table(
        ["Service", "Root directory", "Notes"],
        [
            ["MySQL", "Railway template", "Internal DB host"],
            ["Backend", "backend/", "Set PORT, DB, JWT, CORS"],
            ["Frontend", "frontend/", "VITE_API_URL -> backend /api"],
        ],
        [40, 50, 100],
    )
    pdf.body("Deploy from service root only - not repo root.")
    pdf.sub_title("Production targets")
    pdf.table(
        ["Host", "Role"],
        [
            ["app.swarm.co.in", "SWARM React application"],
            ["api.swarm.co.in", "SWARM backend API (recommended)"],
            ["swarm.co.in", "Marketing website"],
        ],
        [55, 135],
    )

    # 9 URLs & credentials
    pdf.add_page()
    pdf.section_title("9. Key URLs & Credentials")
    pdf.sub_title("Production")
    pdf.bullet("App: https://app.swarm.co.in")
    pdf.bullet("Plant HMI: https://app.swarm.co.in/plant-hmi")
    pdf.sub_title("Tata Steel demo (HMI plant)")
    pdf.table(
        ["Role", "Email", "Password"],
        [
            ["Plant Admin", "tata.admin@tatasteel.com", "TataSteel@2026"],
            ["Operator", "tata.operator@tatasteel.com", "TataSteel@2026"],
        ],
        [40, 80, 70],
    )
    pdf.sub_title("Local dev defaults")
    pdf.table(
        ["Role", "Email", "Password"],
        [
            ["Super Admin", "admin@biopower.com", "admin123"],
            ["Plant Admin", "manager@biopower.com", "manager123"],
            ["Operator", "operator@biopower.com", "operator123"],
        ],
        [40, 80, 70],
    )

    # 10 Structure
    pdf.section_title("10. Project Structure")
    pdf.code_block(
        [
            "swarm_webapp/",
            "  backend/           Spring Boot API, HMI controllers",
            "  frontend/          React dashboard + Plant HMI page",
            "    public/hmi/      biogas-pfd.html, swarm-hmi.js, P&ID assets",
            "    src/pages/       PlantHmi.jsx, Dashboard.jsx, Help.jsx",
            "  database/          MySQL schema",
            "  docs/              Manuals, checkpoints, deployment guides",
            "  docker-compose.yml Local full-stack deploy",
        ]
    )
    pdf.sub_title("Related documentation")
    pdf.bullet("docs/USER_MANUAL.md - full end-user guide")
    pdf.bullet("docs/PLANT_HMI.md - HMI technical reference")
    pdf.bullet("docs/ESP_SENSOR_HUB_MANUAL.md - ESP pairing guide")
    pdf.bullet("docs/RAILWAY_DEPLOYMENT.md - cloud deployment")
    pdf.bullet("docs/PARTNER_API.md - emPOWER partner telemetry API")

    pdf.ln(8)
    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 6, "End of SWARM Project Workflow & Usage Guide", align="C")

    pdf.output(OUTPUT)
    print(f"Created: {OUTPUT}")


if __name__ == "__main__":
    build()
