import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Vibration,
  Platform,
  ActivityIndicator
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

// Gateway IP Address (Set to your computer's local Wi-Fi IP, e.g., 192.168.1.10:8000)
const GATEWAY_API = 'http://192.168.1.10:8000';

export default function App() {
  // Telemetry & Control State
  const [temp, setTemp] = useState(24.5);
  const [humidity, setHumidity] = useState(48);
  const [lightPct, setLightPct] = useState(35);
  const [distanceCm, setDistanceCm] = useState(150);
  const [pirMotion, setPirMotion] = useState(true);
  const [lastMotionTime, setLastMotionTime] = useState('10:30:05 AM');

  const [fanActive, setFanActive] = useState(false);
  const [fanMode, setFanMode] = useState('auto'); // 'auto' | 'manual'
  const [lampActive, setLampActive] = useState(false);
  const [lampMode, setLampMode] = useState('auto'); // 'auto' | 'manual'

  const [thresholdTemp, setThresholdTemp] = useState(25.0);
  const [thresholdLight, setThresholdLight] = useState(40);
  const [activeZone, setActiveZone] = useState('hotel'); // 'hotel' | 'hospital' | 'office'

  // Autonomous Control Logic
  useEffect(() => {
    if (fanMode === 'auto') {
      setFanActive(temp >= thresholdTemp);
    }
  }, [temp, thresholdTemp, fanMode]);

  useEffect(() => {
    if (lampMode === 'auto') {
      setLampActive(pirMotion && lightPct < thresholdLight);
    }
  }, [pirMotion, lightPct, thresholdLight, lampMode]);

  // Simulated Telemetry Jitter Loop
  useEffect(() => {
    const timer = setInterval(() => {
      setTemp((prev) => +(prev + (Math.random() - 0.5) * 0.15).toFixed(1));
      setHumidity((prev) => Math.round(prev + (Math.random() - 0.5) * 0.4));
      setDistanceCm((prev) => Math.max(20, Math.min(300, Math.round(prev + (Math.random() - 0.5) * 1.5))));
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  const triggerHaptic = () => {
    if (Platform.OS !== 'web') {
      Vibration.vibrate(20);
    }
  };

  const toggleFan = () => {
    triggerHaptic();
    if (fanMode === 'auto') setFanMode('manual');
    setFanActive(!fanActive);
  };

  const toggleLamp = () => {
    triggerHaptic();
    if (lampMode === 'auto') setLampMode('manual');
    setLampActive(!lampActive);
  };

  const selectZone = (zone) => {
    triggerHaptic();
    setActiveZone(zone);
    if (zone === 'hotel') {
      setTemp(24.5); setHumidity(48); setThresholdTemp(25.0);
    } else if (zone === 'hospital') {
      setTemp(22.0); setHumidity(50); setThresholdTemp(23.0);
    } else if (zone === 'office') {
      setTemp(21.5); setHumidity(44); setThresholdTemp(22.5);
    }
  };

  // SVG Gauge Helpers (Circumference = 2 * PI * 34 = 213.6)
  const CIRCUMFERENCE = 213.6;
  const tempPct = Math.max(0, Math.min(1, (temp - 15) / 25));
  const tempOffset = CIRCUMFERENCE - (CIRCUMFERENCE * tempPct);

  const humPct = Math.max(0, Math.min(1, humidity / 100));
  const humOffset = CIRCUMFERENCE - (CIRCUMFERENCE * humPct);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#070d19" />

      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandTitle}>XENOX</Text>
          <Text style={styles.brandSub}>FACILITY MOBILE BMS</Text>
        </View>
        <View style={styles.onlinePill}>
          <View style={styles.greenDot} />
          <Text style={styles.onlineText}>CONNECTED</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Zone Selector Strip */}
        <View style={styles.zoneScroll}>
          <TouchableOpacity
            style={[styles.zoneChip, activeZone === 'hotel' && styles.zoneChipActive]}
            onPress={() => selectZone('hotel')}
          >
            <Text style={[styles.zoneChipText, activeZone === 'hotel' && styles.zoneChipTextActive]}>🏨 Hotel Suite 402</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.zoneChip, activeZone === 'hospital' && styles.zoneChipActive]}
            onPress={() => selectZone('hospital')}
          >
            <Text style={[styles.zoneChipText, activeZone === 'hospital' && styles.zoneChipTextActive]}>🏥 Hospital Ward 3B</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.zoneChip, activeZone === 'office' && styles.zoneChipActive]}
            onPress={() => selectZone('office')}
          >
            <Text style={[styles.zoneChipText, activeZone === 'office' && styles.zoneChipTextActive]}>🏢 Corporate Conf A</Text>
          </TouchableOpacity>
        </View>

        {/* Section 1: Environment Overview */}
        <Text style={styles.sectionTitle}>Environment Overview</Text>
        <View style={styles.card}>
          <View style={styles.dualGaugeRow}>
            {/* Temperature Gauge */}
            <View style={styles.gaugeBox}>
              <Svg width={90} height={90} viewBox="0 0 90 90">
                <Circle cx="45" cy="45" r="34" stroke="#162744" strokeWidth="8" fill="none" />
                <Circle
                  cx="45" cy="45" r="34"
                  stroke="#00f0ff" strokeWidth="8" fill="none"
                  strokeDasharray={`${CIRCUMFERENCE}`}
                  strokeDashoffset={tempOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 45 45)"
                />
              </Svg>
              <View style={styles.gaugeTextOverlay}>
                <Text style={styles.gaugeVal}>{temp}°C</Text>
                <Text style={styles.gaugeLabel}>Temp: Optimal</Text>
              </View>
            </View>

            {/* Humidity Gauge */}
            <View style={styles.gaugeBox}>
              <Svg width={90} height={90} viewBox="0 0 90 90">
                <Circle cx="45" cy="45" r="34" stroke="#162744" strokeWidth="8" fill="none" />
                <Circle
                  cx="45" cy="45" r="34"
                  stroke="#00f59b" strokeWidth="8" fill="none"
                  strokeDasharray={`${CIRCUMFERENCE}`}
                  strokeDashoffset={humOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 45 45)"
                />
              </Svg>
              <View style={styles.gaugeTextOverlay}>
                <Text style={[styles.gaugeVal, { color: '#00f59b' }]}>{humidity}%</Text>
                <Text style={styles.gaugeLabel}>Hum: Normal</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Section 2: Security & Proximity */}
        <Text style={styles.sectionTitle}>Security &amp; Proximity</Text>
        <View style={styles.card}>
          <View style={styles.proximityRow}>
            <View style={styles.statBubble}>
              <Text style={styles.bubbleTitle}>PROXIMITY CLEARANCE</Text>
              <Text style={styles.bubbleVal}>{distanceCm} cm</Text>
              <Text style={styles.statusClear}>✓ Entry Clear</Text>
            </View>

            <View style={styles.statBubble}>
              <Text style={styles.bubbleTitle}>MOTION OCCUPANCY</Text>
              <Text style={[styles.bubbleVal, { color: pirMotion ? '#ffaa00' : '#00f59b' }]}>
                {pirMotion ? 'DETECTED' : 'IDLE'}
              </Text>
              <Text style={styles.lastMotionText}>Last: {lastMotionTime}</Text>
            </View>
          </View>
        </View>

        {/* Section 3: Controls & Automation */}
        <Text style={styles.sectionTitle}>Controls &amp; Automation</Text>
        <View style={styles.controlsList}>
          {/* Fan Tile */}
          <View style={[styles.controlTile, fanActive && styles.tileActiveFan]}>
            <View style={styles.tileLeft}>
              <View style={[styles.iconBox, fanActive && styles.iconBoxFan]}>
                <Text style={styles.iconSymbol}>💨</Text>
              </View>
              <View>
                <Text style={styles.tileTitle}>Climate Fan</Text>
                <Text style={styles.tileSubtitle}>{fanActive ? 'Active · 75W (75 CFM)' : 'Standby · 0W'}</Text>
              </View>
            </View>

            <View style={styles.tileRight}>
              <TouchableOpacity
                style={styles.modePill}
                onPress={() => {
                  triggerHaptic();
                  setFanMode(fanMode === 'auto' ? 'manual' : 'auto');
                }}
              >
                <Text style={styles.modePillText}>{fanMode.toUpperCase()}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.powerBtn, fanActive && styles.powerBtnOnFan]}
                onPress={toggleFan}
              >
                <Text style={styles.powerBtnText}>⏻</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Lamp Tile */}
          <View style={[styles.controlTile, lampActive && styles.tileActiveLamp]}>
            <View style={styles.tileLeft}>
              <View style={[styles.iconBox, lampActive && styles.iconBoxLamp]}>
                <Text style={styles.iconSymbol}>💡</Text>
              </View>
              <View>
                <Text style={styles.tileTitle}>Room Lighting</Text>
                <Text style={styles.tileSubtitle}>{lampActive ? 'Illuminated · 18W (850 LM)' : 'Standby · 0W'}</Text>
              </View>
            </View>

            <View style={styles.tileRight}>
              <TouchableOpacity
                style={styles.modePill}
                onPress={() => {
                  triggerHaptic();
                  setLampMode(lampMode === 'auto' ? 'manual' : 'auto');
                }}
              >
                <Text style={styles.modePillText}>{lampMode.toUpperCase()}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.powerBtn, lampActive && styles.powerBtnOnLamp]}
                onPress={toggleLamp}
              >
                <Text style={styles.powerBtnText}>⏻</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#070d19' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#12233f'
  },
  brandTitle: { color: '#ffffff', fontSize: 20, fontWeight: '700', letterSpacing: 1.5 },
  brandSub: { color: '#00f0ff', fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,240,255,0.08)',
    borderColor: 'rgba(0,240,255,0.3)',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00f59b', marginRight: 6 },
  onlineText: { color: '#00f0ff', fontSize: 10, fontWeight: '600' },
  scrollContent: { padding: 18, paddingBottom: 40 },
  zoneScroll: { flexDirection: 'row', marginBottom: 16 },
  zoneChip: {
    backgroundColor: '#0c1628',
    borderColor: '#182b4a',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8
  },
  zoneChipActive: { borderColor: '#00f0ff', backgroundColor: 'rgba(0,240,255,0.1)' },
  zoneChipText: { color: '#8b9bb4', fontSize: 12 },
  zoneChipTextActive: { color: '#ffffff', fontWeight: '600' },
  sectionTitle: { color: '#8b9bb4', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  card: {
    backgroundColor: '#0c1628',
    borderRadius: 16,
    borderColor: 'rgba(0,240,255,0.2)',
    borderWidth: 1,
    padding: 16,
    marginBottom: 16
  },
  dualGaugeRow: { flexDirection: 'row', justifyContent: 'space-around' },
  gaugeBox: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  gaugeTextOverlay: { position: 'absolute', alignItems: 'center' },
  gaugeVal: { color: '#00f0ff', fontSize: 20, fontWeight: '700' },
  gaugeLabel: { color: '#8b9bb4', fontSize: 9, marginTop: 2 },
  proximityRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statBubble: {
    flex: 1,
    backgroundColor: '#060a14',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#12233f'
  },
  bubbleTitle: { color: '#506482', fontSize: 9, fontWeight: '600', marginBottom: 4 },
  bubbleVal: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  statusClear: { color: '#00f59b', fontSize: 10, marginTop: 4 },
  lastMotionText: { color: '#506482', fontSize: 9, marginTop: 4 },
  controlsList: { gap: 12 },
  controlTile: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0c1628',
    borderRadius: 14,
    borderColor: '#182b4a',
    borderWidth: 1,
    padding: 14
  },
  tileActiveFan: { borderColor: '#00f0ff', backgroundColor: 'rgba(0,240,255,0.06)' },
  tileActiveLamp: { borderColor: '#ffaa00', backgroundColor: 'rgba(255,170,0,0.06)' },
  tileLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#081120',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#182b4a'
  },
  iconBoxFan: { borderColor: '#00f0ff' },
  iconBoxLamp: { borderColor: '#ffaa00' },
  iconSymbol: { fontSize: 18 },
  tileTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  tileSubtitle: { color: '#8b9bb4', fontSize: 10, marginTop: 2 },
  tileRight: { alignItems: 'flex-end', gap: 6 },
  modePill: {
    backgroundColor: '#060a14',
    borderColor: '#182b4a',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  modePillText: { color: '#00f0ff', fontSize: 9, fontWeight: '700' },
  powerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#081120',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#182b4a'
  },
  powerBtnOnFan: { backgroundColor: '#00f0ff', borderColor: '#00f0ff' },
  powerBtnOnLamp: { backgroundColor: '#ffaa00', borderColor: '#ffaa00' },
  powerBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' }
});
