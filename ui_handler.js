// ui_handler.js — All DOM manipulation and event wiring for Chess 3D

import * as engine from './game_engine.js';

let els = {};
let callbacks = {};
let toastTimer = null;
let chatNotificationTimer = null;
let isChatOpen = false;

// ---- chat deduplication ----
let knownMessageIds = new Set();
let notifiedMessageIds = new Set();

export function initUI(cb) {
    callbacks = cb;
    cacheElements();
    attachListeners();
    if (els.debugOverlay) els.debugOverlay.textContent = 'Loading...';
    setChatVisibility(false);
}

function cacheElements() {
    const ids = [
        'login-btn', 'profile-avatar', 'profile-avatar-img', 'debug-overlay', 'error-log',
        'ms', 'main-cards', 'original-buttons',
        'card-2p', 'card-ai', 'card-online',
        'online-menu', 'public-menu', 'private-menu', 'join-private',
        'countdown-panel', 'waiting-panel', 'rematch-panel',
        'login-gate-panel',
        'ai-diff-panel', 'ai-color-panel', 'ai-countdown-panel',
        'gu', 'top', 'bot',
        'tdot', 'tlbl', 'smsg',
        'tmrW', 'tmrB', 'tvW', 'tvB',
        'thkstrip', 'chat-toggle-btn', 'chat-box', 'chat-messages', 'chat-input', 'btn-send-chat',
        'go', 'got', 'gos', 'go-btns',
        'pm', 'po', 'toast', 'chat-notification',
        'exit-choice-panel', 'restore-choice-panel', 'cloud-choice-panel',
        'delete-confirm-panel', 'exit-online-panel',
        'new-game-btn', 'undo-btn', 'mode-btn',
        'private-room-code',
        'countdown-welcome', 'countdown-number',
        'waiting-title', 'waiting-text',
        'rematch-text', 'rematch-accept', 'rematch-decline',
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
    ids.forEach(id => { els[id] = document.getElementById(id); });
    if (els.tmrW) els['tmrW_name'] = els.tmrW.querySelector('.tn');
    if (els.tmrB) els['tmrB_name'] = els.tmrB.querySelector('.tn');
    if (els['profile-avatar']) {
        els['profile-avatar'].addEventListener('click', () => { window.location.href = 'profile.html'; });
    }
}

function attachListeners() {
    const btn = (id, handler) => { const el = els[id]; if (el) el.addEventListener('click', handler); };

    btn('card-2p', () => callbacks.onStart2P());
    btn('card-ai', () => callbacks.onStartAI());
    btn('card-online', () => callbacks.onOnlineMenu());

    btn('btn-public-menu', () => { hideAllPanels(); showPanel('public-menu'); });
    btn('btn-private-menu', () => { hideAllPanels(); showPanel('private-menu'); });
    btn('btn-online-back', () => { hideAllPanels(); showMenu(); });
    btn('btn-create-public', () => callbacks.onCreatePublicRoom());
    btn('btn-join-public', () => callbacks.onJoinPublicRoom());
    btn('btn-rejoin-public', () => callbacks.onRejoinPublic());
    btn('btn-public-back', () => { hideAllPanels(); showPanel('online-menu'); });
    btn('btn-show-create-private', () => callbacks.onCreatePrivateRoom());
    btn('btn-show-join-private', () => { hideAllPanels(); showPanel('join-private'); });
    btn('btn-rejoin-private', () => { hideAllPanels(); showPanel('join-private'); });
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
    btn('btn-delete-all-synced', () => { if (els['delete-confirm-panel']) els['delete-confirm-panel'].classList.add('show'); });
    btn('btn-delete-confirm', () => { if (els['delete-confirm-panel']) els['delete-confirm-panel'].classList.remove('show'); callbacks.onDeleteSynced(); });
    btn('btn-delete-cancel', () => { if (els['delete-confirm-panel']) els['delete-confirm-panel'].classList.remove('show'); });

    btn('btn-exit-save', () => callbacks.onExitSave());
    btn('btn-exit-no-save', () => callbacks.onExitWithoutSave());
    btn('btn-exit-cancel', () => { if (els['exit-choice-panel']) els['exit-choice-panel'].classList.remove('show'); });

    btn('btn-exit-online-yes', () => callbacks.onExitOnlineYes());
    btn('btn-exit-online-stay', () => { if (els['exit-online-panel']) els['exit-online-panel'].classList.remove('show'); });

    btn('new-game-btn', () => callbacks.onNewGame());
    btn('undo-btn', () => callbacks.onUndo());
    btn('mode-btn', () => callbacks.onModeBtn());

    if (els['chat-toggle-btn']) els['chat-toggle-btn'].addEventListener('click', () => toggleChat());
    if (els['btn-send-chat']) els['btn-send-chat'].addEventListener('click', () => sendChatFromInput());
    if (els['chat-input']) els['chat-input'].addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatFromInput(); });

    btn('btn-restore-ai', () => { els['restore-choice-panel']?.classList.remove('show'); if (callbacks.onRestoreAI) callbacks.onRestoreAI(); });
    btn('btn-restore-2p', () => { els['restore-choice-panel']?.classList.remove('show'); if (callbacks.onRestore2P) callbacks.onRestore2P(); });
    btn('btn-restore-cancel', () => { els['restore-choice-panel']?.classList.remove('show'); });
    btn('btn-cloud-restore-ai', () => { els['cloud-choice-panel']?.classList.remove('show'); if (callbacks.onCloudRestoreAI) callbacks.onCloudRestoreAI(); });
    btn('btn-cloud-restore-2p', () => { els['cloud-choice-panel']?.classList.remove('show'); if (callbacks.onCloudRestore2P) callbacks.onCloudRestore2P(); });
    btn('btn-cloud-restore-cancel', () => { els['cloud-choice-panel']?.classList.remove('show'); });

    if (els['login-btn']) els['login-btn'].addEventListener('click', () => { window.location.href = 'user_login.html'; });
}

function sendChatFromInput() {
    const input = els['chat-input'];
    if (!input) return;
    const msg = input.value.trim();
    if (msg) {
        callbacks.onSendChat(msg);
        input.value = '';
    }
}

// ---------- Chat ----------
export function toggleChat() {
    isChatOpen = !isChatOpen;
    if (els['chat-box']) {
        els['chat-box'].classList.toggle('show', isChatOpen);
    }
}

export function showChatNotification(senderName) {
    const el = els['chat-notification'];
    if (!el) return;
    el.textContent = senderName + ' sent you a message';
    el.classList.add('show');
    clearTimeout(chatNotificationTimer);
    chatNotificationTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

/**
 * Called by polling every 2 seconds with the full message list.
 * Returns an array of message objects that were newly added to the chat.
 */
export function displayChatMessages(messages) {
    const box = els['chat-messages'];
    if (!box) return [];
    const newMessages = [];
    for (const msg of messages) {
        const id = Number(msg.id);
        if (isNaN(id)) continue;
        if (!knownMessageIds.has(id)) {
            knownMessageIds.add(id);
            appendChatMessage(msg.nickname, msg.message, false);
            newMessages.push(msg);
        }
    }
    if (newMessages.length > 0) {
        box.scrollTop = box.scrollHeight;
    }
    return newMessages;
}

export function appendChatMessage(nickname, msg, skipNotification = false) {
    const box = els['chat-messages'];
    if (!box) return;
    const div = document.createElement('div');
    div.innerHTML = `<b>${nickname}:</b> ${msg}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    // Notification is handled externally via maybeShowNotification
}

/** Call after a message is inserted by us – adds id to both known and notified sets */
export function registerOwnMessage(id) {
    const num = Number(id);
    if (!isNaN(num)) {
        knownMessageIds.add(num);
        notifiedMessageIds.add(num);
    }
}

/** Show a notification popup for message id if not already notified and chat is closed */
export function maybeShowNotification(id, nickname) {
    const num = Number(id);
    if (isNaN(num)) return;
    if (!notifiedMessageIds.has(num)) {
        notifiedMessageIds.add(num);
        if (!isChatOpen) showChatNotification(nickname);
    }
}

export function resetChatState() {
    knownMessageIds.clear();
    notifiedMessageIds.clear();
    if (els['chat-messages']) els['chat-messages'].innerHTML = '';
}

// ---------- Panel helpers ----------
export function showPanel(panelId) { hideAllPanels(); const p = document.getElementById(panelId); if (p) p.classList.add('show'); }
export function hideAllPanels() {
    ['online-menu','public-menu','private-menu','join-private','countdown-panel','waiting-panel','rematch-panel',
     'login-gate-panel','ai-diff-panel','ai-color-panel','ai-countdown-panel',
     'exit-choice-panel','restore-choice-panel','cloud-choice-panel','delete-confirm-panel','exit-online-panel']
    .forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('show'); });
}
export function showMenu() {
    if (els['ms']) els['ms'].style.display = 'flex';
    if (els['gu']) els['gu'].style.display = 'none';
    if (els['main-cards']) els['main-cards'].style.display = 'flex';
    if (els['original-buttons']) els['original-buttons'].style.display = '';
    setOnlineBottomButtons(false);
    hideAllPanels();
    isChatOpen = false;
    if (els['chat-box']) els['chat-box'].classList.remove('show');
}
export function showGameUI() { if (els['ms']) els['ms'].style.display = 'none'; if (els['gu']) els['gu'].style.display = 'block'; }
export function hideGameUI() {
    if (els['gu']) els['gu'].style.display = 'none';
    isChatOpen = false;
    if (els['chat-box']) els['chat-box'].classList.remove('show');
}
export function hideGameOver() { if (els['go']) els['go'].classList.remove('on'); }

export function updateHeaderUI(userId, avatarUrl) {
    if (!els['login-btn'] || !els['profile-avatar'] || !els['profile-avatar-img']) return;
    if (userId) {
        els['login-btn'].style.display = 'none';
        els['profile-avatar'].style.display = 'block';
        els['profile-avatar-img'].src = avatarUrl || '';
    } else {
        els['login-btn'].style.display = 'inline-block';
        els['profile-avatar'].style.display = 'none';
    }
}

export function updateTurnIndicator(turn, myColor, isOnline) {
    if (!els['tdot'] || !els['tlbl'] || !els['tmrW_name'] || !els['tmrB_name']) return;
    els['tdot'].className = 'tdot ' + (turn === 'w' ? 'w' : 'b');
    if (isOnline) {
        els['tlbl'].textContent = turn === 'w' ? (myColor === 'w' ? 'Red (Your turn)' : 'Red (Opponent\'s turn)') : (myColor === 'b' ? 'Black (Your turn)' : 'Black (Opponent\'s turn)');
        els['tmrW_name'].textContent = myColor === 'w' ? 'Red (Your turn)' : 'Red (Opponent\'s turn)';
        els['tmrB_name'].textContent = myColor === 'b' ? 'Black (Your turn)' : 'Black (Opponent\'s turn)';
    } else {
        els['tlbl'].textContent = turn === 'w' ? 'Red' : 'Black';
        els['tmrW_name'].textContent = 'Red'; els['tmrB_name'].textContent = 'Black';
    }
    if (els['smsg']) els['smsg'].textContent = '';
}

export function updateTimers(w, b, activeTurn) {
    if (!els['tvW'] || !els['tvB']) return;
    els['tvW'].textContent = fmtTime(w); els['tvB'].textContent = fmtTime(b);
    if (els['tmrW']) els['tmrW'].className = 'tmr' + (activeTurn === 'w' ? ' active' : '') + (w <= 10 && activeTurn === 'w' ? ' low' : '');
    if (els['tmrB']) els['tmrB'].className = 'tmr' + (activeTurn === 'b' ? ' active' : '') + (b <= 10 && activeTurn === 'b' ? ' low' : '');
}

export function updateThinkingIndicator(thinking) {
    if (!els['smsg'] || !els['thkstrip']) return;
    els['smsg'].textContent = thinking ? 'Thinking…' : '';
    if (thinking) els['thkstrip'].classList.add('on'); else els['thkstrip'].classList.remove('on');
}

export function setChatVisibility(visible) {
    const toggle = els['chat-toggle-btn']?.parentElement;
    if (toggle) toggle.style.display = visible ? '' : 'none';
    if (!visible) {
        isChatOpen = false;
        if (els['chat-box']) els['chat-box'].classList.remove('show');
        resetChatState();
    }
}

export function setOnlineBottomButtons(isOnline) {
    if (els['new-game-btn']) els['new-game-btn'].style.display = isOnline ? 'none' : '';
    if (els['undo-btn']) els['undo-btn'].style.display = isOnline ? 'none' : '';
    if (els['mode-btn']) els['mode-btn'].textContent = isOnline ? 'Leave Match' : 'Exit';
}

export function setRejoinButtonsVisibility(showPublic, showPrivate) {
    const pubBtn = document.getElementById('btn-rejoin-public');
    const privBtn = document.getElementById('btn-rejoin-private');
    if (!pubBtn) {
        const pubMenu = document.getElementById('public-menu');
        if (pubMenu) {
            const b = document.createElement('button'); b.className = 'db'; b.id = 'btn-rejoin-public'; b.textContent = 'Rejoin match';
            b.addEventListener('click', () => callbacks.onRejoinPublic()); pubMenu.appendChild(b);
        }
    }
    if (!privBtn) {
        const privMenu = document.getElementById('private-menu');
        if (privMenu) {
            const b = document.createElement('button'); b.className = 'db'; b.id = 'btn-rejoin-private'; b.textContent = 'Rejoin match';
            b.addEventListener('click', () => { hideAllPanels(); showPanel('join-private'); }); privMenu.appendChild(b);
        }
    }
    const pub = document.getElementById('btn-rejoin-public'); if (pub) pub.style.display = showPublic ? '' : 'none';
    const prv = document.getElementById('btn-rejoin-private'); if (prv) prv.style.display = showPrivate ? '' : 'none';
}

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
    let sec = 5; if (els['countdown-number']) els['countdown-number'].textContent = sec;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        sec--;
        if (sec <= 0) { clearInterval(countdownInterval); countdownInterval = null; hideAllPanels(); if (callbacks.onCountdownFinished) callbacks.onCountdownFinished(); }
        else { if (els['countdown-number']) els['countdown-number'].textContent = sec; }
    }, 1000);
}

function startAiCountdown() {
    hideAllPanels(); showPanel('ai-countdown-panel');
    let sec = 5; if (els['ai-countdown-number']) els['ai-countdown-number'] = sec;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        sec--;
        if (sec <= 0) { clearInterval(countdownInterval); countdownInterval = null; hideAllPanels(); if (callbacks.onAiCountdownFinished) callbacks.onAiCountdownFinished(); }
        else { const numEl = document.getElementById('ai-countdown-number'); if (numEl) numEl.textContent = sec; }
    }, 1000);
}

function cancelAiCountdown() { if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; } hideAllPanels(); showMenu(); }

export function showGameOver(title, subtitle, buttonsHTML) {
    if (els['got']) els['got'].textContent = title; if (els['gos']) els['gos'].textContent = subtitle;
    if (els['go-btns']) els['go-btns'].innerHTML = buttonsHTML; if (els['go']) els['go'].classList.add('on');
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
    const el = els['toast']; if (!el) return; el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

export function showExitChoicePanel() { els['exit-choice-panel']?.classList.add('show'); }
export function hideExitChoicePanel() { els['exit-choice-panel']?.classList.remove('show'); }
export function showRestoreChoicePanel() { els['restore-choice-panel']?.classList.add('show'); }
export function showCloudChoicePanel() { els['cloud-choice-panel']?.classList.add('show'); }
export function showExitOnlinePanel() { els['exit-online-panel']?.classList.add('show'); }
export function hideExitOnlinePanel() { els['exit-online-panel']?.classList.remove('show'); }
export function showRematchUI(text) { if (els['rematch-text']) els['rematch-text'].textContent = text; els['rematch-panel']?.classList.add('show'); }
export function showLoginGate() {
    hideAllPanels();
    if (els['main-cards']) els['main-cards'].style.display = 'none';
    if (els['original-buttons']) els['original-buttons'].style.display = 'none';
    if (els['login-gate-panel']) els['login-gate-panel'].classList.add('show');
}

function fmtTime(s) { const m = Math.floor(s/60), sec = Math.floor(s%60); return m + ':' + sec.toString().padStart(2,'0'); }
export function getPrivateRoomCode() { return els['private-room-code'] ? els['private-room-code'].value.trim() : ''; }
export function updateDebug(text) { if (els['debug-overlay']) els['debug-overlay'].textContent = text; }