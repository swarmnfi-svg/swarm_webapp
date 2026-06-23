# User Manual

## BIOPOWER AI-IoT Plant Health Monitoring System

---

## 1. Getting Started

### Login
1. Open the application URL in your browser
2. Enter your email and password
3. Click **Sign In**

### Forgot Password
1. Click **Forgot Password?** on the login page
2. Enter your registered email
3. Check your email for reset instructions

---

## 2. Dashboard

The main dashboard provides real-time plant monitoring:

- **Plant Health Score** (0-100): Green = Healthy, Yellow = Warning, Red = Critical
- **Sensor Cards**: Current readings for pH, Temperature, Pressure, Gas Flow, Methane, CO₂, H₂S, NH₃
- **Active Alerts**: Latest unresolved alerts
- **Gas Production**: Current biogas output rate

Select a plant from the dropdown to switch between sites.

---

## 3. Plant Management (Admin)

### Add a Plant
1. Navigate to **Plants** in the sidebar
2. Click **Add Plant**
3. Fill in: Name, Type, Location, Capacity, Feedstock, Installation Date
4. Click **Save**

### Plant Types
- Biogas Plant
- Bio-CNG Plant
- Sanitation Plant
- STP Plant
- Organic Waste Plant
- Waste-to-Energy Plant

---

## 4. Sensor Nodes (Admin)

### Register a Sensor
1. Go to **Sensor Nodes**
2. Click **Register Node**
3. Select plant, enter node name and sensor type
4. Save

### Monitor Node Health
- **Battery Level**: Should be above 20%
- **Signal Strength**: Should be above 50%
- **Status**: Active, Inactive, Faulty, or Offline

---

## 5. Analytics

View historical trends:
1. Select plant and sensor type
2. Choose time range: Hour, Day, Week, Month
3. Interactive chart displays trend data

---

## 6. Alerts

### Alert Severities
- **Critical**: Immediate action required (red)
- **Warning**: Attention needed (yellow)
- **Information**: For awareness (blue)

### Managing Alerts
1. View alerts by status: Active, Acknowledged, Resolved
2. Click **Acknowledge** to mark as seen
3. Click **Resolve** when issue is fixed

---

## 7. AI Recommendations

The AI engine analyzes sensor patterns and provides:
- Health score (0-100)
- Issue detection (acidification, overfeeding, etc.)
- Actionable recommendations

Example: *"Reduce feedstock input by 15%. Increase mixing cycle frequency."*

---

## 8. Predictive Maintenance

View predicted equipment failures:
- Remaining Useful Life (days)
- Estimated Failure Date
- Equipment Health Percentage

Equipment types: Pump, Blower, Agitator, Compressor, Sensor

---

## 9. Reports

Generate and download reports:
1. Click **Generate Report**
2. Select plant, report type, and format (PDF/Excel/CSV)
3. Download from the reports list

---

## 10. User Roles

| Feature | Super Admin | Plant Admin | Operator |
|---------|:-----------:|:-----------:|:--------:|
| View Dashboard | ✓ | ✓ | ✓ |
| Manage Plants | ✓ | ✓ | ✗ |
| Manage Sensors | ✓ | ✓ | ✗ |
| View Alerts | ✓ | ✓ | ✓ |
| AI Recommendations | ✓ | ✓ | ✓ |
| Generate Reports | ✓ | ✓ | ✓ |
| Manage Users | ✓ | ✗ | ✗ |
| System Settings | ✓ | ✗ | ✗ |

---

## 11. Notifications

The bell icon in the navbar shows active alert count. Click to open the Notification Center with categorized alerts.

---

## 12. Settings (Super Admin)

Configure:
- **Alert Thresholds**: pH, temperature, pressure limits
- **MQTT Broker**: IoT message broker settings
- **Email Server**: SMTP configuration for notifications
- **AI Settings**: Analysis interval
- **Report Schedule**: Automated report timing
