// ui_handler.js — Chess 3D (drawer overlay, no chat, sync buttons wired)

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
        'left-drawer', 'drawer-overlay', 'drawer-toggle-left', 'close-left-drawer',
        'move-list',
        'state-loading', 'state-empty', 'state-error', 'state-reconnecting',
        'toast',
        'new-game-btn', 'undo-btn', 'mode-btn',
        'go', 'got', 'gos', 'go-btns',
        'pm', 'po',
        // legacy panels
        'exit-choice-panel', 'restore-choice-panel', 'cloud-choice-panel', 'delete-confirm-panel', 'exit-online-panel'
    ];
    ids.forEach(id => { els[id] = document.getElementById(id); });
    if (els['profile-avatar']) {
        els['profile-avatar'].addEventListener('click', () => { window.location.href = 'profile.html'; });
    }
}

function attachListeners() {
    const btn = (id, handler) => { const el = els[id]; if (el) el.addEventListener('click', handler); };

    btn('home-play-online', () => callbacks.onOnlineMenu());
    btn('card-2p', () => callbacks.onStart2P());
    btn('card-ai', () => callbacks.onStartAI());
    ['card-friends','card-history','card-settings'].forEach(id => {
        if (els[id]) els[id].addEventListener('click', () => toast('Coming soon…', 2000));
    });

    btn('btn-restore-local', () => callbacks.onRestoreLocal());
    btn('btn-sync-offline-cloud', () => callbacks.onSyncOfflineCloud());
    btn('btn-restore-offline-cloud', () => callbacks.onRestoreOfflineCloud());
    btn('btn-delete-all-synced', () => {
        if (els['delete-confirm-panel']) els['delete-confirm-panel'].classList.add('show');
    });

    // Bottom bar
    btn('new-game-btn', () => callbacks.onNewGame());
    btn('undo-btn', () => callbacks.onUndo());
    btn('mode-btn', () => callbacks.onModeBtn());

    // Voice
    if (els['mic-toggle-btn']) els['mic-toggle-btn'].addEventListener('click', () => callbacks.onToggleMic && callbacks.onToggleMic());
    if (els['speaker-toggle-btn']) els['speaker-toggle-btn'].addEventListener('click', () => callbacks.onToggleSpeaker && callbacks.onToggleSpeaker());

    // Drawer toggle
    if (els['drawer-toggle-left']) els['drawer-toggle-left'].addEventListener('click', toggleLeftDrawer);
    if (els['close-left-drawer']) els['close-left-drawer'].addEventListener('click', closeLeftDrawer);
    // Overlay closes drawers
    if (els['drawer-overlay']) els['drawer-overlay'].addEventListener('click', () => {
        closeLeftDrawer();
    });

    // Lobby
    btn('lobby-start-btn', () => callbacks.onCountdownFinished && callbacks.onCountdownFinished());
    btn('lobby-leave-btn', () => callbacks.onCancelWaiting && callbacks.onCancelWaiting());
    btn('lobby-rematch-btn', () => callbacks.onAcceptRematch && callbacks.onAcceptRematch());

    // Legacy panel buttons
    btn('btn-delete-confirm', () => { if (els['delete-confirm-panel']) els['delete-confirm-panel'].classList.remove('show'); callbacks.onDeleteSynced(); });
    btn('btn-delete-cancel', () => { if (els['delete-confirm-panel']) els['delete-confirm-panel'].classList.remove('show'); });
    btn('btn-exit-save', () => callbacks.onExitSave());
    btn('btn-exit-no-save', () => callbacks.onExitWithoutSave());
    btn('btn-exit-cancel', () => { if (els['exit-choice-panel']) els['exit-choice-panel'].classList.remove('show'); });
    btn('btn-exit-online-yes', () => callbacks.onExitOnlineYes());
    btn('btn-exit-online-stay', () => { if (els['exit-online-panel']) els['exit-online-panel'].classList.remove('show'); });
    btn('btn-restore-ai', () => { if (els['restore-choice-panel']) els['restore-choice-panel'].classList.remove('show'); callbacks.onRestoreAI && callbacks.onRestoreAI(); });
    btn('btn-restore-2p', () => { if (els['restore-choice-panel']) els['restore-choice-panel'].classList.remove('show'); callbacks.onRestore2P && callbacks.onRestore2P(); });
    btn('btn-restore-cancel', () => { if (els['restore-choice-panel']) els['restore-choice-panel'].classList.remove('show'); });
    btn('btn-cloud-restore-ai', () => { if (els['cloud-choice-panel']) els['cloud-choice-panel'].classList.remove('show'); callbacks.onCloudRestoreAI && callbacks.onCloudRestoreAI(); });
    btn('btn-cloud-restore-2p', () => { if (els['cloud-choice-panel']) els['cloud-choice-panel'].classList.remove('show'); callbacks.onCloudRestore2P && callbacks.onCloudRestore2P(); });
    btn('btn-cloud-restore-cancel', () => { if (els['cloud-choice-panel']) els['cloud-choice-panel'].classList.remove('show'); });

    if (els['login-btn']) els['login-btn'].addEventListener('click', () => { window.location.href = 'user_login.html'; });
}

// ---- Drawer helpers ----
export function toggleLeftDrawer() {
    const drawer = els['left-drawer'];
    const overlay = els['drawer-overlay'];
    if (!drawer || !overlay) return;
    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
        drawer.classList.remove('open');
        overlay.classList.remove('show');
    } else {
        drawer.classList.add('open');
        overlay.classList.add('show');
    }
}
export function closeLeftDrawer() {
    if (els['left-drawer']) els['left-drawer'].classList.remove('open');
    if (els['drawer-overlay']) els['drawer-overlay'].classList.remove('show');
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
    ['state-loading','state-empty','state-error','state-reconnecting'].forEach(s => { if (els[s]) els[s].classList.remove('show'); });
    if (els[id]) els[id].classList.add('show');
}
export function showLoading() { showState('state-loading'); }
export function showEmpty() { showState('state-empty'); }
export function showError() { showState('state-error'); }
export function showReconnecting() { showState('state-reconnecting'); }
export function hideAllStates() {
    ['state-loading','state-empty','state-error','state-reconnecting'].forEach(s => { if (els[s]) els[s].classList.remove('show'); });
}

// ---- Existing UI functions (unchanged) ----
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
export function updateThinkingIndicator(thinking) {}
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
    ['Q','R','B','N'].forEach(t => {
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
export function showLoginGate() {}

// Keep the panel helpers that main.js expects
export function showPanel(panelId) { const p = document.getElementById(panelId); if (p) p.classList.add('show'); }
export function hideAllPanels() {
    ['online-menu','public-menu','private-menu','join-private','countdown-panel','waiting-panel','rematch-panel',
     'login-gate-panel','ai-diff-panel','ai-color-panel','ai-countdown-panel',
     'exit-choice-panel','restore-choice-panel','cloud-choice-panel','delete-confirm-panel','exit-online-panel']
    .forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('show'); });
}
export function showWaitingRoom() {}
export function showCountdown() {}
export function showRematchUI() {}
export function showExitChoicePanel() { if (els['exit-choice-panel']) els['exit-choice-panel'].classList.add('show'); }
export function hideExitChoicePanel() { if (els['exit-choice-panel']) els['exit-choice-panel'].classList.remove('show'); }
export function showExitOnlinePanel() { if (els['exit-online-panel']) els['exit-online-panel'].classList.add('show'); }
export function hideExitOnlinePanel() { if (els['exit-online-panel']) els['exit-online-panel'].classList.remove('show'); }
export function setRejoinButtonsVisibility() {}