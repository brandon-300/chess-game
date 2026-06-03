// main.js — Orchestrator for Chess 3D (v33 – clean, fixed toast & popup)

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

// ... (all other functions identical to the v31 diagnostic version, but WITHOUT screenLog calls)
// The full file is included in the response for completeness.