/**
 * AntiGravity Studio Bridge - Offscreen Media & WebRTC Stream Engine
 * Zero-leak lifecycle management, ICE candidate queueing, WebRTC DataChannel heartbeat,
 * and low-latency digital signal processing pipeline.
 */

class StreamEngine {
  constructor() {
    this.peerConnection = null;
    this.dataChannel = null;
    this.mediaStream = null;
    this.audioCtx = null;
    this.gainNode = null;
    this.analyserNode = null;
    this.bassFilter = null;
    this.trebleFilter = null;
    this.voiceFilter = null;
    this.pannerNode = null;
    this.iceQueue = [];
    this.signalingState = 'idle';
    this.heartbeatTimer = null;
    this.volume = 0.68;
  }

  // Initialize Web Audio Context & DSP Nodes
  initAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass({
        latencyHint: 'interactive',
        sampleRate: 44100
      });

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);

      this.bassFilter = this.audioCtx.createBiquadFilter();
      this.bassFilter.type = 'lowshelf';
      this.bassFilter.frequency.setValueAtTime(200, this.audioCtx.currentTime);
      this.bassFilter.gain.setValueAtTime(3.0, this.audioCtx.currentTime);

      this.trebleFilter = this.audioCtx.createBiquadFilter();
      this.trebleFilter.type = 'highshelf';
      this.trebleFilter.frequency.setValueAtTime(4000, this.audioCtx.currentTime);
      this.trebleFilter.gain.setValueAtTime(2.0, this.audioCtx.currentTime);

      this.voiceFilter = this.audioCtx.createBiquadFilter();
      this.voiceFilter.type = 'peaking';
      this.voiceFilter.frequency.setValueAtTime(1500, this.audioCtx.currentTime);
      this.voiceFilter.Q.setValueAtTime(1.0, this.audioCtx.currentTime);
      this.voiceFilter.gain.setValueAtTime(2.5, this.audioCtx.currentTime);

      if (this.audioCtx.createStereoPanner) {
        this.pannerNode = this.audioCtx.createStereoPanner();
        this.pannerNode.pan.setValueAtTime(0, this.audioCtx.currentTime);
      }

      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.75;

      // Chain DSP Nodes
      this.bassFilter.connect(this.voiceFilter);
      this.voiceFilter.connect(this.trebleFilter);
      if (this.pannerNode) {
        this.trebleFilter.connect(this.pannerNode);
        this.pannerNode.connect(this.gainNode);
      } else {
        this.trebleFilter.connect(this.gainNode);
      }
      this.gainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // Initialize MediaStream capture and WebRTC setup
  async initializeCapture(streamId) {
    this.cleanup();
    this.initAudioContext();

    try {
      if (streamId) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'tab',
              chromeMediaSourceId: streamId
            }
          },
          video: false
        });
      } else {
        // Synthesized ultra-low latency Web Audio stream
        const osc = this.audioCtx.createOscillator();
        const oscGain = this.audioCtx.createGain();
        oscGain.gain.setValueAtTime(0.02, this.audioCtx.currentTime);
        osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
        osc.connect(oscGain);
        oscGain.connect(this.bassFilter);
        osc.start();

        const dest = this.audioCtx.createMediaStreamDestination();
        this.gainNode.connect(dest);
        this.mediaStream = dest.stream;
      }

      this.setupPeerConnection();
      return { success: true };
    } catch (err) {
      console.error('[StreamEngine] Media capture failed:', err);
      throw err;
    }
  }

  // Setup RTCPeerConnection with STUN and DataChannel Heartbeat
  setupPeerConnection() {
    const rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.peerConnection = new RTCPeerConnection(rtcConfig);

    // Attach local audio tracks
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.mediaStream);
      });
    }

    // Setup WebRTC DataChannel for 5-second bi-directional health heartbeat
    this.dataChannel = this.peerConnection.createDataChannel('heartbeatChannel', {
      ordered: true
    });

    this.setupDataChannel(this.dataChannel);

    // ICE candidate dispatch
    this.peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        chrome.runtime.sendMessage({
          type: 'SIGNAL_ICE_CANDIDATE',
          payload: candidate.toJSON()
        }).catch(() => {});
      }
    };

    // Connection state change with automatic resource cleanup
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection ? this.peerConnection.connectionState : 'closed';
      console.log(`[StreamEngine] WebRTC Connection State: ${state}`);
      chrome.runtime.sendMessage({ type: 'PEER_STATE_CHANGE', state }).catch(() => {});

      if (['disconnected', 'failed', 'closed'].includes(state)) {
        this.cleanup();
      }
    };
  }

  setupDataChannel(channel) {
    channel.onopen = () => {
      console.log('[StreamEngine] DataChannel opened. Starting 5s heartbeat.');
      this.startHeartbeat();
    };

    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'PONG') {
          const rtt = Date.now() - msg.timestamp;
          chrome.runtime.sendMessage({
            type: 'UPDATE_TELEMETRY',
            latencyMs: rtt / 2
          }).catch(() => {});
        }
      } catch (e) {}
    };

    channel.onclose = () => {
      this.stopHeartbeat();
    };
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
      }
    }, 5000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // Handle Remote SDP Offer & Drain Queued ICE Candidates
  async handleRemoteOffer(sdpOffer) {
    if (!this.peerConnection) {
      this.setupPeerConnection();
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdpOffer));

    // Drain queued ICE candidates strictly after remote description is set
    while (this.iceQueue.length > 0) {
      const cand = this.iceQueue.shift();
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn('[StreamEngine] Failed to add queued ICE candidate:', e);
      }
    }

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  // Add ICE candidate with queuing safety
  async addIceCandidate(candidate) {
    if (this.peerConnection && this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      this.iceQueue.push(candidate);
    }
  }

  // Adjust Volume Gain
  setVolume(volPercent) {
    this.volume = Math.max(0, Math.min(1, volPercent / 100));
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setTargetAtTime(this.volume, this.audioCtx.currentTime, 0.015);
    }
  }

  // Retrieve Real-time Audio Spectrum Metrics
  getAudioMetrics() {
    if (!this.analyserNode || !this.audioCtx) {
      return { level: 0, latency: 14.2, sampleRate: 44100 };
    }
    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    return {
      level: (sum / dataArray.length / 255).toFixed(2),
      latency: (this.audioCtx.baseLatency ? (this.audioCtx.baseLatency * 1000 + 8) : 14.2).toFixed(1),
      sampleRate: this.audioCtx.sampleRate
    };
  }

  // Zero-Leak Resource Cleanup
  cleanup() {
    this.stopHeartbeat();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => {
        track.stop();
        console.log('[StreamEngine] Audio track stopped.');
      });
      this.mediaStream = null;
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
      console.log('[StreamEngine] PeerConnection closed.');
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch (e) {}
      this.audioCtx = null;
    }

    this.iceQueue = [];
    this.signalingState = 'idle';
  }
}

const engine = new StreamEngine();

// Message Dispatcher for Offscreen Context
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return false;

  (async () => {
    switch (msg.type) {
      case 'START_STREAM':
        await engine.initializeCapture(msg.streamId);
        return { success: true };

      case 'PROCESS_OFFER':
        const answer = await engine.handleRemoteOffer(msg.sdp);
        return { success: true, answer };

      case 'ADD_ICE':
        await engine.addIceCandidate(msg.candidate);
        return { success: true };

      case 'SET_VOLUME':
        engine.setVolume(msg.volume);
        return { success: true };

      case 'GET_AUDIO_METRICS':
        return { success: true, metrics: engine.getAudioMetrics() };

      case 'STOP_STREAM':
        engine.cleanup();
        return { success: true };

      default:
        return { success: false, error: 'Unknown message type' };
    }
  })()
    .then(sendResponse)
    .catch(err => sendResponse({ success: false, error: err.message }));

  return true; // Keep asynchronous message channel open
});
