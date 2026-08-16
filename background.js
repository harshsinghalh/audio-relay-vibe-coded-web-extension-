/**
 * AntiGravity Studio Bridge - Background Service Worker (Manifest V3)
 * Module architecture with Service Worker lifecycle persistence, offscreen document
 * coordination, WebRTC signaling dispatch, and cryptographic LAN authentication.
 */

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

// Generate Cryptographic Bearer Token for LAN peer authentication
function generateAuthToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Default Configuration
const DEFAULT_CONFIG = {
  activeDevice: {
    id: "default",
    name: "Default Audio Output",
    type: "speaker",
    connection: "wifi",
    status: "connected"
  },
  connectionMethod: "wifi",
  signalQuality: {
    status: "Excellent (Low latency)",
    latencyMs: 14.2,
    jitterMs: 0.8,
    packetLossPct: 0.0
  },
  audioStream: {
    sampleRate: "44.1kHz",
    channels: "Stereo",
    state: "Active",
    codec: "Opus"
  },
  volume: 68,
  theme: "light",
  authToken: generateAuthToken()
};

// Initialize State
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[AntiGravity Bridge] Extension installed/updated.");
  const local = await chrome.storage.local.get("antigravityState");
  if (!local.antigravityState) {
    await chrome.storage.local.set({ antigravityState: DEFAULT_CONFIG });
  }
  if (chrome.storage.session) {
    await chrome.storage.session.set({
      isStreaming: false,
      activePeerState: "idle",
      streamStartTime: null
    });
  }
});

// Check if Offscreen Document currently exists
async function hasOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    return contexts.length > 0;
  }
  // Fallback for Chromium environments
  const clientsList = await clients.matchAll({ includeUncontrolled: true, type: 'window' });
  return clientsList.some(c => c.url.includes(chrome.runtime.id) && c.url.includes(OFFSCREEN_DOCUMENT_PATH));
}

// Ensure Offscreen Document is created safely without race conditions
export async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;

  const reasons = (chrome.offscreen && chrome.offscreen.Reason)
    ? [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.WEB_RTC]
    : ['USER_MEDIA', 'WEB_RTC'];

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: reasons,
      justification: 'Real-time low-latency media capture and WebRTC DSP pipeline.'
    });
    console.log('[AntiGravity Bridge] Offscreen document created.');
  } catch (err) {
    if (!err.message.includes('Only a single offscreen document may be created')) {
      console.warn('[AntiGravity Bridge] Offscreen creation notice:', err.message);
    }
  }
}

// Terminate Offscreen Document to prevent hardware thread leaks
export async function terminateOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    try {
      await chrome.offscreen.closeDocument();
      console.log('[AntiGravity Bridge] Offscreen document disposed.');
    } catch (e) {
      console.warn('[AntiGravity Bridge] Offscreen closure notice:', e);
    }
  }
}

// Maintain Service Worker Keep-Alive Port during Live Streaming
const activePorts = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepAliveBridge') {
    activePorts.add(port);
    port.onDisconnect.addListener(() => {
      activePorts.delete(port);
    });
  }
});

// Signaling & Lifecycle Message Hub
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // 1. Offscreen Routing
    if (msg.target === 'offscreen') {
      await ensureOffscreenDocument();
      const response = await chrome.runtime.sendMessage(msg);
      return response;
    }

    // 2. State Inquiries
    if (msg.type === 'GET_APP_STATE') {
      const local = await chrome.storage.local.get('antigravityState');
      const session = chrome.storage.session ? await chrome.storage.session.get() : {};
      return {
        success: true,
        data: { ...(local.antigravityState || DEFAULT_CONFIG), session }
      };
    }

    // 3. Update Persistent Configuration
    if (msg.type === 'UPDATE_APP_STATE') {
      await chrome.storage.local.set({ antigravityState: msg.payload });
      return { success: true };
    }

    // 4. Start Streaming Lifecycle
    if (msg.type === 'START_STREAMING_PIPELINE') {
      await ensureOffscreenDocument();
      if (chrome.storage.session) {
        await chrome.storage.session.set({ isStreaming: true, streamStartTime: Date.now() });
      }
      const response = await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'START_STREAM',
        streamId: msg.streamId,
        config: msg.config
      });
      return response || { success: true };
    }

    // 5. Stop Streaming & Tear Down Offscreen
    if (msg.type === 'STOP_STREAMING_PIPELINE') {
      try {
        await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'STOP_STREAM'
        });
      } catch (e) {}
      await terminateOffscreenDocument();
      if (chrome.storage.session) {
        await chrome.storage.session.set({ isStreaming: false });
      }
      return { success: true };
    }

    // 6. WebRTC Peer State Changes reported by Offscreen
    if (msg.type === 'PEER_STATE_CHANGE') {
      if (chrome.storage.session) {
        await chrome.storage.session.set({ activePeerState: msg.state });
      }
      if (['disconnected', 'failed', 'closed'].includes(msg.state)) {
        await terminateOffscreenDocument();
      }
      return { success: true };
    }

    return { status: 'unhandled_action' };
  })()
    .then(sendResponse)
    .catch((err) => sendResponse({ success: false, error: err.message }));

  return true; // Keep asynchronous message channel open
});
