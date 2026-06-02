// ui_handler.js — All DOM manipulation and event wiring for Chess 3D

import * as engine from './game_engine.js';

// ---------- DOM element references (cached at init) ----------
let els = {};

// Callbacks object filled by main.js
let callbacks = {};

// Toast timer
let toastTimer = null;

// ---------- Public API ----------
export function initUI(cb) {
    callbacks = cb;

    // Cache all DOM elements
    cacheElements();

    // Attach all event listeners
    attachListeners();

    // Initial UI state
    updateHeaderUI(null);
    if (els.debugOverlay) els.debugOverlay.textContent = 'Loading...';
}

function cacheElements() {
    const ids = [
        'login-btn', 'profile-btn', 'debug-overlay', 'error-log',
        'ms', 'main-cards', 'original-buttons',
        'card-2p', 'card-ai', 'card-online',
        'online-menu', 'public-menu', 'private-menu', 'join-private',
        'countdown-panel', 'waiting-panel', 'rematch-panel',
        'login-gate-panel', 'ai-diff-panel', 'ai-color-panel', 'ai-countdown-panel',
        'gu', 'top', 'bot',
        'tdot', 'tlbl', 'smsg',
        'tmrW', 'tmrB', 'tvW', 'tvB',
        'thkstrip', 'chat-toggle-btn', 'chat-box', 'chat-messages', 'chat-input', 'btn-send-chat',
        'go', 'got', 'gos', 'go-btns',
        'pm', 'po',
        'toast',
        'exit-choice-panel', 'restore-choice-panel', 'cloud-choice-panel',
        'delete-confirm-panel', 'exit-online-panel',
        'new-game-btn', 'undo-btn', 'mode-btn',
        'private-room-code',
        'countdown-welcome', 'countdown-number',
        'waiting-title', 'waiting-text',
        'rematch-text', 'rematch-accept', 'rematch-decline',
    ];
    ids.forEach(id => {
        els[id] = document.getElementById(id);
    });
    // Additional querySelector results
    if (els.tmrW) els['tmrW_name'] = els.tmrW.querySelector('.tn');
    if (els.tmrB) els['tmrB_name'] = els.tmrB.querySelector('.tn');
}

function attachListeners() {
    // Helper to safely attach a listener if element exists
    const btn = (id, handler) => {
        const el = els[id];
        if (el) el.addEventListener('click', handler);
    };

    // Mode selection cards
    btn('card-2p', () => callbacks.onStart2P());
    btn('card-ai', () => callbacks.onStartAI());
    btn('card-online', () => callbacks.onOnlineMenu());

    // Online menus
    btn('btn-public-menu', () => { hideAllPanels(); showPanel('public-menu'); });
    btn('btn-private-menu', () => { hideAllPanels(); showPanel('private-menu'); });
    btn('btn-online-back', () => { hideAllPanels(); showMenu(); });
    btn('btn-create-public', () => callbacks.onCreatePublicRoom());
    btn('btn-join-public', () => callbacks.onJoinPublicRoom());
    btn('btn-public-back', () => { hideAllPanels(); showPanel('online-menu'); });
    btn('btn-show-create-private', () => callbacks.onCreatePrivateRoom());
    btn('btn-show-join-private', () => { hideAllPanels(); showPanel('join-private'); });
    btn('btn-private-back', () => { hideAllPanels(); showPanel('online-menu'); });
    btn('btn-join-private', () => callbacks.onJoinPrivateRoom());
    btn('btn-join-private-back', () => { hideAllPanels(); showPanel('private-menu'); });
    btn('btn-cancel-waiting', () => callbacks.onCancelWaiting ? callbacks.onCancelWaiting() : null);
    btn('btn-rematch-accept', () => callbacks.onAcceptRematch());
    btn('btn-rematch-decline', () => callbacks.onDeclineRematch());

    // Login gate
    btn('btn-go-login', () => { window.location.href = 'user_login.html'; });
    btn('btn-login-gate-back', () => { hideAllPanels(); showMenu(); });

    // AI panels
    btn('btn-ai-novice', () => { engine.setAiDepth(1); hideAllPanels(); showPanel('ai-color-panel'); });
    btn('btn-ai-knight', () => { engine.setAiDepth(3); hideAllPanels(); showPanel('ai-color-panel'); });
    btn('btn-ai-master', () => { engine.setAiDepth(4); hideAllPanels(); showPanel('ai-color-panel'); });
    btn('btn-ai-diff-back', () => { hideAllPanels(); showMenu(); });
    btn('btn-ai-red', () => { engine.setPlayerColor('w'); startAiCountdown(); });
    btn('btn-ai-black', () => { engine.setPlayerColor('b'); startAiCountdown(); });
    btn('btn-ai-color-back', () => { hideAllPanels(); showPanel('ai-diff-panel'); });
    btn('btn-cancel-ai-countdown', cancelAiCountdown);

    // Cloud sync / offline buttons
    btn('btn-restore-local', () => callbacks.onRestoreLocal());
    btn('btn-sync-offline-cloud', () => callbacks.onSyncOfflineCloud());
    btn('btn-restore-offline-cloud', () => callbacks.onRestoreOfflineCloud());
    btn('btn-delete-all-synced', () => {
        if (!callbacks.onDeleteSynced) return;
        // check if logged in? main.js will handle, but we open confirm dialog directly
        els['delete-confirm-panel']?.classList.add('show');
    });
    btn('btn-delete-confirm', () => {
        els['delete-confirm-panel']?.classList.remove('show');
        callbacks.onDeleteSynced();
    });
    btn('btn-delete-cancel', () => els['delete-confirm-panel']?.classList.remove('show'));

    // Exit choice (offline)
    btn('btn-exit-save', () => callbacks.onExitSave());
    btn('btn-exit-no-save', () => callbacks.onExitWithoutSave());
    btn('btn-exit-cancel', () => els['exit-choice-panel']?.classList.remove('show'));

    // Exit online confirmation
    btn('btn-exit-online-yes', () => callbacks.onExitOnline());
    btn('btn-exit-online-stay', () => els['exit-online-panel']?.classList.remove('show'));

    // In‑game buttons (bottom bar)
    btn('new-game-btn', () => callbacks.onNewGame());
    btn('undo-btn', () => callbacks.onUndo());
    btn('mode-btn', () => callbacks.onModeBtn());

    // Chat toggle and send
    btn('chat-toggle-btn', () => callbacks.onToggleChat());
    btn('btn-send-chat', () => {
        const input = els['chat-input'];
        if (!input) return;
        const msg = input.value.trim();
        if (msg) {
            callbacks.onSendChat(msg);
            input.value = '';
        }
    });

    // Restore choice panels
    btn('btn-restore-ai', () => {
        els['restore-choice-panel']?.classList.remove('show');
        if (callbacks.onRestoreAI) callbacks.onRestoreAI();
    });
    btn('btn-restore-2p', () => {
        els['restore-choice-panel']?.classList.remove('show');
        if (callbacks.onRestore2P) callbacks.onRestore2P();
    });
    btn('btn-restore-cancel', () => els['restore-choice-panel']?.classList.remove('show'));
    btn('btn-cloud-restore-ai', () => {
        els['cloud-choice-panel']?.classList.remove('show');
        if (callbacks.onCloudRestoreAI) callbacks.onCloudRestoreAI();
    });
    btn('btn-cloud-restore-2p', () => {
        els['cloud-choice-panel']?.classList.remove('show');
        if (callbacks.onCloudRestore2P) callbacks.onCloudRestore2P();
    });
    btn('btn-cloud-restore-cancel', () => els['cloud-choice-panel']?.classList.remove('show'));

    // Header login/profile buttons
    if (els['login-btn']) els['login-btn'].addEventListener('click', () => { window.location.href = 'user_login.html'; });
    if (els['profile-btn']) els['profile-btn'].addEventListener('click', () => { window.location.href = 'profile.html'; });
}

// ---------- Panel helpers ----------
export function showPanel(panelId) {
    hideAllPanels();
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('show');
}

export function hideAllPanels() {
    const panelIds = [
        'online-menu', 'public-menu', 'private-menu', 'join-private',
        'countdown-panel', 'waiting-panel', 'rematch-panel',
        'login-gate-panel', 'ai-diff-panel', 'ai-color-panel', 'ai-countdown-panel',
        'exit-choice-panel', 'restore-choice-panel', 'cloud-choice-panel',
        'delete-confirm-panel', 'exit-online-panel'
    ];
    panelIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('show');
    });
}

export function showMenu() {
    if (els['ms']) els['ms'].style.display = 'flex';
    if (els['gu']) els['gu'].style.display = 'none';
    if (els['main-cards']) els['main-cards'].style.display = 'flex';
    if (els['original-buttons']) els['original-buttons'].style.display = '';
    hideAllPanels();
}

export function showGameUI() {
    if (els['ms']) els['ms'].style.display = 'none';
    if (els['gu']) els['gu'].style.display = 'block';
}

export function hideGameUI() {
    if (els['gu']) els['gu'].style.display = 'none';
    if (els['chat-box']) els['chat-box'].classList.remove('show');
}

export function hideGameOver() {
    if (els['go']) els['go'].classList.remove('on');
}

// ---------- Header UI ----------
export function updateHeaderUI(userId) {
    if (!els['login-btn'] || !els['profile-btn']) return;
    if (userId) {
        els['login-btn'].style.display = 'none';
        els['profile-btn'].style.display = 'inline-block';
    } else {
        els['login-btn'].style.display = 'inline-block';
        els['profile-btn'].style.display = 'none';
    }
}

// ---------- Turn indicator ----------
export function updateTurnIndicator(turn, myColor, isOnline) {
    if (!els['tdot'] || !els['tlbl'] || !els['tmrW_name'] || !els['tmrB_name']) return;
    els['tdot'].className = 'tdot ' + (turn === 'w' ? 'w' : 'b');
    if (isOnline) {
        els['tlbl'].textContent = turn === 'w'
            ? (myColor === 'w' ? 'Red (Your turn)' : 'Red (Opponent\'s turn)')
            : (myColor === 'b' ? 'Black (Your turn)' : 'Black (Opponent\'s turn)');
        els['tmrW_name'].textContent = myColor === 'w' ? 'Red (Your turn)' : 'Red (Opponent\'s turn)';
        els['tmrB_name'].textContent = myColor === 'b' ? 'Black (Your turn)' : 'Black (Opponent\'s turn)';
    } else {
        els['tlbl'].textContent = turn === 'w' ? 'Red' : 'Black';
        els['tmrW_name'].textContent = 'Red';
        els['tmrB_name'].textContent = 'Black';
    }
    if (els['smsg']) els['smsg'].textContent = '';
}

export function updateTimers(w, b, activeTurn) {
    if (!els['tvW'] || !els['tvB'] || !els['tmrW'] || !els['tmrB']) return;
    els['tvW'].textContent = fmtTime(w);
    els['tvB'].textContent = fmtTime(b);
    els['tmrW'].className = 'tmr' + (activeTurn === 'w' ? ' active' : '') + (w <= 10 && activeTurn === 'w' ? ' low' : '');
    els['tmrB'].className = 'tmr' + (activeTurn === 'b' ? ' active' : '') + (b <= 10 && activeTurn === 'b' ? ' low' : '');
}

export function updateThinkingIndicator(thinking) {
    if (!els['smsg'] || !els['thkstrip']) return;
    els['smsg'].textContent = thinking ? 'Thinking…' : '';
    if (thinking) {
        els['thkstrip'].classList.add('on');
    } else {
        els['thkstrip'].classList.remove('on');
    }
}

// ---------- Online waiting / countdown ----------
export function showWaitingRoom(hostNickname, roomCode) {
    hideAllPanels();
    if (els['waiting-title']) els['waiting-title'].textContent = hostNickname + ' room';
    if (els['waiting-text']) els['waiting-text'].innerHTML = 'Room ID: <b>' + roomCode + '</b><br>Waiting for opponent to join…';
    showPanel('waiting-panel');
}

let countdownInterval = null;
export function showCountdown(hostNickname, roomCode) {
    hideAllPanels();
    if (els['countdown-welcome']) els['countdown-welcome'].textContent = 'Welcome to ' + hostNickname + ' room – Room ID: ' + roomCode;
    showPanel('countdown-panel');
    let sec = 5;
    if (els['countdown-number']) els['countdown-number'].textContent = sec;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        sec--;
        if (sec <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            hideAllPanels();
            if (callbacks.onCountdownFinished) callbacks.onCountdownFinished();
        } else {
            if (els['countdown-number']) els['countdown-number'].textContent = sec;
        }
    }, 1000);
}

function startAiCountdown() {
    hideAllPanels();
    showPanel('ai-countdown-panel');
    let sec = 5;
    if (els['ai-countdown-number']) els['ai-countdown-number'] = sec;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        sec--;
        if (sec <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            hideAllPanels();
            if (callbacks.onAiCountdownFinished) callbacks.onAiCountdownFinished();
        } else {
            const numEl = document.getElementById('ai-countdown-number');
            if (numEl) numEl.textContent = sec;
        }
    }, 1000);
}

function cancelAiCountdown() {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    hideAllPanels();
    showMenu();
}

// ---------- Game over popup ----------
export function showGameOver(title, subtitle, buttonsHTML) {
    if (els['got']) els['got'].textContent = title;
    if (els['gos']) els['gos'].textContent = subtitle;
    if (els['go-btns']) els['go-btns'].innerHTML = buttonsHTML;
    if (els['go']) els['go'].classList.add('on');
}

// ---------- Promotion popup ----------
export function showPromotion(color) {
    const po = els['po'];
    if (!po) return;
    po.innerHTML = '';
    const pieces = ['Q', 'R', 'B', 'N'];
    pieces.forEach(t => {
        const btn = document.createElement('div');
        btn.className = 'po-b';
        btn.textContent = color === 'w' ? '♕♖♗♘'[pieces.indexOf(t)] : '♛♜♝♞'[pieces.indexOf(t)]; // rough glyph
        // Better to use GLS from engine, but we simplify by showing piece letter
        // Actually we can use color + t for simplicity: e.g., "wQ"
        btn.textContent = (color === 'w' ? '♕♖♗♘' : '♛♜♝♞')[pieces.indexOf(t)];
        btn.addEventListener('click', () => {
            if (els['pm']) els['pm'].classList.remove('on');
            engine.completePromotion(t);
        });
        po.appendChild(btn);
    });
    if (els['pm']) els['pm'].classList.add('on');
}

// ---------- Chat ----------
export function toggleChat() {
    if (els['chat-box']) els['chat-box'].classList.toggle('show');
}

export function displayChatMessages(messages) {
    const box = els['chat-messages'];
    if (!box) return;
    box.innerHTML = '';
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.innerHTML = `<b>${msg.nickname}:</b> ${msg.message}`;
        box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
}

export function appendChatMessage(nickname, msg) {
    const box = els['chat-messages'];
    if (!box) return;
    const div = document.createElement('div');
    div.innerHTML = `<b>${nickname}:</b> ${msg}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// ---------- Toast ----------
export function toast(msg, duration = 2800) {
    const el = els['toast'];
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ---------- Exit & restore panels ----------
export function showExitChoicePanel() { els['exit-choice-panel']?.classList.add('show'); }
export function hideExitChoicePanel() { els['exit-choice-panel']?.classList.remove('show'); }
export function showRestoreChoicePanel() { els['restore-choice-panel']?.classList.add('show'); }
export function showCloudChoicePanel() { els['cloud-choice-panel']?.classList.add('show'); }
export function showExitOnlinePanel() { els['exit-online-panel']?.classList.add('show'); }
export function hideExitOnlinePanel() { els['exit-online-panel']?.classList.remove('show'); }

// ---------- Rematch ----------
export function showRematchUI(text, onAccept, onDecline) {
    if (els['rematch-text']) els['rematch-text'].textContent = text;
    if (els['rematch-panel']) els['rematch-panel'].classList.add('show');
}

// ---------- Login gate ----------
export function showLoginGate() {
    hideAllPanels();
    if (els['main-cards']) els['main-cards'].style.display = 'none';
    if (els['original-buttons']) els['original-buttons'].style.display = 'none';
    if (els['login-gate-panel']) els['login-gate-panel'].classList.add('show');
}

// ---------- Utility ----------
function fmtTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + s.toString().padStart(2, '0');
}

export function getPrivateRoomCode() {
    return els['private-room-code'] ? els['private-room-code'].value.trim() : '';
}

export function updateDebug(text) {
    if (els['debug-overlay']) els['debug-overlay'].textContent = text;
}