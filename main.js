// main.js — Orchestrator for Chess 3D
// Requires config.js, database.js, game_engine.js, ui_handler.js

import * as db from './database.js';
import * as engine from './game_engine.js';
import * as ui from './ui_handler.js';

// ---------- Global state (orchestrator only) ----------
let gameMode = null;          // '2p', 'ai', or 'online'
let currentOnlineGame = null; // full game row from Supabase
let myColor = 'w';           // my assigned colour in online game
let sessionPlayerKey = null;
let started = false;
let over = false;
let currentUserId = null;
let authReady = false;

// Sync helpers
let moveSyncing = false;
let lastKnownServerState = null; // stringified board_state from last known server data
let pollInterval = null;
let chatPollInterval = null;
let rematchCountdownInterval = null;

// ---------- Debug & error logger ----------
window.addEventListener('error', e => {
    const log = document.getElementById('error-log');
    if (log) {
        log.style.display = 'block';
        log.textContent = (log.textContent || '') + e.message + ' (line ' + e.lineno + ')\n';
    }
});

function updateDebugOverlay() {
    const sbStatus = db.getSbStatus();
    const uid = currentUserId ? currentUserId.slice(0, 8) + '…' : 'not logged in';
    document.getElementById('debug-overlay').textContent = `Supabase: ${sbStatus}\nUser ID: ${uid}`;
}

// ---------- Initialization ----------
async function init() {
    // 1. Auth
    currentUserId = await db.initAuth();
    authReady = true;
    updateDebugOverlay();

    // 2. UI setup with full callback list
    ui.initUI({
        onStart2P: () => startOfflineGame('2p'),
        onStartAI: showAiDiffPanel,
        onOnlineMenu: showOnlineMenu,

        // Online rooms
        onCreatePublicRoom: createPublicRoom,
        onJoinPublicRoom: joinPublicRoom,
        onCreatePrivateRoom: createPrivateRoom,
        onJoinPrivateRoom: joinPrivateRoom,
        onCancelWaiting: cancelWaiting,

        // Countdown finished (online) — startOnlineGame defined separately
        onCountdownFinished: startOnlineGame,

        // AI countdown finished — start AI game after color/depth selection
        onAiCountdownFinished: startAiGame,

        // Rematch
        onAcceptRematch: acceptRematch,
        onDeclineRematch: declineRematch,

        // Chat
        onSendChat: (msg) => sendChat(msg),
        onToggleChat: () => ui.toggleChat(),

        // In-game actions
        onUndo: undoMove,
        onNewGame: newGame,
        onModeBtn: handleBottomRight,

        // Exit / offline / cloud
        onExitSave: exitWithSave,
        onExitNoSave: exitWithoutSave,
        onExitOnline: confirmExitOnline,
        onRestoreLocal: restoreLocalGame,
        onSyncOfflineCloud: () => syncOfflineToCloud(),
        onRestoreOfflineCloud: () => restoreOfflineFromCloud(),
        onDeleteSynced: deleteAllSyncedData,

        // Restore mode choices (local and cloud)
        onRestoreAI: () => restoreLocalMode('ai'),
        onRestore2P: () => restoreLocalMode('2p'),
        onCloudRestoreAI: () => restoreCloudMode('ai'),
        onCloudRestore2P: () => restoreCloudMode('2p'),
    });

    // 3. Init engine (Three.js scene + chess logic)
    engine.initEngine(document.getElementById('cv'), onLocalMoveExecuted);

    // 4. Auth state listener
    if (db.sb) {
        db.sb.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                currentUserId = session.user.id;
            } else {
                currentUserId = null;
            }
            updateDebugOverlay();
            ui.updateHeaderUI(currentUserId);
            if (!session && gameMode === 'online' && started) {
                ui.toast('Session expired. Exiting match.');
                exitOnlineGame();
            }
        });
    }

    // 5. Initial UI state
    ui.updateHeaderUI(currentUserId);
    ui.showMenu();
    updateDebugOverlay();
}

// ---------- Offline game flow ----------
function startOfflineGame(mode) {
    gameMode = mode;
    ui.hideAllPanels();
    ui.showGameUI();
    started = true;
    engine.startGame(mode);
    over = false;
    if (mode === 'ai' && engine.getPlayerColor() === 'b') {
        engine.scheduleAI(500);
    }
    startAutoSave();
}

function newGame() {
    if (gameMode === 'online') return;
    engine.newGame();
    over = false;
    ui.hideGameOver();
    if (gameMode === 'ai' && engine.getPlayerColor() === 'b') {
        engine.scheduleAI(500);
    }
    saveBackup();
}

function undoMove() {
    if (gameMode === 'online') return;
    engine.undoMove();
    saveBackup();
}

// ---------- AI flow ----------
function showAiDiffPanel() {
    ui.showPanel('ai-diff-panel');
}

// These functions are called by UI buttons via callbacks (wired in ui_handler)
window.aiSelectDiff = function(diff) {
    engine.setAiDepth(diff);
    ui.hideAllPanels();
    ui.showPanel('ai-color-panel');
};
window.aiSelectColor = function(col) {
    engine.setPlayerColor(col);
    ui.hideAllPanels();
    startAiCountdown();
};

function startAiCountdown() {
    ui.showPanel('ai-countdown-panel');
    let sec = 5;
    document.getElementById('ai-countdown-number').textContent = sec;
    let iv = setInterval(() => {
        sec--;
        if (sec <= 0) {
            clearInterval(iv);
            ui.hideAllPanels();
            startAiGame();
        } else {
            document.getElementById('ai-countdown-number').textContent = sec;
        }
    }, 1000);
}

function startAiGame() {
    startOfflineGame('ai');
}

// ---------- Online game flow ----------
async function showOnlineMenu() {
    if (!currentUserId) {
        ui.showLoginGate();
        return;
    }
    ui.showPanel('online-menu');
}

async function createPublicRoom() { await createRoom(null, 'public'); }
async function createPrivateRoom() { await createRoom(null, 'private'); }

async function createRoom(code, type) {
    if (!currentUserId) return;
    const username = await db.fetchUsername(currentUserId);
    if (!username) {
        ui.toast('Please set a username on your profile page.');
        return;
    }
    const hostKey = generatePlayerKey();
    try {
        const game = await db.createGame(code, type, currentUserId, hostKey, username);
        onlineGameCreated(game, hostKey);
    } catch (e) {
        ui.toast('Failed to create room: ' + e.message);
    }
}

async function joinPublicRoom() {
    if (!currentUserId) return;
    const username = await db.fetchUsername(currentUserId);
    if (!username) {
        ui.toast('Please set a username on your profile page.');
        return;
    }
    const joinerKey = generatePlayerKey();
    try {
        const game = await db.joinPublicGame(currentUserId, joinerKey, username);
        onlineGameJoined(game, joinerKey);
    } catch (e) {
        ui.toast('Join failed: ' + e.message);
    }
}

async function joinPrivateRoom() {
    if (!currentUserId) return;
    const username = await db.fetchUsername(currentUserId);
    if (!username) {
        ui.toast('Please set a username on your profile page.');
        return;
    }
    const code = ui.getPrivateRoomCode();
    if (!code) {
        ui.toast('Enter a room code.');
        return;
    }
    const joinerKey = generatePlayerKey();
    try {
        const game = await db.joinPrivateGame(code, currentUserId, joinerKey, username);
        onlineGameJoined(game, joinerKey);
    } catch (e) {
        ui.toast('Join failed: ' + e.message);
    }
}

function onlineGameCreated(game, hostKey) {
    currentOnlineGame = game;
    sessionPlayerKey = hostKey;
    sessionStorage.setItem('chess3d_playerkey_' + game.id, hostKey);
    ui.showWaitingRoom(game.host_nickname, game.room_code);
    startPolling(game.id);
}

function onlineGameJoined(game, joinerKey) {
    currentOnlineGame = game;
    sessionPlayerKey = joinerKey;
    sessionStorage.setItem('chess3d_playerkey_' + game.id, joinerKey);
    myColor = 'b'; // joiner is always Black
    ui.showCountdown(game.host_nickname, game.room_code);
    startPolling(game.id);
}

async function startOnlineGame() {
    if (!currentOnlineGame) return;
    if (currentOnlineGame.host_player_id === currentUserId) {
        await db.updateGameStatus(currentOnlineGame.id, 'active');
    }
    ui.hideAllPanels();
    ui.showGameUI();
    engine.setPlayerColor(myColor); // used for online? Actually engine uses myColor via setMyColor later.
    engine.setMyColor(myColor);
    engine.startGame('online');
    started = true;
    startOnlineGameLoop();
    startChatPolling(currentOnlineGame.id);
    engine.rotateForPlayer(myColor);
}

// ---------- Waiting cancellation ----------
async function cancelWaiting() {
    if (currentOnlineGame) {
        await db.cancelGame(currentOnlineGame.id);
        resetOnlineState();
        ui.showMenu();
    }
}

// ---------- Online sync loop (polling) ----------
function startOnlineGameLoop() {
    stopOnlineGameLoop();
    pollInterval = setInterval(pollGameState, 1000);
}

function stopOnlineGameLoop() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

async function pollGameState() {
    if (!currentOnlineGame || moveSyncing || over) return;
    try {
        const gameData = await db.fetchGameState(currentOnlineGame.id);
        if (!gameData) return;

        const serverState = JSON.stringify(gameData.board_state);
        if (serverState === lastKnownServerState) return;

        lastKnownServerState = serverState;
        engine.syncBoardFromServer(
            gameData.board_state.brd,
            gameData.board_state.turn,
            gameData.board_state.cas,
            gameData.board_state.ep,
            gameData.timer_w,
            gameData.timer_b
        );

        ui.updateTurnIndicator(engine.getTurn(), myColor, true);
        ui.updateTimers(engine.getTimerW(), engine.getTimerB(), engine.getTurn());

        // Handle game end / frozen states
        if (gameData.status === 'terminated' || gameData.status === 'finished' || gameData.status === 'frozen') {
            handleOnlineGameEnd(gameData);
        }
    } catch (e) {
        console.error('Polling error:', e);
    }
}

function handleOnlineGameEnd(gameData) {
    over = true;
    if (gameData.status === 'terminated') {
        ui.showGameOver('Game Over', 'The game has been terminated.', '<button onclick="window.location.reload()">Return to Menu</button>');
        resetOnlineState();
    } else if (gameData.status === 'finished') {
        const winner = gameData.winner === 'red' ? 'Red' : 'Black';
        ui.showGameOver(winner + ' Wins!', 'Checkmate or time out', `
            <button onclick="requestRematch()">Request Rematch</button>
            <button class="sec" onclick="exitOnlineGame()">Exit</button>
        `);
        startRematchCountdown();
    } else if (gameData.status === 'frozen') {
        ui.toast('Opponent left – waiting...');
        engine.pauseTimer(); // Stop local timer ticking
    }
}

// ---------- Chat polling ----------
function startChatPolling(gameId) {
    stopChatPolling();
    chatPollInterval = setInterval(async () => {
        try {
            const messages = await db.getChatMessages(gameId);
            ui.displayChatMessages(messages);
        } catch (e) {}
    }, 2000);
}

function stopChatPolling() {
    if (chatPollInterval) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
    }
}

function sendChat(msg) {
    if (!currentOnlineGame) return;
    const nickname = currentOnlineGame.host_player_id === currentUserId
        ? currentOnlineGame.host_nickname
        : currentOnlineGame.joiner_nickname;
    db.sendChatMessage(currentOnlineGame.id, currentUserId, nickname, msg);
    ui.appendChatMessage(nickname, msg);
}

// ---------- Move execution callback (called by engine) ----------
async function onLocalMoveExecuted(move) {
    if (gameMode !== 'online' || !currentOnlineGame || moveSyncing) return;
    moveSyncing = true;
    try {
        const savedState = await db.pushBoardState(
            currentOnlineGame.id,
            engine.getBoardArray(),
            engine.getTurn(),
            engine.getCastling(),
            engine.getEnPassant(),
            engine.getTimerW(),
            engine.getTimerB()
        );
        lastKnownServerState = savedState;
    } catch (e) {
        console.error('Failed to push move:', e);
        ui.toast('Move sync failed. Try again.');
    } finally {
        moveSyncing = false;
    }
}

// ---------- Rematch ----------
function startRematchCountdown() {
    if (rematchCountdownInterval) clearInterval(rematchCountdownInterval);
    let sec = 10;
    document.getElementById('gos').textContent = `Returning to menu in ${sec}…`;
    rematchCountdownInterval = setInterval(() => {
        sec--;
        if (sec <= 0) {
            clearInterval(rematchCountdownInterval);
            exitOnlineGame();
        } else {
            document.getElementById('gos').textContent = `Returning to menu in ${sec}…`;
        }
    }, 1000);
}

async function requestRematch() {
    if (!currentOnlineGame) return;
    clearInterval(rematchCountdownInterval);
    await db.sb.from('online_games').update({
        rematch_requested_by: currentUserId,
        rematch_requested_at: new Date()
    }).eq('id', currentOnlineGame.id);
    document.getElementById('gos').textContent = 'Rematch requested. Waiting for opponent…';
}

async function acceptRematch() {
    // implementation similar to original; simplified here
    // Will need to create a new game with swapped colors
    ui.toast('Rematch accepted.');
}

async function declineRematch() {
    await db.terminateGame(currentOnlineGame.id);
    resetOnlineState();
    ui.showMenu();
}

// ---------- Exit ----------
function confirmExitOnline() {
    ui.showExitOnlinePanel();
}

async function exitOnlineGame() {
    if (!currentOnlineGame) return;
    stopOnlineGameLoop();
    stopChatPolling();
    if (currentOnlineGame.host_player_id === currentUserId) {
        await db.terminateGame(currentOnlineGame.id);
    } else {
        await db.freezeGame(currentOnlineGame.id, currentUserId);
    }
    resetOnlineState();
    ui.showMenu();
}

function resetOnlineState() {
    stopOnlineGameLoop();
    stopChatPolling();
    if (currentOnlineGame) {
        sessionStorage.removeItem('chess3d_playerkey_' + currentOnlineGame.id);
    }
    currentOnlineGame = null;
    sessionPlayerKey = null;
    myColor = 'w';
    moveSyncing = false;
    lastKnownServerState = null;
    over = false;
    ui.hideGameUI();
    ui.hideGameOver();
    engine.resetState();
    started = false;
}

function handleBottomRight() {
    if (gameMode === 'online') {
        confirmExitOnline();
    } else {
        ui.showExitChoicePanel();
    }
}

function exitWithSave() {
    saveBackup();
    ui.hideGameUI();
    ui.showMenu();
    engine.resetState();
}

function exitWithoutSave() {
    if (confirm('Are you sure? Any progress will be lost.')) {
        localStorage.removeItem('chess3d_backup_' + gameMode);
        ui.hideGameUI();
        ui.showMenu();
        engine.resetState();
    }
}

// ---------- Offline save/restore ----------
let autoSaveInterval = null;

function saveBackup() {
    if (over || gameMode === 'online') return;
    const data = engine.getBackupData();
    localStorage.setItem('chess3d_backup_' + gameMode, JSON.stringify(data));
}

function startAutoSave() {
    stopAutoSave();
    autoSaveInterval = setInterval(() => {
        if (!over && started && gameMode !== 'online') saveBackup();
    }, 2000);
}

function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
}

function restoreLocalGame() {
    const ai = localStorage.getItem('chess3d_backup_ai');
    const pvp = localStorage.getItem('chess3d_backup_2p');
    if (!ai && !pvp) {
        ui.toast('No backup found.');
        return;
    }
    if (ai && !pvp) {
        restoreLocalMode('ai');
    } else if (!ai && pvp) {
        restoreLocalMode('2p');
    } else {
        ui.showRestoreChoicePanel();
    }
}

function restoreLocalMode(mode) {
    const dataStr = localStorage.getItem('chess3d_backup_' + mode);
    if (!dataStr) {
        ui.toast('No backup found for ' + (mode === 'ai' ? 'AI' : 'PvP'));
        return;
    }
    const data = JSON.parse(dataStr);
    engine.restoreBackup(data);
    gameMode = mode;
    ui.hideAllPanels();
    ui.showGameUI();
    started = true;
    over = false;
    startAutoSave();
    if (mode === 'ai' && engine.getTurn() !== engine.getPlayerColor()) {
        engine.scheduleAI(300);
    }
}

// Cloud sync / restore wrappers
async function syncOfflineToCloud() {
    if (!currentUserId) { ui.toast('Log in to sync.'); return; }
    try {
        await db.syncOfflineToCloud(currentUserId);
        ui.toast('Synced offline data to cloud.');
    } catch (e) {
        ui.toast('Sync failed: ' + e.message);
    }
}

async function restoreOfflineFromCloud() {
    if (!currentUserId) { ui.toast('Log in to restore.'); return; }
    try {
        const result = await db.restoreOfflineFromCloud(currentUserId, null);
        if (Array.isArray(result)) {
            window._cloudBackups = result;
            ui.showCloudChoicePanel();
        } else {
            // single backup was restored automatically by db function
            ui.toast('Restored from cloud.');
        }
    } catch (e) {
        ui.toast('Restore failed: ' + e.message);
    }
}

function restoreCloudMode(mode) {
    const backups = window._cloudBackups;
    if (!backups) return;
    const backup = backups.find(b => b.mode === mode);
    if (!backup) return;
    localStorage.setItem('chess3d_backup_' + mode, JSON.stringify(backup.backup_data));
    ui.hideAllPanels();
    restoreLocalMode(mode);
    ui.toast('Restored cloud backup.');
}

async function deleteAllSyncedData() {
    if (!currentUserId) { ui.toast('Log in to delete.'); return; }
    try {
        await db.deleteAllSyncedData(currentUserId);
        ui.toast('Cloud data deleted.');
    } catch (e) {
        ui.toast('Delete failed: ' + e.message);
    }
}

// ---------- Utilities ----------
function generatePlayerKey() {
    return Math.random().toString(36).substring(2, 15);
}

// ---------- Start everything ----------
init();