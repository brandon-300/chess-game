// database.js — All Supabase interactions for Chess 3D

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// ---------- Supabase client ----------
let sb = null;
let sbStatus = 'Loading...';
try {
    sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    sbStatus = 'Loaded';
} catch (e) {
    sbStatus = 'Error: ' + e.message;
}

export function getSbStatus() {
    return sbStatus;
}

// ---------- Auth ----------
export async function initAuth() {
    if (!sb) return null;
    const { data: { session } } = await sb.auth.getSession();
    return session?.user?.id || null;
}

// ---------- Profiles ----------
export async function fetchUsername(userId) {
    if (!sb) return null;
    const { data, error } = await sb
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .maybeSingle();
    if (error) {
        console.error('fetchUsername error:', error);
        return null;
    }
    return data?.username || null;
}

// ---------- Online Games ----------

// Generic fetch of a full game row
export async function fetchGameState(gameId) {
    if (!sb) return null;
    const { data, error } = await sb
        .from('online_games')
        .select('*')
        .eq('id', gameId)
        .maybeSingle();
    if (error) {
        console.error('fetchGameState error:', error);
        return null;
    }
    if (!data) return null;

    // Parse board_state string into object
    if (typeof data.board_state === 'string') {
        try {
            data.board_state = JSON.parse(data.board_state);
        } catch (e) {
            console.error('Corrupted board_state JSON from DB:', data.board_state);
            data.board_state = null;
        }
    }
    return data;
}

// Push board state (used after a move)
export async function pushBoardState(gameId, board, turn, cas, ep, timerW, timerB) {
    if (!sb) throw new Error('Supabase not available');
    const stateString = JSON.stringify({ brd: board, turn, cas, ep });
    const { error } = await sb
        .from('online_games')
        .update({
            board_state: stateString,
            timer_w: timerW,
            timer_b: timerB
        })
        .eq('id', gameId);
    if (error) throw error;
    return stateString;
}

// Create a new game (public or private)
export async function createGame(roomCode, type, hostId, hostKey, hostNickname) {
    if (!sb) throw new Error('Supabase not available');
    const code = roomCode || generateRoomCode(8);
    const { data, error } = await sb
        .from('online_games')
        .insert({
            room_code: code,
            type: type,
            host_player_id: hostId,
            host_player_key: hostKey,
            host_nickname: hostNickname,
            status: 'waiting_for_joiner',
            host_color: 'w',
            board_state: JSON.stringify({
                brd: initBoardArray(),
                turn: 'w',
                cas: { wK: true, wQ: true, bK: true, bQ: true },
                ep: null
            }),
            timer_w: 60,
            timer_b: 60
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

// Join the oldest available public room
export async function joinPublicGame(joinerId, joinerKey, joinerNickname) {
    if (!sb) throw new Error('Supabase not available');
    // Find oldest waiting public room
    const { data: rooms, error: selectError } = await sb
        .from('online_games')
        .select('*')
        .eq('type', 'public')
        .eq('status', 'waiting_for_joiner')
        .order('created_at', { ascending: true })
        .limit(1);
    if (selectError) throw selectError;
    if (!rooms || rooms.length === 0) throw new Error('No rooms available');

    const game = rooms[0];
    const { error: updateError } = await sb
        .from('online_games')
        .update({
            joiner_player_id: joinerId,
            joiner_player_key: joinerKey,
            joiner_nickname: joinerNickname,
            status: 'countdown'
        })
        .eq('id', game.id)
        .eq('status', 'waiting_for_joiner');
    if (updateError) throw updateError;

    return { ...game, joiner_player_id: joinerId, joiner_nickname: joinerNickname, status: 'countdown' };
}

// Join a private room by code
export async function joinPrivateGame(roomCode, joinerId, joinerKey, joinerNickname) {
    if (!sb) throw new Error('Supabase not available');
    const { data: game, error: selectError } = await sb
        .from('online_games')
        .select('*')
        .eq('room_code', roomCode)
        .eq('type', 'private')
        .maybeSingle();
    if (selectError) throw selectError;
    if (!game) throw new Error('Room not found');
    if (game.status !== 'waiting_for_joiner') throw new Error('Room is no longer open');

    const { error: updateError } = await sb
        .from('online_games')
        .update({
            joiner_player_id: joinerId,
            joiner_player_key: joinerKey,
            joiner_nickname: joinerNickname,
            status: 'countdown'
        })
        .eq('id', game.id)
        .eq('status', 'waiting_for_joiner');
    if (updateError) throw updateError;

    return { ...game, joiner_player_id: joinerId, joiner_nickname: joinerNickname, status: 'countdown' };
}

// Update game status (used for starting, terminating, freezing)
export async function updateGameStatus(gameId, status) {
    if (!sb) throw new Error('Supabase not available');
    const { error } = await sb.from('online_games').update({ status }).eq('id', gameId);
    if (error) throw error;
}

// Terminate game (host or explicit end)
export async function terminateGame(gameId) {
    return updateGameStatus(gameId, 'terminated');
}

// Freeze game (joiner leaves)
export async function freezeGame(gameId, leaverId) {
    if (!sb) throw new Error('Supabase not available');
    const { error } = await sb.from('online_games').update({
        status: 'frozen',
        leaver_id: leaverId,
        leave_time: new Date()
    }).eq('id', gameId);
    if (error) throw error;
}

// Cancel a waiting room
export async function cancelGame(gameId) {
    return updateGameStatus(gameId, 'cancelled');
}

// ---------- Chat ----------
export async function getChatMessages(gameId) {
    if (!sb) return [];
    const { data, error } = await sb
        .from('chat_messages')
        .select('*')
        .eq('game_id', gameId)
        .order('id', { ascending: true });
    if (error) {
        console.error('getChatMessages error:', error);
        return [];
    }
    return data || [];
}

export async function sendChatMessage(gameId, playerId, nickname, message) {
    if (!sb) return;
    const { error } = await sb.from('chat_messages').insert({
        game_id: gameId,
        player_id: playerId,
        nickname: nickname,
        message: message
    });
    if (error) console.error('sendChatMessage error:', error);
}

// ---------- Offline backup sync ----------
export async function syncOfflineToCloud(userId) {
    if (!sb || !userId) return;
    const aiBackup = JSON.parse(localStorage.getItem('chess3d_backup_ai') || 'null');
    const pvpBackup = JSON.parse(localStorage.getItem('chess3d_backup_2p') || 'null');
    if (!aiBackup && !pvpBackup) throw new Error('No offline data to sync');

    if (aiBackup) {
        const { error } = await sb.from('offline_backups').upsert(
            { user_id: userId, mode: 'ai', backup_data: aiBackup },
            { onConflict: 'user_id,mode' }
        );
        if (error) throw error;
    }
    if (pvpBackup) {
        const { error } = await sb.from('offline_backups').upsert(
            { user_id: userId, mode: '2p', backup_data: pvpBackup },
            { onConflict: 'user_id,mode' }
        );
        if (error) throw error;
    }
}

export async function restoreOfflineFromCloud(userId, onSelectMode) {
    if (!sb || !userId) return;
    const { data, error } = await sb
        .from('offline_backups')
        .select('*')
        .eq('user_id', userId);
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('No cloud backup found');
    if (data.length === 1) {
        const backup = data[0];
        localStorage.setItem(
            backup.mode === 'ai' ? 'chess3d_backup_ai' : 'chess3d_backup_2p',
            JSON.stringify(backup.backup_data)
        );
        onSelectMode(backup.mode);
    } else {
        // More than one backup → show choice (handled in main.js)
        return data; // returns array of backups
    }
}

export async function deleteAllSyncedData(userId) {
    if (!sb || !userId) throw new Error('Supabase not available');
    const { error } = await sb.from('offline_backups').delete().eq('user_id', userId);
    if (error) throw error;
}

// ---------- Utilities ----------
function generateRoomCode(len = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let code = '';
    for (let i = 0; i < len; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// Standard initial board array (used for game creation)
function initBoardArray() {
    const b = Array(64).fill(null);
    ['R','N','B','Q','K','B','N','R'].forEach((p, c) => {
        b[0 * 8 + c] = 'b' + p;
        b[7 * 8 + c] = 'w' + p;
    });
    for (let c = 0; c < 8; c++) {
        b[1 * 8 + c] = 'bP';
        b[6 * 8 + c] = 'wP';
    }
    return b;
}