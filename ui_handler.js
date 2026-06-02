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
    els.debugOverlay.textContent = 'Loading...';
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
    ids.forEach(id => { els[id] = document.getElementById(id); });
    // Also cache some querySelector results
    els['tmrW_name'] = els.tmrW.querySelector('.tn');
    els['tmrB_name'] = els.tmrB.querySelector('.tn');
}

function attachListeners() {
    // Mode selection cards
    els['card-2p'].addEventListener('click', () => callbacks.onStart2P());
    els['card-ai'].addEventListener('click', () => callbacks.onStartAI());
    els['card-online'].addEventListener('click', () => callbacks.onOnlineMenu());

    // Online menus
    const btn = (id, handler) => els[id]?.addEventListener('click', handler);
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
    btn('btn-go-login', () => window.location.href = 'user_login.html');
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
    btn('btn-delete-all-synced', () => els['delete-confirm-panel'].classList.add('show'));
    btn('btn-delete-confirm', () => { els['delete-confirm-panel'].classList.remove('show'); callbacks.onDeleteSynced(); });
    btn('btn-delete-cancel', () => els['delete-confirm-panel'].classList.remove('show'));

    // Exit choice (offline)
    btn('btn-exit-save', () => callbacks.onExitSave());
    btn('btn-exit-no-save', () => callbacks.onExitWithoutSave());
    btn('btn-exit-cancel', () => els['exit-choice-panel'].classList.remove('show'));

    // Exit online confirmation
    btn('btn-exit-online-yes', () => callbacks.onExitOnline());
    btn('btn-exit-online-stay', () => els['exit-online-panel'].classList.remove('show'));

    // In‑game buttons (bottom bar)
    els['new-game-btn'].addEventListener('click', () => callbacks.onNewGame());
    els['undo-btn'].addEventListener('click', () => callbacks.onUndo());
    els['mode-btn'].addEventListener('click', () => callbacks.onModeBtn());

    // Chat toggle
    els['chat-toggle-btn'].addEventListener('click', () => callbacks.onToggleChat());
    els['btn-send-chat'].addEventListener('click', () => {
        const msg = els['chat-input'].value.trim();
        if (msg) {
            callbacks.onSendChat(msg);
            els['chat-input'].value = '';
        }
    });

    // Restore choice panels
    btn('btn-restore-ai', () => { els['restore-choice-panel'].classList.remove('show'); callbacks.onRestoreAI?.(); });
    btn('btn-restore-2p', () => { els['restore-choice-panel'].classList.remove('show'); callbacks.onRestore2P?.(); });
    btn('btn-restore-cancel', () => els['restore-choice-panel'].classList.remove('show'));
    btn('btn-cloud-restore-ai', () => { els['cloud-choice-panel'].classList.remove('show'); callbacks.onCloudRestoreAI?.(); });
    btn('btn-cloud-restore-2p', () => { els['cloud-choice-panel'].classList.remove('show'); callbacks.onCloudRestore2P?.(); });
    btn('btn-cloud-restore-cancel', () => els['cloud-choice-panel'].classList.remove('show'));

    // Header login/profile buttons
    els['login-btn'].addEventListener('click', () => window.location.href = 'user_login.html');
    els['profile-btn'].addEventListener('click', () => window.location.href = 'profile.html');
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
    els['ms'].style.display = 'flex';
    els['gu'].style.display = 'none';
    els['main-cards'].style.display = 'flex';
    els['original-buttons'].style.display = '';
    hideAllPanels();
}

export function showGameUI() {
    els['ms'].style.display = 'none';
    els['gu'].style.display = 'block';
}

export function hideGameUI() {
    els['gu'].style.display = 'none';
    els['chat-box'].classList.remove('show');
}

export function hideGameOver() {
    els['go'].classList.remove('on');
}

// ---------- Header UI ----------
export function updateHeaderUI(userId) {
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
    els['smsg'].textContent = '';
}

export function updateTimers(w, b, activeTurn) {
    els['tvW'].textContent = fmtTime(w);
    els['tvB'].textContent = fmtTime(b);
    els['tmrW'].className = 'tmr' + (activeTurn === 'w' ? ' active' : '') + (w <= 10 && activeTurn === 'w' ? ' low' : '');
    els['tmrB'].className = 'tmr' + (activeTurn === 'b' ? ' active' : '') + (b <= 10 && activeTurn === 'b' ? ' low' : '');
}

export function updateThinkingIndicator(thinking) {
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
    els['waiting-title'].textContent = hostNickname + ' room';
    els['waiting-text'].innerHTML = 'Room ID: <b>' + roomCode + '</b><br>Waiting for opponent to join…';
    showPanel('waiting-panel');
}

let countdownInterval = null;
export function showCountdown(hostNickname, roomCode) {
    hideAllPanels();
    els['countdown-welcome'].textContent = 'Welcome to ' + hostNickname + ' room – Room ID: ' + roomCode;
    showPanel('countdown-panel');
    let sec = 5;
    els['countdown-number'].textContent = sec;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        sec--;
        if (sec <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            hideAllPanels();
            callbacks.onCountdownFinished?.();
        } else {
            els['countdown-number'].textContent = sec;
        }
    }, 1000);
}

function startAiCountdown() {
    hideAllPanels();
    showPanel('ai-countdown-panel');
    let sec = 5;
    els['ai-countdown-number'].textContent = sec;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        sec--;
        if (sec <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            hideAllPanels();
            callbacks.onStartAI?.(); // main.js will call engine.startGame('ai')
        } else {
            els['ai-countdown-number'].textContent = sec;
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
    els['got'].textContent = title;
    els['gos'].textContent = subtitle;
    els['go-btns'].innerHTML = buttonsHTML;
    els['go'].classList.add('on');
}

// ---------- Promotion popup ----------
export function showPromotion(color) {
    const po = els['po'];
    po.innerHTML = '';
    const pieces = ['Q', 'R', 'B', 'N'];
    pieces.forEach(t => {
        const btn = document.createElement('div');
        btn.className = 'po-b';
        btn.textContent = color + t; // simplistic display; could use glyphs
        btn.addEventListener('click', () => {
            els['pm'].classList.remove('on');
            engine.completePromotion(t);
        });
        po.appendChild(btn);
    });
    els['pm'].classList.add('on');
}

// ---------- Chat ----------
export function toggleChat() {
    els['chat-box'].classList.toggle('show');
}

export function displayChatMessages(messages) {
    const box = els['chat-messages'];
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
    const div = document.createElement('div');
    div.innerHTML = `<b>${nickname}:</b> ${msg}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// ---------- Toast ----------
export function toast(msg, duration = 2800) {
    const el = els['toast'];
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ---------- Exit & restore panels ----------
export function showExitChoicePanel() { els['exit-choice-panel'].classList.add('show'); }
export function hideExitChoicePanel() { els['exit-choice-panel'].classList.remove('show'); }
export function showRestoreChoicePanel() { els['restore-choice-panel'].classList.add('show'); }
export function showCloudChoicePanel() { els['cloud-choice-panel'].classList.add('show'); }
export function showExitOnlinePanel() { els['exit-online-panel'].classList.add('show'); }
export function hideExitOnlinePanel() { els['exit-online-panel'].classList.remove('show'); }

// ---------- Rematch ----------
export function showRematchUI(text, onAccept, onDecline) {
    els['rematch-text'].textContent = text;
    els['rematch-panel'].classList.add('show');
}

// ---------- Login gate ----------
export function showLoginGate() {
    hideAllPanels();
    els['main-cards'].style.display = 'none';
    els['original-buttons'].style.display = 'none';
    els['login-gate-panel'].classList.add('show');
}

// ---------- Utility ----------
function fmtTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + s.toString().padStart(2, '0');
}

export function getPrivateRoomCode() {
    return els['private-room-code'].value.trim();
}

export function updateDebug(text) {
    els['debug-overlay'].textContent = text;
}