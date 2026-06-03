// main.js — DIAGNOSTIC VERSION (logs to #error-log)

function showError(source, err) {
    const log = document.getElementById('error-log');
    if (log) { log.style.display = 'block'; log.textContent += `[${source}] ${err.message || err}\n`; console.error(`[${source}]`, err); }
}

function screenLog(msg) {
    const log = document.getElementById('error-log');
    if (log) { log.style.display = 'block'; log.textContent += msg + '\n'; }
}

let gameMode = null, currentOnlineGame = null, myColor = 'w', sessionPlayerKey = null, started = false, over = false, frozen = false, currentUserId = null;
let moveSyncing = false, lastKnownServerState = null, pollInterval = null, chatPollInterval = null, rematchCountdownInterval = null, waitingPollInterval = null, lastTimerSync = 0;
let db, engine, ui;

async function loadModules() {
    try { db = await import('./database.js'); screenLog('database.js loaded'); } catch (e) { screenLog('FAIL: database.js - ' + e.message); return false; }
    try { engine = await import('./game_engine.js'); screenLog('game_engine.js loaded'); } catch (e) { screenLog('FAIL: game_engine.js - ' + e.message); return false; }
    try { ui = await import('./ui_handler.js'); screenLog('ui_handler.js loaded'); } catch (e) { screenLog('FAIL: ui_handler.js - ' + e.message); return false; }
    return true;
}

async function init() {
    if (!await loadModules()) return;
    screenLog('All modules loaded');

    try {
        currentUserId = await db.initAuth();
        screenLog('User ID: ' + (currentUserId ? currentUserId.slice(0,8)+'…' : 'null'));

        ui.initUI({
            onStart2P: () => startOfflineGame('2p'),
            onStartAI: showAiDiffPanel,
            onOnlineMenu: showOnlineMenu,
            onCreatePublicRoom: createPublicRoom,
            onJoinPublicRoom: joinPublicRoom,
            onRejoinPublic: rejoinPublicGame,
            onCreatePrivateRoom: createPrivateRoom,
            onJoinPrivateRoom: joinPrivateRoom,
            onCancelWaiting: cancelWaiting,
            onCountdownFinished: () => startOnlineGame(),
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
            onExitOnlineYes: exitOnlineGame,
            onRestoreLocal: restoreLocalGame,
            onSyncOfflineCloud: () => { screenLog('Sync button clicked'); syncOfflineToCloud(); },
            onRestoreOfflineCloud: () => restoreOfflineFromCloud(),
            onDeleteSynced: () => { screenLog('Delete button clicked'); deleteAllSyncedData(); },
            onRestoreAI: () => restoreLocalMode('ai'),
            onRestore2P: () => restoreLocalMode('2p'),
            onCloudRestoreAI: () => restoreCloudMode('ai'),
            onCloudRestore2P: () => restoreCloudMode('2p')
        });
        screenLog('UI callbacks registered');

        engine.initEngine(document.getElementById('cv'), onLocalMoveExecuted);
        screenLog('Engine initialized');

        engine.setFrameCallback((state) => {
            if (!started) return;
            const isOnline = gameMode === 'online';
            ui.updateTurnIndicator(state.turn, myColor, isOnline);
            ui.updateTimers(state.timerW, state.timerB, state.turn);
            ui.updateThinkingIndicator(state.aiThink);
            if (state.over) {
                screenLog('Game over detected');
                const info = engine.getGameOverInfo();
                screenLog('Info: ' + JSON.stringify(info));
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
                    screenLog('Calling showGameOver: ' + title);
                    ui.showGameOver(title, subtitle,
                        isOnline && info.resultType !== 'draw'
                            ? '<button onclick="window.requestRematch()">Request Rematch</button><button class="sec" onclick="window.exitOnlineGame()">Exit</button>'
                            : isOnline ? '<button onclick="window.exitOnlineGame()">Exit</button>' : '');
                    over = true;
                    if (!isOnline) {
                        setTimeout(() => { ui.hideGameOver(); ui.showMenu(); engine.resetState(); started = false; gameMode = null; over = false; }, 5000);
                    }
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
        screenLog('Init complete');
    } catch (err) { screenLog('INIT ERROR: ' + err.message); }
}

async function updateHeaderWithAvatar() {
    if (currentUserId && db) { const p = await db.fetchProfileData(currentUserId); ui.updateHeaderUI(currentUserId, p.avatar_url); }
    else ui.updateHeaderUI(null);
}

function updateDebugOverlay() {
    const sbStatus = db ? db.getSbStatus() : 'db not loaded';
    document.getElementById('debug-overlay').textContent = `Supabase: ${sbStatus}\nUser ID: ${currentUserId ? currentUserId.slice(0,8)+'…' : 'not logged in'}`;
}

// … (all other standard functions unchanged – I'll include the sync function with logging below)

async function syncOfflineToCloud() {
    screenLog('syncOfflineToCloud entered');
    screenLog('currentUserId: ' + currentUserId + ', online: ' + navigator.onLine);
    const aiBackup = localStorage.getItem('chess3d_backup_ai');
    const pvpBackup = localStorage.getItem('chess3d_backup_2p');
    screenLog('AI backup: ' + !!aiBackup + ', PvP backup: ' + !!pvpBackup);
    if (!currentUserId) { screenLog('→ showing "Please log in" toast'); ui.toast('Please log in to sync data.', 3000); return; }
    if (!navigator.onLine) { screenLog('→ showing "No internet" toast'); ui.toast('No internet connection.', 3000); return; }
    if (!aiBackup && !pvpBackup) { screenLog('→ showing "No offline data" toast'); ui.toast('No offline data to sync.', 4000); return; }
    screenLog('→ calling db.syncOfflineToCloud…');
    try {
        await db.syncOfflineToCloud(currentUserId);
        screenLog('→ sync success');
        ui.toast('Synced data successfully', 3000);
    } catch (e) {
        screenLog('→ sync failed: ' + e.message);
        ui.toast('Sync failed: ' + e.message, 4000);
    }
}

// [all other functions unchanged – I'll include the complete file in the next message if needed]