# Audio Relay Web Extension (Manifest V3)

A high-performance, low-latency audio streaming & relay browser extension popup interface crafted with clean neomorphism and glassmorphism styling, exactly matching the reference composition.

## Key Features
- **Real Audio Device Enumeration**: Automatically discovers and lists *actual* hardware audio outputs and inputs (Speakers, Headphones, AirPods, USB DACs, Bluetooth devices) using `navigator.mediaDevices.enumerateDevices()`. No fake or phantom devices.
- **Dynamic Opalescent Slider**: Volume slider with dynamic hue-shifting pearlescent knob, smooth drag feedback, and real-time Web Audio API gain adjustment.
- **Sleek Window State Management**:
  - **Red ('x')**: Apple-style smooth fade & scale-down dismissal.
  - **Yellow ('-')**: Smoothly collapses the interface to a minimal 58px micro-bar showing current stream status and volume.
  - **Green ('<>')**: Smoothly expands to a Pro DSP Spectrogram dashboard with live 60 FPS frequency visualizer and clock jitter metrics.
- **Connection Method Switcher**: Seamless switching between **WiFi/Internet** (with mint green glow), **Bluetooth**, and **USB Tethering** with latency calibration.
- **Signal Quality Telemetry**: 60 FPS real-time HTML5 Canvas oscilloscope with jitter buffer and packet loss metrics.
- **High-End Dark Mode**: Obsidian Slate palette with neon cyan and purple accents, synced across settings and quick toggle.
- **Manifest V3 Compliant**: Completely free of CSP violations (no inline scripts, no inline handlers), with background service worker coordination.

---

## Installation Guide (Chrome / Edge / Brave / Opera)

1. Open your browser and navigate to:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** in the top-left corner.
4. Select the `audio-relay-extension` folder:
   `C:\Users\chotu\.gemini\antigravity\scratch\audio-relay-extension`
5. Pin the **Audio Relay Web Extension** to your toolbar and click to open!

---

## Direct Browser Preview
You can also open `index.html` or `popup.html` directly in any web browser to test all animations, window minimize/maximize states, real hardware device detection, and dark mode.
