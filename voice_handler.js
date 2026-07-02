// voice_handler.js — WebRTC voice call handling for Chess 3D online matches
// Mic is opt-in and off by default; speaker is on by default. Signaling (offer/
// answer/ICE) is relayed by main.js through a Supabase Realtime Broadcast
// channel (see database.js: subscribeVoiceSignal/sendVoiceSignal) — this module
// never touches Supabase directly, it only knows about RTCPeerConnection + audio.

const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
        // No TURN server configured. On some mobile networks (carrier-grade NAT /
        // symmetric NAT) a direct peer-to-peer path can fail in one direction even
        // though it works the other way — the same class of issue as the AniChan
        // call bug. If that shows up here too, add a TURN server to this list.
    ]
};
const TALK_THRESHOLD = 14;   // avg byte-frequency level considered "talking"
const TALK_HOLD_MS = 700;    // how long to wait after volume drops before saying "stopped"

let pc = null;
let polite = true;
let makingOffer = false;
let ignoreOffer = false;
let localStream = null;
let remoteStream = null;
let audioEl = null;
let speakerOn = true;
let sendSignalFn = () => {};
let onTalkingChangeCb = () => {};
let onMicErrorCb = () => {};
let analyserCtx = null;
let analyserRaf = null;

// Call once per online match, right after the voice signaling channel is subscribed.
export function initVoice({ isPolite, sendSignal, onTalkingChange, onMicError }) {
    polite = !!isPolite;
    sendSignalFn = sendSignal || (() => {});
    onTalkingChangeCb = onTalkingChange || (() => {});
    onMicErrorCb = onMicError || (() => {});
    speakerOn = true;
    ensureAudioEl();
    createPeerConnection();
}

function ensureAudioEl() {
    if (audioEl) return;
    audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.style.display = 'none';
    audioEl.muted = !speakerOn;
    document.body.appendChild(audioEl);
}

function createPeerConnection() {
    teardownConnectionOnly();
    pc = new RTCPeerConnection(RTC_CONFIG);
    makingOffer = false;
    ignoreOffer = false;

    pc.onnegotiationneeded = async () => {
        try {
            makingOffer = true;
            await pc.setLocalDescription();
            sendSignalFn({ description: pc.localDescription });
        } catch (e) { console.error('[voice] negotiation error', e); }
        finally { makingOffer = false; }
    };

    pc.onicecandidate = ({ candidate }) => { if (candidate) sendSignalFn({ candidate }); };

    pc.ontrack = (event) => {
        remoteStream = event.streams[0] || new MediaStream([event.track]);
        ensureAudioEl();
        audioEl.srcObject = remoteStream;
        const playPromise = audioEl.play();
        if (playPromise && playPromise.catch) {
            playPromise.catch(() => {
                // Mobile autoplay restriction — resume on the next user tap, same fix as AniChan calls.
                const unlock = () => { audioEl.play().catch(() => {}); };
                document.addEventListener('touchend', unlock, { once: true });
                document.addEventListener('click', unlock, { once: true });
            });
        }
        startTalkingWatch(remoteStream);
    };
}

// Feed a { description } or { candidate } payload received from the signaling channel.
export async function handleRemoteSignal(payload) {
    if (!pc) createPeerConnection();
    try {
        if (payload.description) {
            const offerCollision = payload.description.type === 'offer' &&
                (makingOffer || pc.signalingState !== 'stable');
            ignoreOffer = !polite && offerCollision;
            if (ignoreOffer) return;
            await pc.setRemoteDescription(payload.description);
            if (payload.description.type === 'offer') {
                await pc.setLocalDescription();
                sendSignalFn({ description: pc.localDescription });
            }
        } else if (payload.candidate) {
            try { await pc.addIceCandidate(payload.candidate); }
            catch (e) { if (!ignoreOffer) console.error('[voice] ICE error', e); }
        }
    } catch (e) { console.error('[voice] signal error', e); }
}

export async function enableMic() {
    if (!pc) createPeerConnection();
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) { onMicErrorCb(e); throw e; }
    localStream = stream;
    const track = stream.getAudioTracks()[0];
    pc.addTrack(track, stream); // reuses an existing recvonly transceiver if the remote side already offered one
    return true;
}

export function disableMic() {
    if (pc) {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (sender) pc.removeTrack(sender);
    }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
}

export function isMicOn() {
    return !!(localStream && localStream.getAudioTracks().some(t => t.readyState === 'live'));
}

export function setSpeakerEnabled(enabled) {
    speakerOn = !!enabled;
    if (audioEl) audioEl.muted = !speakerOn;
}

export function isSpeakerOn() { return speakerOn; }

// Volume-based "is talking" detection on the incoming stream. Runs regardless of the
// local speaker mute state (it taps the raw stream via Web Audio, not the <audio> element),
// so a player can see the opponent is talking even with their own speaker off.
function startTalkingWatch(stream) {
    stopTalkingWatch();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    analyserCtx = new Ctx();
    const source = analyserCtx.createMediaStreamSource(stream);
    const analyser = analyserCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let talking = false, lastAbove = 0;
    const loop = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        const now = performance.now();
        if (avg > TALK_THRESHOLD) {
            lastAbove = now;
            if (!talking) { talking = true; onTalkingChangeCb(true); }
        } else if (talking && now - lastAbove > TALK_HOLD_MS) {
            talking = false; onTalkingChangeCb(false);
        }
        analyserRaf = requestAnimationFrame(loop);
    };
    loop();
}

function stopTalkingWatch() {
    if (analyserRaf) { cancelAnimationFrame(analyserRaf); analyserRaf = null; }
    if (analyserCtx) { analyserCtx.close().catch(() => {}); analyserCtx = null; }
    onTalkingChangeCb(false);
}

function teardownConnectionOnly() {
    stopTalkingWatch();
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (pc) { try { pc.close(); } catch (e) {} pc = null; }
    if (audioEl) audioEl.srcObject = null;
    remoteStream = null;
}

// Call when leaving the match entirely (exit, terminate, back to menu).
export function closeConnection() {
    teardownConnectionOnly();
    sendSignalFn = () => {};
    onTalkingChangeCb = () => {};
    onMicErrorCb = () => {};
}
