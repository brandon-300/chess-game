// main.js — Orchestrator for Chess 3D (UI‑cleanup version)

function showError(source, err) {
    const log = document.getElementById('error-log');
    if (log) { log.style.display = 'block'; log.textContent += `[${source}] ${err.message || err}\n`; console.error(`[${source}]`, err); }
}

let gameMode = null, currentOnlineGame = null, myColor = 'w', sessionPlayerKey = null, started = false, over = false, frozen = false, currentUserId = null;
let moveSyncing = false, lastKnownServerState = null, pollInterval = null, waitingPollInterval = null, lastTimerSync = 0;
let voiceChannel = null;
let db, engine, ui, voice;

async function loadModules() {
    try { db = await import('./database.js'); } catch (e) { showError('import database.js', e); return false; }
    try { engine = await import('./game_engine.js'); } catch (e) { showError('import game_engine.js', e); return false; }
    try { ui = await import('./ui_handler.js'); } catch (e) { showError('import ui_handler.js', e); return false; }
    try { voice = await import('./voice_handler.js'); } catch (e) { showError('import voice_handler.js', e); return false; }
    return true;
}

async function init() {
    if (!await loadModules()) return;
    try {
        currentUserId = await db.initAuth();
        updateDebugOverlay();

        ui.initUI({
            onStart2P: () => startOfflineGame('2p'),
            onStartAI: () => { /* show AI difficulty panels via existing panels */ showAiDiffPanel(); },
            onOnlineMenu: () => showOnlineMenu(),
            onChatSend: (msg) => { /* future: send chat via database */ },
            onCreatePublicRoom: createPublicRoom,
            onJoinPublicRoom: joinPublicRoom,
            onRejoinPublic: rejoinPublicGame,
            onCreatePrivateRoom: createPrivateRoom,
            onJoinPrivateRoom: joinPrivateRoom,
            onCancelWaiting: cancelWaiting,
            onCountdownFinished: () => startOnlineGame(),
            onAcceptRematch: acceptRematch,
            onDeclineRematch: declineRematch,
            onToggleMic: () => toggleMic(),
            onToggleSpeaker: () => toggleSpeaker(),
            onUndo: undoMove,
            onNewGame: newGame,
            onModeBtn: handleBottomRight,
            onExitSave: exitWithSave,
            onExitWithoutSave: exitWithoutSave,
            onExitOnline: confirmExitOnline,
            onExitOnlineYes: exitOnlineGame,
            onRestoreLocal: restoreLocalGame,
            onSyncOfflineCloud: () => syncOfflineToCloud(),
            onRestoreOfflineCloud: () => restoreOfflineFromCloud(),
            onDeleteSynced: () => deleteAllSyncedData(),
        });

        engine.initEngine(document.getElementById('cv'), onLocalMoveExecuted);
        engine.setFrameCallback((state) => {
            if (!started) return;
            const isOnline = gameMode === 'online';
            ui.updateTurnIndicator(state.turn, myColor, isOnline);
            ui.updateTimers(state.timerW, state.timerB, state.turn);
            if (state.inCheck) {
                // visual handled in engine; we can flash indicator here if desired
            }
            if (state.over) {
                const info = engine.getGameOverInfo();
                if (info) {
                    let title, subtitle;
                    if (gameMode === 'ai') {
                        if (info.resultType === 'draw') { title = "It's a draw!"; subtitle = 'Stalemate'; }
                        else {
                            const iWon = info.resultType === engine.getPlayerColor();
                            title = iWon ? 'Congratulations! You won!' : 'You lost!';
                            subtitle = iWon ? 'You defeated the AI' : 'The AI defeated you';
                        }
                    } else if (gameMode === '2p') {
                        if (info.resultType === 'draw') { title = "It's a draw!"; subtitle = 'Stalemate'; }
                        else { title = info.resultType + ' Wins!'; subtitle = info.title || ''; }
                    } else {
                        if (info.resultType === 'draw') { title = "It's a draw!"; subtitle = 'Stalemate'; }
                        else {
                            const iWon = (myColor === 'w' && info.resultType === 'Red') || (myColor === 'b' && info.resultType === 'Black');
                            title = iWon ? 'Congratulations! You won!' : 'You lost!';
                            subtitle = iWon ? 'You won the match!' : 'Better luck next time';
                        }
                    }
                    ui.showGameOver(title, subtitle,
                        isOnline && info.resultType !== 'draw'
                            ? '<button onclick="window.requestRematch()">Rematch</button><button onclick="window.exitOnlineGame()">Exit</button>'
                            : isOnline ? '<button onclick="window.exitOnlineGame()">Exit</button>' : '');
                    over = true;
                    if (!isOnline) { setTimeout(() => { ui.hideGameOver(); ui.showMenu(); engine.resetState(); started = false; gameMode = null; over = false; }, 5000); }
                }
            }
            if (state.promotionPending) ui.showPromotion(engine.getTurn());
            if (isOnline && currentOnlineGame && !moveSyncing && !over && Date.now() - lastTimerSync > 2000) { lastTimerSync = Date.now(); syncTimers(); }
        });

        if (db.sb) {
            db.sb.auth.onAuthStateChange(async (event, session) => {
                if (session?.user) { currentUserId = session.user.id; await updateHeaderWithAvatar(); }
                else { currentUserId = null; ui.updateHeaderUI(null); }
                updateDebugOverlay();
                if (!session && gameMode === 'online' && started) { ui.toast('Session expired. Exiting match.'); exitOnlineGame(); }
            });
        }
        await updateHeaderWithAvatar();
        ui.showMenu();
        updateDebugOverlay();
    } catch (err) { showError('init()', err); }
}

async function updateHeaderWithAvatar() {
    if (currentUserId && db) { const p = await db.fetchProfileData(currentUserId); ui.updateHeaderUI(currentUserId, p.avatar_url); }
    else ui.updateHeaderUI(null);
}

function updateDebugOverlay() {
    const sbStatus = db ? db.getSbStatus() : 'db not loaded';
    document.getElementById('debug-overlay').textContent = `Supabase: ${sbStatus}\nUser ID: ${currentUserId ? currentUserId.slice(0,8)+'…' : 'not logged in'}`;
}

// ---- Online Flow ----
async function showOnlineMenu() {
    if (!currentUserId) { ui.showLoginGate(); return; }
    // In the new UI, we skip the old online menu and go straight to creating a public room
    createPublicRoom();
}

// ---- Lobby Integration ----
function onlineGameCreated(game, hostKey) {
    currentOnlineGame = game;
    sessionPlayerKey = hostKey;
    sessionStorage.setItem('chess3d_playerkey_' + game.id, hostKey);
    ui.showLobbyPanel(game.host_nickname, game.room_code);
    startWaitingPoll(game.id);
}

function onlineGameJoined(game, joinerKey) {
    currentOnlineGame = game;
    sessionPlayerKey = joinerKey;
    sessionStorage.setItem('chess3d_playerkey_' + game.id, joinerKey);
    myColor = 'b';
    ui.showLobbyPanel(game.host_nickname || 'Opponent', game.room_code);
    startWaitingPoll(game.id);
}

function startWaitingPoll(gameId) {
    stopWaitingPoll();
    waitingPollInterval = setInterval(async () => {
        try {
            const data = await db.fetchGameState(gameId);
            if (!data) return;
            if (data.status === 'countdown') {
                stopWaitingPoll();
                currentOnlineGame = data;
                // update lobby with opponent name
                const opponentName = currentUserId === data.host_player_id ? data.joiner_nickname : data.host_nickname;
                ui.showLobbyPanel(opponentName, data.room_code);
                // countdown will be triggered by the existing countdown panel, but we can also call startOnlineGame after delay
                // For simplicity, we keep the old countdown panel logic if present; otherwise we start directly.
                // In the new UI, we can just start the game after a short delay.
                setTimeout(() => startOnlineGame(), 5000);
            } else if (data.status === 'active') {
                stopWaitingPoll();
                currentOnlineGame = data;
                startOnlineGame();
            } else if (data.status === 'cancelled' || data.status === 'terminated') {
                stopWaitingPoll();
                ui.toast('Game cancelled.');
                resetOnlineState();
                ui.showMenu();
            }
        } catch (e) {}
    }, 1000);
}

function stopWaitingPoll() { if (waitingPollInterval) { clearInterval(waitingPollInterval); waitingPollInterval = null; } }

async function startOnlineGame() {
    if (!currentOnlineGame) return;
    if (currentOnlineGame.host_player_id === currentUserId) await db.updateGameStatus(currentOnlineGame.id, 'active');
    ui.hideLobbyPanel();
    ui.showGameUI();
    ui.setOnlineBottomButtons(true);
    engine.setMyColor(myColor);
    engine.startGame('online');
    started = true; gameMode = 'online'; over = false; frozen = false; engine.setFrozen(false);
    lastTimerSync = Date.now();
    startOnlineGameLoop();
    startVoice();
    engine.rotateForPlayer(myColor);
}

// ---- Rematch, Exit, etc. ----
async function requestRematch() {
    if (!currentOnlineGame) return;
    await db.sb.from('online_games').update({ rematch_requested_by: currentUserId, rematch_requested_at: new Date() }).eq('id', currentOnlineGame.id);
    ui.showRematchInLobby();
    ui.toast('Rematch requested.');
}
window.requestRematch = requestRematch;

async function acceptRematch() { /* logic to accept and restart game */ }
async function declineRematch() {
    if (currentOnlineGame) {
        await db.terminateGame(currentOnlineGame.id);
        resetOnlineState();
        ui.showMenu();
    }
}

async function cancelWaiting() {
    if (currentOnlineGame) { await db.cancelGame(currentOnlineGame.id); resetOnlineState(); ui.showMenu(); }
}

async function exitOnlineGame() {
    if (!currentOnlineGame) return;
    stopOnlineGameLoop(); stopVoice();
    const gameId = currentOnlineGame.id;
    if (currentOnlineGame.host_player_id === currentUserId) {
        await db.terminateGame(gameId);
        resetOnlineState(); ui.showMenu();
    } else {
        await db.freezeGame(gameId, currentUserId);
        sessionStorage.setItem('chess3d_frozen_game', gameId);
        resetOnlineState(); ui.showMenu();
    }
}
window.exitOnlineGame = exitOnlineGame;

function resetOnlineState() {
    stopOnlineGameLoop(); stopVoice(); stopWaitingPoll();
    if (currentOnlineGame) sessionStorage.removeItem('chess3d_playerkey_' + currentOnlineGame.id);
    currentOnlineGame = null; sessionPlayerKey = null; myColor = 'w'; moveSyncing = false; lastKnownServerState = null; over = false; frozen = false;
    engine.setFrozen(false);
    ui.hideGameUI(); ui.hideGameOver(); engine.resetState();
    started = false; gameMode = null;
}

function confirmExitOnline() { ui.showExitOnlinePanel(); }

function handleBottomRight() {
    if (gameMode === 'online') confirmExitOnline();
    else ui.showExitChoicePanel();
}

// ---- Offline / AI / Save / Restore (unchanged) ----
function startOfflineGame(mode) {
    gameMode = mode; ui.hideAllPanels(); ui.showGameUI(); ui.setVoiceControlsVisibility(false); ui.setOnlineBottomButtons(false);
    started = true; engine.startGame(mode); over = false;
    if (mode === 'ai' && engine.getPlayerColor() === 'b') engine.scheduleAI(500);
    startAutoSave();
}
function newGame() {
    if (gameMode === 'online') return;
    engine.newGame(); over = false; ui.hideGameOver();
    if (gameMode === 'ai' && engine.getPlayerColor() === 'b') engine.scheduleAI(500);
    saveBackup();
}
function undoMove() {
    if (gameMode === 'online') return;
    engine.undoMove(); saveBackup();
}

function showAiDiffPanel() {
    // reuse old AI panels (they still exist in HTML but hidden) – we can show them via ui
    ui.hideAllPanels();
    document.getElementById('ai-diff-panel')?.classList.add('show');
}
// other AI panel callbacks remain the same (tied to buttons in html)

function exitWithSave() { saveBackup(); ui.hideGameUI(); ui.showMenu(); engine.resetState(); started = false; }
function exitWithoutSave() {
    if (confirm('Are you sure?')) {
        localStorage.removeItem('chess3d_backup_' + gameMode);
        ui.hideGameUI(); ui.showMenu(); engine.resetState(); started = false;
    }
}

// Offline save/restore
let autoSaveInterval = null;
function saveBackup() { if (over || gameMode === 'online') return; localStorage.setItem('chess3d_backup_' + gameMode, JSON.stringify(engine.getBackupData())); }
function startAutoSave() { stopAutoSave(); autoSaveInterval = setInterval(() => { if (!over && started && gameMode !== 'online') saveBackup(); }, 2000); }
function stopAutoSave() { if (autoSaveInterval) { clearInterval(autoSaveInterval); autoSaveInterval = null; } }
function restoreLocalGame() {
    const ai = localStorage.getItem('chess3d_backup_ai'), pvp = localStorage.getItem('chess3d_backup_2p');
    if (!ai && !pvp) { ui.toast('No backup found.'); return; }
    if (ai && !pvp) restoreLocalMode('ai');
    else if (!ai && pvp) restoreLocalMode('2p');
    else { /* show restore choice panel – we keep old panel logic */ }
}
function restoreLocalMode(mode) {
    const dataStr = localStorage.getItem('chess3d_backup_' + mode);
    if (!dataStr) { ui.toast('No backup found.'); return; }
    const data = JSON.parse(dataStr);
    gameMode = mode; engine.setGameMode(mode); engine.restoreBackup(data);
    ui.hideAllPanels(); ui.showGameUI(); ui.setVoiceControlsVisibility(false); ui.setOnlineBottomButtons(false);
    started = true; over = false; startAutoSave();
    if (mode === 'ai' && engine.getTurn() !== engine.getPlayerColor()) engine.scheduleAI(300);
}

// Cloud sync (unchanged)
async function syncOfflineToCloud() { /* existing code */ }
async function restoreOfflineFromCloud() { /* existing code */ }
async function deleteAllSyncedData() { /* existing code */ }

// Voice controls (unchanged)
async function toggleMic() { /* existing */ }
function toggleSpeaker() { /* existing */ }
function startVoice() { /* existing */ }
function stopVoice() { /* existing */ }

// Online sync
function startOnlineGameLoop() { stopOnlineGameLoop(); pollInterval = setInterval(pollGameState, 1000); }
function stopOnlineGameLoop() { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } }
async function pollGameState() { /* existing logic */ }
async function syncTimers() { /* existing */ }
async function onLocalMoveExecuted(move) { /* existing */ }

// Online room creation/joining (adapted to lobby)
async function createPublicRoom() {
    if (!currentUserId) return;
    const username = await db.fetchUsername(currentUserId);
    if (!username) { ui.toast('Please set a username.'); return; }
    const hostKey = generatePlayerKey();
    try {
        const game = await db.createGame(null, 'public', currentUserId, hostKey, username);
        onlineGameCreated(game, hostKey);
    } catch (e) { ui.toast('Failed to create room: ' + e.message); }
}
async function createPrivateRoom() { /* similar, but for private */ }
async function joinPublicRoom() {
    if (!currentUserId) return;
    const username = await db.fetchUsername(currentUserId);
    if (!username) { ui.toast('Please set a username.'); return; }
    const joinerKey = generatePlayerKey();
    try {
        const game = await db.joinPublicGame(currentUserId, joinerKey, username);
        onlineGameJoined(game, joinerKey);
    } catch (e) { ui.toast('Join failed: ' + e.message); }
}
async function joinPrivateRoom() { /* similar, with room code */ }
async function rejoinPublicGame() { /* existing */ }

function generatePlayerKey() { return Math.random().toString(36).substring(2, 15); }

// ---- Initialize ----
init();