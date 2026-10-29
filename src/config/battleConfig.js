// ==========================================
// DROP BATTLE CONFIGURATION
// ==========================================
// Tuning for the live 1v1 mode. Gameplay values only need a page reload;
// Supabase-side limits (invite lifetime, rate limits) live in supabase/schema.sql.

export const BATTLE_CONFIG = {
    // Time a player has to drop the piece they're holding. Starts once the
    // drop cooldown is over; when it hits zero the piece drops where it's aimed.
    // Used by the timed lengths; Endless uses endlessDropTimer below.
    dropTimerMs: 4000,

    // Match lengths the host can pick in the lobby. Overflowing always ends the
    // match early (that player loses); in a timed match the highest score when
    // the clock runs out wins. durationMs null = Endless: no clock, only an
    // overflow (or a forfeit) ends it.
    matchLengths: [
        { id: '3min', label: '3 min', durationMs: 3 * 60 * 1000 },
        { id: '5min', label: '5 min', durationMs: 5 * 60 * 1000 },
        { id: 'endless', label: 'Endless', durationMs: null }
    ],
    defaultMatchLength: '3min',

    // Endless pacing: the drop timer starts generous and halves every
    // halfLifeMs of match time until it bottoms out at floorMs ("terminal
    // velocity"), then stays there. Each piece gets the value for the moment
    // it became droppable, so a timer never shrinks while you hold it.
    // With these values the floor is reached after ~2.5 minutes.
    endlessDropTimer: {
        startMs: 7000,
        halfLifeMs: 120 * 1000,
        floorMs: 3000
    },

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
