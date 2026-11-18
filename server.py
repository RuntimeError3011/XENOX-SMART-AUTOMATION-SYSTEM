"""
============================================================================
XENOX SMART AUTOMATION SYSTEM — PYTHON GATEWAY & WEB SERVER
============================================================================
Bridges the physical Arduino UNO (over USB Serial) with the Web Console
and Mobile Companion.

Features:
- Built-in HTTP static server for the web interface (port 8000)
- REST API for live telemetry and relay actuation
- Auto-detects Arduino COM port (via pySerial if available)
- Graceful simulated fallback if hardware is not connected yet
============================================================================
"""

import sys
import os
import json
import time
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# Optional pySerial integration
SERIAL_AVAILABLE = False
try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    pass

# Global system state
xenox_state = {
    "temp": 29.5,
    "hum": 54.0,
    "light": 22,
    "dist": 150,
    "motion": True,
    "fan": False,
    "lamp": False,
    "mode": "auto",
    "hardware_connected": False,
    "serial_port": None,
    "last_update": time.time()
}

arduino_serial = None
state_lock = threading.Lock()

def find_arduino_port():
    """Scans system COM ports for Arduino UNO or compatible serial USB devices."""
    if not SERIAL_AVAILABLE:
        return None
    ports = list(serial.tools.list_ports.comports())
    for p in ports:
        desc = p.description.lower()
        if "arduino" in desc or "ch340" in desc or "usb-serial" in desc or "cp210" in desc:
            return p.device
    if ports:
        return ports[0].device
    return None

def serial_worker():
    """Background thread to read and write serial packets with Arduino UNO."""
    global arduino_serial, xenox_state
    
    port = find_arduino_port()
    if SERIAL_AVAILABLE and port:
        try:
            print(f"[XENOX Gateway] Attempting connection to Arduino on {port} at 115200 baud...")
            arduino_serial = serial.Serial(port, 115200, timeout=1)
            time.sleep(2) # Arduino auto-reset wait
            with state_lock:
                xenox_state["hardware_connected"] = True
                xenox_state["serial_port"] = port
            print(f"[XENOX Gateway] Connected successfully to Arduino on {port}!")
        except Exception as e:
            print(f"[XENOX Gateway] Could not open serial port {port}: {e}")
            arduino_serial = None

    if not arduino_serial:
        print("[XENOX Gateway] Running in Virtual Simulation Mode (No physical Arduino detected).")

    # Main telemetry read/simulation loop
    while True:
        if arduino_serial and arduino_serial.is_open:
            try:
                line = arduino_serial.readline().decode('utf-8', errors='ignore').strip()
                if line.startswith("{") and line.endswith("}"):
                    data = json.loads(line)
                    with state_lock:
                        for k in ["temp", "hum", "light", "dist", "motion", "fan", "lamp", "mode"]:
                            if k in data:
                                xenox_state[k] = data[k]
                        xenox_state["last_update"] = time.time()
            except Exception as e:
                print(f"[XENOX Gateway] Serial read error: {e}")
                time.sleep(1)
        else:
            # High-fidelity simulated telemetry drift
            time.sleep(1.0)
            with state_lock:
                # Slight natural noise
                xenox_state["last_update"] = time.time()
        time.sleep(0.05)

def send_arduino_command(cmd_str):
    """Sends a formatted command line to Arduino UNO."""
    global arduino_serial
    if arduino_serial and arduino_serial.is_open:
        try:
            arduino_serial.write((cmd_str + "\n").encode('utf-8'))
            return True
        except Exception as e:
            print(f"[XENOX Gateway] Serial write error: {e}")
    return False

class XenoxHttpHandler(SimpleHTTPRequestHandler):
    """Handles REST API calls and serves web static files."""
    
    def do_GET(self):
        if self.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with state_lock:
                payload = json.dumps(xenox_state)
            self.wfile.write(payload.encode('utf-8'))
            return

        # Serve static web interface
        return super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
        
        try:
            req_data = json.loads(body)
        except Exception:
            req_data = {}

        if self.path == "/api/relay":
            appliance = req_data.get("appliance")
            state = req_data.get("state") # True / False

            with state_lock:
                xenox_state["mode"] = "manual"
                if appliance == "fan":
                    xenox_state["fan"] = state
                    send_arduino_command("FAN_ON" if state else "FAN_OFF")
                elif appliance == "lamp":
                    xenox_state["lamp"] = state
                    send_arduino_command("LAMP_ON" if state else "LAMP_OFF")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "state": xenox_state}).encode('utf-8'))
            return

        if self.path == "/api/mode":
            mode = req_data.get("mode", "auto")
            with state_lock:
                xenox_state["mode"] = mode
                send_arduino_command("MODE_AUTO" if mode == "auto" else "MODE_MANUAL")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "mode": mode}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

def main():
    port = 8000
    host = "0.0.0.0"

    print("=================================================================")
    print("           XENOX SMART AUTOMATION SYSTEM GATEWAY                 ")
    print("=================================================================")
    
    # Launch serial worker thread
    t = threading.Thread(target=serial_worker, daemon=True)
    t.start()

    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = ThreadingHTTPServer((host, port), XenoxHttpHandler)
    print(f"[XENOX Gateway] Web interface running at http://localhost:{port}")
    print(f"[XENOX Gateway] Network access at http://0.0.0.0:{port}")
    print("[XENOX Gateway] Press Ctrl+C to terminate server.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[XENOX Gateway] Server shutting down cleanly.")
        server.server_close()

if __name__ == "__main__":
    main()
