# XENOX — Smart Automation System

![XENOX Logo](assets/xenox-logo.png)

A comprehensive, offline-ready **Smart Home Automation & Telemetry Console** built on an **Arduino UNO** microcontroller with sensor-driven decision logic, dual-channel AC relay switching, real-time ultrasonic proximity radar, and web/mobile integration.

---

## 🏗️ System Architecture

![System Architecture](assets/architecture.png)

### 1. Hardware Layer
- **Arduino UNO (ATmega328P)**: Central microcontroller executing autonomous switching algorithms.
- **DHT11 Sensor (Digital Pin D2)**: Temperature and relative humidity monitoring.
- **PIR Motion Sensor (Digital Pin D3)**: Infrared human presence and room occupancy detection.
- **LDR Light Sensor (Analog Pin A0)**: Ambient light & lux level detection.
- **HC-SR04 Sensor (Trig D6 / Echo D7)**: Ultrasonic distance measurement & proximity perimeter tracking.
- **2-Channel Relay Module**:
  - **Relay Channel 1 (Pin D8)**: AC Ceiling Fan control.
  - **Relay Channel 2 (Pin D9)**: Smart Room Lamp control.
- **Status LED (Pin D13)**: Microcontroller heartbeat and serial state indicator.

### 2. Network & Gateway Layer
- **Laptop / Gateway (`server.py`)**: Python HTTP and Serial bridge communicating with Arduino UNO at **115200 baud** over USB.
- Serves REST endpoints (`/api/status`, `/api/relay`, `/api/mode`) and delivers the web interface locally or across the local Wi-Fi network.

### 3. User Interface Layer
- **XENOX Web Console**: Ultra-sleek cyberpunk dark glassmorphism dashboard with circular gauges, live radar sweep, animated fan/lamp visualizers, threshold sliders, event log, and energy analytics.
- **Mobile Companion Preview**: Built-in phone simulator pre-configured for the upcoming native mobile phone app!

---

## ⚡ Quick Start (Running the Web Interface)

### Option A: Open directly in any Web Browser (No installation needed)
Double-click `index.html` or open it with Google Chrome, Microsoft Edge, or Firefox.  
The interface comes with a full **Virtual Hardware Simulator** running out of the box with realistic telemetry, scenario presets, and interactive controls!

### Option B: Run with the Python Gateway (For real Arduino or local network)
```bash
cd "C:\Users\mnvpa\.gemini\antigravity\scratch\xenox-smart-automation"
python server.py
```
Open **`http://localhost:8000`** in your browser.  
Devices on the same Wi-Fi network can also access it using your computer's local IP address (e.g. `http://192.168.1.10:8000`).

---

## 🔌 Hardware Wiring Pinout

| Module / Sensor | Arduino UNO Pin | Function | Logic |
| :--- | :--- | :--- | :--- |
| **DHT11 Data** | **Digital D2** | Temperature & Humidity input | OneWire Protocol |
| **PIR Out** | **Digital D3** | Human Motion detection | HIGH = Motion, LOW = Idle |
| **LDR Analog Out** | **Analog A0** | Ambient Light Level | 0 to 1023 ADC (0–100%) |
| **HC-SR04 Trig** | **Digital D6** | Ultrasonic Trigger pulse | 10µs HIGH pulse |
| **HC-SR04 Echo** | **Digital D7** | Ultrasonic Echo return | Pulse duration timing |
| **Relay CH1 (IN1)** | **Digital D8** | AC Ceiling Fan Actuator | Active LOW (LOW = ON) |
| **Relay CH2 (IN2)** | **Digital D9** | Smart Room Lamp Actuator | Active LOW (LOW = ON) |
| **Status LED** | **Digital D13** | System Heartbeat indicator | Toggle every 500ms |

---

## 🧠 Automation Decision Rules

1. **AC Fan Automation**:
   - **Condition**: If `Temperature >= Temperature Threshold` (Default: **28.0°C**), Relay CH1 is energized (Fan turns **ON**).
   - If temperature cools down below the threshold, Relay CH1 is de-energized (Fan turns **OFF**).

2. **Smart Lamp Automation**:
   - **Condition**: Relay CH2 turns **ON** only when **BOTH**:
     1. `PIR Occupancy == DETECTED` (or within hold timeout window, default **30s**), **AND**
     2. `Ambient Light < Darkness Threshold` (Default: **40%**).
   - Prevents wasting electricity during daylight or in empty rooms.

3. **Perimeter / Proximity Warning**:
   - If `Target Distance <= Proximity Limit` (Default: **50 cm**) and motion is verified, a visual and audible security alarm is triggered on the dashboard.

4. **Manual Override**:
   - Switching to **Manual Mode** allows instantaneous control of the Fan and Lamp via the interactive tactile switches.

---

## 📱 Next Step: Mobile Phone App
The web interface includes an interactive **Phone Companion Preview** modal demonstrating the mobile layout. Next, we will create the dedicated mobile application (Flutter / React Native / PWA) for your phone!
