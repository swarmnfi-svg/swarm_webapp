"""Generate SWARM User Manual PDF from docs/USER_MANUAL.md content."""
from datetime import date
from fpdf import FPDF

OUTPUT = "docs/SWARM_User_Manual.pdf"


class ManualPDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(100, 100, 100)
            self.cell(0, 8, "SWARM User Manual - BIOPOWER AI-IoT Plant Health Monitoring", align="L")
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
            texts = []
            for i, cell in enumerate(row):
                texts.append(str(cell))
                nb = self.get_string_width(str(cell)) / (col_widths[i] - 2)
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
    pdf = ManualPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    # Cover
    pdf.ln(28)
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(0, 100, 60)
    pdf.cell(0, 12, "SWARM", align="C", ln=True)
    pdf.set_font("Helvetica", "", 13)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(0, 8, "BIOPOWER AI-IoT Plant Health Monitoring System", align="C", ln=True)
    pdf.ln(8)
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 10, "User Manual", align="C", ln=True)
    pdf.ln(10)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 6, "by nanoFarm", align="C", ln=True)
    pdf.cell(0, 6, f"Version: {date.today().strftime('%d %B %Y')}", align="C", ln=True)
    pdf.ln(14)
    pdf.set_font("Helvetica", "I", 10)
    pdf.multi_cell(
        0,
        5,
        "Dashboard monitoring, Plant HMI (process flow diagram), ESP sensor hub pairing, "
        "alerts, AI recommendations, and admin features. "
        "Production app: https://app.swarm.co.in",
        align="C",
    )

    # TOC
    pdf.add_page()
    pdf.section_title("Table of Contents")
    toc = [
        "1. Getting Started",
        "2. Dashboard",
        "3. Plant HMI",
        "4. ESP Sensor Hub",
        "5. Plant Management (Admin)",
        "6. Sensor Nodes (Admin)",
        "7. Analytics",
        "8. Alerts",
        "9. AI Recommendations",
        "10. Predictive Maintenance",
        "11. Reports",
        "12. User Roles",
        "13. Notifications",
        "14. Settings (Super Admin)",
        "15. Android APK",
        "16. Development - Run Locally",
    ]
    for item in toc:
        pdf.bullet(item)

    # 1
    pdf.add_page()
    pdf.section_title("1. Getting Started")
    pdf.sub_title("Login")
    pdf.numbered(1, "Open the application URL (e.g. http://localhost:3000 or https://app.swarm.co.in).")
    pdf.numbered(2, "Enter your email and password.")
    pdf.numbered(3, "Click Sign In.")
    pdf.sub_title("Forgot password")
    pdf.numbered(1, "Click Forgot Password? on the login page.")
    pdf.numbered(2, "Enter your registered email.")
    pdf.numbered(3, "Check your email for reset instructions.")
    pdf.sub_title("Demo credentials (Tata Steel plant)")
    pdf.table(
        ["Role", "Email", "Password"],
        [
            ["Super Admin", "swarm.nfi@gmail.com", "Swarm@2026"],
            ["Plant Admin", "tata.admin@tatasteel.com", "TataSteel@2026"],
            ["Operator", "tata.operator@tatasteel.com", "TataSteel@2026"],
        ],
        [40, 80, 70],
    )

    # 2
    pdf.section_title("2. Dashboard")
    pdf.body("The main dashboard provides real-time plant monitoring:")
    pdf.bullet("Plant Health Score (0-100): Green = Healthy, Yellow = Warning, Red = Critical")
    pdf.bullet("Sensor cards: pH, temperature, pressure, gas flow, methane, CO2, H2S, NH3")
    pdf.bullet("Active alerts: latest unresolved alerts")
    pdf.bullet("Gas production: current biogas output rate")
    pdf.body("Select a plant from the dropdown to switch between sites.")

    # 3 Plant HMI
    pdf.add_page()
    pdf.section_title("3. Plant HMI")
    pdf.body(
        "The Plant HMI is the interactive process flow diagram (PFD) for the Tata Steel West Bokaro "
        "biomethanation plant. It shows equipment status, live instrument readings, animated pipeline "
        "flow, and block-level start/stop controls."
    )
    pdf.note(
        "Simulation mode: commands update server-side HMI state. They do not drive real PLCs "
        "or field pumps until Phase 3 field integration."
    )
    pdf.sub_title("Access")
    pdf.table(
        ["Entry", "Path"],
        [
            ["Sidebar", "Plant HMI"],
            ["Direct URL", "/plant-hmi"],
            ["With plant", "/plant-hmi?plantId=<id>"],
        ],
        [50, 140],
    )
    pdf.body(
        "Roles: All authenticated users can open the HMI. Plant Admin and Super Admin can send "
        "commands. Operators can view status and readings only."
    )
    pdf.sub_title("Page layout")
    pdf.numbered(1, "SWARM Core header - platform modules and simulation indicator.")
    pdf.numbered(2, "Master output enable - energize or de-energize the plant electrical bus.")
    pdf.numbered(3, "Process flow diagram - animated PFD with block buttons and live readings.")
    pdf.numbered(4, "HMI page tabs - Overview, zone pages, alarms, trends, diagnostics, audit.")

    pdf.sub_title("Master output enable (plant bus)")
    pdf.table(
        ["Action", "Effect"],
        [
            ["Energize bus", "Powers controllable equipment (ready, not running)"],
            ["De-energize bus", "Stops all equipment and disables the plant"],
        ],
        [55, 135],
    )
    pdf.body("Only Plant Admin and Super Admin see these buttons.")

    pdf.add_page()
    pdf.sub_title("Block control bar")
    pdf.body("Eight equipment blocks (plus All On when available):")
    pdf.table(
        ["Button", "Tag", "Equipment"],
        [
            ["Belt Conveyor", "BC101", "Feed belt"],
            ["Crusher", "CH101", "Crusher"],
            ["Pre Treatment Tank", "P-101B", "Duty feed pump PW"],
            ["Motor", "AG101", "Pre-treatment mixer / fan"],
            ["Main Digester", "AG102", "Digester agitator"],
            ["Slurry Storage Tank", "P102", "Slurry pump"],
            ["Treatment Water Tank", "P104", "Treatment water pump"],
            ["Equalization Tank", "P103", "Equalization pump"],
        ],
        [55, 30, 105],
    )
    pdf.sub_title("Button colors (when bus is energized)")
    pdf.table(
        ["Color", "Meaning"],
        [
            ["Green", "Running"],
            ["Red", "Off (stopped)"],
            ["Yellow", "Fault"],
            ["Grey", "Bus de-energized or idle"],
        ],
        [40, 150],
    )
    pdf.body("Click a block button to toggle START / STOP for that equipment.")

    pdf.sub_title("Live readings panel")
    pdf.bullet("Equipment - block tag, value, and run status (Off / Running / Fault).")
    pdf.bullet("Instruments - FIT, PIT, LIT tags with live values when sensors are linked.")
    pdf.body("Values refresh about every 4 seconds while the HMI page is open.")

    pdf.sub_title("Pipeline flow animation")
    pdf.bullet("Animated dashed lines show water, slurry, and gas flow.")
    pdf.bullet("Flow follows active blocks - pipes animate when related equipment is running.")
    pdf.bullet("Fresh water feed to heater animates when the bus is energized.")

    pdf.sub_title("PS / PW feed pumps (pre-treatment)")
    pdf.bullet("PW (P-101B) - duty / working pump (Pre Treatment Tank block).")
    pdf.bullet("PS (P-101A) - standby pump.")
    pdf.table(
        ["Condition", "PS to PW line", "PW to digester line"],
        [
            ["PW running (normal)", "Off", "On (when motor + digester active)"],
            ["PW off, PS running", "On", "On"],
            ["Both off", "Off", "Off"],
        ],
        [55, 65, 70],
    )

    pdf.add_page()
    pdf.sub_title("HMI page tabs")
    pdf.table(
        ["Tab", "Purpose"],
        [
            ["Plant Overview", "Process flow summary, auto-sequence, safety chain"],
            ["Feed & Pretreatment", "T101, BC101, CH101, T102, AG101"],
            ["Digester & Feed Pumps", "P-101A/B, T104, AG102"],
            ["Gas System", "Balloon, scrubber, generator, flare"],
            ["Slurry & ETP", "Slurry tanks, screw press, equalization, water"],
            ["Alarm Summary", "Active HMI alarms"],
            ["Trends & Totals", "Pressure, flow, temperature trends"],
            ["Maintenance / Diagnostics", "I/O quality, communication, runtime"],
            ["Audit Log", "Command history for the plant"],
        ],
        [55, 135],
    )
    pdf.sub_title("Troubleshooting (HMI)")
    pdf.table(
        ["Issue", "What to check"],
        [
            ["Block buttons greyed out", "Energize bus first; confirm Admin role"],
            ["No live readings", "Sensor nodes linked; wait ~4 s poll"],
            ["Flow not animating", "Related block running; bus energized"],
            ["Diagram not updating", "Hard refresh Ctrl+Shift+R"],
        ],
        [60, 130],
    )

    # 4 ESP
    pdf.add_page()
    pdf.section_title("4. ESP Sensor Hub")
    pdf.body("SWARM MODEL hub: DHT11 (temperature/humidity) + MQ5 (methane/gas).")
    pdf.sub_title("Quick setup flow")
    pdf.numbered(1, "Admin sets Device Unique ID in firmware and flashes once.")
    pdf.numbered(2, "On site, connect phone to SWARM-Setup-<chipId> (password = Unique ID).")
    pdf.numbered(3, "Open http://192.168.4.1/setup, enter Unique ID + site Wi-Fi, save.")
    pdf.numbered(4, "In SWARM > Connect Device, enter ESP LAN IP + Device Password, then pair.")
    pdf.numbered(5, "Verify readings on Dashboard.")
    pdf.body("Full guide with screenshots: docs/ESP_SENSOR_HUB_MANUAL.md")

    # 5-6
    pdf.section_title("5. Plant Management (Admin)")
    pdf.sub_title("Add a plant")
    pdf.numbered(1, "Navigate to Plants in the sidebar.")
    pdf.numbered(2, "Click Add Plant.")
    pdf.numbered(3, "Fill in: Name, Type, Location, Capacity, Feedstock, Installation Date.")
    pdf.numbered(4, "Click Save. Plants with P&ID feedstock are eligible for Plant HMI.")
    pdf.sub_title("Plant types")
    for pt in ["Biogas", "Bio-CNG", "Sanitation", "STP", "Organic Waste", "Waste-to-Energy"]:
        pdf.bullet(f"{pt} Plant")

    pdf.section_title("6. Sensor Nodes (Admin)")
    pdf.sub_title("Register a sensor")
    pdf.numbered(1, "Go to Sensor Nodes > Register Node.")
    pdf.numbered(2, "Select plant, enter node name and sensor type. Save.")
    pdf.sub_title("Monitor node health")
    pdf.bullet("Battery level: should be above 20%")
    pdf.bullet("Signal strength: should be above 50%")
    pdf.bullet("Status: Active, Inactive, Faulty, or Offline")

    # 7-11
    pdf.add_page()
    pdf.section_title("7. Analytics")
    pdf.numbered(1, "Select plant and sensor type.")
    pdf.numbered(2, "Choose time range: Hour, Day, Week, Month.")
    pdf.numbered(3, "Interactive chart displays trend data.")

    pdf.section_title("8. Alerts")
    pdf.sub_title("Alert severities")
    pdf.bullet("Critical: immediate action (red)")
    pdf.bullet("Warning: attention needed (yellow)")
    pdf.bullet("Information: for awareness (blue)")
    pdf.sub_title("Managing alerts")
    pdf.numbered(1, "View by status: Active, Acknowledged, Resolved.")
    pdf.numbered(2, "Click Acknowledge to mark as seen.")
    pdf.numbered(3, "Click Resolve when issue is fixed.")

    pdf.section_title("9. AI Recommendations")
    pdf.bullet("Health score (0-100)")
    pdf.bullet("Issue detection: acidification, overfeeding, gas yield reduction")
    pdf.bullet("Actionable recommendations for operators")
    pdf.body('Example: "Reduce feedstock input by 15%. Increase mixing cycle frequency."')

    pdf.section_title("10. Predictive Maintenance")
    pdf.bullet("Remaining Useful Life (days)")
    pdf.bullet("Estimated Failure Date")
    pdf.bullet("Equipment Health Percentage")
    pdf.body("Equipment types: Pump, Blower, Agitator, Compressor, Sensor")

    pdf.section_title("11. Reports")
    pdf.numbered(1, "Click Generate Report.")
    pdf.numbered(2, "Select plant, report type, and format (PDF/Excel/CSV).")
    pdf.numbered(3, "Download from the reports list.")

    # 12-16
    pdf.add_page()
    pdf.section_title("12. User Roles")
    pdf.table(
        ["Feature", "Super Admin", "Plant Admin", "Operator"],
        [
            ["View Dashboard", "Yes", "Yes", "Yes"],
            ["View Plant HMI", "Yes", "Yes", "Yes"],
            ["Control Plant HMI", "Yes", "Yes", "No"],
            ["Manage Plants", "Yes", "Yes", "No"],
            ["Manage Sensors", "Yes", "Yes", "No"],
            ["Connect Device (ESP)", "Yes", "Yes", "Yes"],
            ["View Alerts", "Yes", "Yes", "Yes"],
            ["AI Recommendations", "Yes", "Yes", "Yes"],
            ["Generate Reports", "Yes", "Yes", "Yes"],
            ["Manage Users", "Yes", "No", "No"],
            ["System Settings", "Yes", "No", "No"],
        ],
        [70, 40, 40, 40],
    )

    pdf.section_title("13. Notifications")
    pdf.body("The bell icon in the navbar shows active alert count. Click to open the Notification Center.")

    pdf.section_title("14. Settings (Super Admin)")
    pdf.bullet("Alert thresholds: pH, temperature, pressure limits")
    pdf.bullet("MQTT broker: IoT message broker settings")
    pdf.bullet("Email server: SMTP for notifications")
    pdf.bullet("AI settings: analysis interval")
    pdf.bullet("Report schedule: automated report timing")

    pdf.section_title("15. Android APK (phone and tablet)")
    pdf.bullet("Build APK locally — see docs/ANDROID_APK.md")
    pdf.body("Install by copying APK to device. Backend URL from VITE_API_URL in frontend/.env.production.")

    pdf.section_title("16. Development - Run Locally")
    pdf.sub_title("Frontend")
    pdf.set_fill_color(245, 245, 245)
    pdf.set_font("Courier", "", 9)
    for line in ["cd frontend", "npm install", "npm run dev", "URL: http://localhost:3000"]:
        pdf.cell(0, 5, "  " + line, ln=True, fill=True)
    pdf.ln(2)
    pdf.sub_title("Backend")
    for line in [
        "cd backend",
        r".\mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=dev",
        "API: http://localhost:8080/api",
    ]:
        pdf.cell(0, 5, "  " + line, ln=True, fill=True)
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 10)
    pdf.bullet("Plant HMI: http://localhost:3000/plant-hmi")
    pdf.bullet("Git push: git push swarm main")
    pdf.bullet("LAN access: http://<your-PC-IP>:3000/plant-hmi")

    pdf.ln(8)
    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 6, "End of SWARM User Manual", align="C")

    pdf.output(OUTPUT)
    print(f"Created: {OUTPUT}")


if __name__ == "__main__":
    build()
