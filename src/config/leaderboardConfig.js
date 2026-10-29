// ==========================================
// LEADERBOARD CONFIGURATION
// ==========================================
// Leaderboard-only settings, kept apart from the gameplay config.

export const LEADERBOARD_CONFIG = {
    // Season every new score is tagged with. Must exist in public.seasons (supabase/schema.sql).
    currentSeason: 'halloween-2026',

    // Seasonal board is fully wired but hidden. Set to true to show its tab
    // (and season labels in History); nothing else needs to change.
    showSeasonalBoard: false,

    topLimit: 10,

    // Weekly board = ISO week, Monday 00:00 UTC to the next Monday 00:00 UTC.
    // The cut-off is computed server-side in get_weekly_leaderboard().
    weeklyResetText: 'Resets every Monday 00:00 UTC.'
};
