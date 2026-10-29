// ==========================================
// DROP BATTLE CONFIGURATION
// ==========================================
// Tuning for the live 1v1 mode. Gameplay values only need a page reload;
// Supabase-side limits (invite lifetime, rate limits) live in supabase/schema.sql.

export const BATTLE_CONFIG = {
    // Time a player has to drop the piece they're holding. Starts once the
    // drop cooldown is over; when it hits zero the piece drops where it's aimed.
    dropTimerMs: 4000,

    // Match length. Overflowing ends the match early (that player loses);
    // otherwise the highest score when the clock runs out wins.
    matchDurationMs: 3 * 60 * 1000,

    // "3, 2, 1, GO" before the boards go live
    countdownMs: 3000,

    // How long a dropped connection may be away before it counts as a forfeit
    disconnectGraceMs: 10000,

    // At time-up the host waits this long for the guest's final score
    finalScoreWaitMs: 3000,

    // Opponent sync: a drop event per piece plus a full board snapshot this
    // often while anything is still moving (nothing is sent while settled).
    // Lower = smoother corrections, more Realtime messages.
    snapshotIntervalMs: 1500,

    // Friend challenges: how often the game checks for incoming challenges
    // and marks the player as online (only while the tab is visible)
    invitePollMs: 8000
};
