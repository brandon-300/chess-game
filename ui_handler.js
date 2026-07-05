// ui_handler.js — Chess 3D (drawer, voice, clearMoveDrawer, all fixes)

import * as engine from './game_engine.js';

let callbacks = {};
let toastTimer = null;
let countdownInterval = null;

export function initUI(cb) {
    callbacks = cb;
    document.body.addEventListener('click', handleDelegatedClick);
    if (document.getElementById('debug-overlay')) {
        document.getElementById('debug-overlay').textContent = 'UI loaded';
    }
    setVoiceControlsVisibility(false);
}

function handleDelegatedClick(e) {
    const btn = e.target.closest('button');
    if (!btn) {
        // Close drawer if overlay clicked
        if (e.target.id === 'drawer-overlay' || e.target.closest('#drawer-overlay')) {
            closeLeftDrawer();
            return;
        }
        return;
    }
    const id = btn.id;
    if (!id) return;

    switch (id) {
        // Home screen
        case 'home-play-online':
            if (callbacks.onOnlineMenu) callbacks.onOnlineMenu();
            break;
        case 'card-2p': if (callbacks.onStart2P) callbacks.onStart2P(); break;
        case 'card-ai': if (callbacks.onStartAI) callbacks.onStartAI(); break;
        case 'card-friends': case 'card-history': case 'card-settings': toast('Coming soon…', 2000); break;

        // Offline / sync
        case 'btn-restore-local': if (callbacks.onRestoreLocal) callbacks.onRestoreLocal(); break;
        case 'btn-sync-offline-cloud': if (callbacks.onSyncOfflineCloud) callbacks.onSyncOfflineCloud(); break;
        case 'btn-restore-offline-cloud': if (callbacks.onRestoreOfflineCloud) callbacks.onRestoreOfflineCloud(); break;
        case 'btn-delete-all-synced': const dp = document.getElementById('delete-confirm-panel'); if (dp) dp.classList.add('show'); break;

        // Bottom bar
        case 'new-game-btn': if (callbacks.onNewGame) callbacks.onNewGame(); break;
        case 'undo-btn': if (callbacks.onUndo) callbacks.onUndo(); break;
        case 'mode-btn': if (callbacks.onModeBtn) callbacks.onModeBtn(); break;

        // Voice
        case 'mic-toggle-btn': if (callbacks.onToggleMic) callbacks.onToggleMic(); break;
        case 'speaker-toggle-btn': if (callbacks.onToggleSpeaker) callbacks.onToggleSpeaker(); break;

        // Drawer
        case 'drawer-toggle-left': toggleLeftDrawer(); break;
        case 'close-left-drawer': closeLeftDrawer(); break;

        // Lobby
        case 'lobby-start-btn': if (callbacks.onCountdownFinished) callbacks.onCountdownFinished(); break;
        case 'lobby-leave-btn': if (callbacks.onCancelWaiting) callbacks.onCancelWaiting(); break;
        case 'lobby-rematch-btn': if (callbacks.onAcceptRematch) callbacks.onAcceptRematch(); break;

        // Legacy panels
        case 'btn-delete-confirm': const dp2 = document.getElementById('delete-confirm-panel'); if (dp2) dp2.classList.remove('show'); if (callbacks.onDeleteSynced) callbacks.onDeleteSynced(); break;
        case 'btn-delete-cancel': const dp3 = document.getElementById('delete-confirm-panel'); if (dp3) dp3.classList.remove('show'); break;
        case 'btn-exit-save': if (callbacks.onExitSave) callbacks.onExitSave(); break;
        case 'btn-exit-no-save': if (callbacks.onExitWithoutSave) callbacks.onExitWithoutSave(); break;
        case 'btn-exit-cancel': const ecp = document.getElementById('exit-choice-panel'); if (ecp) ecp.classList.remove('show'); break;
        case 'btn-exit-online-yes': if (callbacks.onExitOnlineYes) callbacks.onExitOnlineYes(); break;
        case 'btn-exit-online-stay': const eop = document.getElementById('exit-online-panel'); if (eop) eop.classList.remove('show'); break;
        case 'btn-restore-ai': const rcp = document.getElementById('restore-choice-panel'); if (rcp) rcp.classList.remove('show'); if (callbacks.onRestoreAI) callbacks.onRestoreAI(); break;
        case 'btn-restore-2p': const rcp2 = document.getElementById('restore-choice-panel'); if (rcp2) rcp2.classList.remove('show'); if (callbacks.onRestore2P) callbacks.onRestore2P(); break;
        case 'btn-restore-cancel': const rcp3 = document.getElementById('restore-choice-panel'); if (rcp3) rcp3.classList.remove('show'); break;
        case 'btn-cloud-restore-ai': const ccp = document.getElementById('cloud-choice-panel'); if (ccp) ccp.classList.remove('show'); if (callbacks.onCloudRestoreAI) callbacks.onCloudRestoreAI(); break;
        case 'btn-cloud-restore-2p': const ccp2 = document.getElementById('cloud-choice-panel'); if (ccp2) ccp2.classList.remove('show'); if (callbacks.onCloudRestore2P) callbacks.onCloudRestore2P(); break;
        case 'btn-cloud-restore-cancel': const ccp3 = document.getElementById('cloud-choice-panel'); if (ccp3) ccp3.classList.remove('show'); break;

        // Online flow
        case 'btn-public-menu': hideAllPanels(); const pm = document.getElementById('public-menu'); if (pm) pm.classList.add('show'); break;
        case 'btn-private-menu': hideAllPanels(); const pvm = document.getElementById('private-menu'); if (pvm) pvm.classList.add('show'); break;
        case 'btn-online-back': hideAllPanels(); showMenu(); break;
        case 'btn-create-public': if (callbacks.onCreatePublicRoom) callbacks.onCreatePublicRoom(); break;
        case 'btn-join-public': if (callbacks.onJoinPublicRoom) callbacks.onJoinPublicRoom(); break;
        case 'btn-public-back': hideAllPanels(); const om2 = document.getElementById('online-menu'); if (om2) om2.classList.add('show'); break;
        case 'btn-show-create-private': if (callbacks.onCreatePrivateRoom) callbacks.onCreatePrivateRoom(); break;
        case 'btn-show-join-private': hideAllPanels(); const jp = document.getElementById('join-private'); if (jp) jp.classList.add('show'); break;
        case 'btn-private-back': hideAllPanels(); const om3 = document.getElementById('online-menu'); if (om3) om3.classList.add('show'); break;
        case 'btn-join-private': if (callbacks.onJoinPrivateRoom) callbacks.onJoinPrivateRoom(); break;
        case 'btn-join-private-back': hideAllPanels(); const pvm2 = document.getElementById('private-menu'); if (pvm2) pvm2.classList.add('show'); break;
        case 'btn-cancel-waiting': if (callbacks.onCancelWaiting) callbacks.onCancelWaiting(); break;
        case 'btn-rematch-accept': if (callbacks.onAcceptRematch) callbacks.onAcceptRematch(); break;
        case 'btn-rematch-decline': if (callbacks.onDeclineRematch) callbacks.onDeclineRematch(); break;
        case 'btn-go-login': window.location.href = 'user_login.html'; break;
        case 'btn-login-gate-back': hideAllPanels(); showMenu(); break;

        // AI
        case 'btn-ai-novice': engine.setAiDepth(1); hideAllPanels(); showPanel('ai-color-panel'); break;
        case 'btn-ai-knight': engine.setAiDepth(3); hideAllPanels(); showPanel('ai-color-panel'); break;
        case 'btn-ai-master': engine.setAiDepth(5); hideAllPanels(); showPanel('ai-color-panel'); break;
        case 'btn-ai-diff-back': hideAllPanels(); showMenu(); break;
        case 'btn-ai-red': engine.setPlayerColor('w'); startAiCountdown(); break;
        case 'btn-ai-black': engine.setPlayerColor('b'); startAiCountdown(); break;
        case 'btn-ai-color-back': hideAllPanels(); showPanel('ai-diff-panel'); break;
        case 'btn-cancel-ai-countdown': cancelAiCountdown(); break;

        // Header
        case 'login-btn': window.location.href = 'user_login.html'; break;
    }
}

// ---- Drawer helpers ----
export function toggleLeftDrawer() {
    const drawer = document.getElementById('left-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (!drawer || !overlay) return;
    const isOpen = drawer.classList.contains('open');
    if (isOpen) { drawer.classList.remove('open'); overlay.classList.remove('show'); }
    else { drawer.classList.add('open'); overlay.classList.add('show'); }
}
export function closeLeftDrawer() {
    const drawer = document.getElementById('left-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
}
export function clearMoveDrawer() {
    const ml = document.getElementById('move-list');
    if (ml) ml.innerHTML = '';
}
export function appendMoveToDrawer(moveText) {
    const ml = document.getElementById('move-list');
    if (ml) { const div = document.createElement('div'); div.textContent = moveText; ml.appendChild(div); ml.scrollTop = ml.scrollHeight; }
}

// ---- Lobby ----
export function showLobbyPanel(opponentName, roomCode) {
    const gu = document.getElementById('gu'); if (gu) gu.style.display = 'block';
    const top = document.getElementById('top'); if (top) top.style.display = 'none';
    const bot = document.getElementById('bot'); if (bot) bot.style.display = 'none';
    const lp = document.getElementById('lobby-panel'); if (lp) lp.classList.add('show');
    const name = document.getElementById('lobby-opponent-name'); if (name) name.textContent = opponentName || 'Waiting…';
    const start = document.getElementById('lobby-start-btn'); const leave = document.getElementById('lobby-leave-btn'); const rematch = document.getElementById('lobby-rematch-btn');
    if (start) start.style.display = 'inline-block';
    if (leave) leave.style.display = 'inline-block';
    if (rematch) rematch.style.display = 'none';
}
export function hideLobbyPanel() {
    const lp = document.getElementById('lobby-panel'); if (lp) lp.classList.remove('show');
    const top = document.getElementById('top'); if (top) top.style.display = '';
    const bot = document.getElementById('bot'); if (bot) bot.style.display = '';
}
export function showRematchInLobby() {
    const start = document.getElementById('lobby-start-btn'); const leave = document.getElementById('lobby-leave-btn'); const rematch = document.getElementById('lobby-rematch-btn');
    if (start) start.style.display = 'none';
    if (leave) leave.style.display = 'none';
    if (rematch) rematch.style.display = 'inline-block';
}

// ---- State overlays ----
function showState(id) {
    ['state-loading','state-empty','state-error','state-reconnecting'].forEach(s => { const el = document.getElementById(s); if (el) el.classList.remove('show'); });
    const el = document.getElementById(id); if (el) el.classList.add('show');
}
export function showLoading() { showState('state-loading'); }
export function showEmpty() { showState('state-empty'); }
export function showError() { showState('state-error'); }
export function showReconnecting() { showState('state-reconnecting'); }
export function hideAllStates() { ['state-loading','state-empty','state-error','state-reconnecting'].forEach(s => { const el = document.getElementById(s); if (el) el.classList.remove('show'); }); }

// ---- Voice ----
export function setVoiceControlsVisibility(visible) { const vc = document.getElementById('voice-controls'); if (vc) vc.style.display = visible ? '' : 'none'; }
export function setMicState(on) { const btn = document.getElementById('mic-toggle-btn'); if (btn) { btn.classList.toggle('on', !!on); btn.classList.toggle('off', !on); } }
export function setSpeakerState(on) { const btn = document.getElementById('speaker-toggle-btn'); if (btn) { btn.classList.toggle('on', !!on); btn.classList.toggle('off', !on); } }

export function setOpponentTalking(talking, nickname) {
    const el = document.getElementById('voice-status');
    if (!el) return;
    if (talking && nickname) {
        el.innerHTML = '<span class="spk-ic">🔊</span> ' + nickname + ' is talking';
        el.classList.add('show');
    } else {
        el.classList.remove('show');
    }
}
export function resetVoiceState() { setMicState(false); setSpeakerState(true); setOpponentTalking(false, ''); }

// ---- General UI ----
export function showMenu() { const ms = document.getElementById('ms'); if (ms) ms.style.display = 'flex'; const gu = document.getElementById('gu'); if (gu) gu.style.display = 'none'; }
export function showGameUI() {
    const ms = document.getElementById('ms'); if (ms) ms.style.display = 'none';
    const gu = document.getElementById('gu'); if (gu) gu.style.display = 'block';
    const top = document.getElementById('top'); if (top) top.style.display = '';
    const bot = document.getElementById('bot'); if (bot) bot.style.display = '';
    hideAllStates();
}
export function hideGameUI() { const gu = document.getElementById('gu'); if (gu) gu.style.display = 'none'; }
export function hideGameOver() { const go = document.getElementById('go'); if (go) go.classList.remove('on'); }
export function updateHeaderUI(userId, avatarUrl) {
    const login = document.getElementById('login-btn'); const avatar = document.getElementById('profile-avatar'); const img = document.getElementById('profile-avatar-img');
    if (!login || !avatar || !img) return;
    if (userId) { login.style.display = 'none'; avatar.style.display = 'block'; img.src = avatarUrl || ''; }
    else { login.style.display = 'inline-block'; avatar.style.display = 'none'; }
}
export function updateTurnIndicator(turn, myColor, isOnline) {
    const dot = document.getElementById('tdot'); const lbl = document.getElementById('tlbl');
    if (!dot || !lbl) return;
    dot.className = 'tdot ' + (turn === 'w' ? 'w' : 'b');
    lbl.textContent = turn === 'w' ? (isOnline ? (myColor==='w'?'Your turn':'Red') : 'Red') : (isOnline ? (myColor==='b'?'Your turn':'Black') : 'Black');
}
export function updateTimers(w, b, activeTurn) {
    const tvW = document.getElementById('tvW'); const tvB = document.getElementById('tvB');
    if (tvW) tvW.textContent = fmtTime(w);
    if (tvB) tvB.textContent = fmtTime(b);
    const tmrW = document.getElementById('tmrW'); const tmrB = document.getElementById('tmrB');
    if (tmrW) tmrW.className = 'tmr' + (activeTurn === 'w' ? ' active' : '') + (w <= 10 && activeTurn === 'w' ? ' low' : '');
    if (tmrB) tmrB.className = 'tmr' + (activeTurn === 'b' ? ' active' : '') + (b <= 10 && activeTurn === 'b' ? ' low' : '');
}
export function setOnlineBottomButtons(isOnline) {
    const undo = document.getElementById('undo-btn');
    const ng = document.getElementById('new-game-btn');
    const mode = document.getElementById('mode-btn');
    const drawer = document.getElementById('drawer-toggle-left');
    if (undo) undo.style.display = isOnline ? 'none' : '';
    if (ng) ng.style.display = isOnline ? 'none' : '';
    if (mode) mode.textContent = isOnline ? 'Leave Match' : 'Exit';
    if (drawer) drawer.style.display = isOnline ? 'none' : '';
}
export function showGameOver(title, subtitle, buttonsHTML) {
    const got = document.getElementById('got'); if (got) got.textContent = title;
    const gos = document.getElementById('gos'); if (gos) gos.textContent = subtitle;
    const gob = document.getElementById('go-btns'); if (gob) gob.innerHTML = buttonsHTML;
    const go = document.getElementById('go'); if (go) go.classList.add('on');
}
export function showPromotion(color) {
    const po = document.getElementById('po'); if (!po) return; po.innerHTML = '';
    ['Q','R','B','N'].forEach(t => {
        const btn = document.createElement('div'); btn.className = 'po-b';
        const glyphs = { wQ:'\u2655',wR:'\u2656',wB:'\u2657',wN:'\u2658', bQ:'\u265B',bR:'\u265C',bB:'\u265D',bN:'\u265E' };
        btn.textContent = glyphs[color + t];
        btn.addEventListener('click', () => { const pm = document.getElementById('pm'); if (pm) pm.classList.remove('on'); engine.completePromotion(t); });
        po.appendChild(btn);
    });
    const pm = document.getElementById('pm'); if (pm) pm.classList.add('on');
}
export function toast(msg, duration = 2800) {
    const el = document.getElementById('toast'); if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}
export function getPrivateRoomCode() { const input = document.getElementById('private-room-code'); return input ? input.value.trim() : ''; }
export function updateDebug(text) { const el = document.getElementById('debug-overlay'); if (el) el.textContent = text; }
export function showLoginGate() { hideAllPanels(); const gate = document.getElementById('login-gate-panel'); if (gate) gate.classList.add('show'); }
export function updateThinkingIndicator() {}

export function showPanel(panelId) { hideAllPanels(); const p = document.getElementById(panelId); if (p) p.classList.add('show'); }
export function hideAllPanels() {
    const ms = document.getElementById('ms'); if (ms) ms.style.display = 'none';
    const ids = [
        'online-menu','public-menu','private-menu','join-private','countdown-panel','waiting-panel','rematch-panel',
        'login-gate-panel','ai-diff-panel','ai-color-panel','ai-countdown-panel',
        'exit-choice-panel','restore-choice-panel','cloud-choice-panel','delete-confirm-panel','exit-online-panel'
    ];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('show'); });
}
export function showWaitingRoom() {}
export function showCountdown() {}
export function showRematchUI() {}
export function showExitChoicePanel() { const p = document.getElementById('exit-choice-panel'); if (p) p.classList.add('show'); }
export function hideExitChoicePanel() { const p = document.getElementById('exit-choice-panel'); if (p) p.classList.remove('show'); }
export function showExitOnlinePanel() { const p = document.getElementById('exit-online-panel'); if (p) p.classList.add('show'); }
export function hideExitOnlinePanel() { const p = document.getElementById('exit-online-panel'); if (p) p.classList.remove('show'); }
export function setRejoinButtonsVisibility() {}

function fmtTime(s) { const m = Math.floor(s/60), sec = Math.floor(s%60); return m + ':' + sec.toString().padStart(2,'0'); }

// ---- Countdown helpers ----
function startAiCountdown() {
    hideAllPanels(); showPanel('ai-countdown-panel');
    let sec = 5;
    const numEl = document.getElementById('ai-countdown-number');
    if (numEl) numEl.textContent = sec;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        sec--;
        if (sec <= 5 && sec > 0) engine.playTickSound();
        if (sec <= 0) {
            clearInterval(countdownInterval); countdownInterval = null;
            hideAllPanels();
            if (callbacks.onAiCountdownFinished) callbacks.onAiCountdownFinished();
        } else {
            const el = document.getElementById('ai-countdown-number');
            if (el) el.textContent = sec;
        }
    }, 1000);
}

function cancelAiCountdown() { if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; } hideAllPanels(); showMenu(); }

export function startOnlineCountdown(hostNickname, roomCode, onFinished) {
    hideAllPanels();
    const panel = document.getElementById('countdown-panel');
    const welcome = document.getElementById('countdown-welcome');
    const number = document.getElementById('countdown-number');
    if (panel) panel.classList.add('show');
    if (welcome) welcome.textContent = `Welcome to ${hostNickname} room – Room ID: ${roomCode}`;
    let sec = 5;
    if (number) number.textContent = sec;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        sec--;
        if (sec <= 5 && sec > 0) engine.playTickSound();
        if (sec <= 0) {
            clearInterval(countdownInterval); countdownInterval = null;
            if (panel) panel.classList.remove('show');
            if (onFinished) onFinished();
        } else {
            const el = document.getElementById('countdown-number');
            if (el) el.textContent = sec;
        }
    }, 1000);
}