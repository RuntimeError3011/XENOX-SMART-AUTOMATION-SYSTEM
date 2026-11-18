/**
 * ============================================================================
 * XENOX SMART AUTOMATION SYSTEM — CORE APPLICATION ENGINE
 * ============================================================================
 * Connects Arduino UNO Sensors (DHT11, PIR, LDR, HC-SR04), 2-Channel Relay
 * Module (AC Fan, Room Lamp), Python Gateway Bridge, and Phone Companion.
 */

// Application State
const xenoxState = {
  mode: 'auto', // 'auto' | 'manual'
  connection: {
    type: 'simulated', // 'simulated' | 'gateway'
    gatewayUrl: 'http://localhost:8000',
    online: true,
    lastPing: Date.now()
  },
  soundEnabled: true,
  audioCtx: null,

  // Environmental Sensors (DHT11, LDR, HC-SR04, PIR)
  env: {
    temp: 29.5,            // DHT11 Ambient Temperature in °C
    tempF: 85.1,
    humidity: 54,          // DHT11 Relative Humidity in %
    lightPct: 22,          // LDR Ambient Light %
    lightLux: 220,         // Estimated lux
    distanceCm: 150,       // HC-SR04 Ultrasonic Distance in cm
    pirMotion: true,       // PIR Motion detected
    pirHoldRemaining: 30,  // Active motion countdown window in seconds
    securityAlert: false   // Proximity intrusion alert
  },

  // Actuators & 2-Channel Relays
  relays: {
    fan: {
      active: false,
      mode: 'auto',        // 'auto' | 'manual'
      watts: 75,
      currentPower: 0,
      rpm: 0,
      triggerReason: 'Evaluating DHT11 temperature...'
    },
    lamp: {
      active: false,
      mode: 'auto',        // 'auto' | 'manual'
      watts: 18,
      currentPower: 0,
      lumens: 0,
      triggerReason: 'Evaluating PIR occupancy and LDR daylight...'
    }
  },

  // Automation Thresholds
  thresholds: {
    temp: 28.0,            // °C limit to trigger Fan
    light: 40,             // % darkness limit to allow Lamp
    distance: 50,          // cm proximity alert limit
    pirTimeout: 30         // seconds to hold lamp ON after motion
  },

  // Energy & Eco Model
  energy: {
    currency: '$',
    tariffPerKwh: 0.15,
    baselineFanHrs: 14,
    baselineLampHrs: 10,
    dailyKwhSaved: 0,
    monthlyCostSaved: 0,
    annualCo2Saved: 0
  },

  // Active Presets
  activePreset: 'evening',

  // Telemetry History (for real-time charting)
  history: {
    maxPoints: 30,
    timestamps: [],
    temp: [],
    humidity: [],
    light: [],
    distance: []
  },

  // Event Log
  eventLogs: []
};

/* ============================================================================
   WEB AUDIO API SYNTHESIZER (RELAY CLICKS & ALARMS)
   ============================================================================ */
function initAudio() {
  if (!xenoxState.audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      xenoxState.audioCtx = new AudioContext();
    }
  }
}

function playRelayClickSound(isOn) {
  if (!xenoxState.soundEnabled) return;
  try {
    initAudio();
    if (!xenoxState.audioCtx) return;
    if (xenoxState.audioCtx.state === 'suspended') {
      xenoxState.audioCtx.resume();
    }

    const ctx = xenoxState.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isOn ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(isOn ? 820 : 640, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(isOn ? 220 : 180, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {
    // Audio context may require user interaction
  }
}

function playSecurityAlertBeep() {
  if (!xenoxState.soundEnabled) return;
  try {
    initAudio();
    if (!xenoxState.audioCtx) return;
    const ctx = xenoxState.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (e) {}
}

/* ============================================================================
   CORE AUTOMATION DECISION LOGIC (ARDUINO UNO EMULATION)
   ============================================================================ */
function evaluateAutomationLogic() {
  const prevFanState = xenoxState.relays.fan.active;
  const prevLampState = xenoxState.relays.lamp.active;
  const prevAlert = xenoxState.env.securityAlert;

  // 1. Proximity / Ultrasonic Intruder Alert Evaluation
  const isTooClose = xenoxState.env.distanceCm <= xenoxState.thresholds.distance;
  xenoxState.env.securityAlert = isTooClose && xenoxState.env.pirMotion;
  if (xenoxState.env.securityAlert && !prevAlert) {
    logEvent('HC-SR04', `Proximity Breach: Object at ${xenoxState.env.distanceCm} cm (< ${xenoxState.thresholds.distance} cm limit)`, 'SECURITY ALERT');
    playSecurityAlertBeep();
  }

  // 2. Relay CH1: AC Fan Evaluation
  const fanMode = xenoxState.relays.fan.mode;
  if (fanMode === 'auto') {
    const shouldFanBeOn = xenoxState.env.temp >= xenoxState.thresholds.temp;
    xenoxState.relays.fan.active = shouldFanBeOn;
    xenoxState.relays.fan.triggerReason = shouldFanBeOn
      ? `Auto: Room temp (${xenoxState.env.temp.toFixed(1)}°C) ≥ ${xenoxState.thresholds.temp.toFixed(1)}°C threshold.`
      : `Auto: Room temp (${xenoxState.env.temp.toFixed(1)}°C) < ${xenoxState.thresholds.temp.toFixed(1)}°C threshold.`;
  } else {
    xenoxState.relays.fan.triggerReason = `Manual Override: Switch is ${xenoxState.relays.fan.active ? 'ON' : 'OFF'}.`;
  }

  // Calculate fan power & RPM
  xenoxState.relays.fan.currentPower = xenoxState.relays.fan.active ? xenoxState.relays.fan.watts : 0;
  xenoxState.relays.fan.rpm = xenoxState.relays.fan.active ? 1420 : 0;

  // 3. Relay CH2: Room Lamp Evaluation
  const lampMode = xenoxState.relays.lamp.mode;
  const isOccupied = xenoxState.env.pirMotion && xenoxState.env.pirHoldRemaining > 0;
  const isDark = xenoxState.env.lightPct < xenoxState.thresholds.light;

  if (lampMode === 'auto') {
    const shouldLampBeOn = isOccupied && isDark;
    xenoxState.relays.lamp.active = shouldLampBeOn;

    if (shouldLampBeOn) {
      xenoxState.relays.lamp.triggerReason = `Auto: Motion active & dark (${xenoxState.env.lightPct}% < ${xenoxState.thresholds.light}% threshold).`;
    } else if (!isOccupied && !isDark) {
      xenoxState.relays.lamp.triggerReason = `Auto: Vacant & daylight present (${xenoxState.env.lightPct}%).`;
    } else if (!isOccupied) {
      xenoxState.relays.lamp.triggerReason = `Auto: No motion detected (PIR idle).`;
    } else {
      xenoxState.relays.lamp.triggerReason = `Auto: Daylight sufficient (${xenoxState.env.lightPct}% ≥ ${xenoxState.thresholds.light}%).`;
    }
  } else {
    xenoxState.relays.lamp.triggerReason = `Manual Override: Switch is ${xenoxState.relays.lamp.active ? 'ON' : 'OFF'}.`;
  }

  // Calculate lamp power & lumens
  xenoxState.relays.lamp.currentPower = xenoxState.relays.lamp.active ? xenoxState.relays.lamp.watts : 0;
  xenoxState.relays.lamp.lumens = xenoxState.relays.lamp.active ? 850 : 0;

  // Log state transitions & trigger clicks
  if (prevFanState !== xenoxState.relays.fan.active) {
    logEvent(
      fanMode === 'auto' ? 'DHT11 / Auto' : 'Manual Switch',
      xenoxState.relays.fan.triggerReason,
      `Relay CH1 (Fan) → ${xenoxState.relays.fan.active ? 'ENERGIZED (ON)' : 'DE-ENERGIZED (OFF)'}`
    );
    playRelayClickSound(xenoxState.relays.fan.active);
  }

  if (prevLampState !== xenoxState.relays.lamp.active) {
    logEvent(
      lampMode === 'auto' ? 'PIR+LDR / Auto' : 'Manual Switch',
      xenoxState.relays.lamp.triggerReason,
      `Relay CH2 (Lamp) → ${xenoxState.relays.lamp.active ? 'ENERGIZED (ON)' : 'DE-ENERGIZED (OFF)'}`
    );
    playRelayClickSound(xenoxState.relays.lamp.active);
  }

  updateEnergyEstimates();
}

/* ============================================================================
   ENERGY CONSUMPTION & ECO SAVINGS ESTIMATION
   ============================================================================ */
function updateEnergyEstimates() {
  const e = xenoxState.energy;
  const fanW = xenoxState.relays.fan.watts;
  const lampW = xenoxState.relays.lamp.watts;

  // Base manual energy consumption without smart sensors:
  const baselineDailyKwh = (fanW * e.baselineFanHrs + lampW * e.baselineLampHrs) / 1000;

  // Sensor-governed duty cycle based on thresholds:
  // Higher temp threshold means fan runs fewer hours; lower light limit + short timeout means lamp runs fewer hours
  const tempRatio = Math.max(0.2, Math.min(0.85, 1 - (xenoxState.thresholds.temp - 18) * 0.035));
  const lightRatio = Math.max(0.15, Math.min(0.8, (xenoxState.thresholds.light / 100) * (xenoxState.thresholds.pirTimeout / 60)));

  const autoFanHrs = Number((e.baselineFanHrs * tempRatio).toFixed(1));
  const autoLampHrs = Number((e.baselineLampHrs * lightRatio).toFixed(1));

  const autoDailyKwh = (fanW * autoFanHrs + lampW * autoLampHrs) / 1000;
  const savedDailyKwh = Math.max(0, baselineDailyKwh - autoDailyKwh);

  e.dailyKwhSaved = Number(savedDailyKwh.toFixed(2));
  e.monthlyCostSaved = Number((savedDailyKwh * 30 * e.tariffPerKwh).toFixed(2));
  e.annualCo2Saved = Math.round(savedDailyKwh * 365 * 0.82); // 0.82 kg CO2 per kWh avg
}

/* ============================================================================
   EVENT AUDIT LOGGER
   ============================================================================ */
function logEvent(source, condition, action) {
  const timeStr = new Date().toLocaleTimeString([], { hour12: false });
  xenoxState.eventLogs.unshift({
    time: timeStr,
    source,
    condition,
    action
  });

  if (xenoxState.eventLogs.length > 50) {
    xenoxState.eventLogs.length = 50;
  }

  renderEventLogs();
}

function renderEventLogs() {
  const tbody = document.getElementById('event-log-table-body');
  if (!tbody) return;

  if (xenoxState.eventLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-dim); padding:24px;">No automation events recorded yet. Adjust sensor values to trigger relays.</td></tr>`;
    return;
  }

  tbody.innerHTML = xenoxState.eventLogs.map((item) => {
    let badgeClass = 'badge-optimal';
    if (item.action.includes('ON') || item.action.includes('ENERGIZED')) badgeClass = 'badge-warning';
    if (item.action.includes('ALERT') || item.source.includes('HC-SR04')) badgeClass = 'badge-alert';

    return `
      <tr>
        <td style="font-family:var(--font-mono); color:var(--text-muted);">${item.time}</td>
        <td style="font-family:var(--font-mono); font-weight:600; color:var(--cyan);">${item.source}</td>
        <td>${item.condition}</td>
        <td><span class="badge ${badgeClass}">${item.action}</span></td>
      </tr>
    `;
  }).join('');
}

function exportEventLogCsv() {
  const header = "Timestamp,Source,Condition,RelayAction\n";
  const rows = xenoxState.eventLogs.map(log => 
    `"${log.time}","${log.source}","${log.condition.replace(/"/g, '""')}","${log.action}"`
  ).join("\n");

  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `xenox_automation_events_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ============================================================================
   UI RENDERING & GAUGE SYNCHRONIZATION
   ============================================================================ */
function renderAll() {
  evaluateAutomationLogic();

  renderSensorsUI();
  renderRelaysUI();
  renderSecurityAndRadar();
  renderTopologySchematic();
  renderEnergyUI();
  renderCodeSnippets();
  syncPhoneCompanion();
}

function renderSensorsUI() {
  // Temperature
  const tempGauge = document.getElementById('gauge-temp-fill');
  const tempNum = document.getElementById('val-temp-num');
  const tempStatus = document.getElementById('badge-temp-status');
  if (tempNum) tempNum.textContent = xenoxState.env.temp.toFixed(1);
  if (tempGauge) {
    // 377 is full circle circumference. min: 15, max: 45
    const pct = Math.max(0, Math.min(1, (xenoxState.env.temp - 15) / 30));
    const offset = 377 - (377 * pct);
    tempGauge.style.strokeDashoffset = offset;
    tempGauge.classList.toggle('temp-hot', xenoxState.env.temp >= xenoxState.thresholds.temp);
  }
  if (tempStatus) {
    const isHot = xenoxState.env.temp >= xenoxState.thresholds.temp;
    tempStatus.textContent = isHot ? 'WARM / FAN ON' : 'OPTIMAL';
    tempStatus.className = `badge ${isHot ? 'badge-warning' : 'badge-optimal'}`;
  }

  // Humidity
  const humGauge = document.getElementById('gauge-hum-fill');
  const humNum = document.getElementById('val-hum-num');
  const humStatus = document.getElementById('badge-hum-status');
  if (humNum) humNum.textContent = Math.round(xenoxState.env.humidity);
  if (humGauge) {
    const pct = Math.max(0, Math.min(1, xenoxState.env.humidity / 100));
    const offset = 377 - (377 * pct);
    humGauge.style.strokeDashoffset = offset;
  }
  if (humStatus) {
    humStatus.textContent = xenoxState.env.humidity > 70 ? 'HIGH' : (xenoxState.env.humidity < 30 ? 'DRY' : 'NORMAL');
    humStatus.className = 'badge badge-optimal';
  }

  // Light Level
  const lightGauge = document.getElementById('gauge-light-fill');
  const lightNum = document.getElementById('val-light-num');
  const lightStatus = document.getElementById('badge-light-status');
  const lightLuxEl = document.getElementById('val-light-lux');
  if (lightNum) lightNum.textContent = Math.round(xenoxState.env.lightPct);
  if (lightLuxEl) lightLuxEl.textContent = `${Math.round(xenoxState.env.lightPct * 10)} lux`;
  if (lightGauge) {
    const pct = Math.max(0, Math.min(1, xenoxState.env.lightPct / 100));
    const offset = 377 - (377 * pct);
    lightGauge.style.strokeDashoffset = offset;
  }
  if (lightStatus) {
    const isDark = xenoxState.env.lightPct < xenoxState.thresholds.light;
    lightStatus.textContent = isDark ? 'DARK' : 'DAYLIGHT';
    lightStatus.className = `badge ${isDark ? 'badge-warning' : 'badge-optimal'}`;
  }

  // Ultrasonic Distance
  const distGauge = document.getElementById('gauge-dist-fill');
  const distNum = document.getElementById('val-dist-num');
  const distStatus = document.getElementById('badge-dist-status');
  if (distNum) distNum.textContent = Math.round(xenoxState.env.distanceCm);
  if (distGauge) {
    const pct = Math.max(0, Math.min(1, xenoxState.env.distanceCm / 300));
    const offset = 377 - (377 * pct);
    distGauge.style.strokeDashoffset = offset;
    distGauge.classList.toggle('distance-alert', xenoxState.env.distanceCm <= xenoxState.thresholds.distance);
  }
  if (distStatus) {
    const isClose = xenoxState.env.distanceCm <= xenoxState.thresholds.distance;
    distStatus.textContent = isClose ? 'PROXIMITY ALERT' : 'CLEAR ZONE';
    distStatus.className = `badge ${isClose ? 'badge-alert' : 'badge-optimal'}`;
  }

  // PIR Motion & Hold Bar
  const pirStatus = document.getElementById('badge-pir-status');
  const pirHoldText = document.getElementById('val-pir-hold-time');
  const pirHoldBar = document.getElementById('pir-hold-bar');
  const isOccupied = xenoxState.env.pirMotion && xenoxState.env.pirHoldRemaining > 0;

  if (pirStatus) {
    pirStatus.textContent = isOccupied ? 'DETECTED' : 'IDLE';
    pirStatus.className = `badge ${isOccupied ? 'badge-warning' : 'badge-optimal'}`;
  }
  if (pirHoldText) {
    pirHoldText.textContent = isOccupied
      ? `Hold Active: ${Math.ceil(xenoxState.env.pirHoldRemaining)}s remaining`
      : 'No recent motion detected';
  }
  if (pirHoldBar) {
    const pct = isOccupied ? (xenoxState.env.pirHoldRemaining / xenoxState.thresholds.pirTimeout) * 100 : 0;
    pirHoldBar.style.width = `${pct}%`;
  }
}

function renderRelaysUI() {
  // AC Fan UI
  const fanCard = document.getElementById('card-fan-relay');
  const fanBtn = document.getElementById('btn-relay-fan-toggle');
  const fanPower = document.getElementById('val-fan-power');
  const fanRpm = document.getElementById('val-fan-rpm');
  const fanReason = document.getElementById('val-fan-reason');
  const fanAutoBtn = document.getElementById('btn-fan-mode-auto');
  const fanManualBtn = document.getElementById('btn-fan-mode-manual');

  if (fanCard) {
    fanCard.classList.toggle('active-fan', xenoxState.relays.fan.active);
    fanCard.classList.toggle('fan-spinning', xenoxState.relays.fan.active);
  }
  if (fanBtn) {
    fanBtn.classList.toggle('is-active-fan', xenoxState.relays.fan.active);
    fanBtn.innerHTML = xenoxState.relays.fan.active
      ? `<span>RELAY CH1: ENERGIZED (ON)</span>`
      : `<span>RELAY CH1: OFF</span>`;
    fanBtn.disabled = xenoxState.relays.fan.mode === 'auto';
  }
  if (fanPower) fanPower.textContent = `${xenoxState.relays.fan.currentPower} W`;
  if (fanRpm) fanRpm.textContent = `${xenoxState.relays.fan.rpm} RPM`;
  if (fanReason) fanReason.textContent = xenoxState.relays.fan.triggerReason;

  if (fanAutoBtn && fanManualBtn) {
    fanAutoBtn.classList.toggle('active', xenoxState.relays.fan.mode === 'auto');
    fanManualBtn.classList.toggle('active', xenoxState.relays.fan.mode === 'manual');
  }

  // Room Lamp UI
  const lampCard = document.getElementById('card-lamp-relay');
  const lampBtn = document.getElementById('btn-relay-lamp-toggle');
  const lampPower = document.getElementById('val-lamp-power');
  const lampLumens = document.getElementById('val-lamp-lumens');
  const lampReason = document.getElementById('val-lamp-reason');
  const lampAutoBtn = document.getElementById('btn-lamp-mode-auto');
  const lampManualBtn = document.getElementById('btn-lamp-mode-manual');

  if (lampCard) {
    lampCard.classList.toggle('active-lamp', xenoxState.relays.lamp.active);
    lampCard.classList.toggle('lamp-glowing', xenoxState.relays.lamp.active);
  }
  if (lampBtn) {
    lampBtn.classList.toggle('is-active-lamp', xenoxState.relays.lamp.active);
    lampBtn.innerHTML = xenoxState.relays.lamp.active
      ? `<span>RELAY CH2: ENERGIZED (ON)</span>`
      : `<span>RELAY CH2: OFF</span>`;
    lampBtn.disabled = xenoxState.relays.lamp.mode === 'auto';
  }
  if (lampPower) lampPower.textContent = `${xenoxState.relays.lamp.currentPower} W`;
  if (lampLumens) lampLumens.textContent = `${xenoxState.relays.lamp.lumens} LM`;
  if (lampReason) lampReason.textContent = xenoxState.relays.lamp.triggerReason;

  if (lampAutoBtn && lampManualBtn) {
    lampAutoBtn.classList.toggle('active', xenoxState.relays.lamp.mode === 'auto');
    lampManualBtn.classList.toggle('active', xenoxState.relays.lamp.mode === 'manual');
  }
}

function renderSecurityAndRadar() {
  const alertBanner = document.getElementById('proximity-alert-banner');
  const radarDataEl = document.getElementById('radar-overlay-data');

  if (alertBanner) {
    const isAlert = xenoxState.env.securityAlert;
    alertBanner.classList.toggle('alert-active', isAlert);
    alertBanner.innerHTML = isAlert
      ? `<i data-lucide="alert-triangle" style="width:18px;height:18px;"></i> <strong>PROXIMITY BREACH DETECTED:</strong> Target within ${xenoxState.env.distanceCm} cm (< ${xenoxState.thresholds.distance} cm threshold)!`
      : `<i data-lucide="shield-check" style="width:18px;height:18px;"></i> Security & Perimeter Clear — Ultrasonic Scanner Armed (${xenoxState.thresholds.distance} cm boundary).`;
  }

  if (radarDataEl) {
    radarDataEl.innerHTML = `
      TARGET DIST: ${Math.round(xenoxState.env.distanceCm)} CM<br>
      STATUS: ${xenoxState.env.distanceCm <= xenoxState.thresholds.distance ? 'INTRUSION ZONE' : 'TRACKING SAFE'}<br>
      PIR SYNC: ${xenoxState.env.pirMotion ? 'MOTION VERIFIED' : 'NO MOTION'}
    `;
  }
}

function renderTopologySchematic() {
  const wireDht = document.getElementById('topo-wire-dht');
  const wirePir = document.getElementById('topo-wire-pir');
  const wireLdr = document.getElementById('topo-wire-ldr');
  const wireDist = document.getElementById('topo-wire-dist');
  const wireFan = document.getElementById('topo-wire-fan');
  const wireLamp = document.getElementById('topo-wire-lamp');

  if (wireDht) wireDht.className.baseVal = xenoxState.env.temp >= xenoxState.thresholds.temp ? 'topo-wire pulse-cyan' : 'topo-wire';
  if (wirePir) wirePir.className.baseVal = xenoxState.env.pirMotion ? 'topo-wire pulse-cyan' : 'topo-wire';
  if (wireLdr) wireLdr.className.baseVal = xenoxState.env.lightPct < xenoxState.thresholds.light ? 'topo-wire pulse-amber' : 'topo-wire';
  if (wireDist) wireDist.className.baseVal = xenoxState.env.distanceCm <= xenoxState.thresholds.distance ? 'topo-wire pulse-amber' : 'topo-wire';
  if (wireFan) wireFan.className.baseVal = xenoxState.relays.fan.active ? 'topo-wire pulse-cyan' : 'topo-wire';
  if (wireLamp) wireLamp.className.baseVal = xenoxState.relays.lamp.active ? 'topo-wire pulse-amber' : 'topo-wire';

  const dhtText = document.getElementById('topo-text-dht');
  const pirText = document.getElementById('topo-text-pir');
  const ldrText = document.getElementById('topo-text-ldr');
  const distText = document.getElementById('topo-text-dist');
  const fanText = document.getElementById('topo-text-fan');
  const lampText = document.getElementById('topo-text-lamp');

  if (dhtText) dhtText.textContent = `${xenoxState.env.temp.toFixed(1)}°C · ${Math.round(xenoxState.env.humidity)}%`;
  if (pirText) pirText.textContent = xenoxState.env.pirMotion ? 'MOTION DETECTED' : 'IDLE';
  if (ldrText) ldrText.textContent = `${Math.round(xenoxState.env.lightPct)}% (${Math.round(xenoxState.env.lightPct * 10)} lx)`;
  if (distText) distText.textContent = `${Math.round(xenoxState.env.distanceCm)} cm`;
  if (fanText) fanText.textContent = `FAN: ${xenoxState.relays.fan.active ? 'RUNNING (' + xenoxState.relays.fan.watts + 'W)' : 'OFF'}`;
  if (lampText) lampText.textContent = `LAMP: ${xenoxState.relays.lamp.active ? 'LIT (' + xenoxState.relays.lamp.watts + 'W)' : 'OFF'}`;
}

function renderEnergyUI() {
  const e = xenoxState.energy;
  const kwhEl = document.getElementById('val-energy-saved-kwh');
  const costEl = document.getElementById('val-energy-saved-cost');
  const co2El = document.getElementById('val-energy-saved-co2');

  if (kwhEl) kwhEl.textContent = `${e.dailyKwhSaved.toFixed(2)} kWh`;
  if (costEl) costEl.textContent = `${e.currency}${e.monthlyCostSaved.toFixed(2)}`;
  if (co2El) co2El.textContent = `${e.annualCo2Saved} kg`;
}

function renderCodeSnippets() {
  const codeIno = document.getElementById('code-arduino-ino');
  if (codeIno) {
    codeIno.textContent = getArduinoSketchCode();
  }
}

/* ============================================================================
   SIMULATION ENGINE & SENSOR TELEMETRY LOOP
   ============================================================================ */
let simLoopTimer = null;
let radarAngle = 0;

function tickSimulation() {
  if (xenoxState.connection.type === 'simulated') {
    // Subtle real-world natural fluctuation
    const tempDrift = (Math.random() - 0.5) * 0.15;
    const humDrift = (Math.random() - 0.5) * 0.4;
    const lightDrift = (Math.random() - 0.5) * 0.8;
    const distDrift = (Math.random() - 0.5) * 1.2;

    xenoxState.env.temp = Math.max(16, Math.min(42, Number((xenoxState.env.temp + tempDrift).toFixed(1))));
    xenoxState.env.humidity = Math.max(20, Math.min(95, Math.round(xenoxState.env.humidity + humDrift)));
    xenoxState.env.lightPct = Math.max(0, Math.min(100, Math.round(xenoxState.env.lightPct + lightDrift)));
    xenoxState.env.distanceCm = Math.max(10, Math.min(300, Math.round(xenoxState.env.distanceCm + distDrift)));

    // PIR motion hold countdown
    if (xenoxState.env.pirMotion && xenoxState.env.pirHoldRemaining > 0) {
      xenoxState.env.pirHoldRemaining = Math.max(0, xenoxState.env.pirHoldRemaining - 1);
      if (xenoxState.env.pirHoldRemaining === 0) {
        xenoxState.env.pirMotion = false;
        logEvent('PIR Sensor', 'Motion timeout expired', 'PIR → Idle');
      }
    }
  }

  // Record point into telemetry history
  pushTelemetryHistory();

  // Render updates
  renderAll();
}

function pushTelemetryHistory() {
  const now = new Date().toLocaleTimeString([], { hour12: false });
  const h = xenoxState.history;
  h.timestamps.push(now);
  h.temp.push(xenoxState.env.temp);
  h.humidity.push(xenoxState.env.humidity);
  h.light.push(xenoxState.env.lightPct);
  h.distance.push(xenoxState.env.distanceCm);

  if (h.timestamps.length > h.maxPoints) {
    h.timestamps.shift();
    h.temp.shift();
    h.humidity.shift();
    h.light.shift();
    h.distance.shift();
  }

  drawTelemetryChart();
}

/* ============================================================================
   CANVAS CHART & RADAR VISUALIZERS
   ============================================================================ */
function drawTelemetryChart() {
  const canvas = document.getElementById('telemetry-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width = canvas.parentElement.clientWidth;
  const height = canvas.height = canvas.parentElement.clientHeight;

  ctx.clearRect(0, 0, width, height);

  const h = xenoxState.history;
  const len = h.timestamps.length;
  if (len < 2) return;

  // Draw cyber grid
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
  ctx.lineWidth = 1;
  const stepsY = 4;
  for (let i = 0; i <= stepsY; i++) {
    const y = (height / stepsY) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Draw Series: Temperature (°C scaled 0 - 50)
  drawLineSeries(ctx, h.temp, 0, 50, '#00f0ff', width, height);

  // Draw Series: Humidity (% scaled 0 - 100)
  drawLineSeries(ctx, h.humidity, 0, 100, '#00f59b', width, height);

  // Draw Series: Light (% scaled 0 - 100)
  drawLineSeries(ctx, h.light, 0, 100, '#ffaa00', width, height);

  // Draw Series: Distance (cm scaled 0 - 300)
  drawLineSeries(ctx, h.distance, 0, 300, '#ff3366', width, height);
}

function drawLineSeries(ctx, data, minVal, maxVal, color, width, height) {
  const len = data.length;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;

  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    const x = (width / (len - 1)) * i;
    const normalized = Math.max(0, Math.min(1, (data[i] - minVal) / (maxVal - minVal)));
    const y = height - (normalized * (height - 20) + 10);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawRadarAnimation() {
  const canvas = document.getElementById('radar-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width = canvas.parentElement.clientWidth;
  const height = canvas.height = canvas.parentElement.clientHeight;
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(cx, cy) - 10;

  ctx.clearRect(0, 0, width, height);

  // Concentric radar rings
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
  ctx.lineWidth = 1;
  for (let r = maxR / 3; r <= maxR; r += maxR / 3) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Crosshairs
  ctx.beginPath();
  ctx.moveTo(cx - maxR, cy);
  ctx.lineTo(cx + maxR, cy);
  ctx.moveTo(cx, cy - maxR);
  ctx.lineTo(cx, cy + maxR);
  ctx.stroke();

  // Rotating sweep beam
  radarAngle += 0.04;
  if (radarAngle > Math.PI * 2) radarAngle = 0;

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
  gradient.addColorStop(0, 'rgba(0, 240, 255, 0.25)');
  gradient.addColorStop(1, 'rgba(0, 240, 255, 0.02)');

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, maxR, radarAngle - 0.4, radarAngle);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();

  // Echo blip representing HC-SR04 Target
  const targetDistNorm = Math.min(1, xenoxState.env.distanceCm / 300);
  const targetR = targetDistNorm * maxR;
  const targetAngle = Math.PI * 0.75; // fixed azimuth for detection zone
  const targetX = cx + Math.cos(targetAngle) * targetR;
  const targetY = cy + Math.sin(targetAngle) * targetR;

  const isAlert = xenoxState.env.distanceCm <= xenoxState.thresholds.distance;
  ctx.fillStyle = isAlert ? '#ff3366' : '#00f59b';
  ctx.shadowColor = isAlert ? 'rgba(255,51,102,0.8)' : 'rgba(0,245,155,0.8)';
  ctx.shadowBlur = 12;

  ctx.beginPath();
  ctx.arc(targetX, targetY, isAlert ? 6 : 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  requestAnimationFrame(drawRadarAnimation);
}

/* ============================================================================
   USER ACTIONS & PRESETS
   ============================================================================ */
function setMasterMode(mode) {
  xenoxState.mode = mode;
  xenoxState.relays.fan.mode = mode;
  xenoxState.relays.lamp.mode = mode;

  document.getElementById('btn-master-auto')?.classList.toggle('active', mode === 'auto');
  document.getElementById('btn-master-manual')?.classList.toggle('active', mode === 'manual');

  logEvent('System Mode', `Operating mode switched to ${mode.toUpperCase()}`, mode === 'auto' ? 'Automated Rules Active' : 'Manual Override Active');
  renderAll();
}

function setApplianceMode(appliance, mode) {
  if (xenoxState.relays[appliance]) {
    xenoxState.relays[appliance].mode = mode;
    logEvent(`${appliance.toUpperCase()} Mode`, `Set to ${mode.toUpperCase()}`, 'Updated');
    renderAll();
  }
}

function toggleRelayManual(appliance) {
  if (xenoxState.relays[appliance].mode !== 'manual') {
    setApplianceMode(appliance, 'manual');
  }
  xenoxState.relays[appliance].active = !xenoxState.relays[appliance].active;
  renderAll();
}

function triggerPirMotionPulse() {
  xenoxState.env.pirMotion = true;
  xenoxState.env.pirHoldRemaining = xenoxState.thresholds.pirTimeout;
  logEvent('PIR Sensor', `Manual Motion pulse triggered (${xenoxState.thresholds.pirTimeout}s window)`, 'PIR → HIGH');
  renderAll();
}

function clearPirMotionManual() {
  xenoxState.env.pirMotion = false;
  xenoxState.env.pirHoldRemaining = 0;
  logEvent('PIR Sensor', 'Motion cleared', 'PIR → LOW');
  renderAll();
}

function applyPreset(name) {
  xenoxState.activePreset = name;
  const presets = {
    evening: {
      temp: 29.5,
      humidity: 54,
      lightPct: 22,
      distanceCm: 150,
      pirMotion: true,
      pirHold: 30,
      title: 'Warm Occupied Evening'
    },
    sunny: {
      temp: 26.0,
      humidity: 42,
      lightPct: 85,
      distanceCm: 280,
      pirMotion: false,
      pirHold: 0,
      title: 'Sunny Empty Afternoon'
    },
    nightGuard: {
      temp: 22.0,
      humidity: 62,
      lightPct: 5,
      distanceCm: 42, // Under 50cm threshold -> Triggers alert!
      pirMotion: true,
      pirHold: 30,
      title: 'Night Perimeter Breach'
    },
    hotStudy: {
      temp: 34.0,
      humidity: 48,
      lightPct: 70,
      distanceCm: 180,
      pirMotion: true,
      pirHold: 30,
      title: 'Hot Daylight Study'
    }
  };

  const p = presets[name];
  if (!p) return;

  xenoxState.env.temp = p.temp;
  xenoxState.env.humidity = p.humidity;
  xenoxState.env.lightPct = p.lightPct;
  xenoxState.env.distanceCm = p.distanceCm;
  xenoxState.env.pirMotion = p.pirMotion;
  xenoxState.env.pirHoldRemaining = p.pirHold;

  // Update UI preset chips
  ['evening', 'sunny', 'nightGuard', 'hotStudy'].forEach(id => {
    document.getElementById(`preset-${id}`)?.classList.toggle('active', id === name);
  });

  logEvent('Preset Applied', `Loaded scenario "${p.title}"`, 'Sensors Reconfigured');
  renderAll();
}

/* ============================================================================
   THRESHOLD CALIBRATION SYNC
   ============================================================================ */
function updateThreshold(key, val) {
  const num = parseFloat(val);
  if (isNaN(num)) return;
  xenoxState.thresholds[key] = num;

  const slider = document.getElementById(`slider-thresh-${key}`);
  const input = document.getElementById(`num-thresh-${key}`);
  const display = document.getElementById(`disp-thresh-${key}`);

  if (slider) slider.value = num;
  if (input) input.value = num;
  if (display) display.textContent = `${num}${key === 'temp' ? '°C' : (key === 'light' ? '%' : (key === 'distance' ? 'cm' : 's'))}`;

  logEvent('Calibration', `Threshold ${key} updated to ${num}`, 'Applied to Logic');
  renderAll();
}

function resetThresholds() {
  updateThreshold('temp', 28.0);
  updateThreshold('light', 40);
  updateThreshold('distance', 50);
  updateThreshold('pirTimeout', 30);
}

/* ============================================================================
   PHONE COMPANION SYNCHRONIZATION
   ============================================================================ */
function syncPhoneCompanion() {
  const phoneTemp = document.getElementById('phone-val-temp');
  const phoneHum = document.getElementById('phone-val-hum');
  const phoneDist = document.getElementById('phone-val-dist');
  const phoneMotion = document.getElementById('phone-val-motion');
  const phoneFanBtn = document.getElementById('phone-btn-fan');
  const phoneLampBtn = document.getElementById('phone-btn-lamp');

  if (phoneTemp) phoneTemp.textContent = `${xenoxState.env.temp.toFixed(1)}°C`;
  if (phoneHum) phoneHum.textContent = `${Math.round(xenoxState.env.humidity)}%`;
  if (phoneDist) phoneDist.textContent = `${Math.round(xenoxState.env.distanceCm)} cm`;
  if (phoneMotion) {
    phoneMotion.textContent = xenoxState.env.pirMotion ? 'DETECTED' : 'IDLE';
    phoneMotion.style.color = xenoxState.env.pirMotion ? 'var(--cyan)' : 'var(--text-muted)';
  }

  if (phoneFanBtn) {
    phoneFanBtn.textContent = `FAN: ${xenoxState.relays.fan.active ? 'ON' : 'OFF'}`;
    phoneFanBtn.className = `btn btn-sm ${xenoxState.relays.fan.active ? 'btn-cyan' : 'btn-subtle'}`;
  }
  if (phoneLampBtn) {
    phoneLampBtn.textContent = `LAMP: ${xenoxState.relays.lamp.active ? 'ON' : 'OFF'}`;
    phoneLampBtn.className = `btn btn-sm ${xenoxState.relays.lamp.active ? 'btn-cyan' : 'btn-subtle'}`;
  }
}

function togglePhoneModal(open) {
  const modal = document.getElementById('phone-preview-modal');
  if (modal) {
    modal.classList.toggle('open', open);
  }
}

/* ============================================================================
   CODE EXPORT GENERATORS (ARDUINO INO & PYTHON GATEWAY)
   ============================================================================ */
function getArduinoSketchCode() {
  return `/*
 * XENOX SMART AUTOMATION SYSTEM — FIRMWARE SKETCH
 * Target: Arduino UNO (ATmega328P)
 * Pins:
 *   D2: DHT11 Sensor
 *   D3: PIR Motion Sensor
 *   A0: LDR Light Sensor
 *   D6: HC-SR04 Trigger Pin
 *   D7: HC-SR04 Echo Pin
 *   D8: Relay Channel 1 (AC Fan)
 *   D9: Relay Channel 2 (Room Lamp)
 *   D13: Status LED / Heartbeat
 */

#include <DHT.h>

#define DHTPIN 2
#define DHTTYPE DHT11
#define PIR_PIN 3
#define LDR_PIN A0
#define TRIG_PIN 6
#define ECHO_PIN 7
#define RELAY_FAN 8
#define RELAY_LAMP 9
#define STATUS_LED 13

DHT dht(DHTPIN, DHTTYPE);

// Configured Thresholds from XENOX Web Console
const float TEMP_THRESHOLD_C = ${xenoxState.thresholds.temp.toFixed(1)};
const int   LDR_THRESHOLD    = ${Math.round((xenoxState.thresholds.light / 100) * 1023)}; // ${xenoxState.thresholds.light}%
const long  PROXIMITY_LIMIT  = ${xenoxState.thresholds.distance}; // cm
const unsigned long PIR_HOLD_MS = ${xenoxState.thresholds.pirTimeout * 1000}UL;

unsigned long lastMotionTime = 0;
bool manualOverride = false;
bool fanManualState = false;
bool lampManualState = false;

void setup() {
  Serial.begin(115200);
  dht.begin();

  pinMode(PIR_PIN, INPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(RELAY_FAN, OUTPUT);
  pinMode(RELAY_LAMP, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);

  // Relay active LOW trigger initialization (OFF)
  digitalWrite(RELAY_FAN, HIGH);
  digitalWrite(RELAY_LAMP, HIGH);
  digitalWrite(STATUS_LED, HIGH);

  Serial.println("{\\"system\\":\\"XENOX Online\\",\\"baud\\":115200}");
}

long readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 25000);
  if (duration == 0) return 400; // timeout/out of range
  return duration * 0.034 / 2;
}

void loop() {
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int ldrAdc = analogRead(LDR_PIN);
  int lightPct = map(ldrAdc, 0, 1023, 0, 100);
  bool motion = digitalRead(PIR_PIN) == HIGH;
  long distanceCm = readDistanceCm();

  if (motion) {
    lastMotionTime = millis();
  }
  bool occupied = (millis() - lastMotionTime) < PIR_HOLD_MS;

  // Process any Incoming Serial Command from Python Gateway
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    if (cmd == "FAN_ON") { manualOverride = true; fanManualState = true; }
    else if (cmd == "FAN_OFF") { manualOverride = true; fanManualState = false; }
    else if (cmd == "LAMP_ON") { manualOverride = true; lampManualState = true; }
    else if (cmd == "LAMP_OFF") { manualOverride = true; lampManualState = false; }
    else if (cmd == "AUTO") { manualOverride = false; }
  }

  // Automation Logic
  bool fanState = manualOverride ? fanManualState : (temp >= TEMP_THRESHOLD_C);
  bool lampState = manualOverride ? lampManualState : (occupied && lightPct < ${xenoxState.thresholds.light});

  digitalWrite(RELAY_FAN, fanState ? LOW : HIGH);
  digitalWrite(RELAY_LAMP, lampState ? LOW : HIGH);

  // Output Telemetry JSON Stream to USB Serial
  Serial.print("{\\"temp\\":"); Serial.print(temp);
  Serial.print(",\\"hum\\":"); Serial.print(hum);
  Serial.print(",\\"light\\":"); Serial.print(lightPct);
  Serial.print(",\\"motion\\":"); Serial.print(motion ? "true" : "false");
  Serial.print(",\\"dist\\":"); Serial.print(distanceCm);
  Serial.print(",\\"fan\\":"); Serial.print(fanState ? "true" : "false");
  Serial.print(",\\"lamp\\":"); Serial.print(lampState ? "true" : "false");
  Serial.println("}");

  delay(1000);
}`;
}

function copyCodeToClipboard(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    alert('Code copied to clipboard successfully!');
  });
}

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ============================================================================
   APP INITIALIZATION
   ============================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons if available
  if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons();
  }

  // Initial seed of history points
  for (let i = 20; i >= 0; i--) {
    const t = new Date(Date.now() - i * 1500).toLocaleTimeString([], { hour12: false });
    xenoxState.history.timestamps.push(t);
    xenoxState.history.temp.push(xenoxState.env.temp + (Math.random() - 0.5) * 0.4);
    xenoxState.history.humidity.push(xenoxState.env.humidity + (Math.random() - 0.5) * 1.5);
    xenoxState.history.light.push(xenoxState.env.lightPct + (Math.random() - 0.5) * 3);
    xenoxState.history.distance.push(xenoxState.env.distanceCm + (Math.random() - 0.5) * 5);
  }

  // Initial log entry
  logEvent('XENOX Core', 'System Boot Completed — Ready', 'All Sensors & Relays Online');

  // Start simulation loop & radar
  simLoopTimer = setInterval(tickSimulation, 1200);
  requestAnimationFrame(drawRadarAnimation);

  // Initial render
  renderAll();
});
