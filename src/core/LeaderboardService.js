import { LEADERBOARD_CONFIG } from '../config/leaderboardConfig.js';

// ==========================================
// LEADERBOARD SERVICE (Supabase RPC over fetch)
// ==========================================
// Only the public "publishable"/anon key is used. It can do nothing except call
// the validated, rate-limited functions defined in supabase/schema.sql.

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export class LeaderboardService {
    get isConfigured() {
        return Boolean(SUPABASE_URL && SUPABASE_KEY);
    }

    async rpc(fn, args) {
        if (!this.isConfigured) {
            throw new Error('not_configured');
        }

        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_KEY
            },
            body: JSON.stringify(args)
        });

        const body = await response.json().catch(() => null);
        if (!response.ok) {
            // Postgres "raise exception 'code'" arrives as { message: 'code' }
            throw new Error(body?.message || `http_${response.status}`);
        }
        return body;
    }

    fetchTopScores(limit = LEADERBOARD_CONFIG.topLimit) {
        return this.rpc('get_leaderboard', { p_limit: limit });
    }

    fetchWeeklyScores(limit = LEADERBOARD_CONFIG.topLimit) {
        return this.rpc('get_weekly_leaderboard', { p_limit: limit });
    }

    fetchSeasonScores(season = LEADERBOARD_CONFIG.currentSeason, limit = LEADERBOARD_CONFIG.topLimit) {
        return this.rpc('get_season_leaderboard', { p_season: season, p_limit: limit });
    }

    fetchFriendsScores(playerId) {
        return this.rpc('get_friends_leaderboard', { p_player_id: playerId });
    }

    fetchHistory(playerId) {
        return this.rpc('get_history', { p_player_id: playerId });
    }

    async fetchPlayer(playerId) {
        const rows = await this.rpc('get_player', { p_player_id: playerId });
        return rows?.[0] || null;
    }

    // score = the game just finished (0 if none); legacyScore = old local best being migrated
    submitScore(playerId, username, score, legacyScore = 0) {
        return this.rpc('submit_score', {
            p_player_id: playerId,
            p_username: username,
            p_score: score,
            p_season: LEADERBOARD_CONFIG.currentSeason,
            p_legacy_score: legacyScore
        });
    }

    addFriend(playerId, friendUsername) {
        return this.rpc('add_friend', { p_player_id: playerId, p_friend_username: friendUsername });
    }

    removeFriend(playerId, friendUsername) {
        return this.rpc('remove_friend', { p_player_id: playerId, p_friend_username: friendUsername });
    }
}
