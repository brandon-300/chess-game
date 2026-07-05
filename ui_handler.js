// ui_handler.js — DIAGNOSTIC ONLY

let callbacks = {};

export function initUI(cb) {
    callbacks = cb;
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn && btn.id) {
            alert('Clicked: ' + btn.id);
        }
    });
    if (document.getElementById('debug-overlay')) {
        document.getElementById('debug-overlay').textContent = 'UI loaded – click any button';
    }
}

// Stub all other exports that main.js might call
export function showMenu() {}
export function showGameUI() {}
export function hideGameUI() {}
export function updateHeaderUI() {}
export function updateTurnIndicator() {}
export function updateTimers() {}
export function setOnlineBottomButtons() {}
export function showGameOver() {}
export function showPromotion() {}
export function toast(msg) { alert(msg); }
export function getPrivateRoomCode() { return ''; }
export function updateDebug() {}
export function showLoginGate() {}
export function showPanel() {}
export function hideAllPanels() {}
export function showWaitingRoom() {}
export function showCountdown() {}
export function showRematchUI() {}
export function showExitChoicePanel() {}
export function showExitOnlinePanel() {}
export function hideExitOnlinePanel() {}
export function hideExitChoicePanel() {}
export function setRejoinButtonsVisibility() {}
export function setVoiceControlsVisibility() {}
export function setMicState() {}
export function setSpeakerState() {}
export function setOpponentTalking() {}
export function resetVoiceState() {}
export function showLoading() {}
export function showEmpty() {}
export function showError() {}
export function showReconnecting() {}
export function hideAllStates() {}
export function appendMoveToDrawer() {}
export function showLobbyPanel() {}
export function hideLobbyPanel() {}
export function showRematchInLobby() {}
export function toggleLeftDrawer() {}
export function closeLeftDrawer() {}
export function updateThinkingIndicator() {}
export function hideGameOver() {}