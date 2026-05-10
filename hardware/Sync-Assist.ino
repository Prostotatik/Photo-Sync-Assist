#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

#define WIFI_SSID     "LEE_WIFI_2.40GHz"
#define WIFI_PASSWORD "Robert0163303567#"
#define BACKEND_URL   "https://satisfy-infants-consistency-talks.trycloudflare.com"

#define DHT_PIN           4
#define DHT_TYPE          DHT11
#define SOIL_MOISTURE_PIN 34
#define PH_PIN            35
#define RELAY_PIN         26

#define SOIL_DRY_RAW  3000
#define SOIL_WET_RAW  1200
constexpr float PH_SLOPE     = -5.70f;
constexpr float PH_INTERCEPT = 21.34f;

#define SENSOR_INTERVAL_MS  3000
#define PUMP_INTERVAL_MS    2000

DHT dht(DHT_PIN, DHT_TYPE);

WiFiClientSecure secureClient;

unsigned long lastSensorTime = 0;
unsigned long lastPumpTime   = 0;
int lastPumpState = -1;

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 20) {
    Serial.print(".");
    delay(500);
    retries++;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nWiFi connection failed, restarting...");
    ESP.restart();
  }
  Serial.println();
  Serial.print("Connected with IP: ");
  Serial.println(WiFi.localIP());

  secureClient.setInsecure();
  dht.begin();
}

void loop() {
  unsigned long now = millis();

  // Poll pump state every 2s
  if (lastPumpTime == 0 || now - lastPumpTime >= PUMP_INTERVAL_MS) {
    lastPumpTime = now;
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(secureClient, BACKEND_URL "/api/automation/irrigate/status");
      int code = http.GET();
      if (code == 200) {
        StaticJsonDocument<128> doc;
        if (!deserializeJson(doc, http.getString())) {
          int pumpState = doc["running"].as<bool>() ? 1 : 0;
          digitalWrite(RELAY_PIN, pumpState == 1 ? LOW : HIGH);
          if (pumpState != lastPumpState) {
            Serial.println(pumpState == 1 ? "Pump: ON" : "Pump: OFF");
            lastPumpState = pumpState;
          }
        }
      } else {
        Serial.printf("Pump status read failed: HTTP %d\n", code);
      }
      http.end();
    }
  }

  // Send sensor data every 30s
  if (lastSensorTime == 0 || now - lastSensorTime >= SENSOR_INTERVAL_MS) {
    lastSensorTime = now;

    float temperature = dht.readTemperature();
    float humidity    = dht.readHumidity();

    if (isnan(temperature) || isnan(humidity)) {
      Serial.println("DHT11 read failed, skipping this cycle");
      return;
    }

    int soilRaw = analogRead(SOIL_MOISTURE_PIN);
    float soilMoisture = constrain(
      (float)(soilRaw - SOIL_DRY_RAW) / (SOIL_WET_RAW - SOIL_DRY_RAW) * 100.0f,
      0.0f, 100.0f
    );

    int phRaw = analogRead(PH_PIN);
    float ph = constrain(PH_SLOPE * (phRaw * 3.3f / 4095.0f) + PH_INTERCEPT, 0.0f, 14.0f);

    Serial.printf("Temp: %.1f C | Humidity: %.1f%% | Soil: %.1f%% | pH: %.2f\n",
                  temperature, humidity, soilMoisture, ph);

    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(secureClient, BACKEND_URL "/api/sensors/readings");
      http.addHeader("Content-Type", "application/json");

      StaticJsonDocument<256> doc;
      doc["temperature_c"]     = temperature;
      doc["humidity_pct"]      = humidity;
      doc["soil_moisture_pct"] = soilMoisture;
      doc["ph_level"]          = ph;
      doc["farm_id"]           = "RACK_ALPHA";

      String body;
      serializeJson(doc, body);

      int code = http.POST(body);
      if (code == 200) {
        Serial.println("Backend write OK");
      } else {
        Serial.printf("Backend write FAILED: HTTP %d\n", code);
      }
      http.end();
    }
  }
}
