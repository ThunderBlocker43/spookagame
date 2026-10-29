import { RealtimeClient } from '@supabase/realtime-js';
import { SUPABASE_URL, SUPABASE_KEY } from './supabaseEnv.js';

// ==========================================
// BATTLE SERVICE (match bookkeeping RPCs + Realtime connection)
// ==========================================
// Matches are created and joined through the validated functions in
// supabase/schema.sql; live play runs over a public Realtime broadcast channel
// named after the match code. Nothing here needs a server of our own.

export const battleTopic = (code) => `spooka-battle-${code}`;

export class BattleService {
    constructor(leaderboardService) {
        this.service = leaderboardService;
        this.realtime = null;
    }

    get isConfigured() {
        return this.service.isConfigured;
    }

    // { battle_code, battle_seed, battle_expires_at }; friendUsername = private challenge
    async createBattle(playerId, friendUsername = null) {
        const rows = await this.service.rpc('create_battle', {
            p_player_id: playerId,
            p_friend_username: friendUsername
        });
        return rows[0];
    }

    // { battle_role: 'host' | 'guest', battle_seed, host_name }
    async joinBattle(code, playerId) {
        const rows = await this.service.rpc('join_battle', { p_code: code, p_player_id: playerId });
        return rows[0];
    }

    // releaseSeat: guest leaving before the start frees the seat for someone else
    closeBattle(code, playerId, releaseSeat = false) {
        return this.service.rpc('close_battle', { p_code: code, p_player_id: playerId, p_release_seat: releaseSeat });
    }

    // Marks the player online and returns open challenges sent to them
    heartbeat(playerId) {
        return this.service.rpc('battle_heartbeat', { p_player_id: playerId });
    }

    // One socket per tab, opened on first use
    getRealtime() {
        if (!this.realtime) {
            this.realtime = new RealtimeClient(`${SUPABASE_URL.replace(/^http/i, 'ws')}/realtime/v1`, {
                params: { apikey: SUPABASE_KEY }
            });
        }
        return this.realtime;
    }

    // One-off message to a match channel without joining it (REST, no socket)
    async sendOnce(code, event, payload) {
        await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
            body: JSON.stringify({ messages: [{ topic: battleTopic(code), event, payload }] })
        });
    }

    // Close the socket when no channel needs it any more (frees a connection slot).
    // A client that is still disconnecting ignores connect(), so the next match gets a new one.
    disconnectIfIdle() {
        if (this.realtime && this.realtime.getChannels().length === 0) {
            const realtime = this.realtime;
            this.realtime = null;
            realtime.disconnect();
        }
    }
}
