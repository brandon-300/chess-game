// ui_handler.js — DIAGNOSTIC VERSION (logs toast calls)

import * as engine from './game_engine.js';

let els = {};
let callbacks = {};
let toastTimer = null;
let chatNotificationTimer = null;
let isChatOpen = false;

let knownMessageIds = new Set();
let notifiedMessageIds = new Set();

function screenLog(msg) {
    const log = document.getElementById('error-log');
    if (log) { log.style.display = 'block'; log.textContent += msg + '\n'; }
}

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

// ... rest of ui_handler.js unchanged, EXCEPT the toast function ...

export function toast(msg, duration = 2800) {
    screenLog('TOAST: ' + msg);
    const el = els['toast'];
    if (!el) { screenLog('TOAST FAIL: #toast element not found'); return; }
    el.textContent = msg;
    el.classList.add('show');
    screenLog('TOAST: classList now ' + el.className);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.classList.remove('show');
        screenLog('TOAST: hidden');
    }, duration);
}