// database.js — All Supabase interactions for Chess 3D

let sb = null;
let sbStatus = 'Loading...';

try {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        sb = window.supabase.createClient(
            window.SUPABASE_URL,
            window.SUPABASE_KEY
        );
        sbStatus = 'Loaded';
    } else {
        sbStatus = 'Supabase script not loaded';
        console.error('Supabase global not found');
    }
} catch (e) {
    sbStatus = 'Error: ' + e.message;
}

export function getSbStatus() { return sbStatus; }

// ---------- Auth ----------
export async function initAuth() {
    if (!sb) return null;
    try {
        const { data: { session } } = await sb.auth.getSession();
        return session?.user?.id || null;
    } catch (e) { return null; }
}

// ---------- Profiles ----------
export async function fetchUsername(userId) {
    if (!sb) return null;
    const { data } = await sb.from('profiles').select('username').eq('id', userId).maybeSingle();
    return data?.username || null;
}

export async function fetchProfileData(userId) {
    if (!sb) return { username: null, avatar_url: null };
    const { data } = await sb.from('profiles').select('username, avatar_url').eq('id', userId).maybeSingle();
    return data || { username: null, avatar_url: null };
}

export async function fetchUserAvatar(userId) {
    if (!sb || !userId) return null;
    const { data } = await sb.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
    return data?.avatar_url || null;
}

// ---------- Online Games ----------
export async function fetchGameState(gameId) {
    if (!sb) return null;
    const { data } = await sb.from('online_games').select('*').eq('id', gameId).maybeSingle();
    if (!data) return null;
    if (typeof data.board_state === 'string') {
        try { data.board_state = JSON.parse(data.board_state); } catch (e) { data.board_state = null; }
    }
    return data;
}

export async function pushBoardState(gameId, board, turn, cas, ep, timerW, timerB) {
    if (!sb) throw new Error('Supabase not available');
    const stateString = JSON.stringify({ brd: board, turn, cas, ep });
    const { error } = await sb.from('online_games').update({
        board_state: stateString, timer_w: timerW, timer_b: timerB
    }).eq('id', gameId);
    if (error) throw error;
    return stateString;
}

export async function createGame(roomCode, type, hostId, hostKey, hostNickname) {
    if (!sb) throw new Error('Supabase not available');
    const code = roomCode || generateRoomCode(8);
    const { data, error } = await sb.from('online_games').insert({
        room_code: code, type, host_player_id: hostId, host_player_key: hostKey,
        host_nickname: hostNickname, status: 'waiting_for_joiner', host_color: 'w',
        board_state: JSON.stringify({ brd: initBoardArray(), turn: 'w', cas: { wK: true, wQ: true, bK: true, bQ: true }, ep: null }),
        timer_w: 60, timer_b: 60
    }).select().single();
    if (error) throw error;
    return data;
}

// FIXED: now picks the MOST RECENT waiting room (descending order)
export async function joinPublicGame(joinerId, joinerKey, joinerNickname) {
    if (!sb) throw new Error('Supabase not available');
    const { data: rooms, error: selectError } = await sb.from('online_games')
        .select('*').eq('type', 'public').eq('status', 'waiting_for_joiner')
        .order('created_at', { ascending: false }).limit(1);
    if (selectError) throw selectError;
    if (!rooms || rooms.length === 0) throw new Error('No rooms available');
    const game = rooms[0];
    const { error: updateError } = await sb.from('online_games').update({
        joiner_player_id: joinerId, joiner_player_key: joinerKey,
        joiner_nickname: joinerNickname, status: 'countdown'
    }).eq('id', game.id).eq('status', 'waiting_for_joiner');
    if (updateError) throw updateError;
    return { ...game, joiner_player_id: joinerId, joiner_nickname: joinerNickname, status: 'countdown' };
}

export async function joinPrivateGame(roomCode, joinerId, joinerKey, joinerNickname) {
    if (!sb) throw new Error('Supabase not available');
    const { data: game, error: selectError } = await sb.from('online_games')
        .select('*').eq('room_code', roomCode).eq('type', 'private').maybeSingle();
    if (selectError) throw selectError;
    if (!game) throw new Error('Room not found');

    if (game.status === 'frozen') {
        if (game.leaver_id !== joinerId) throw new Error('You cannot join this match because it has already started.');
        if (Date.now() - new Date(game.leave_time).getTime() > 10 * 60 * 1000) {
            await terminateGame(game.id);
            throw new Error('Rejoin window expired. The match has been terminated.');
        }
        const { error: updateError } = await sb.from('online_games')
            .update({ status: 'active', leaver_id: null, leave_time: null })
            .eq('id', game.id).eq('status', 'frozen');
        if (updateError) throw updateError;
        return { ...game, status: 'active', leaver_id: null, leave_time: null };
    }

    if (game.status !== 'waiting_for_joiner') throw new Error('Room is no longer open.');

    const { error: updateError } = await sb.from('online_games').update({
        joiner_player_id: joinerId, joiner_player_key: joinerKey,
        joiner_nickname: joinerNickname, status: 'countdown'
    }).eq('id', game.id).eq('status', 'waiting_for_joiner');
    if (updateError) throw updateError;
    return { ...game, joiner_player_id: joinerId, joiner_nickname: joinerNickname, status: 'countdown' };
}

export async function updateGameStatus(gameId, status) {
    if (!sb) throw new Error('Supabase not available');
    const { error } = await sb.from('online_games').update({ status }).eq('id', gameId);
    if (error) throw error;
}

export async function terminateGame(gameId) { return updateGameStatus(gameId, 'terminated'); }

export async function freezeGame(gameId, leaverId) {
    if (!sb) throw new Error('Supabase not available');
    const { error } = await sb.from('online_games').update({
        status: 'frozen', leaver_id: leaverId, leave_time: new Date()
    }).eq('id', gameId);
    if (error) throw error;
}

export async function unfreezeGame(gameId, joinerId) {
    if (!sb) throw new Error('Supabase not available');
    const { data: game } = await sb.from('online_games').select('*').eq('id', gameId).maybeSingle();
    if (!game || game.status !== 'frozen') throw new Error('Game is not frozen.');
    if (game.leaver_id !== joinerId) throw new Error('Only the player who left can rejoin.');
    if (Date.now() - new Date(game.leave_time).getTime() > 10 * 60 * 1000) {
        await terminateGame(game.id);
        throw new Error('Rejoin window expired.');
    }
    const { error } = await sb.from('online_games')
        .update({ status: 'active', leaver_id: null, leave_time: null })
        .eq('id', gameId).eq('status', 'frozen');
    if (error) throw error;
    return { ...game, status: 'active', leaver_id: null, leave_time: null };
}

export async function cancelGame(gameId) { return updateGameStatus(gameId, 'cancelled'); }

export async function getFrozenGameForUser(userId) {
    if (!sb || !userId) return null;
    const { data } = await sb.from('online_games')
        .select('*').eq('leaver_id', userId).eq('status', 'frozen').maybeSingle();
    if (!data) return null;
    if (Date.now() - new Date(data.leave_time).getTime() > 10 * 60 * 1000) {
        await terminateGame(data.id);
        return null;
    }
    return data;
}

// ---------- Voice signaling (Realtime Broadcast) ----------
export function subscribeVoiceSignal(gameId, onSignal) {
    if (!sb) return null;
    const channel = sb.channel('voice_' + gameId, { config: { broadcast: { self: false } } });
    channel.on('broadcast', { event: 'signal' }, (msg) => onSignal(msg.payload));
    channel.subscribe();
    return channel;
}

export function sendVoiceSignal(channel, payload) {
    if (!channel) return;
    channel.send({ type: 'broadcast', event: 'signal', payload });
}

export function unsubscribeVoiceSignal(channel) {
    if (channel && sb) sb.removeChannel(channel);
}

// ---------- Offline backup sync ----------
export async function syncOfflineToCloud(userId) {
    if (!sb || !userId) throw new Error('Not authenticated');
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
    if (!sb || !userId) throw new Error('Not authenticated');
    const { data } = await sb.from('offline_backups').select('*').eq('user_id', userId);
    if (!data || data.length === 0) throw new Error('No cloud backup found');
    if (data.length === 1) {
        const backup = data[0];
        localStorage.setItem(
            backup.mode === 'ai' ? 'chess3d_backup_ai' : 'chess3d_backup_2p',
            JSON.stringify(backup.backup_data)
        );
        if (onSelectMode) onSelectMode(backup.mode);
    } else { return data; }
}

export async function deleteAllSyncedData(userId) {
    if (!sb || !userId) throw new Error('Not authenticated');
    const { error } = await sb.from('offline_backups').delete().eq('user_id', userId);
    if (error) throw error;
}

// ---------- Match History ----------
export async function saveMatchHistory(userId, opponentName, result, playerColor, mode, moves) {
    if (!sb) throw new Error('Supabase not available');
    const { error } = await sb.from('match_history').insert({
        user_id: userId,
        opponent_name: opponentName,
        result,
        player_color: playerColor,
        mode,
        moves: moves ? JSON.stringify(moves) : null,
        ended_at: new Date().toISOString()
    });
    if (error) throw error;
}

// ---------- Friends ----------
export async function searchUsers(query, currentUserId) {
    if (!sb) return [];
    const { data } = await sb.from('profiles')
        .select('id, username, avatar_url, is_online, last_seen')
        .neq('id', currentUserId)
        .ilike('username', `%${query}%`)
        .limit(20);
    return data || [];
}

export async function sendFriendRequest(fromUserId, toUserId) {
    if (!sb) throw new Error('Supabase not available');
    const { data: existing } = await sb.from('friend_requests')
        .select('id').eq('from_user_id', fromUserId).eq('to_user_id', toUserId)
        .eq('status', 'pending').maybeSingle();
    if (existing) throw new Error('Request already pending.');

    const { error } = await sb.from('friend_requests').insert({
        from_user_id: fromUserId,
        to_user_id: toUserId,
        status: 'pending'
    });
    if (error) throw error;
}

export async function getPendingRequests(userId) {
    if (!sb) return { incoming: [], outgoing: [] };
    const { data: incoming } = await sb.from('friend_requests')
        .select('id, from_user_id, status, created_at, profiles!friend_requests_from_user_id_fkey(username, avatar_url)')
        .eq('to_user_id', userId).eq('status', 'pending');
    const { data: outgoing } = await sb.from('friend_requests')
        .select('id, to_user_id, status, created_at, profiles!friend_requests_to_user_id_fkey(username, avatar_url)')
        .eq('from_user_id', userId).eq('status', 'pending');
    return {
        incoming: incoming || [],
        outgoing: outgoing || []
    };
}

export async function acceptFriendRequest(requestId, userId) {
    if (!sb) throw new Error('Supabase not available');
    const { data: req } = await sb.from('friend_requests').select('*').eq('id', requestId).single();
    if (!req || req.to_user_id !== userId) throw new Error('Not authorized');
    await sb.from('friend_requests').update({ status: 'accepted' }).eq('id', requestId);
    await sb.from('friends').insert({ user_id: req.from_user_id, friend_id: req.to_user_id });
    await sb.from('friends').insert({ user_id: req.to_user_id, friend_id: req.from_user_id });
}

export async function declineFriendRequest(requestId, userId) {
    if (!sb) throw new Error('Supabase not available');
    const { data: req } = await sb.from('friend_requests').select('*').eq('id', requestId).single();
    if (!req || req.to_user_id !== userId) throw new Error('Not authorized');
    await sb.from('friend_requests').update({ status: 'declined' }).eq('id', requestId);
}

export async function cancelFriendRequest(requestId, userId) {
    if (!sb) throw new Error('Supabase not available');
    const { data: req } = await sb.from('friend_requests').select('*').eq('id', requestId).single();
    if (!req || req.from_user_id !== userId) throw new Error('Not authorized');
    await sb.from('friend_requests').delete().eq('id', requestId);
}

export async function getFriendsList(userId) {
    if (!sb) return [];
    const { data } = await sb.from('friends')
        .select('friend_id, profiles!friends_friend_id_fkey(username, avatar_url, is_online, last_seen)')
        .eq('user_id', userId);
    return (data || []).map(row => ({
        id: row.friend_id,
        username: row.profiles.username,
        avatar_url: row.profiles.avatar_url,
        is_online: row.profiles.is_online,
        last_seen: row.profiles.last_seen
    }));
}

export async function removeFriend(userId, friendId) {
    if (!sb) throw new Error('Supabase not available');
    await sb.from('friends').delete().eq('user_id', userId).eq('friend_id', friendId);
    await sb.from('friends').delete().eq('user_id', friendId).eq('friend_id', userId);
}

export async function createMatchInvite(fromUserId, toUserId, roomCode) {
    if (!sb) throw new Error('Supabase not available');
    const { error } = await sb.from('match_invites').insert({
        from_user_id: fromUserId,
        to_user_id: toUserId,
        room_code: roomCode,
        status: 'pending'
    });
    if (error) throw error;
}

export async function getPendingInvites(userId) {
    if (!sb) return [];
    const { data } = await sb.from('match_invites')
        .select('id, from_user_id, room_code, created_at, profiles!match_invites_from_user_id_fkey(username, avatar_url)')
        .eq('to_user_id', userId).eq('status', 'pending');
    return data || [];
}

export async function respondToMatchInvite(inviteId, userId, accept) {
    if (!sb) throw new Error('Supabase not available');
    const { data: invite } = await sb.from('match_invites').select('*').eq('id', inviteId).single();
    if (!invite || invite.to_user_id !== userId) throw new Error('Not authorized');
    await sb.from('match_invites').update({ status: accept ? 'accepted' : 'declined' }).eq('id', inviteId);
    if (accept) {
        // Optionally expire other pending invites between the same users
        await sb.from('match_invites').update({ status: 'expired' })
            .eq('from_user_id', invite.from_user_id).eq('to_user_id', userId).eq('status', 'pending');
        return invite.room_code;
    }
    return null;
}

// ---------- Utilities ----------
function generateRoomCode(len = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let code = ''; for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function initBoardArray() {
    const b = Array(64).fill(null);
    ['R','N','B','Q','K','B','N','R'].forEach((p, c) => { b[c] = 'b'+p; b[56+c] = 'w'+p; });
    for (let c = 0; c < 8; c++) { b[8+c] = 'bP'; b[48+c] = 'wP'; }
    return b;
}