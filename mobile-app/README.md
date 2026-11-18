# XENOX Mobile Phone App (React Native / Expo)

Dedicated native smartphone client for the **XENOX Smart Automation System**, tailored for Hotel, Hospital, and Facility Building Managers.

Matches the exact mobile interface displayed in the architecture diagram:
- **Environment Overview**: Circular arc gauges for Temperature & Humidity.
- **Security & Proximity**: HC-SR04 doorway clearance distance (cm) & PIR motion status.
- **Controls & Automation**: Climate Fan & Room Lighting with Auto/Manual toggles and Power switches.

---

## 🚀 How to Run on your Phone

### Option 1: Instant Test via Web Mobile App (Zero Installation)
Simply open [`mobile/index.html`](../mobile/index.html) in your mobile browser or open it via your computer's local Wi-Fi IP address:
```
http://<YOUR_COMPUTER_IP>:8000/mobile/index.html
```
You can tap **"Add to Home Screen"** on Safari (iOS) or Chrome (Android) to install it as a native standalone PWA application!

---

### Option 2: Run Native App with Expo Go (Android & iOS)

1. Make sure you have Node.js installed.
2. In this folder (`mobile-app/`), install dependencies:
   ```bash
   npm install
   ```
3. Start the Expo development server:
   ```bash
   npx expo start
   ```
4. Scan the QR code shown in your terminal using:
   - **Android**: The **Expo Go** app (downloadable from Google Play Store).
   - **iPhone**: The Camera app (with Expo Go installed from the App Store).

---

### Option 3: Build Standalone APK (Android)
To compile a native `.apk` for direct installation on Android devices:
```bash
npx eas-cli build -p android --profile preview
```
