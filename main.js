// main.js — Orchestrator for Chess 3D (v39 – clean, no debug spam)

function showError(source, err) {
    const log = document.getElementById('error-log');
    if (log) { log.style.display = 'block'; log.textContent += `[${source}] ${err.message || err}\n`; console.error(`[${source}]`, err); }
}

let gameMode = null, currentOnlineGame = null, myColor = 'w', sessionPlayerKey = null, started = false, over = false, frozen = false, currentUserId = null;
let moveSyncing = false, lastKnownServerState = null, pollInterval = null, chatPollInterval = null, rematchCountdownInterval = null, waitingPollInterval = null, lastTimerSync = 0;
let db, engine, ui;

async function loadModules() {
    try { db = await import('./database.js'); } catch (e) { showError('import database.js', e); return false; }
    try { engine = await import('./game_engine.js'); } catch (e) { showError('import game_engine.js', e); return false; }
    try { ui = await import('./ui_handler.js'); } catch (e) { showError('import ui_handler.js', e); return false; }
    return true;
}

async function init() {
    if (!await loadModules()) return;
    try {
        currentUserId = await db.initAuth();
        updateDebugOverlay();

        ui.initUI({
            onStart2P: () => startOfflineGame('2p'), onStartAI: showAiDiffPanel, onOnlineMenu: showOnlineMenu,
            onCreatePublicRoom: createPublicRoom, onJoinPublicRoom: joinPublicRoom, onRejoinPublic: rejoinPublicGame,
            onCreatePrivateRoom: createPrivateRoom, onJoinPrivateRoom: joinPrivateRoom,
            onCancelWaiting: cancelWaiting, onCountdownFinished: () => startOnlineGame(),
            onAiCountdownFinished: startAiGame,
            onAcceptRematch: acceptRematch, onDeclineRematch: declineRematch,
            onSendChat: (msg) => sendChat(msg), onToggleChat: () => ui.toggleChat(),
            onUndo: undoMove, onNewGame: newGame, onModeBtn: handleBottomRight,
            onExitSave: exitWithSave, onExitWithoutSave: exitWithoutSave, onExitOnline: confirmExitOnline, onExitOnlineYes: exitOnlineGame,
            onRestoreLocal: restoreLocalGame, onSyncOfflineCloud: () => syncOfflineToCloud(), onRestoreOfflineCloud: () => restoreOfflineFromCloud(), onDeleteSynced: () => deleteAllSyncedData(),
            onRestoreAI: () => restoreLocalMode('ai'), onRestore2P: () => restoreLocalMode('2p'), onCloudRestoreAI: () => restoreCloudMode('ai'), onCloudRestore2P: () => restoreCloudMode('2p')
        });

        engine.initEngine(document.getElementById('cv'), onLocalMoveExecuted);
        engine.setFrameCallback((state) => {
            if (!started) return;
            const isOnline = gameMode === 'online';
            ui.updateTurnIndicator(state.turn, myColor, isOnline);
            ui.updateTimers(state.timerW, state.timerB, state.turn);
            ui.updateThinkingIndicator(state.aiThink);
            if (state.inCheck) document.getElementById('smsg').textContent = '⚠ Check!'; else if (!state.aiThink) document.getElementById('smsg').textContent = '';
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
                            ? '<button onclick="window.requestRematch()">Request Rematch</button><button class="sec" onclick="window.exitOnlineGame()">Exit</button>'
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
        updateRejoinButtonsFromSession();
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

function updateRejoinButtonsFromSession() {
    const frozenId = sessionStorage.getItem('chess3d_frozen_game');
    ui.setRejoinButtonsVisibility(!!frozenId, !!frozenId);
    if (frozenId) validateRejoinButtonAsync(frozenId);
}
async function validateRejoinButtonAsync(frozenId) {
    if (!db) return;
    try { const game = await db.fetchGameState(frozenId); if (!game || game.status !== 'frozen' || Date.now() - new Date(game.leave_time).getTime() > 10*60*1000) { sessionStorage.removeItem('chess3d_frozen_game'); ui.setRejoinButtonsVisibility(false, false); } } catch (e) {}
}
async function updateRejoinButtonsFromDB() {
    if (!currentUserId || !db) { ui.setRejoinButtonsVisibility(false, false); return; }
    const frozenGame = await db.getFrozenGameForUser(currentUserId);
    const hasFrozen = !!frozenGame;
    ui.setRejoinButtonsVisibility(hasFrozen, hasFrozen);
    if (hasFrozen) sessionStorage.setItem('chess3d_frozen_game', frozenGame.id);
    else sessionStorage.removeItem('chess3d_frozen_game');
}
async function rejoinPublicGame() {
    if (!currentUserId) return;
    const frozenId = sessionStorage.getItem('chess3d_frozen_game');
    if (!frozenId) { ui.toast('No frozen game found.'); return; }
    try { const game = await db.unfreezeGame(frozenId, currentUserId); enterOnlineGame(game); } catch (e) { ui.toast('Rejoin failed: ' + e.message); }
}
function enterOnlineGame(game) {
    currentOnlineGame = game; myColor = (game.host_player_id === currentUserId) ? 'w' : 'b';
    sessionPlayerKey = myColor === 'w' ? game.host_player_key : game.joiner_player_key;
    sessionStorage.setItem('chess3d_playerkey_' + game.id, sessionPlayerKey); sessionStorage.removeItem('chess3d_frozen_game');
    ui.hideAllPanels(); ui.showGameUI(); ui.setChatVisibility(true); ui.setOnlineBottomButtons(true); ui.setRejoinButtonsVisibility(false, false);
    engine.setMyColor(myColor); engine.setGameMode('online');
    engine.syncBoardFromServer(game.board_state.brd, game.board_state.turn, game.board_state.cas, game.board_state.ep, game.timer_w, game.timer_b);
    started = true; gameMode = 'online'; over = false; frozen = false; engine.setFrozen(false);
    lastTimerSync = Date.now(); startOnlineGameLoop(); startChatPolling(game.id); engine.rotateForPlayer(myColor);
}
async function syncTimers() { if (!currentOnlineGame) return; try { await db.sb.from('online_games').update({ timer_w: engine.getTimerW(), timer_b: engine.getTimerB() }).eq('id', currentOnlineGame.id); } catch (e) {} }

// Offline flow
function startOfflineGame(mode) { gameMode = mode; ui.hideAllPanels(); ui.showGameUI(); ui.setChatVisibility(false); ui.setOnlineBottomButtons(false); started = true; engine.startGame(mode); over = false; if (mode === 'ai' && engine.getPlayerColor() === 'b') engine.scheduleAI(500); startAutoSave(); }
function newGame() { if (gameMode === 'online') return; engine.newGame(); over = false; ui.hideGameOver(); if (gameMode === 'ai' && engine.getPlayerColor() === 'b') engine.scheduleAI(500); saveBackup(); }
function undoMove() { if (gameMode === 'online') return; engine.undoMove(); saveBackup(); }

// AI
function showAiDiffPanel() { document.getElementById('main-cards').style.display = 'none'; document.getElementById('original-buttons').style.display = 'none'; ui.hideAllPanels(); ui.showPanel('ai-diff-panel'); }
function startAiGame() { startOfflineGame('ai'); }

// Online
async function showOnlineMenu() { if (!currentUserId) { ui.showLoginGate(); return; } document.getElementById('main-cards').style.display = 'none'; document.getElementById('original-buttons').style.display = 'none'; ui.showPanel('online-menu'); updateRejoinButtonsFromDB(); }
async function createPublicRoom() { await createRoom(null, 'public'); }
async function createPrivateRoom() { await createRoom(null, 'private'); }
async function createRoom(code, type) { if (!currentUserId) return; const username = await db.fetchUsername(currentUserId); if (!username) { ui.toast('Please set a username.'); return; } const hostKey = generatePlayerKey(); try { const game = await db.createGame(code, type, currentUserId, hostKey, username); onlineGameCreated(game, hostKey); } catch (e) { ui.toast('Failed to create room: ' + e.message); } }
async function joinPublicRoom() { if (!currentUserId) return; const username = await db.fetchUsername(currentUserId); if (!username) { ui.toast('Please set a username.'); return; } const joinerKey = generatePlayerKey(); try { const game = await db.joinPublicGame(currentUserId, joinerKey, username); onlineGameJoined(game, joinerKey); } catch (e) { ui.toast('Join failed: ' + e.message); } }
async function joinPrivateRoom() { if (!currentUserId) return; const username = await db.fetchUsername(currentUserId); if (!username) { ui.toast('Please set a username.'); return; } const code = ui.getPrivateRoomCode(); if (!code) { ui.toast('Enter a room code.'); return; } const joinerKey = generatePlayerKey(); try { const game = await db.joinPrivateGame(code, currentUserId, joinerKey, username); if (game.status === 'active') { enterOnlineGame(game); return; } onlineGameJoined(game, joinerKey); } catch (e) { ui.toast('Join failed: ' + e.message); } }
function onlineGameCreated(game, hostKey) { currentOnlineGame = game; sessionPlayerKey = hostKey; sessionStorage.setItem('chess3d_playerkey_' + game.id, hostKey); ui.showWaitingRoom(game.host_nickname, game.room_code); startWaitingPoll(game.id); }
function onlineGameJoined(game, joinerKey) {
    currentOnlineGame = game;
    sessionPlayerKey = joinerKey;
    sessionStorage.setItem('chess3d_playerkey_' + game.id, joinerKey);
    myColor = 'b';
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
                ui.showCountdown(data.host_nickname, data.room_code);
            } else if (data.status === 'active') {
                stopWaitingPoll();
                currentOnlineGame = data;
                startOnlineGame();
            } else if (data.status === 'cancelled' || data.status === 'terminated') {
                stopWaitingPoll();
                ui.toast('Game was cancelled.');
                resetOnlineState();
                ui.showMenu();
            }
        } catch (e) {}
    }, 1000);
}
function stopWaitingPoll() { if (waitingPollInterval) { clearInterval(waitingPollInterval); waitingPollInterval = null; } }
async function startOnlineGame() { if (!currentOnlineGame) return; document.getElementById('ms').style.display = 'none'; if (currentOnlineGame.host_player_id === currentUserId) await db.updateGameStatus(currentOnlineGame.id, 'active'); ui.hideAllPanels(); ui.showGameUI(); ui.setChatVisibility(true); ui.resetChatState(); ui.setOnlineBottomButtons(true); engine.setMyColor(myColor); engine.startGame('online'); started = true; gameMode = 'online'; over = false; frozen = false; engine.setFrozen(false); lastTimerSync = Date.now(); startOnlineGameLoop(); startChatPolling(currentOnlineGame.id); engine.rotateForPlayer(myColor); }
async function cancelWaiting() { if (currentOnlineGame) { await db.cancelGame(currentOnlineGame.id); resetOnlineState(); ui.showMenu(); } }

// Online sync
function startOnlineGameLoop() { stopOnlineGameLoop(); pollInterval = setInterval(pollGameState, 1000); }
function stopOnlineGameLoop() { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } }
async function pollGameState() { if (!currentOnlineGame || moveSyncing || over) return; try { const gameData = await db.fetchGameState(currentOnlineGame.id); if (!gameData) return; if (gameData.status === 'terminated') { if (currentUserId !== gameData.host_player_id) ui.toast('Match terminated by the host.'); resetOnlineState(); ui.showMenu(); return; } if (gameData.status === 'frozen') { if (!frozen) { frozen = true; engine.setFrozen(true); if (currentUserId !== gameData.leaver_id) { ui.toast('Opponent left – waiting for rejoin…'); sessionStorage.setItem('chess3d_frozen_game', gameData.id); } else sessionStorage.setItem('chess3d_frozen_game', gameData.id); } return; } if (frozen && gameData.status === 'active') { frozen = false; engine.setFrozen(false); ui.toast('Opponent rejoined!'); sessionStorage.removeItem('chess3d_frozen_game'); } const serverState = JSON.stringify(gameData.board_state); if (serverState !== lastKnownServerState) { lastKnownServerState = serverState; engine.syncBoardFromServer(gameData.board_state.brd, gameData.board_state.turn, gameData.board_state.cas, gameData.board_state.ep, gameData.timer_w, gameData.timer_b); } } catch (e) {} }

// Chat
function startChatPolling(gameId) { stopChatPolling(); chatPollInterval = setInterval(async () => { try { ui.displayChatMessages(await db.getChatMessages(gameId)); } catch (e) {} }, 2000); }
function stopChatPolling() { if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; } }
async function sendChat(msg) { if (!currentOnlineGame) return; const nickname = currentOnlineGame.host_player_id === currentUserId ? currentOnlineGame.host_nickname : currentOnlineGame.joiner_nickname; const row = await db.sendChatMessage(currentOnlineGame.id, currentUserId, nickname, msg); if (row) { ui.appendChatMessage(nickname, msg, true); ui.registerOwnMessage(row.id); } else { ui.appendChatMessage(nickname, msg, true); } }

// Move callback
async function onLocalMoveExecuted(move) { if (gameMode !== 'online' || !currentOnlineGame || moveSyncing || frozen) return; moveSyncing = true; try { const savedState = await db.pushBoardState(currentOnlineGame.id, engine.getBoardArray(), engine.getTurn(), engine.getCastling(), engine.getEnPassant(), engine.getTimerW(), engine.getTimerB()); lastKnownServerState = savedState; lastTimerSync = Date.now(); } catch (e) { ui.toast('Move sync failed.'); } finally { moveSyncing = false; } }

// Rematch
async function requestRematch() { if (!currentOnlineGame) return; clearInterval(rematchCountdownInterval); await db.sb.from('online_games').update({ rematch_requested_by: currentUserId, rematch_requested_at: new Date() }).eq('id', currentOnlineGame.id); document.getElementById('gos').textContent = 'Rematch requested...'; }
async function acceptRematch() { ui.toast('Rematch accepted.'); }
async function declineRematch() { if (currentOnlineGame) { await db.terminateGame(currentOnlineGame.id); resetOnlineState(); ui.showMenu(); } }

// Exit
function confirmExitOnline() { ui.showExitOnlinePanel(); }
async function exitOnlineGame() { if (!currentOnlineGame) return; stopOnlineGameLoop(); stopChatPolling(); const gameId = currentOnlineGame.id; if (currentOnlineGame.host_player_id === currentUserId) { await db.terminateGame(gameId); resetOnlineState(); ui.showMenu(); } else { await db.freezeGame(gameId, currentUserId); sessionStorage.setItem('chess3d_frozen_game', gameId); resetOnlineState(); ui.showMenu(); updateRejoinButtonsFromSession(); } }
function resetOnlineState() { stopOnlineGameLoop(); stopChatPolling(); stopWaitingPoll(); if (currentOnlineGame) sessionStorage.removeItem('chess3d_playerkey_' + currentOnlineGame.id); currentOnlineGame = null; sessionPlayerKey = null; myColor = 'w'; moveSyncing = false; lastKnownServerState = null; over = false; frozen = false; engine.setFrozen(false); ui.hideGameUI(); ui.hideGameOver(); engine.resetState(); started = false; gameMode = null; }
function handleBottomRight() { if (gameMode === 'online') confirmExitOnline(); else ui.showExitChoicePanel(); }
function exitWithSave() { saveBackup(); ui.hideGameUI(); ui.showMenu(); engine.resetState(); started = false; }
function exitWithoutSave() { if (confirm('Are you sure?')) { localStorage.removeItem('chess3d_backup_' + gameMode); ui.hideGameUI(); ui.showMenu(); engine.resetState(); started = false; } }

// Offline save/restore
let autoSaveInterval = null;
function saveBackup() { if (over || gameMode === 'online') return; localStorage.setItem('chess3d_backup_' + gameMode, JSON.stringify(engine.getBackupData())); }
function startAutoSave() { stopAutoSave(); autoSaveInterval = setInterval(() => { if (!over && started && gameMode !== 'online') saveBackup(); }, 2000); }
function stopAutoSave() { if (autoSaveInterval) { clearInterval(autoSaveInterval); autoSaveInterval = null; } }
function restoreLocalGame() { const ai = localStorage.getItem('chess3d_backup_ai'), pvp = localStorage.getItem('chess3d_backup_2p'); if (!ai && !pvp) { ui.toast('No backup found.'); return; } if (ai && !pvp) restoreLocalMode('ai'); else if (!ai && pvp) restoreLocalMode('2p'); else ui.showRestoreChoicePanel(); }
function restoreLocalMode(mode) { const dataStr = localStorage.getItem('chess3d_backup_' + mode); if (!dataStr) { ui.toast('No backup found.'); return; } const data = JSON.parse(dataStr); gameMode = mode; engine.setGameMode(mode); engine.restoreBackup(data); ui.hideAllPanels(); ui.showGameUI(); ui.setChatVisibility(false); ui.setOnlineBottomButtons(false); started = true; over = false; startAutoSave(); if (mode === 'ai' && engine.getTurn() !== engine.getPlayerColor()) engine.scheduleAI(300); }

// Cloud sync
async function syncOfflineToCloud() { if (!currentUserId) { ui.toast('Please log in to sync data.', 3000); return; } if (!navigator.onLine) { ui.toast('No internet connection.', 3000); return; } const aiBackup = localStorage.getItem('chess3d_backup_ai'); const pvpBackup = localStorage.getItem('chess3d_backup_2p'); if (!aiBackup && !pvpBackup) { ui.toast('No offline data to sync.', 4000); return; } ui.toast('Syncing data to cloud…', 2000); try { await db.syncOfflineToCloud(currentUserId); ui.toast('Synced data successfully', 3000); } catch (e) { ui.toast('Sync failed: ' + e.message, 4000); showError('sync', e); } }
async function restoreOfflineFromCloud() { if (!currentUserId) { ui.toast('Please log in to restore cloud data.', 3000); return; } if (!navigator.onLine) { ui.toast('No internet connection.', 3000); return; } ui.toast('Restoring data from cloud…', 2000); try { const result = await db.restoreOfflineFromCloud(currentUserId); if (Array.isArray(result)) { window._cloudBackups = result; ui.showCloudChoicePanel(); } else ui.toast('Restored data successfully', 3000); } catch (e) { ui.toast('Restore failed: ' + e.message, 4000); showError('restore', e); } }
function restoreCloudMode(mode) { const backups = window._cloudBackups; if (!backups) return; const backup = backups.find(b => b.mode === mode); if (!backup) return; localStorage.setItem('chess3d_backup_' + mode, JSON.stringify(backup.backup_data)); ui.hideAllPanels(); restoreLocalMode(mode); ui.toast('Restored cloud backup.', 3000); }
async function deleteAllSyncedData() { if (!currentUserId) { ui.toast('Please log in to delete synced data.', 3000); return; } if (!navigator.onLine) { ui.toast('No internet connection.', 3000); return; } try { await db.deleteAllSyncedData(currentUserId); ui.toast('Cloud data deleted.', 3000); } catch (e) { ui.toast('Delete failed: ' + e.message, 4000); showError('delete', e); } }

function generatePlayerKey() { return Math.random().toString(36).substring(2, 15); }

window.requestRematch = requestRematch; window.exitOnlineGame = exitOnlineGame; window.newGameAction = newGame; window.exitGameAction = handleBottomRight;

// Offline detection
(function() { const notify = document.getElementById('offline-notification'); function show() { if (notify) notify.classList.add('show'); } window.addEventListener('offline', show); window.addEventListener('online', () => { if (gameMode && gameMode !== 'online' && started && !over) saveBackup(); setTimeout(() => location.reload(), 150); }); if (!navigator.onLine) show(); })();

init();