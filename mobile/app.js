/**
 * ============================================================================
 * XENOX MOBILE APPLICATION ENGINE
 * ============================================================================
 * Mobile-first client for Hotel, Hospital, and Facility Managers.
 * Connects via Wi-Fi to Python Gateway REST API or runs in autonomous mode.
 */

const mobileState = {
  temp: 24.5,
  humidity: 48,
  lightPct: 35,
  distanceCm: 150,
  pirMotion: true,
  lastMotionTime: new Date().toLocaleTimeString([], { hour12: true }),

  fanActive: false,
  fanMode: 'auto', // 'auto' | 'manual'
  fanWatts: 75,

  lampActive: false,
  lampMode: 'auto', // 'auto' | 'manual'
  lampWatts: 18,

  thresholdTemp: 25.0,
  thresholdLight: 40,
  activeZone: 'hotel',

  gatewayUrl: 'http://localhost:8000',
  isOnline: true
};

// Haptic feedback helper
function triggerHaptic(duration = 20) {
  if (navigator.vibrate) {
    try {
      navigator.vibrate(duration);
    } catch (e) {}
  }
}

// Update mobile system clock
function updateMobileClock() {
  const clockEl = document.getElementById('mobile-clock');
  if (clockEl) {
    const d = new Date();
    clockEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}

// Core Automation Evaluation
function evaluateMobileAutomation() {
  if (mobileState.fanMode === 'auto') {
    mobileState.fanActive = mobileState.temp >= mobileState.thresholdTemp;
  }

  if (mobileState.lampMode === 'auto') {
    const isDark = mobileState.lightPct < mobileState.thresholdLight;
    mobileState.lampActive = mobileState.pirMotion && isDark;
  }

  renderMobileUI();
}

// Render UI Elements
function renderMobileUI() {
  // 1. Environment Gauges
  const tempVal = document.getElementById('m-val-temp');
  const tempComfort = document.getElementById('m-pill-temp-comfort');
  const tempGauge = document.getElementById('m-gauge-temp');

  const humVal = document.getElementById('m-val-hum');
  const humComfort = document.getElementById('m-pill-hum-comfort');
  const humGauge = document.getElementById('m-gauge-hum');

  if (tempVal) tempVal.textContent = `${mobileState.temp.toFixed(1)}°C`;
  if (tempComfort) {
    const isOptimal = mobileState.temp >= 20 && mobileState.temp <= 26;
    tempComfort.textContent = isOptimal ? 'Temp: Optimal' : (mobileState.temp > 26 ? 'Temp: Warm' : 'Temp: Cool');
    tempComfort.style.color = isOptimal ? 'var(--cyan)' : 'var(--amber)';
  }
  if (tempGauge) {
    // 235 circumference
    const pct = Math.max(0, Math.min(1, (mobileState.temp - 15) / 25));
    tempGauge.style.strokeDashoffset = 235 - (235 * pct);
  }

  if (humVal) humVal.textContent = `${Math.round(mobileState.humidity)}%`;
  if (humComfort) {
    const isNormal = mobileState.humidity >= 35 && mobileState.humidity <= 60;
    humComfort.textContent = isNormal ? 'Hum: Normal' : (mobileState.humidity > 60 ? 'Hum: High' : 'Hum: Dry');
  }
  if (humGauge) {
    const pct = Math.max(0, Math.min(1, mobileState.humidity / 100));
    humGauge.style.strokeDashoffset = 235 - (235 * pct);
  }

  // 2. Security & Proximity
  const distVal = document.getElementById('m-val-dist');
  const motionVal = document.getElementById('m-val-motion');
  const motionLast = document.getElementById('m-val-last-motion');

  if (distVal) distVal.textContent = `${Math.round(mobileState.distanceCm)} cm`;
  if (motionVal) {
    motionVal.textContent = mobileState.pirMotion ? 'DETECTED' : 'IDLE';
    motionVal.className = `bubble-badge ${mobileState.pirMotion ? 'active-amber' : 'active-green'}`;
  }
  if (motionLast) motionLast.textContent = `Last: ${mobileState.lastMotionTime}`;

  // 3. Actuator Controls
  const fanTile = document.getElementById('m-tile-fan');
  const fanBtn = document.getElementById('m-btn-fan-power');
  const fanModePill = document.getElementById('m-pill-fan-mode');
  const fanStatusText = document.getElementById('m-text-fan-status');
  const fanIcon = document.getElementById('m-icon-fan');

  if (fanTile) fanTile.classList.toggle('is-energized-fan', mobileState.fanActive);
  if (fanBtn) {
    fanBtn.classList.toggle('on-fan', mobileState.fanActive);
    fanBtn.disabled = mobileState.fanMode === 'auto';
  }
  if (fanModePill) fanModePill.textContent = mobileState.fanMode.toUpperCase();
  if (fanStatusText) {
    fanStatusText.textContent = mobileState.fanActive
      ? `Active · ${mobileState.fanWatts}W (75 CFM)`
      : `Standby · 0W`;
  }
  if (fanIcon) fanIcon.classList.toggle('spinning-fan-icon', mobileState.fanActive);

  const lampTile = document.getElementById('m-tile-lamp');
  const lampBtn = document.getElementById('m-btn-lamp-power');
  const lampModePill = document.getElementById('m-pill-lamp-mode');
  const lampStatusText = document.getElementById('m-text-lamp-status');

  if (lampTile) lampTile.classList.toggle('is-energized-lamp', mobileState.lampActive);
  if (lampBtn) {
    lampBtn.classList.toggle('on-lamp', mobileState.lampActive);
    lampBtn.disabled = mobileState.lampMode === 'auto';
  }
  if (lampModePill) lampModePill.textContent = mobileState.lampMode.toUpperCase();
  if (lampStatusText) {
    lampStatusText.textContent = mobileState.lampActive
      ? `Illuminated · ${mobileState.lampWatts}W (850 LM)`
      : `Standby · 0W`;
  }
}

// User Actions
function toggleFanPower() {
  triggerHaptic(25);
  if (mobileState.fanMode === 'auto') {
    mobileState.fanMode = 'manual';
  }
  mobileState.fanActive = !mobileState.fanActive;
  renderMobileUI();
  sendApiRelay('fan', mobileState.fanActive);
}

function toggleFanMode() {
  triggerHaptic(20);
  mobileState.fanMode = mobileState.fanMode === 'auto' ? 'manual' : 'auto';
  evaluateMobileAutomation();
}

function toggleLampPower() {
  triggerHaptic(25);
  if (mobileState.lampMode === 'auto') {
    mobileState.lampMode = 'manual';
  }
  mobileState.lampActive = !mobileState.lampActive;
  renderMobileUI();
  sendApiRelay('lamp', mobileState.lampActive);
}

function toggleLampMode() {
  triggerHaptic(20);
  mobileState.lampMode = mobileState.lampMode === 'auto' ? 'manual' : 'auto';
  evaluateMobileAutomation();
}

function selectMobileZone(zone) {
  triggerHaptic(15);
  mobileState.activeZone = zone;
  const presets = {
    hotel: { temp: 24.5, humidity: 48, lightPct: 35, distance: 180, threshTemp: 25.0 },
    hospital: { temp: 22.0, humidity: 50, lightPct: 20, distance: 140, threshTemp: 23.0 },
    office: { temp: 21.5, humidity: 44, lightPct: 75, distance: 220, threshTemp: 22.5 },
    night: { temp: 27.0, humidity: 52, lightPct: 8, distance: 290, threshTemp: 29.0 }
  };
  const p = presets[zone];
  if (p) {
    mobileState.temp = p.temp;
    mobileState.humidity = p.humidity;
    mobileState.lightPct = p.lightPct;
    mobileState.distanceCm = p.distance;
    mobileState.thresholdTemp = p.threshTemp;
  }
  evaluateMobileAutomation();
}

function triggerMobileMotion() {
  triggerHaptic(30);
  mobileState.pirMotion = true;
  mobileState.lastMotionTime = new Date().toLocaleTimeString([], { hour12: true });
  evaluateMobileAutomation();
}

// Optional REST sync with Python Gateway
async function sendApiRelay(appliance, state) {
  try {
    await fetch(`${mobileState.gatewayUrl}/api/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appliance, state })
    });
  } catch (e) {
    // Gateway offline or simulated mode
  }
}

// Natural background drift in simulated mode
function startMobileSimulation() {
  setInterval(() => {
    const tJitter = (Math.random() - 0.5) * 0.15;
    const hJitter = (Math.random() - 0.5) * 0.3;
    const dJitter = (Math.random() - 0.5) * 1.5;

    mobileState.temp = Math.max(16, Math.min(38, Number((mobileState.temp + tJitter).toFixed(1))));
    mobileState.humidity = Math.max(25, Math.min(85, Math.round(mobileState.humidity + hJitter)));
    mobileState.distanceCm = Math.max(20, Math.min(300, Math.round(mobileState.distanceCm + dJitter)));

    evaluateMobileAutomation();
  }, 1500);
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons();
  }

  updateMobileClock();
  setInterval(updateMobileClock, 10000);

  evaluateMobileAutomation();
  startMobileSimulation();
});
