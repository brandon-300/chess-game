// main.js — Orchestrator for Chess 3D (cloud restore fixed + all features)

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
    return true;
}

async function ensureVoiceLoaded() {
    if (voice) return true;
    try { voice = await import('./voice_handler.js'); return true; }
    catch (e) { showError('import voice_handler.js', e); return false; }
}

window.undoAIDraw = function() {
    if (gameMode !== 'ai' || !over) return;
    undoMove();
    ui.hideGameOver();
};

function updateMoveDrawer() {
    if (gameMode === 'online') return;
    ui.clearMoveDrawer();
    const moves = engine.getMoveLogDisplay();
    moves.forEach(m => ui.appendMoveToDrawer(m));
}

async function saveGameHistory(resultType) {
    if (!currentUserId) return;
    const opponentName = getOpponentName();
    const result = getResultText(resultType);
    const moves = engine.getMoveLogDisplay();
    try {
        await db.saveMatchHistory(currentUserId, opponentName, result, myColor, gameMode, moves);
    } catch (e) {
        showError('saveHistory', e);
    }
}

function getOpponentName() {
    if (gameMode === 'ai') return 'Computer';
    if (gameMode === '2p') return 'Player 2';
    if (currentOnlineGame) {
        return currentOnlineGame.host_player_id === currentUserId
            ? currentOnlineGame.joiner_nickname || 'Opponent'
            : currentOnlineGame.host_nickname || 'Opponent';
    }
    return 'Unknown';
}

function getResultText(resultType) {
    if (resultType === 'draw') return 'draw';
    if (gameMode === 'ai') {
        if (resultType === engine.getPlayerColor()) return 'win';
        return 'loss';
    }
    if (gameMode === '2p') {
        return resultType === 'Red' ? 'win' : 'loss';
    }
    const iWon = (myColor === 'w' && resultType === 'Red') || (myColor === 'b' && resultType === 'Black');
    return iWon ? 'win' : 'loss';
}

async function init() {
    if (!await loadModules()) return;
    try {
        currentUserId = await db.initAuth();
        updateDebugOverlay();

        ui.initUI({
            onStart2P: () => startOfflineGame('2p'),
            onStartAI: () => showAiDiffPanel(),
            onOnlineMenu: () => showOnlineMenu(),
            onChatSend: (msg) => { /* future */ },
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
            onAiCountdownFinished: () => startOfflineGame('ai'),
            // NEW – missing cloud restore callbacks
            onCloudRestoreAI: () => restoreCloudMode('ai'),
            onCloudRestore2P: () => restoreCloudMode('2p'),
        });

        engine.initEngine(document.getElementById('cv'), onLocalMoveExecuted);

        engine.setMoveCallback((move) => {
            if (gameMode !== 'online' && started) {
                updateMoveDrawer();
            }
        });

        engine.setFrameCallback((state) => {
            if (!started) return;
            const isOnline = gameMode === 'online';
            ui.updateTurnIndicator(state.turn, myColor, isOnline);
            ui.updateTimers(state.timerW, state.timerB, state.turn);
            if (state.over) {
                const info = engine.getGameOverInfo();
                if (info) {
                    let title, subtitle;
                    if (gameMode === 'ai') {
                        if (info.resultType === 'draw') {
                            title = "It's a draw!";
                            subtitle = 'Stalemate / Threefold repetition';
                        } else {
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

                    let buttonsHTML = '';
                    if (isOnline && info.resultType !== 'draw') {
                        buttonsHTML = '<button onclick="window.requestRematch()">Rematch</button><button onclick="window.exitOnlineGame()">Exit</button>';
                    } else if (isOnline) {
                        buttonsHTML = '<button onclick="window.exitOnlineGame()">Exit</button>';
                    } else if (gameMode === 'ai' && info.resultType === 'draw') {
                        buttonsHTML = '<button onclick="window.undoAIDraw()">Undo last move</button>';
                    }

                    ui.showGameOver(title, subtitle, buttonsHTML);
                    over = true;

                    saveGameHistory(info.resultType);

                    if (!isOnline) {
                        setTimeout(() => {
                            if (over) {
                                ui.hideGameOver();
                                ui.showMenu();
                                engine.resetState();
                                started = false;
                                gameMode = null;
                                over = false;
                            }
                        }, 5000);
                    }
                }
            }
            if (state.promotionPending) ui.showPromotion(engine.getTurn());
            if (isOnline && currentOnlineGame && !moveSyncing && !over && Date.now() - lastTimerSync > 1000) { lastTimerSync = Date.now(); syncTimers(); }
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
function showOnlineMenu() {
    if (!currentUserId) { ui.showLoginGate(); return; }
    ui.showPanel('online-menu');
}

// ---- Lobby Integration ----
async function onlineGameCreated(game, hostKey) {
    currentOnlineGame = game;
    sessionPlayerKey = hostKey;
    sessionStorage.setItem('chess3d_playerkey_' + game.id, hostKey);
    ui.hideAllPanels();
    ui.showLobbyPanel(game.host_nickname, game.room_code);
    const avatarUrl = await db.fetchUserAvatar(game.host_player_id);
    const av = document.getElementById('lobby-avatar');
    if (av && avatarUrl) {
        av.style.background = `url(${avatarUrl}) center/cover`;
        av.style.borderColor = 'var(--gold)';
    }
    startWaitingPoll(game.id);
}

async function onlineGameJoined(game, joinerKey) {
    currentOnlineGame = game;
    sessionPlayerKey = joinerKey;
    sessionStorage.setItem('chess3d_playerkey_' + game.id, joinerKey);
    myColor = 'b';
    ui.hideAllPanels();
    ui.showLobbyPanel(game.host_nickname || 'Opponent', game.room_code);
    const avatarUrl = await db.fetchUserAvatar(game.host_player_id);
    const av = document.getElementById('lobby-avatar');
    if (av && avatarUrl) {
        av.style.background = `url(${avatarUrl}) center/cover`;
        av.style.borderColor = 'var(--gold)';
    }
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
                const opponentName = currentUserId === data.host_player_id ? data.joiner_nickname : data.host_nickname;
                ui.hideLobbyPanel();
                ui.startOnlineCountdown(data.host_nickname, data.room_code, () => {
                    startOnlineGame();
                });
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

async function acceptRematch() { }
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
    const eop = document.getElementById('exit-online-panel');
    if (eop) eop.classList.remove('show');
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

// ---- Offline / AI / Save / Restore ----
function startOfflineGame(mode) {
    gameMode = mode; ui.hideAllPanels(); ui.showGameUI(); ui.setVoiceControlsVisibility(false); ui.setOnlineBottomButtons(false);
    started = true; engine.startGame(mode); over = false;
    updateMoveDrawer();
    if (mode === 'ai' && engine.getPlayerColor() === 'b') engine.scheduleAI(500);
    startAutoSave();
}
function newGame() {
    if (gameMode === 'online') return;
    engine.newGame(); over = false; ui.hideGameOver();
    updateMoveDrawer();
    if (gameMode === 'ai' && engine.getPlayerColor() === 'b') engine.scheduleAI(500);
    saveBackup();
}
function undoMove() {
    if (gameMode === 'online') return;
    engine.undoMove(); saveBackup();
    updateMoveDrawer();
}

function showAiDiffPanel() {
    ui.hideAllPanels();
    document.getElementById('ai-diff-panel')?.classList.add('show');
}

function exitWithSave() {
    saveBackup();
    ui.hideGameUI();
    ui.showMenu();
    engine.resetState();
    started = false;
    const ecp = document.getElementById('exit-choice-panel');
    if (ecp) ecp.classList.remove('show');
}
function exitWithoutSave() {
    if (confirm('Are you sure?')) {
        localStorage.removeItem('chess3d_backup_' + gameMode);
        ui.hideGameUI();
        ui.showMenu();
        engine.resetState();
        started = false;
        const ecp = document.getElementById('exit-choice-panel');
        if (ecp) ecp.classList.remove('show');
    }
}

let autoSaveInterval = null;
function saveBackup() { if (over || gameMode === 'online') return; localStorage.setItem('chess3d_backup_' + gameMode, JSON.stringify(engine.getBackupData())); }
function startAutoSave() { stopAutoSave(); autoSaveInterval = setInterval(() => { if (!over && started && gameMode !== 'online') saveBackup(); }, 2000); }
function stopAutoSave() { if (autoSaveInterval) { clearInterval(autoSaveInterval); autoSaveInterval = null; } }
function restoreLocalGame() {
    const ai = localStorage.getItem('chess3d_backup_ai'), pvp = localStorage.getItem('chess3d_backup_2p');
    if (!ai && !pvp) { ui.toast('No backup found.'); return; }
    if (ai && !pvp) restoreLocalMode('ai');
    else if (!ai && pvp) restoreLocalMode('2p');
    else {
        document.getElementById('restore-choice-panel')?.classList.add('show');
    }
}
function restoreLocalMode(mode) {
    const dataStr = localStorage.getItem('chess3d_backup_' + mode);
    if (!dataStr) { ui.toast('No backup found.'); return; }
    const data = JSON.parse(dataStr);
    gameMode = mode; engine.setGameMode(mode); engine.restoreBackup(data);
    ui.hideAllPanels(); ui.showGameUI(); ui.setVoiceControlsVisibility(false); ui.setOnlineBottomButtons(false);
    started = true; over = false; startAutoSave();
    updateMoveDrawer();
    if (mode === 'ai' && engine.getTurn() !== engine.getPlayerColor()) engine.scheduleAI(300);
}

// Cloud sync
async function syncOfflineToCloud() {
    if (!currentUserId) { ui.toast('Please log in to sync data.'); return; }
    if (!navigator.onLine) { ui.toast('No internet connection.'); return; }
    const aiBackup = localStorage.getItem('chess3d_backup_ai');
    const pvpBackup = localStorage.getItem('chess3d_backup_2p');
    if (!aiBackup && !pvpBackup) { ui.toast('No offline data to sync.'); return; }
    ui.toast('Syncing data to cloud…');
    try { await db.syncOfflineToCloud(currentUserId); ui.toast('Synced data successfully'); } catch (e) { ui.toast('Sync failed: ' + e.message); showError('sync', e); }
}
async function restoreOfflineFromCloud() {
    if (!currentUserId) { ui.toast('Please log in to restore cloud data.'); return; }
    if (!navigator.onLine) { ui.toast('No internet connection.'); return; }
    ui.toast('Restoring data from cloud…');
    try {
        const result = await db.restoreOfflineFromCloud(currentUserId);
        if (Array.isArray(result)) {
            window._cloudBackups = result;
            document.getElementById('cloud-choice-panel')?.classList.add('show');
        } else ui.toast('Restored data successfully');
    } catch (e) { ui.toast('Restore failed: ' + e.message); showError('restore', e); }
}
function restoreCloudMode(mode) {
    const backups = window._cloudBackups;
    if (!backups) return;
    const backup = backups.find(b => b.mode === mode);
    if (!backup) return;
    localStorage.setItem('chess3d_backup_' + mode, JSON.stringify(backup.backup_data));
    ui.hideAllPanels();
    restoreLocalMode(mode);
    ui.toast('Restored cloud backup.', 3000);
}
async function deleteAllSyncedData() {
    if (!currentUserId) { ui.toast('Please log in to delete synced data.'); return; }
    if (!navigator.onLine) { ui.toast('No internet connection.'); return; }
    try { await db.deleteAllSyncedData(currentUserId); ui.toast('Cloud data deleted.'); } catch (e) { ui.toast('Delete failed: ' + e.message); showError('delete', e); }
}

// Voice
async function toggleMic() {
    if (!voice) return;
    if (voice.isMicOn()) { voice.disableMic(); ui.setMicState(false); return; }
    try { await voice.enableMic(); ui.setMicState(true); } catch (e) { ui.setMicState(false); }
}
function toggleSpeaker() { if (!voice) return; const next = !voice.isSpeakerOn(); voice.setSpeakerEnabled(next); ui.setSpeakerState(next); }
async function startVoice() {
    if (!currentOnlineGame) return;
    if (!await ensureVoiceLoaded()) { ui.toast('Voice chat unavailable.'); return; }
    const isPolite = currentOnlineGame.host_player_id !== currentUserId;
    voiceChannel = db.subscribeVoiceSignal(currentOnlineGame.id, (payload) => voice.handleRemoteSignal(payload));
    voice.initVoice({
        isPolite,
        sendSignal: (payload) => db.sendVoiceSignal(voiceChannel, payload),
        onTalkingChange: (talking) => ui.setOpponentTalking(talking, getOpponentNickname()),
        onMicError: () => ui.toast('Microphone unavailable or permission denied.')
    });
    ui.setVoiceControlsVisibility(true);
    ui.resetVoiceState();
}
function stopVoice() {
    if (voice) voice.closeConnection();
    if (voiceChannel) { db.unsubscribeVoiceSignal(voiceChannel); voiceChannel = null; }
    ui.setVoiceControlsVisibility(false);
}
function getOpponentNickname() {
    if (!currentOnlineGame) return '';
    return currentOnlineGame.host_player_id === currentUserId ? currentOnlineGame.joiner_nickname : currentOnlineGame.host_nickname;
}

// Online sync
function startOnlineGameLoop() { stopOnlineGameLoop(); pollInterval = setInterval(pollGameState, 500); }
function stopOnlineGameLoop() { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } }

async function pollGameState() {
    if (!currentOnlineGame || moveSyncing || over) return;
    try {
        const gameData = await db.fetchGameState(currentOnlineGame.id);
        if (!gameData) return;
        if (gameData.status === 'terminated') {
            if (currentUserId !== gameData.host_player_id) ui.toast('Match terminated by the host.');
            resetOnlineState(); ui.showMenu(); return;
        }
        if (gameData.status === 'frozen') {
            if (!frozen) {
                frozen = true; engine.setFrozen(true);
                if (voice && voice.isMicOn()) { voice.disableMic(); ui.setMicState(false); }
                if (currentUserId !== gameData.leaver_id) {
                    ui.toast('Opponent left – waiting for rejoin…');
                    sessionStorage.setItem('chess3d_frozen_game', gameData.id);
                } else sessionStorage.setItem('chess3d_frozen_game', gameData.id);
            }
            return;
        }
        if (frozen && gameData.status === 'active') {
            frozen = false; engine.setFrozen(false);
            ui.toast('Opponent rejoined!');
            sessionStorage.removeItem('chess3d_frozen_game');
            stopVoice(); startVoice();
        }
        const serverState = JSON.stringify(gameData.board_state);
        if (serverState !== lastKnownServerState) {
            lastKnownServerState = serverState;
            engine.syncBoardFromServer(gameData.board_state.brd, gameData.board_state.turn, gameData.board_state.cas, gameData.board_state.ep, gameData.timer_w, gameData.timer_b);
        }
    } catch (e) {}
}

async function syncTimers() {
    if (!currentOnlineGame) return;
    try { await db.sb.from('online_games').update({ timer_w: engine.getTimerW(), timer_b: engine.getTimerB() }).eq('id', currentOnlineGame.id); } catch (e) {}
}

async function onLocalMoveExecuted(move) {
    if (gameMode !== 'online' || !currentOnlineGame || moveSyncing || frozen) return;
    moveSyncing = true;
    try {
        const savedState = await db.pushBoardState(currentOnlineGame.id, engine.getBoardArray(), engine.getTurn(), engine.getCastling(), engine.getEnPassant(), engine.getTimerW(), engine.getTimerB());
        lastKnownServerState = savedState; lastTimerSync = Date.now();
    } catch (e) { ui.toast('Move sync failed.'); } finally { moveSyncing = false; }
}

// Room creation/joining
async function createPublicRoom() { /* unchanged */ }
async function createPrivateRoom() { /* unchanged */ }
async function joinPublicRoom() { /* unchanged */ }
async function joinPrivateRoom() { /* unchanged */ }
async function rejoinPublicGame() { /* unchanged */ }
function enterOnlineGame(game) { /* unchanged */ }
function generatePlayerKey() { return Math.random().toString(36).substring(2, 15); }

// Offline detection
(function() {
    const notify = document.getElementById('offline-notification');
    function show() { if (notify) notify.classList.add('show'); }
    window.addEventListener('offline', show);
    window.addEventListener('online', () => {
        if (gameMode && gameMode !== 'online' && started && !over) saveBackup();
        setTimeout(() => location.reload(), 150);
    });
    if (!navigator.onLine) show();
})();

window.requestRematch = requestRematch;
window.exitOnlineGame = exitOnlineGame;
window.newGameAction = newGame;
window.exitGameAction = handleBottomRight;

init();