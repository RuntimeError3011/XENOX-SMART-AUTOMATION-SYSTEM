/*
 * ============================================================================
 * XENOX SMART AUTOMATION SYSTEM — ARDUINO UNO FIRMWARE
 * ============================================================================
 * Hardware Components:
 *   - Microcontroller: Arduino UNO (ATmega328P)
 *   - DHT11: Temperature & Humidity Sensor (Digital Pin D2)
 *   - PIR HC-SR501: Passive Infrared Motion Sensor (Digital Pin D3)
 *   - LDR: Light Dependent Resistor in voltage divider (Analog Pin A0)
 *   - HC-SR04: Ultrasonic Distance/Proximity Sensor (Trig D6, Echo D7)
 *   - 2-Channel Relay Module:
 *       Relay 1: AC Fan (Digital Pin D8, Active LOW)
 *       Relay 2: Smart Room Lamp (Digital Pin D9, Active LOW)
 *   - Status LED: Digital Pin D13
 *
 * Serial Interface: 115200 Baud JSON stream & command listener
 * ============================================================================
 */

#include <DHT.h>

// Pin Definitions
#define PIN_DHT        2
#define DHTTYPE        DHT11
#define PIN_PIR        3
#define PIN_LDR        A0
#define PIN_TRIG       6
#define PIN_ECHO       7
#define PIN_RELAY_FAN  8
#define PIN_RELAY_LAMP 9
#define PIN_STATUS_LED 13

// Sensors
DHT dht(PIN_DHT, DHTTYPE);

// Configurable Automation Thresholds (modifiable via Serial commands)
float thresholdTempC     = 28.0;   // Fan turns ON if temp >= limit
int   thresholdLightPct  = 40;     // Dark if light % < limit
long  thresholdDistCm    = 50;     // Proximity alert limit (cm)
unsigned long pirHoldMs  = 30000;  // 30 seconds PIR hold duration

// Internal State
unsigned long lastMotionTimestamp = 0;
unsigned long lastTelemetrySent   = 0;
bool isManualMode                 = false;
bool manualFanState               = false;
bool manualLampState              = false;

void setup() {
  Serial.begin(115200);
  dht.begin();

  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);

  pinMode(PIN_RELAY_FAN, OUTPUT);
  pinMode(PIN_RELAY_LAMP, OUTPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);

  // Default Relays to OFF (Active LOW relays: HIGH = De-energized / OFF)
  digitalWrite(PIN_RELAY_FAN, HIGH);
  digitalWrite(PIN_RELAY_LAMP, HIGH);
  digitalWrite(PIN_STATUS_LED, HIGH);

  delay(500);
  Serial.println("{\"system\":\"XENOX\",\"status\":\"ONLINE\",\"version\":\"2.4\"}");
}

// Ultrasonic Distance Measurement
long measureDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  long duration = pulseIn(PIN_ECHO, HIGH, 25000); // 25ms timeout (~400cm)
  if (duration <= 0) return 400; // Out of range or no echo
  long dist = (duration * 0.0343) / 2;
  return constrain(dist, 2, 400);
}

// Parse Incoming Commands from Python Gateway / Web Console
void handleSerialCommands() {
  while (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == "FAN_ON") {
      isManualMode = true;
      manualFanState = true;
      Serial.println("{\"ack\":\"FAN_ON\"}");
    } else if (cmd == "FAN_OFF") {
      isManualMode = true;
      manualFanState = false;
      Serial.println("{\"ack\":\"FAN_OFF\"}");
    } else if (cmd == "LAMP_ON") {
      isManualMode = true;
      manualLampState = true;
      Serial.println("{\"ack\":\"LAMP_ON\"}");
    } else if (cmd == "LAMP_OFF") {
      isManualMode = true;
      manualLampState = false;
      Serial.println("{\"ack\":\"LAMP_OFF\"}");
    } else if (cmd == "MODE_AUTO") {
      isManualMode = false;
      Serial.println("{\"ack\":\"MODE_AUTO\"}");
    } else if (cmd == "MODE_MANUAL") {
      isManualMode = true;
      Serial.println("{\"ack\":\"MODE_MANUAL\"}");
    } else if (cmd.startsWith("SET_TEMP:")) {
      thresholdTempC = cmd.substring(9).toFloat();
      Serial.print("{\"ack\":\"SET_TEMP\",\"val\":");
      Serial.print(thresholdTempC);
      Serial.println("}");
    } else if (cmd.startsWith("SET_LIGHT:")) {
      thresholdLightPct = cmd.substring(10).toInt();
      Serial.print("{\"ack\":\"SET_LIGHT\",\"val\":");
      Serial.print(thresholdLightPct);
      Serial.println("}");
    } else if (cmd.startsWith("SET_DIST:")) {
      thresholdDistCm = cmd.substring(9).toInt();
      Serial.print("{\"ack\":\"SET_DIST\",\"val\":");
      Serial.print(thresholdDistCm);
      Serial.println("}");
    }
  }
}

void loop() {
  // Check for any remote commands
  handleSerialCommands();

  // Read sensors
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  if (isnan(temp)) temp = 25.0; // fallback if sensor read error
  if (isnan(hum)) hum = 50.0;

  int ldrRaw = analogRead(PIN_LDR);
  int lightPct = map(ldrRaw, 0, 1023, 0, 100);

  bool pirMotion = (digitalRead(PIN_PIR) == HIGH);
  if (pirMotion) {
    lastMotionTimestamp = millis();
  }
  bool isOccupied = (millis() - lastMotionTimestamp) < pirHoldMs;
  long distanceCm = measureDistanceCm();

  // Automation Logic
  bool targetFanState = false;
  bool targetLampState = false;

  if (isManualMode) {
    targetFanState = manualFanState;
    targetLampState = manualLampState;
  } else {
    // Fan logic: Temperature >= threshold
    targetFanState = (temp >= thresholdTempC);

    // Lamp logic: Room occupied (PIR) AND ambient light < darkness threshold (LDR)
    targetLampState = (isOccupied && (lightPct < thresholdLightPct));
  }

  // Actuate 2-Channel Relays (Active LOW: LOW = ON, HIGH = OFF)
  digitalWrite(PIN_RELAY_FAN, targetFanState ? LOW : HIGH);
  digitalWrite(PIN_RELAY_LAMP, targetLampState ? LOW : HIGH);

  // Heartbeat LED flash
  digitalWrite(PIN_STATUS_LED, (millis() / 500) % 2 == 0 ? HIGH : LOW);

  // Send periodic JSON telemetry packet every 1000ms
  if (millis() - lastTelemetrySent >= 1000) {
    lastTelemetrySent = millis();

    Serial.print("{\"temp\":");
    Serial.print(temp, 1);
    Serial.print(",\"hum\":");
    Serial.print(hum, 1);
    Serial.print(",\"light\":");
    Serial.print(lightPct);
    Serial.print(",\"dist\":");
    Serial.print(distanceCm);
    Serial.print(",\"motion\":");
    Serial.print(pirMotion ? "true" : "false");
    Serial.print(",\"fan\":");
    Serial.print(targetFanState ? "true" : "false");
    Serial.print(",\"lamp\":");
    Serial.print(targetLampState ? "true" : "false");
    Serial.print(",\"mode\":\"");
    Serial.print(isManualMode ? "manual" : "auto");
    Serial.println("\"}");
  }

  delay(50);
}
