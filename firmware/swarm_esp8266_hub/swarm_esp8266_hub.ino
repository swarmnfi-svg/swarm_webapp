/*
 * SWARM Sensor Hub — SWARM MODEL + DHT11 + MQ5
 *
 * Features:
 * - /info, /api/status, /setup, /swarm/configure
 * - Sends data to SWARM /api/iot/batch every 30s
 * - Password via /setup or DEVICE_PASSWORD default
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266mDNS.h>
#include <WiFiClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <EEPROM.h>

// ---------- Defaults (used if not saved in /setup) ----------
const char* WIFI_SSID = "BPG renewables 2g";
const char* WIFI_PASSWORD = "biopowerindia";
const char* DEVICE_PASSWORD = "1234";

// ---------- Pins ----------
#define DHT_PIN D4
#define DHT_TYPE DHT11
#define MQ5_PIN A0
#define BUZZER_PIN D1

// ---------- Timing ----------
#define SENSOR_INTERVAL_MS 5000
#define SWARM_INTERVAL_MS 30000
#define EEPROM_SIZE 512
#define EEPROM_MAGIC 0xCD

struct SwarmConfig {
  uint8_t magic;
  char wifiSsid[32];
  char wifiPass[64];
  char devicePass[16];
  char swarmUrl[96];
  uint32_t plantId;
  uint32_t tempNodeId;
  uint32_t humidityNodeId;
  uint32_t gasNodeId;
  uint8_t configured;
};

SwarmConfig swarmCfg;
DHT dht(DHT_PIN, DHT_TYPE);
ESP8266WebServer server(80);

float lastTemp = NAN, lastHumidity = NAN;
int lastGasRaw = -1;
bool dhtOk = false, mq5Ok = false;
String sessionToken;
unsigned long lastSensorRead = 0;
unsigned long lastSwarmSend = 0;

String chipId() {
  return String(ESP.getChipId(), HEX);
}

void loadConfig() {
  EEPROM.begin(EEPROM_SIZE);
  EEPROM.get(0, swarmCfg);
  if (swarmCfg.magic != EEPROM_MAGIC) {
    memset(&swarmCfg, 0, sizeof(swarmCfg));
  }
}

void saveConfig() {
  swarmCfg.magic = EEPROM_MAGIC;
  EEPROM.put(0, swarmCfg);
  EEPROM.commit();
}

const char* getWifiSsid() {
  return (strlen(swarmCfg.wifiSsid) > 0) ? swarmCfg.wifiSsid : WIFI_SSID;
}

const char* getWifiPass() {
  return (strlen(swarmCfg.wifiPass) > 0) ? swarmCfg.wifiPass : WIFI_PASSWORD;
}

const char* getDevicePassword() {
  return (strlen(swarmCfg.devicePass) > 0) ? swarmCfg.devicePass : DEVICE_PASSWORD;
}

String makeToken() {
  return chipId() + String(millis(), HEX);
}

void addCors() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, X-Device-Password");
}

bool checkAuth() {
  if (server.hasHeader("X-Device-Password")) {
    String incoming = server.header("X-Device-Password");
    incoming.trim();
    String expected = String(getDevicePassword());
    expected.trim();
    return incoming == expected;
  }
  if (!server.hasHeader("Cookie")) return false;
  return server.header("Cookie").indexOf("session=" + sessionToken) >= 0;
}

String readRequestBody() {
  if (server.hasArg("plain")) {
    return server.arg("plain");
  }
  String body = "";
  WiFiClient client = server.client();
  unsigned long start = millis();
  while (client.connected() && millis() - start < 2000) {
    while (client.available()) {
      body += (char)client.read();
      start = millis();
    }
    delay(1);
  }
  return body;
}

String healthStatus() {
  if (!dhtOk && !mq5Ok) return "CRITICAL";
  if (!dhtOk || !mq5Ok || lastGasRaw > 500) return "WARNING";
  return "OK";
}

String issuesJson() {
  String s = "[";
  bool first = true;
  if (!dhtOk) { s += "\"DHT11 fault\""; first = false; }
  if (!mq5Ok) { if (!first) s += ","; s += "\"MQ5 fault\""; first = false; }
  if (mq5Ok && lastGasRaw > 500) { if (!first) s += ","; s += "\"High gas\""; first = false; }
  if (dhtOk && lastTemp > 40) { if (!first) s += ","; s += "\"High temperature\""; }
  s += "]";
  return s;
}

void readSensors() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  int gas = analogRead(MQ5_PIN);

  dhtOk = !isnan(t) && !isnan(h);
  mq5Ok = (gas >= 0 && gas <= 1023);

  if (dhtOk) {
    lastTemp = t;
    lastHumidity = h;
  }
  if (mq5Ok) {
    lastGasRaw = gas;
  }

  if (BUZZER_PIN >= 0) {
    bool danger = dhtOk && mq5Ok && (lastGasRaw > 600 || lastTemp > 45);
    digitalWrite(BUZZER_PIN, danger ? HIGH : LOW);
  }

  lastSensorRead = millis();
}

bool sendToSwarm() {
  if (!swarmCfg.configured || strlen(swarmCfg.swarmUrl) == 0) return false;
  if (!dhtOk && !mq5Ok) return false;

  WiFiClient client;
  HTTPClient http;
  String url = String(swarmCfg.swarmUrl);
  if (!url.endsWith("/iot/batch")) {
    if (url.endsWith("/")) url.remove(url.length() - 1);
    url += "/iot/batch";
  }

  StaticJsonDocument<512> doc;
  doc["plantId"] = swarmCfg.plantId;
  doc["chipId"] = chipId();
  doc["rssi"] = WiFi.RSSI();

  JsonArray readings = doc.createNestedArray("readings");

  if (dhtOk) {
    JsonObject t = readings.createNestedObject();
    t["nodeId"] = swarmCfg.tempNodeId;
    t["sensorType"] = "TEMPERATURE";
    t["value"] = lastTemp;

    JsonObject h = readings.createNestedObject();
    h["nodeId"] = swarmCfg.humidityNodeId;
    h["sensorType"] = "HUMIDITY";
    h["value"] = lastHumidity;
  }

  if (mq5Ok) {
    JsonObject g = readings.createNestedObject();
    g["nodeId"] = swarmCfg.gasNodeId;
    g["sensorType"] = "METHANE";
    g["value"] = lastGasRaw;
  }

  String body;
  serializeJson(doc, body);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  http.end();

  return (code == 200 || code == 201);
}

void handleOptions() {
  addCors();
  server.send(204);
}

void handleRoot() {
  addCors();
  server.send(200, "text/html",
    "<html><body style='font-family:sans-serif;padding:20px'>"
    "<h2>SWARM Sensor Hub</h2>"
    "<p><a href='/info'>/info</a></p>"
    "<p><a href='/setup'>/setup</a></p>"
    "<p><a href='/login'>/login</a></p>"
    "</body></html>");
}

void handleInfo() {
  addCors();
  String json = "{";
  json += "\"name\":\"SWARM-SensorHub\",";
  json += "\"chipId\":\"" + chipId() + "\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"sensors\":[\"DHT11\",\"MQ5\"],";
  json += "\"swarmConfigured\":" + String(swarmCfg.configured ? "true" : "false");
  json += "}";
  server.send(200, "application/json", json);
}

void handleStatus() {
  addCors();
  if (!checkAuth()) {
    server.send(401, "application/json", "{\"error\":\"unauthorized\"}");
    return;
  }

  String json = "{";
  json += "\"health\":\"" + healthStatus() + "\",";
  json += "\"dht\":{\"ok\":" + String(dhtOk ? "true" : "false");
  json += ",\"temp\":" + String(dhtOk ? String(lastTemp) : "null");
  json += ",\"humidity\":" + String(dhtOk ? String(lastHumidity) : "null") + "},";
  json += "\"mq5\":{\"ok\":" + String(mq5Ok ? "true" : "false");
  json += ",\"raw\":" + String(mq5Ok ? String(lastGasRaw) : "null") + "},";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"issues\":" + issuesJson();
  json += "}";

  server.send(200, "application/json", json);
}

void handleLoginPage() {
  addCors();
  server.send(200, "text/html",
    "<html><body style='font-family:sans-serif;padding:20px'>"
    "<h2>Device Login</h2>"
    "<form method='POST' action='/login'>"
    "<input type='password' name='password' placeholder='Device password' required>"
    "<button type='submit'>Login</button>"
    "</form></body></html>");
}

void handleLoginPost() {
  addCors();
  String incoming = server.arg("password");
  incoming.trim();
  String expected = String(getDevicePassword());
  expected.trim();

  if (incoming == expected) {
    sessionToken = makeToken();
    server.sendHeader("Set-Cookie", "session=" + sessionToken + "; Path=/; Max-Age=86400");
    server.send(200, "text/plain", "OK");
  } else {
    server.send(401, "text/plain", "Wrong password");
  }
}

void handleSetupPage() {
  addCors();
  server.send(200, "text/html",
    "<html><body style='font-family:sans-serif;padding:20px'>"
    "<h2>Setup</h2>"
    "<form method='POST' action='/setup'>"
    "<p>Wi-Fi SSID: <input name='ssid' required></p>"
    "<p>Wi-Fi Password: <input name='wifipass' type='password' required></p>"
    "<p>Device Password: <input name='devicepass' type='password' required></p>"
    "<button type='submit'>Save & Restart</button>"
    "</form></body></html>");
}

void handleSetupPost() {
  addCors();
  String ssid = server.arg("ssid");
  String wifipass = server.arg("wifipass");
  String devicepass = server.arg("devicepass");

  ssid.trim();
  wifipass.trim();
  devicepass.trim();

  if (ssid.length() == 0 || devicepass.length() == 0) {
    server.send(400, "text/plain", "Missing fields");
    return;
  }

  memset(swarmCfg.wifiSsid, 0, sizeof(swarmCfg.wifiSsid));
  memset(swarmCfg.wifiPass, 0, sizeof(swarmCfg.wifiPass));
  memset(swarmCfg.devicePass, 0, sizeof(swarmCfg.devicePass));

  strncpy(swarmCfg.wifiSsid, ssid.c_str(), sizeof(swarmCfg.wifiSsid) - 1);
  strncpy(swarmCfg.wifiPass, wifipass.c_str(), sizeof(swarmCfg.wifiPass) - 1);
  strncpy(swarmCfg.devicePass, devicepass.c_str(), sizeof(swarmCfg.devicePass) - 1);

  saveConfig();
  server.send(200, "text/plain", "Saved. Restarting...");
  delay(1000);
  ESP.restart();
}

void handleSwarmConfigure() {
  addCors();
  if (!checkAuth()) {
    server.send(401, "application/json", "{\"error\":\"unauthorized\"}");
    return;
  }

  String body = readRequestBody();
  if (body.length() == 0) {
    server.send(400, "application/json", "{\"error\":\"empty body\"}");
    return;
  }

  StaticJsonDocument<768> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    server.send(400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }

  String swarmUrl = doc["swarmUrl"] | "";
  swarmUrl.trim();
  if (swarmUrl.length() == 0) {
    server.send(400, "application/json", "{\"error\":\"swarmUrl required\"}");
    return;
  }

  memset(swarmCfg.swarmUrl, 0, sizeof(swarmCfg.swarmUrl));
  strncpy(swarmCfg.swarmUrl, swarmUrl.c_str(), sizeof(swarmCfg.swarmUrl) - 1);

  swarmCfg.plantId = doc["plantId"] | 0;
  swarmCfg.tempNodeId = doc["temperatureNodeId"] | 0;
  swarmCfg.humidityNodeId = doc["humidityNodeId"] | 0;
  swarmCfg.gasNodeId = doc["gasNodeId"] | 0;

  swarmCfg.configured = (swarmCfg.plantId > 0 &&
                         swarmCfg.tempNodeId > 0 &&
                         swarmCfg.humidityNodeId > 0 &&
                         swarmCfg.gasNodeId > 0) ? 1 : 0;

  saveConfig();
  server.send(200, "application/json", "{\"ok\":true,\"message\":\"SWARM configured\"}");
  if (swarmCfg.configured) {
    sendToSwarm();
  }
}

void setupRoutes() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/info", HTTP_GET, handleInfo);
  server.on("/info", HTTP_OPTIONS, handleOptions);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/status", HTTP_OPTIONS, handleOptions);
  server.on("/login", HTTP_GET, handleLoginPage);
  server.on("/login", HTTP_POST, handleLoginPost);
  server.on("/login", HTTP_OPTIONS, handleOptions);
  server.on("/setup", HTTP_GET, handleSetupPage);
  server.on("/setup", HTTP_POST, handleSetupPost);
  server.on("/setup", HTTP_OPTIONS, handleOptions);
  server.on("/swarm/configure", HTTP_POST, handleSwarmConfigure);
  server.on("/swarm/configure", HTTP_OPTIONS, handleOptions);
  server.onNotFound([]() {
    addCors();
    server.send(404, "text/plain", "Not found");
  });
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(getWifiSsid(), getWifiPass());

  Serial.print("Connecting Wi-Fi");
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Connected");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi failed. Check SSID/password.");
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  loadConfig();

  if (BUZZER_PIN >= 0) {
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
  }

  dht.begin();
  connectWiFi();

  if (WiFi.status() == WL_CONNECTED) {
    MDNS.begin("sensorhub");
    Serial.println("mDNS: http://sensorhub.local");
  }

  setupRoutes();
  server.collectHeaders("X-Device-Password", "Cookie");
  server.begin();

  readSensors();

  Serial.println("ESP ready");
  Serial.println("Chip ID: " + chipId());
  Serial.println("Device password: [" + String(getDevicePassword()) + "]");
  Serial.println("SWARM configured: " + String(swarmCfg.configured ? "yes" : "no"));
}

void loop() {
  server.handleClient();

  if (millis() - lastSensorRead >= SENSOR_INTERVAL_MS) {
    readSensors();
  }

  if (millis() - lastSwarmSend >= SWARM_INTERVAL_MS) {
    lastSwarmSend = millis();
    if (swarmCfg.configured) {
      Serial.println(sendToSwarm() ? "Sent to SWARM" : "SWARM send failed");
    }
  }

  MDNS.update();
}