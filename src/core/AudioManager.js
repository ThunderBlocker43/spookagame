import { AUDIO_CONFIG } from '../config/audioConfig.js';
import { FRUIT_TIERS } from '../config/gameConfig.js';

// ==========================================
// AUDIO MANAGER (Web Audio: looping music + one-shot effects)
// ==========================================
// - Browsers only allow sound after a user gesture, so the context is resumed
//   on the first tap/click/key; music asked for before that starts then.
// - One music track at a time; asking for the one already playing does nothing,
//   switching crossfades.
// - Files are MP3 (plays everywhere). MP3 adds a few ms of silence at the start,
//   which is skipped so effects are instant and loops stay seamless.
// - Muting is remembered on this device.

const MUTE_KEY = 'spooka_muted';
const SILENCE = 1e-3;

const readMuted = () => {
    try {
        return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
        return false;
    }
};

// First audible sample: skips the encoder padding at the start of an MP3
const findStartOffset = (buffer) => {
    const data = buffer.getChannelData(0);
    const limit = Math.min(data.length, Math.floor(buffer.sampleRate * 0.1));
    for (let i = 0; i < limit; i++) {
        if (Math.abs(data[i]) > SILENCE) return i / buffer.sampleRate;
    }
    return 0;
};

class AudioManager {
    constructor() {
        this.muted = readMuted();
        this.buffers = new Map();       // src -> { buffer, offset }
        this.lastPlayed = new Map();    // sfx name -> time
        this.music = null;              // { name, source, gain }
        this.wantedMusic = null;
        this.ducked = false;

        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return; // Very old browser: the game simply stays silent

        this.ctx = new Context();
        this.master = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);
        this.master.connect(this.ctx.destination);

        this.master.gain.value = this.muted ? 0 : AUDIO_CONFIG.masterVolume;
        this.musicBus.gain.value = AUDIO_CONFIG.musicVolume;
        this.sfxBus.gain.value = AUDIO_CONFIG.sfxVolume;

        this.loadAll();

        // Unlock on the first gesture (capture phase: panels stop propagation)
        const unlock = () => {
            if (document.visibilityState === 'visible') this.ctx.resume();
        };
        ['pointerdown', 'keydown', 'touchend'].forEach((type) => window.addEventListener(type, unlock, true));

        // Don't keep playing (or draining the battery) in a background tab
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.ctx.suspend();
            else this.ctx.resume();
        });
    }

    get isAvailable() {
        return Boolean(this.ctx);
    }

    async load(src) {
        if (this.buffers.has(src)) return this.buffers.get(src);
        const loading = fetch(src)
            .then((res) => res.arrayBuffer())
            .then((data) => new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject)))
            .then((buffer) => ({ buffer, offset: findStartOffset(buffer) }));
        this.buffers.set(src, loading);
        return loading;
    }

    // Fetch everything up front; failures only mean that sound stays silent
    loadAll() {
        const sources = [
            ...Object.values(AUDIO_CONFIG.sfx),
            ...Object.values(AUDIO_CONFIG.music)
        ].map((sound) => sound.src);
        sources.forEach((src) => this.load(src).catch(() => this.buffers.delete(src)));
    }

    // ------------------------------------------
    // Effects
    // ------------------------------------------
    // rate: playback speed (also pitch); volume: multiplier on the configured volume
    async play(name, { rate = 1, volume = 1 } = {}) {
        const sound = AUDIO_CONFIG.sfx[name];
        if (!this.ctx || !sound || this.muted || this.ctx.state !== 'running') return;

        const now = performance.now();
        if (now - (this.lastPlayed.get(name) || -Infinity) < (sound.minGapMs || 0)) return;
        this.lastPlayed.set(name, now);

        let loaded;
        try {
            loaded = await this.load(sound.src);
        } catch {
            return;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = loaded.buffer;
        source.playbackRate.value = rate;
        const gain = this.ctx.createGain();
        gain.gain.value = sound.volume * volume;
        source.connect(gain).connect(this.sfxBus);
        source.start(0, loaded.offset);
    }

    // Merge pluck, pitched by tier: small pieces high, big ones low
    playMerge(tier, tierCount) {
        const { smallest, largest } = AUDIO_CONFIG.mergePitch;
        const t = tierCount > 1 ? tier / (tierCount - 1) : 0;
        this.play('merge', { rate: smallest + (largest - smallest) * t });
    }

    // ------------------------------------------
    // Music
    // ------------------------------------------
    async playMusic(name) {
        this.wantedMusic = name;
        if (!this.ctx || this.music?.name === name) return;

        const track = AUDIO_CONFIG.music[name];
        let loaded;
        try {
            loaded = await this.load(track.src);
        } catch {
            return;
        }
        // Another track was asked for while this one loaded
        if (this.wantedMusic !== name || this.music?.name === name) return;

        const fade = AUDIO_CONFIG.musicFadeMs / 1000;
        const now = this.ctx.currentTime;
        this.stopMusic(fade);

        const source = this.ctx.createBufferSource();
        source.buffer = loaded.buffer;
        source.loop = true;
        source.loopStart = loaded.offset;
        source.loopEnd = Math.min(loaded.buffer.duration, loaded.offset + track.loopSeconds);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.trackVolume(track), now + fade);
        source.connect(gain).connect(this.musicBus);
        source.start(now, loaded.offset);

        this.music = { name, track, source, gain };
    }

    stopMusic(fade = AUDIO_CONFIG.musicFadeMs / 1000) {
        if (!this.music) return;
        const { source, gain } = this.music;
        const now = this.ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + fade);
        source.stop(now + fade + 0.05);
        this.music = null;
    }

    trackVolume(track) {
        return track.volume * (this.ducked ? AUDIO_CONFIG.duckedMusicVolume : 1);
    }

    // Quieter music behind the Game Over screen
    setDucked(ducked) {
        if (this.ducked === ducked) return;
        this.ducked = ducked;
        if (!this.music) return;
        const now = this.ctx.currentTime;
        const { gain, track } = this.music;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(this.trackVolume(track), now + 0.4);
    }

    // ------------------------------------------
    // Mute
    // ------------------------------------------
    setMuted(muted) {
        this.muted = muted;
        try {
            localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
        } catch {
            // Storage blocked: mute still works for this visit
        }
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(this.master.gain.value, now);
        this.master.gain.linearRampToValueAtTime(muted ? 0 : AUDIO_CONFIG.masterVolume, now + 0.15);
    }

    toggleMuted() {
        this.setMuted(!this.muted);
        return this.muted;
    }
}

export const audio = new AudioManager();

// Sound hooks for a playable board (GameSession options). Mirrors of the
// opponent's board get none, so only your own pieces make noise.
export const boardSoundEvents = {
    onDrop: () => audio.play('drop'),
    onMerge: (tier, isMaxTier) => {
        if (isMaxTier) audio.play('mergeMax');
        else audio.playMerge(tier, FRUIT_TIERS.length);
    },
    onDangerStart: () => audio.play('danger')
};
