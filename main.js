// main.js — Orchestrator for Chess 3D (v9 – offline notification + auto-refresh)

// ---------- Helper: show error on screen ----------
function showError(source, err) {
    const log = document.getElementById('error-log');
    if (log) {
        log.style.display = 'block';
        log.textContent += `[${source}] ${err.message || err}\n`;
        console.error(`[${source}]`, err);
    }
}

// ---------- Global state ----------
let gameMode = null;
let currentOnlineGame = null;
let myColor = 'w';
let sessionPlayerKey = null;
let started = false;
let over = false;
let currentUserId = null;

let moveSyncing = false;
let lastKnownServerState = null;
let pollInterval = null;
let chatPollInterval = null;
let rematchCountdownInterval = null;

// ---------- Dynamic imports ----------
let db, engine, ui;

async function loadModules() {
    try { db = await import('./database.js'); showError('main', 'database.js loaded'); } catch (e) { showError('import database.js', e); return false; }
    try { engine = await import('./game_engine.js'); showError('main', 'game_engine.js loaded'); } catch (e) { showError('import game_engine.js', e); return false; }
    try { ui = await import('./ui_handler.js'); showError('main', 'ui_handler.js loaded'); } catch (e) { showError('import ui_handler.js', e); return false; }
    return true;
}

// ---------- Initialization ----------
async function init() {
    const loaded = await loadModules();
    if (!loaded) return;

    try {
        currentUserId = await db.initAuth();
        updateDebugOverlay();

        // 1. Init UI (does not touch header anymore)
        ui.initUI({
            onStart2P: () => startOfflineGame('2p'),
            onStartAI: showAiDiffPanel,
            onOnlineMenu: showOnlineMenu,

            onCreatePublicRoom: createPublicRoom,
            onJoinPublicRoom: joinPublicRoom,
            onCreatePrivateRoom: createPrivateRoom,
            onJoinPrivateRoom: joinPrivateRoom,
            onCancelWaiting: cancelWaiting,
            onCountdownFinished: startOnlineGame,
            onAiCountdownFinished: startAiGame,

            onAcceptRematch: acceptRematch,
            onDeclineRematch: declineRematch,

            onSendChat: (msg) => sendChat(msg),
            onToggleChat: () => ui.toggleChat(),

            onUndo: undoMove,
            onNewGame: newGame,
            onModeBtn: handleBottomRight,

            onExitSave: exitWithSave,
            onExitWithoutSave: exitWithoutSave,
            onExitOnline: confirmExitOnline,
            onRestoreLocal: restoreLocalGame,
            onSyncOfflineCloud: () => syncOfflineToCloud(),
            onRestoreOfflineCloud: () => restoreOfflineFromCloud(),
            onDeleteSynced: deleteAllSyncedData,

            onRestoreAI: () => restoreLocalMode('ai'),
            onRestore2P: () => restoreLocalMode('2p'),
            onCloudRestoreAI: () => restoreCloudMode('ai'),
            onCloudRestore2P: () => restoreCloudMode('2p'),
        });

        engine.initEngine(document.getElementById('cv'), onLocalMoveExecuted);

        engine.setFrameCallback((state) => {
            if (!started) return;
            const isOnline = gameMode === 'online';
            ui.updateTurnIndicator(state.turn, myColor, isOnline);
            ui.updateTimers(state.timerW, state.timerB, state.turn);
            ui.updateThinkingIndicator(state.aiThink);

            if (state.inCheck) {
                document.getElementById('smsg').textContent = '⚠ Check!';
            } else if (!state.aiThink) {
                document.getElementById('smsg').textContent = '';
            }

            if (state.over) {
                const info = engine.getGameOverInfo();
                if (info) {
                    ui.showGameOver(info.title, info.subtitle,
                        gameMode === 'online'
                            ? '<button onclick="window.requestRematch()">Request Rematch</button><button class="sec" onclick="window.exitOnlineGame()">Exit</button>'
                            : '<button onclick="window.newGameAction()">New Game</button><button class="sec" onclick="window.exitGameAction()">Exit</button>');
                    over = true;
                }
            }

            if (state.promotionPending) {
                ui.showPromotion(engine.getTurn());
            }
        });

        if (db.sb) {
            db.sb.auth.onAuthStateChange(async (event, session) => {
                if (session?.user) {
                    currentUserId = session.user.id;
                    await updateHeaderWithAvatar();
                } else {
                    currentUserId = null;
                    ui.updateHeaderUI(null);
                }
                updateDebugOverlay();
                if (!session && gameMode === 'online' && started) {
                    ui.toast('Session expired. Exiting match.');
                    exitOnlineGame();
                }
            });
        }

        // 2. Now set the correct header state (after UI is ready)
        await updateHeaderWithAvatar();
        ui.showMenu();
        updateDebugOverlay();
        showError('main', 'Initialization complete');
    } catch (err) {
        showError('init()', err);
    }
}

async function updateHeaderWithAvatar() {
    if (currentUserId && db) {
        const profile = await db.fetchProfileData(currentUserId);
        ui.updateHeaderUI(currentUserId, profile.avatar_url);
    } else {
        ui.updateHeaderUI(null);
    }
}

// ---------- Debug overlay ----------
function updateDebugOverlay() {
    const sbStatus = db ? db.getSbStatus() : 'db not loaded';
    const uid = currentUserId ? currentUserId.slice(0, 8) + '…' : 'not logged in';
    document.getElementById('debug-overlay').textContent = `Supabase: ${sbStatus}\nUser ID: ${uid}`;
}

// ---------- Offline game flow ----------
function startOfflineGame(mode) {
    gameMode = mode;
    ui.hideAllPanels();
    ui.showGameUI();
    ui.setChatVisibility(false);
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
    document.getElementById('main-cards').style.display = 'none';
    document.getElementById('original-buttons').style.display = 'none';
    ui.hideAllPanels();
    ui.showPanel('ai-diff-panel');
}

function startAiGame() {
    startOfflineGame('ai');
}

// ---------- Online game flow ----------
async function showOnlineMenu() {
    if (!currentUserId) { ui.showLoginGate(); return; }
    document.getElementById('main-cards').style.display = 'none';
    document.getElementById('original-buttons').style.display = 'none';
    ui.showPanel('online-menu');
}

async function createPublicRoom() { await createRoom(null, 'public'); }
async function createPrivateRoom() { await createRoom(null, 'private'); }

async function createRoom(code, type) {
    if (!currentUserId) return;
    const username = await db.fetchUsername(currentUserId);
    if (!username) { ui.toast('Please set a username on your profile page.'); return; }
    const hostKey = generatePlayerKey();
    try {
        const game = await db.createGame(code, type, currentUserId, hostKey, username);
        onlineGameCreated(game, hostKey);
    } catch (e) { ui.toast('Failed to create room: ' + e.message); }
}

async function joinPublicRoom() {
    if (!currentUserId) return;
    const username = await db.fetchUsername(currentUserId);
    if (!username) { ui.toast('Please set a username on your profile page.'); return; }
    const joinerKey = generatePlayerKey();
    try {
        const game = await db.joinPublicGame(currentUserId, joinerKey, username);
        onlineGameJoined(game, joinerKey);
    } catch (e) { ui.toast('Join failed: ' + e.message); }
}

async function joinPrivateRoom() {
    if (!currentUserId) return;
    const username = await db.fetchUsername(currentUserId);
    if (!username) { ui.toast('Please set a username on your profile page.'); return; }
    const code = ui.getPrivateRoomCode();
    if (!code) { ui.toast('Enter a room code.'); return; }
    const joinerKey = generatePlayerKey();
    try {
        const game = await db.joinPrivateGame(code, currentUserId, joinerKey, username);
        onlineGameJoined(game, joinerKey);
    } catch (e) { ui.toast('Join failed: ' + e.message); }
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
    myColor = 'b';
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
    ui.setChatVisibility(true);
    engine.setMyColor(myColor);
    engine.startGame('online');
    started = true;
    startOnlineGameLoop();
    startChatPolling(currentOnlineGame.id);
    engine.rotateForPlayer(myColor);
}

async function cancelWaiting() {
    if (currentOnlineGame) { await db.cancelGame(currentOnlineGame.id); resetOnlineState(); ui.showMenu(); }
}

// ---------- Online sync loop ----------
function startOnlineGameLoop() { stopOnlineGameLoop(); pollInterval = setInterval(pollGameState, 1000); }
function stopOnlineGameLoop() { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } }
async function pollGameState() {
    if (!currentOnlineGame || moveSyncing || over) return;
    try {
        const gameData = await db.fetchGameState(currentOnlineGame.id);
        if (!gameData) return;
        const serverState = JSON.stringify(gameData.board_state);
        if (serverState === lastKnownServerState) return;
        lastKnownServerState = serverState;
        engine.syncBoardFromServer(gameData.board_state.brd, gameData.board_state.turn, gameData.board_state.cas, gameData.board_state.ep, gameData.timer_w, gameData.timer_b);
    } catch (e) {}
}

// ---------- Chat ----------
function startChatPolling(gameId) { stopChatPolling(); chatPollInterval = setInterval(async () => { try { const msgs = await db.getChatMessages(gameId); ui.displayChatMessages(msgs); } catch (e) {} }, 2000); }
function stopChatPolling() { if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; } }
function sendChat(msg) {
    if (!currentOnlineGame) return;
    const nickname = currentOnlineGame.host_player_id === currentUserId ? currentOnlineGame.host_nickname : currentOnlineGame.joiner_nickname;
    db.sendChatMessage(currentOnlineGame.id, currentUserId, nickname, msg);
    ui.appendChatMessage(nickname, msg);
}

// ---------- Move execution callback ----------
async function onLocalMoveExecuted(move) {
    if (gameMode !== 'online' || !currentOnlineGame || moveSyncing) return;
    moveSyncing = true;
    try {
        const savedState = await db.pushBoardState(currentOnlineGame.id, engine.getBoardArray(), engine.getTurn(), engine.getCastling(), engine.getEnPassant(), engine.getTimerW(), engine.getTimerB());
        lastKnownServerState = savedState;
    } catch (e) { ui.toast('Move sync failed. Try again.'); }
    finally { moveSyncing = false; }
}

// ---------- Rematch ----------
async function requestRematch() {
    if (!currentOnlineGame) return;
    clearInterval(rematchCountdownInterval);
    await db.sb.from('online_games').update({
        rematch_requested_by: currentUserId,
        rematch_requested_at: new Date()
    }).eq('id', currentOnlineGame.id);
    document.getElementById('gos').textContent = 'Rematch requested. Waiting for opponent…';
}

async function acceptRematch() { ui.toast('Rematch accepted.'); }
async function declineRematch() {
    if (currentOnlineGame) {
        await db.terminateGame(currentOnlineGame.id);
        resetOnlineState();
        ui.showMenu();
    }
}

// ---------- Exit ----------
function confirmExitOnline() { ui.showExitOnlinePanel(); }
async function exitOnlineGame() {
    if (!currentOnlineGame) return;
    stopOnlineGameLoop(); stopChatPolling();
    if (currentOnlineGame.host_player_id === currentUserId) await db.terminateGame(currentOnlineGame.id);
    else await db.freezeGame(currentOnlineGame.id, currentUserId);
    resetOnlineState(); ui.showMenu();
}

function resetOnlineState() {
    stopOnlineGameLoop(); stopChatPolling();
    if (currentOnlineGame) sessionStorage.removeItem('chess3d_playerkey_' + currentOnlineGame.id);
    currentOnlineGame = null; sessionPlayerKey = null; myColor = 'w';
    moveSyncing = false; lastKnownServerState = null; over = false;
    ui.hideGameUI(); ui.hideGameOver(); engine.resetState(); started = false;
}

function handleBottomRight() {
    if (gameMode === 'online') confirmExitOnline();
    else ui.showExitChoicePanel();
}

function exitWithSave() { saveBackup(); ui.hideGameUI(); ui.showMenu(); engine.resetState(); started = false; }
function exitWithoutSave() {
    if (confirm('Are you sure? Any progress will be lost.')) {
        localStorage.removeItem('chess3d_backup_' + gameMode);
        ui.hideGameUI(); ui.showMenu(); engine.resetState(); started = false;
    }
}

// ---------- Offline save/restore ----------
let autoSaveInterval = null;
function saveBackup() { if (over || gameMode === 'online') return; const data = engine.getBackupData(); localStorage.setItem('chess3d_backup_' + gameMode, JSON.stringify(data)); }
function startAutoSave() { stopAutoSave(); autoSaveInterval = setInterval(() => { if (!over && started && gameMode !== 'online') saveBackup(); }, 2000); }
function stopAutoSave() { if (autoSaveInterval) { clearInterval(autoSaveInterval); autoSaveInterval = null; } }

function restoreLocalGame() {
    const ai = localStorage.getItem('chess3d_backup_ai'), pvp = localStorage.getItem('chess3d_backup_2p');
    if (!ai && !pvp) { ui.toast('No backup found.'); return; }
    if (ai && !pvp) restoreLocalMode('ai');
    else if (!ai && pvp) restoreLocalMode('2p');
    else ui.showRestoreChoicePanel();
}

function restoreLocalMode(mode) {
    const dataStr = localStorage.getItem('chess3d_backup_' + mode);
    if (!dataStr) { ui.toast('No backup found.'); return; }
    const data = JSON.parse(dataStr);
    gameMode = mode;
    engine.setGameMode(mode);
    engine.restoreBackup(data);
    ui.hideAllPanels();
    ui.showGameUI();
    ui.setChatVisibility(false);
    started = true;
    over = false;
    startAutoSave();
    if (mode === 'ai' && engine.getTurn() !== engine.getPlayerColor()) {
        engine.scheduleAI(300);
    }
}

// ---------- Cloud sync ----------
async function syncOfflineToCloud() {
    if (!currentUserId) { ui.toast('Please log in to sync data.'); return; }
    if (!navigator.onLine) { ui.toast('No internet connection.'); return; }
    ui.toast('Syncing data to cloud…', 0);
    try {
        await db.syncOfflineToCloud(currentUserId);
        ui.toast('Synced data successfully');
    } catch (e) {
        ui.toast('Failed to sync data: ' + e.message);
    }
}

async function restoreOfflineFromCloud() {
    if (!currentUserId) { ui.toast('Please log in to restore cloud data.'); return; }
    if (!navigator.onLine) { ui.toast('No internet connection.'); return; }
    ui.toast('Restoring data from cloud…', 0);
    try {
        const result = await db.restoreOfflineFromCloud(currentUserId);
        if (Array.isArray(result)) {
            window._cloudBackups = result;
            ui.showCloudChoicePanel();
            ui.toast('');
        } else {
            ui.toast('Restored data successfully');
        }
    } catch (e) {
        ui.toast('Failed to restore data: ' + e.message);
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
    if (!currentUserId) { ui.toast('Please log in to delete synced data.'); return; }
    if (!navigator.onLine) { ui.toast('No internet connection.'); return; }
    ui.toast('Deleting synced data…', 0);
    try {
        await db.deleteAllSyncedData(currentUserId);
        ui.toast('Cloud data deleted.');
    } catch (e) {
        ui.toast('Delete failed: ' + e.message);
    }
}

// ---------- Utilities ----------
function generatePlayerKey() { return Math.random().toString(36).substring(2, 15); }

// ---------- Expose globally for inline onclick handlers ----------
window.requestRematch = requestRematch;
window.exitOnlineGame = exitOnlineGame;
window.newGameAction = newGame;
window.exitGameAction = handleBottomRight;

// ---------- Offline detection & auto‑refresh ----------
(function() {
    const notify = document.getElementById('offline-notification');

    function showOffline() {
        if (notify) notify.classList.add('show');
    }

    function hideOffline() {
        if (notify) notify.classList.remove('show');
    }

    // Listen to browser events
    window.addEventListener('offline', showOffline);
    window.addEventListener('online', () => {
        // Save any in‑progress offline game before refreshing
        if (gameMode && gameMode !== 'online' && started && !over && engine) {
            saveBackup();
        }
        // Small delay so the save can complete, then refresh
        setTimeout(() => {
            location.reload();
        }, 150);
    });

    // Initial state
    if (!navigator.onLine) showOffline();
})();

// ---------- Start ----------
init();