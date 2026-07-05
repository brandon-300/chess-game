// ui_handler.js — All DOM manipulation and event wiring for Chess 3D

import * as engine from './game_engine.js';

let els = {};
let callbacks = {};
let toastTimer = null;

export function initUI(cb) {
    callbacks = cb;
    cacheElements();
    attachListeners();
    if (els.debugOverlay) els.debugOverlay.textContent = 'Loading...';
    setVoiceControlsVisibility(false);
}

function cacheElements() {
    const ids = [
        'login-btn', 'profile-avatar', 'profile-avatar-img', 'debug-overlay', 'error-log',
        'ms', 'home-play-online', 'home-cards',
        'card-2p', 'card-ai', 'card-friends', 'card-history', 'card-settings',
        'btn-restore-local', 'btn-sync-offline-cloud', 'btn-restore-offline-cloud', 'btn-delete-all-synced',
        'gu', 'top', 'bot',
        'tdot', 'tlbl',
        'tmrW', 'tmrB', 'tvW', 'tvB',
        'voice-controls', 'mic-toggle-btn', 'speaker-toggle-btn', 'voice-status',
        'lobby-panel', 'lobby-avatar', 'lobby-opponent-name', 'lobby-start-btn', 'lobby-leave-btn', 'lobby-rematch-btn',
        'left-drawer', 'right-drawer', 'drawer-toggle-left', 'drawer-toggle-right', 'close-left-drawer', 'close-right-drawer',
        'move-list', 'chat-messages', 'chat-input', 'chat-send',
        'state-loading', 'state-empty', 'state-error', 'state-reconnecting',
        'toast',
        'new-game-btn', 'undo-btn', 'mode-btn',
        'go', 'got', 'gos', 'go-btns',
        'pm', 'po'
    ];
    ids.forEach(id => { els[id] = document.getElementById(id); });
    if (els['profile-avatar']) {
        els['profile-avatar'].addEventListener('click', () => { window.location.href = 'profile.html'; });
    }
}

function attachListeners() {
    const btn = (id, handler) => { const el = els[id]; if (el) el.addEventListener('click', handler); };

    // Home screen buttons
    btn('home-play-online', () => callbacks.onOnlineMenu());
    btn('card-2p', () => callbacks.onStart2P());
    btn('card-ai', () => callbacks.onStartAI());
    ['card-friends','card-history','card-settings'].forEach(id => {
        if (els[id]) els[id].addEventListener('click', () => toast('Coming soon…', 2000));
    });

    // Offline sync buttons (fixed)
    btn('btn-restore-local', () => callbacks.onRestoreLocal());
    btn('btn-sync-offline-cloud', () => callbacks.onSyncOfflineCloud());
    btn('btn-restore-offline-cloud', () => callbacks.onRestoreOfflineCloud());
    btn('btn-delete-all-synced', () => {
        // Show delete confirmation (we'll reuse the old panel if it exists)
        const confirmPanel = document.getElementById('delete-confirm-panel');
        if (confirmPanel) {
            confirmPanel.classList.add('show');
            // Wire confirm/cancel buttons inside the panel (one-time)
            document.getElementById('btn-delete-confirm')?.addEventListener('click', () => {
                confirmPanel.classList.remove('show');
                callbacks.onDeleteSynced();
            }, { once: true });
            document.getElementById('btn-delete-cancel')?.addEventListener('click', () => {
                confirmPanel.classList.remove('show');
            }, { once: true });
        }
    });

    // Bottom bar buttons
    btn('new-game-btn', () => callbacks.onNewGame());
    btn('undo-btn', () => callbacks.onUndo());
    btn('mode-btn', () => callbacks.onModeBtn());

    // Voice controls
    if (els['mic-toggle-btn']) els['mic-toggle-btn'].addEventListener('click', () => callbacks.onToggleMic && callbacks.onToggleMic());
    if (els['speaker-toggle-btn']) els['speaker-toggle-btn'].addEventListener('click', () => callbacks.onToggleSpeaker && callbacks.onToggleSpeaker());

    // Drawer toggles
    if (els['drawer-toggle-left']) els['drawer-toggle-left'].addEventListener('click', () => toggleLeftDrawer());
    if (els['drawer-toggle-right']) els['drawer-toggle-right'].addEventListener('click', () => toggleRightDrawer());
    if (els['close-left-drawer']) els['close-left-drawer'].addEventListener('click', () => closeLeftDrawer());
    if (els['close-right-drawer']) els['close-right-drawer'].addEventListener('click', () => closeRightDrawer());

    // Lobby buttons
    btn('lobby-start-btn', () => callbacks.onCountdownFinished && callbacks.onCountdownFinished());
    btn('lobby-leave-btn', () => callbacks.onCancelWaiting && callbacks.onCancelWaiting());
    btn('lobby-rematch-btn', () => callbacks.onAcceptRematch && callbacks.onAcceptRematch());

    // Chat (basic send)
    if (els['chat-send']) els['chat-send'].addEventListener('click', () => {
        const msg = els['chat-input'].value.trim();
        if (msg && callbacks.onChatSend) {
            callbacks.onChatSend(msg);
            els['chat-input'].value = '';
        }
    });

    if (els['login-btn']) els['login-btn'].addEventListener('click', () => { window.location.href = 'user_login.html'; });
}

// ---- Drawer helpers ----
export function toggleLeftDrawer() {
    els['left-drawer'].classList.toggle('open');
}
export function closeLeftDrawer() {
    els['left-drawer'].classList.remove('open');
}
export function toggleRightDrawer() {
    els['right-drawer'].classList.toggle('open');
}
export function closeRightDrawer() {
    els['right-drawer'].classList.remove('open');
}
export function appendMoveToDrawer(moveText) {
    if (els['move-list']) {
        const div = document.createElement('div');
        div.textContent = moveText;
        els['move-list'].appendChild(div);
        els['move-list'].scrollTop = els['move-list'].scrollHeight;
    }
}

// ---- Lobby ----
export function showLobbyPanel(opponentName, roomCode) {
    if (els['lobby-panel']) els['lobby-panel'].classList.add('show');
    if (els['lobby-opponent-name']) els['lobby-opponent-name'].textContent = opponentName || 'Waiting…';
    // Show start/leave, hide rematch
    if (els['lobby-start-btn']) els['lobby-start-btn'].style.display = 'inline-block';
    if (els['lobby-leave-btn']) els['lobby-leave-btn'].style.display = 'inline-block';
    if (els['lobby-rematch-btn']) els['lobby-rematch-btn'].style.display = 'none';
}
export function hideLobbyPanel() {
    if (els['lobby-panel']) els['lobby-panel'].classList.remove('show');
}
export function showRematchInLobby() {
    if (els['lobby-start-btn']) els['lobby-start-btn'].style.display = 'none';
    if (els['lobby-leave-btn']) els['lobby-leave-btn'].style.display = 'none';
    if (els['lobby-rematch-btn']) els['lobby-rematch-btn'].style.display = 'inline-block';
}

// ---- State overlays ----
function showState(id) {
    ['state-loading','state-empty','state-error','state-reconnecting'].forEach(s => {
        if (els[s]) els[s].classList.remove('show');
    });
    if (els[id]) els[id].classList.add('show');
}
export function showLoading() { showState('state-loading'); }
export function showEmpty() { showState('state-empty'); }
export function showError() { showState('state-error'); }
export function showReconnecting() { showState('state-reconnecting'); }
export function hideAllStates() {
    ['state-loading','state-empty','state-error','state-reconnecting'].forEach(s => {
        if (els[s]) els[s].classList.remove('show');
    });
}

// ---- Existing UI functions ----
export function setVoiceControlsVisibility(visible) {
    if (els['voice-controls']) els['voice-controls'].style.display = visible ? '' : 'none';
}
export function setMicState(on) {
    const btn = els['mic-toggle-btn']; if (!btn) return;
    btn.classList.toggle('on', !!on); btn.classList.toggle('off', !on);
}
export function setSpeakerState(on) {
    const btn = els['speaker-toggle-btn']; if (!btn) return;
    btn.classList.toggle('on', !!on); btn.classList.toggle('off', !on);
}
export function setOpponentTalking(talking, nickname) {
    const el = els['voice-status']; if (!el) return;
    if (talking && nickname) {
        el.textContent = nickname + ' talking…';
        el.classList.add('show');
    } else {
        el.classList.remove('show');
    }
}
export function resetVoiceState() {
    setMicState(false);
    setSpeakerState(true);
    setOpponentTalking(false, '');
}

export function showMenu() {
    if (els['ms']) els['ms'].style.display = 'flex';
    if (els['gu']) els['gu'].style.display = 'none';
}
export function showGameUI() { if (els['ms']) els['ms'].style.display = 'none'; if (els['gu']) els['gu'].style.display = 'block'; hideAllStates(); }
export function hideGameUI() { if (els['gu']) els['gu'].style.display = 'none'; }
export function hideGameOver() { if (els['go']) els['go'].classList.remove('on'); }

export function updateHeaderUI(userId, avatarUrl) {
    if (!els['login-btn'] || !els['profile-avatar'] || !els['profile-avatar-img']) return;
    if (userId) {
        els['login-btn'].style.display = 'none'; els['profile-avatar'].style.display = 'block';
        els['profile-avatar-img'].src = avatarUrl || '';
    } else {
        els['login-btn'].style.display = 'inline-block'; els['profile-avatar'].style.display = 'none';
    }
}
export function updateTurnIndicator(turn, myColor, isOnline) {
    if (!els['tdot'] || !els['tlbl']) return;
    els['tdot'].className = 'tdot ' + (turn === 'w' ? 'w' : 'b');
    els['tlbl'].textContent = turn === 'w' ? (isOnline ? (myColor==='w'?'Your turn':'Red') : 'Red') : (isOnline ? (myColor==='b'?'Your turn':'Black') : 'Black');
}
export function updateTimers(w, b, activeTurn) {
    if (!els['tvW'] || !els['tvB']) return;
    els['tvW'].textContent = fmtTime(w); els['tvB'].textContent = fmtTime(b);
    if (els['tmrW']) els['tmrW'].className = 'tmr' + (activeTurn === 'w' ? ' active' : '') + (w <= 10 && activeTurn === 'w' ? ' low' : '');
    if (els['tmrB']) els['tmrB'].className = 'tmr' + (activeTurn === 'b' ? ' active' : '') + (b <= 10 && activeTurn === 'b' ? ' low' : '');
}
export function updateThinkingIndicator(thinking) { /* can use top bar spinner */ }
export function setOnlineBottomButtons(isOnline) {
    if (els['undo-btn']) els['undo-btn'].style.display = isOnline ? 'none' : '';
    if (els['new-game-btn']) els['new-game-btn'].style.display = isOnline ? 'none' : '';
    if (els['mode-btn']) els['mode-btn'].textContent = isOnline ? 'Leave Match' : 'Exit';
}

export function showGameOver(title, subtitle, buttonsHTML) {
    if (els['got']) els['got'].textContent = title;
    if (els['gos']) els['gos'].textContent = subtitle;
    if (els['go-btns']) els['go-btns'].innerHTML = buttonsHTML;
    if (els['go']) els['go'].classList.add('on');
}
export function showPromotion(color) {
    const po = els['po']; if (!po) return; po.innerHTML = '';
    const pieces = ['Q','R','B','N'];
    pieces.forEach(t => {
        const btn = document.createElement('div'); btn.className = 'po-b';
        const glyphs = { wQ:'\u2655',wR:'\u2656',wB:'\u2657',wN:'\u2658', bQ:'\u265B',bR:'\u265C',bB:'\u265D',bN:'\u265E' };
        btn.textContent = glyphs[color + t];
        btn.addEventListener('click', () => { if (els['pm']) els['pm'].classList.remove('on'); engine.completePromotion(t); });
        po.appendChild(btn);
    });
    if (els['pm']) els['pm'].classList.add('on');
}
export function toast(msg, duration = 2800) {
    const el = els['toast'];
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}
export function getPrivateRoomCode() { return els['private-room-code'] ? els['private-room-code'].value.trim() : ''; }
export function updateDebug(text) { if (els['debug-overlay']) els['debug-overlay'].textContent = text; }

function fmtTime(s) { const m = Math.floor(s/60), sec = Math.floor(s%60); return m + ':' + sec.toString().padStart(2,'0'); }
export function showLoginGate() { /* kept for compatibility */ }

// ---- Additional panel helpers (used by main.js) ----
export function showPanel(panelId) {
    const p = document.getElementById(panelId);
    if (p) p.classList.add('show');
}
export function hideAllPanels() {
    ['online-menu','public-menu','private-menu','join-private','countdown-panel','waiting-panel','rematch-panel',
     'login-gate-panel','ai-diff-panel','ai-color-panel','ai-countdown-panel',
     'exit-choice-panel','restore-choice-panel','cloud-choice-panel','delete-confirm-panel','exit-online-panel']
    .forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('show'); });
}
export function showWaitingRoom(name, code) { /* replaced by lobby */ }
export function showCountdown(name, code) { /* can still use existing countdown if desired */ }
export function showRematchUI(text) { /* can use lobby rematch */ }
export function showExitChoicePanel() { if (els['exit-choice-panel']) els['exit-choice-panel'].classList.add('show'); }
export function hideExitChoicePanel() { if (els['exit-choice-panel']) els['exit-choice-panel'].classList.remove('show'); }
export function showExitOnlinePanel() { if (els['exit-online-panel']) els['exit-online-panel'].classList.add('show'); }
export function hideExitOnlinePanel() { if (els['exit-online-panel']) els['exit-online-panel'].classList.remove('show'); }
export function setRejoinButtonsVisibility() {} // no-op
export function updateChatMessages(msgs) { /* future */ }