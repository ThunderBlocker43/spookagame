// ==========================================
// AUDIO CONFIGURATION
// ==========================================
// Every sound the game plays, with its file and default volume. Sources and
// licenses of each file are listed in CREDITS.md.

export const AUDIO_CONFIG = {
    // Overall mix (0-1). Music sits well under the effects.
    masterVolume: 0.9,
    musicVolume: 0.35,
    sfxVolume: 0.8,

    // Music crossfade when switching tracks, and how far it dips on Game Over
    musicFadeMs: 700,
    duckedMusicVolume: 0.3,

    // loopSeconds: exact length of the seamless loop in the source file, so the
    // MP3 encoder's padding never ends up inside the loop
    music: {
        classic: { src: 'assets/audio/music/music-classic.mp3', volume: 1.0, loopSeconds: 1693439 / 44100 },
        battle: { src: 'assets/audio/music/music-battle.mp3', volume: 1.0, loopSeconds: 3814054 / 44100 }
    },

    // minGapMs: the same effect won't retrigger faster than this
    sfx: {
        drop: { src: 'assets/audio/sfx/drop.mp3', volume: 0.55, minGapMs: 40 },
        merge: { src: 'assets/audio/sfx/merge.mp3', volume: 0.7, minGapMs: 35 },
        mergeMax: { src: 'assets/audio/sfx/merge-max.mp3', volume: 0.65, minGapMs: 300 },
        danger: { src: 'assets/audio/sfx/danger.mp3', volume: 0.5, minGapMs: 2500 },
        gameOver: { src: 'assets/audio/sfx/game-over.mp3', volume: 0.7, minGapMs: 500 },
        click: { src: 'assets/audio/sfx/click.mp3', volume: 0.35, minGapMs: 40 },
        countdownTick: { src: 'assets/audio/sfx/countdown-tick.mp3', volume: 0.5, minGapMs: 200 },
        countdownGo: { src: 'assets/audio/sfx/countdown-go.mp3', volume: 0.55, minGapMs: 500 },
        timerTick: { src: 'assets/audio/sfx/timer-tick.mp3', volume: 0.35, minGapMs: 200 },
        win: { src: 'assets/audio/sfx/win.mp3', volume: 0.7, minGapMs: 500 },
        lose: { src: 'assets/audio/sfx/lose.mp3', volume: 0.7, minGapMs: 500 },
        draw: { src: 'assets/audio/sfx/draw.mp3', volume: 0.65, minGapMs: 500 },
        challenge: { src: 'assets/audio/sfx/challenge.mp3', volume: 0.6, minGapMs: 1000 }
    },

    // Merge pluck pitch: smallest tier plays this much higher, the biggest this much lower
    mergePitch: { smallest: 1.6, largest: 0.6 }
};
