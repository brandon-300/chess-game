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

    // Initial UI state – header will be set by main.js after init
    if (els.debugOverlay) els.debugOverlay.textContent = 'Loading...';

    // Hide chat by default (will be shown only for online games)
    setChatVisibility(false);
}

function cacheElements() {
    const ids = [
        // Header
        'login-btn', 'profile-avatar', 'profile-avatar-img', 'debug-overlay', 'error-log',

        // Main menu
        'ms', 'main-cards', 'original-buttons',
        'card-2p', 'card-ai', 'card-online',

        // Online panels
        'online-menu', 'public-menu', 'private-menu', 'join-private',
        'countdown-panel', 'waiting-panel', 'rematch-panel',
        'login-gate-panel',

        // AI panels
        'ai-diff-panel', 'ai-color-panel', 'ai-countdown-panel',

        // In-game UI
        'gu', 'top', 'bot',
        'tdot', 'tlbl', 'smsg',
        'tmrW', 'tmrB', 'tvW', 'tvB',
        'thkstrip', 'chat-toggle-btn', 'chat-box', 'chat-messages', 'chat-input', 'btn-send-chat',

        // Game over / promotion
        'go', 'got', 'gos', 'go-btns',
        'pm', 'po',

        // Toast
        'toast',

        // Exit & restore & cloud panels
        'exit-choice-panel', 'restore-choice-panel', 'cloud-choice-panel',
        'delete-confirm-panel', 'exit-online-panel',

        // Bottom bar buttons
        'new-game-btn', 'undo-btn', 'mode-btn',

        // Online join input
        'private-room-code',

        // Countdown / waiting
        'countdown-welcome', 'countdown-number',
        'waiting-title', 'waiting-text',
        'rematch-text', 'rematch-accept', 'rematch-decline',

        // ---- All button IDs ----
        'btn-public-menu', 'btn-private-menu', 'btn-online-back',
        'btn-create-public', 'btn-join-public', 'btn-public-back',
        'btn-show-create-private', 'btn-show-join-private', 'btn-private-back',
        'btn-join-private', 'btn-join-private-back',
        'btn-cancel-waiting',
        'btn-rematch-accept', 'btn-rematch-decline',

        'btn-go-login', 'btn-login-gate-back',

        'btn-ai-novice', 'btn-ai-knight', 'btn-ai-master', 'btn-ai-diff-back',
        'btn-ai-red', 'btn-ai-black', 'btn-ai-color-back',
        'btn-cancel-ai-countdown',

        'btn-restore-local', 'btn-sync-offline-cloud', 'btn-restore-offline-cloud',
        'btn-delete-all-synced',
        'btn-delete-confirm', 'btn-delete-cancel',

        'btn-exit-save', 'btn-exit-no-save', 'btn-exit-cancel',
        'btn-exit-online-yes', 'btn-exit-online-stay',

        'btn-restore-ai', 'btn-restore-2p', 'btn-restore-cancel',
        'btn-cloud-restore-ai', 'btn-cloud-restore-2p', 'btn-cloud-restore-cancel'
    ];

    ids.forEach(id => {
        els[id] = document.getElementById(id);
    });

    if (els.tmrW) els['tmrW_name'] = els.tmrW.querySelector('.tn');
    if (els.tmrB) els['tmrB_name'] = els.tmrB.querySelector('.tn');

    // Add click listener to the avatar (it's already in the DOM)
    if (els['profile-avatar']) {
        els['profile-avatar'].addEventListener('click', () => {
            window.location.href = 'profile.html';
        });
    }
}

function attachListeners() {
    const btn = (id, handler) => {
        const el = els[id];
        if (el) el.addEventListener('click', handler);
    };

    btn('card-2p', () => callbacks.onStart2P());
    btn('card-ai', () => callbacks.onStartAI());
    btn('card-online', () => callbacks.onOnlineMenu());

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

    btn('btn-go-login', () => { window.location.href = 'user_login.html'; });
    btn('btn-login-gate-back', () => { hideAllPanels(); showMenu(); });

    btn('btn-ai-novice', () => { engine.setAiDepth(1); hideAllPanels(); showPanel('ai-color-panel'); });
    btn('btn-ai-knight', () => { engine.setAiDepth(3); hideAllPanels(); showPanel('ai-color-panel'); });
    btn('btn-ai-master', () => { engine.setAiDepth(4); hideAllPanels(); showPanel('ai-color-panel'); });
    btn('btn-ai-diff-back', () => { hideAllPanels(); showMenu(); });
    btn('btn-ai-red', () => { engine.setPlayerColor('w'); startAiCountdown(); });
    btn('btn-ai-black', () => { engine.setPlayerColor('b'); startAiCountdown(); });
    btn('btn-ai-color-back', () => { hideAllPanels(); showPanel('ai-diff-panel'); });
    btn('btn-cancel-ai-countdown', cancelAiCountdown);

    btn('btn-restore-local', () => callbacks.onRestoreLocal());
    btn('btn-sync-offline-cloud', () => callbacks.onSyncOfflineCloud());
    btn('btn-restore-offline-cloud', () => callbacks.onRestoreOfflineCloud());
    btn('btn-delete-all-synced', () => {
        const panel = els['delete-confirm-panel'];
        if (panel) panel.classList.add('show');
    });
    btn('btn-delete-confirm', () => {
        const panel = els['delete-confirm-panel'];
        if (panel) panel.classList.remove('show');
        callbacks.onDeleteSynced();
    });
    btn('btn-delete-cancel', () => {
        const panel = els['delete-confirm-panel'];
        if (panel) panel.classList.remove('show');
    });

    btn('btn-exit-save', () => callbacks.onExitSave());
    btn('btn-exit-no-save', () => callbacks.onExitWithoutSave());
    btn('btn-exit-cancel', () => {
        const panel = els['exit-choice-panel'];
        if (panel) panel.classList.remove('show');
    });

    btn('btn-exit-online-yes', () => callbacks.onExitOnline());
    btn('btn-exit-online-stay', () => {
        const panel = els['exit-online-panel'];
        if (panel) panel.classList.remove('show');
    });

    btn('new-game-btn', () => callbacks.onNewGame());
    btn('undo-btn', () => callbacks.onUndo());
    btn('mode-btn', () => callbacks.onModeBtn());

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

    btn('btn-restore-ai', () => {
        const panel = els['restore-choice-panel'];
        if (panel) panel.classList.remove('show');
        if (callbacks.onRestoreAI) callbacks.onRestoreAI();
    });
    btn('btn-restore-2p', () => {
        const panel = els['restore-choice-panel'];
        if (panel) panel.classList.remove('show');
        if (callbacks.onRestore2P) callbacks.onRestore2P();
    });
    btn('btn-restore-cancel', () => {
        const panel = els['restore-choice-panel'];
        if (panel) panel.classList.remove('show');
    });
    btn('btn-cloud-restore-ai', () => {
        const panel = els['cloud-choice-panel'];
        if (panel) panel.classList.remove('show');
        if (callbacks.onCloudRestoreAI) callbacks.onCloudRestoreAI();
    });
    btn('btn-cloud-restore-2p', () => {
        const panel = els['cloud-choice-panel'];
        if (panel) panel.classList.remove('show');
        if (callbacks.onCloudRestore2P) callbacks.onCloudRestore2P();
    });
    btn('btn-cloud-restore-cancel', () => {
        const panel = els['cloud-choice-panel'];
        if (panel) panel.classList.remove('show');
    });

    // Header login button is already handled, avatar click already set in cacheElements
    if (els['login-btn']) els['login-btn'].addEventListener('click', () => { window.location.href = 'user_login.html'; });
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
export function updateHeaderUI(userId, avatarUrl) {
    if (!els['login-btn'] || !els['profile-avatar'] || !els['profile-avatar-img']) return;
    if (userId) {
        // Logged in – hide login button, show avatar
        els['login-btn'].style.display = 'none';
        els['profile-avatar'].style.display = 'block';
        if (avatarUrl) {
            els['profile-avatar-img'].src = avatarUrl;
        } else {
            // No avatar – show a fallback gold circle (CSS background will handle)
            els['profile-avatar-img'].src = '';
        }
    } else {
        // Logged out
        els['login-btn'].style.display = 'inline-block';
        els['profile-avatar'].style.display = 'none';
        els['profile-avatar-img'].src = '';
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

// ---------- Chat visibility ----------
export function setChatVisibility(visible) {
    const toggle = els['chat-toggle-btn']?.parentElement;
    const box = els['chat-box'];
    if (toggle) toggle.style.display = visible ? '' : 'none';
    if (box && !visible) box.classList.remove('show');
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
        const glyphs = {
            wQ: '\u2655', wR: '\u2656', wB: '\u2657', wN: '\u2658',
            bQ: '\u265B', bR: '\u265C', bB: '\u265D', bN: '\u265E'
        };
        btn.textContent = glyphs[color + t];
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