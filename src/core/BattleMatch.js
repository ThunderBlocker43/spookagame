import { BATTLE_CONFIG } from '../config/battleConfig.js';
import { battleTopic } from './BattleService.js';

// ==========================================
// BATTLE MATCH (one live 1v1 over a Realtime channel)
// ==========================================
// Each player simulates only their own board and broadcasts what happens on it:
// a "drop" per piece and a full "snap" of the board every now and then while it
// moves. The opponent's screen replays drops through its own physics and snaps
// back to the real board on each snapshot.
//
// The host is the referee: it decides the result and broadcasts it, so both
// players always see the same outcome. Presence tells us who is connected.
//
// Events: hello, start, drop, snap, out, final, result, leave, rematch, decline

export const MATCH_PHASES = {
    CONNECTING: 'CONNECTING',
    WAITING: 'WAITING',       // in the channel, opponent not here yet
    COUNTDOWN: 'COUNTDOWN',
    PLAYING: 'PLAYING',
    ENDING: 'ENDING',         // my board stopped (overflow or time up), waiting for the result
    FINISHED: 'FINISHED'
};

export const RESULT_REASONS = {
    KO: 'ko',           // someone overflowed
    SCORE: 'score',     // clock ran out, highest score wins
    FORFEIT: 'forfeit'  // someone left or lost their connection
};

// Match length by id (see BATTLE_CONFIG.matchLengths); unknown ids fall back to the default
export const findMatchLength = (id) => {
    const lengths = BATTLE_CONFIG.matchLengths;
    return lengths.find((length) => length.id === id)
        || lengths.find((length) => length.id === BATTLE_CONFIG.defaultMatchLength);
};

const EVENTS = ['hello', 'start', 'drop', 'snap', 'out', 'final', 'result', 'leave', 'rematch', 'decline'];

export class BattleMatch {
    // handlers: onPhase, onOpponent(info | null), onDrop, onSnapshot, onOpponentOut,
    // onResult, onStatus(text), onRematch(code), onDecline, onError(code), getMyScore
    // lengthId: picked by the host; the guest takes it from the host's "start"
    constructor(battleService, { code, role, myName, lengthId, handlers }) {
        this.service = battleService;
        this.code = code;
        this.role = role;
        this.myName = myName;
        this.handlers = handlers;
        this.matchLength = findMatchLength(lengthId);

        // Presence key: random per tab, never the private player id
        this.clientId = crypto.randomUUID();
        this.joinedAt = Date.now();

        this.phase = MATCH_PHASES.CONNECTING;
        this.opponent = null;
        this.opponentScore = 0;
        this.guestFinalScore = null;
        this.result = null;

        this.countdownStartedAt = 0;
        this.playStartsAt = 0;
        this.matchEndsAt = 0;

        this.disconnectTimer = null;
        this.finalScoreTimer = null;
        this.tickTimer = null;
        this.channel = null;
    }

    get isHost() {
        return this.role === 'host';
    }

    get isLive() {
        return this.phase === MATCH_PHASES.PLAYING || this.phase === MATCH_PHASES.ENDING;
    }

    connect() {
        const realtime = this.service.getRealtime();
        this.channel = realtime.channel(battleTopic(this.code), {
            config: {
                broadcast: { self: false },
                presence: { key: this.clientId }
            }
        });

        EVENTS.forEach((event) => {
            this.channel.on('broadcast', { event }, ({ payload }) => this.onMessage(event, payload || {}));
        });
        this.channel.on('presence', { event: 'sync' }, () => this.onPresenceSync());

        this.channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                this.handlers.onStatus('');
                this.channel.track({ role: this.role, name: this.myName, joinedAt: this.joinedAt });
                if (this.phase === MATCH_PHASES.CONNECTING) {
                    this.setPhase(MATCH_PHASES.WAITING);
                }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                // realtime-js keeps retrying on its own; just tell the player
                this.handlers.onStatus('Connection lost. Reconnecting…');
            }
        });
    }

    send(event, payload = {}) {
        if (this.channel) {
            this.channel.send({ type: 'broadcast', event, payload });
        }
    }

    setPhase(phase) {
        this.phase = phase;
        this.handlers.onPhase(phase);
    }

    // Called every frame by the controller
    tick(now = Date.now()) {
        if (this.phase === MATCH_PHASES.COUNTDOWN && now >= this.playStartsAt) {
            this.setPhase(MATCH_PHASES.PLAYING);
        }
        if (this.phase === MATCH_PHASES.PLAYING && now >= this.matchEndsAt) {
            this.onTimeUp();
        }
    }

    get countdownRemainingMs() {
        return Math.max(0, this.playStartsAt - Date.now());
    }

    // Endless matches have no clock; only an overflow or a forfeit ends them
    get isEndless() {
        return this.matchLength.durationMs === null;
    }

    // Timed matches only (Endless has no time limit)
    get timeRemainingMs() {
        if (this.phase === MATCH_PHASES.COUNTDOWN) return this.matchLength.durationMs;
        if (this.phase !== MATCH_PHASES.PLAYING) return 0;
        return Math.max(0, this.matchEndsAt - Date.now());
    }

    get elapsedMs() {
        return Math.max(0, Date.now() - this.playStartsAt);
    }

    // Time allowed for a piece that became droppable at turnStartedAt.
    // Timed matches: a fixed dropTimerMs. Endless: halves every halfLifeMs of
    // match time, never below floorMs.
    dropTimerMsFor(turnStartedAt) {
        if (!this.isEndless) return BATTLE_CONFIG.dropTimerMs;
        const { startMs, halfLifeMs, floorMs } = BATTLE_CONFIG.endlessDropTimer;
        const elapsed = Math.max(0, turnStartedAt - this.playStartsAt);
        return Math.max(floorMs, startMs * Math.pow(0.5, elapsed / halfLifeMs));
    }

    // ------------------------------------------
    // Presence: who is in the room
    // ------------------------------------------
    onPresenceSync() {
        if (!this.channel) return;
        const others = Object.entries(this.channel.presenceState())
            .filter(([key]) => key !== this.clientId)
            .map(([, metas]) => metas[0])
            .filter(Boolean);

        // Same player opened the match twice: the newer tab bows out
        const twin = others.find((meta) => meta.role === this.role);
        if (twin && twin.joinedAt < this.joinedAt) {
            this.handlers.onError('battle_duplicate');
            this.leave(false);
            return;
        }

        const opponent = others.find((meta) => meta.role !== this.role);
        if (opponent) {
            this.onOpponentPresent(opponent);
        } else if (this.opponent) {
            this.onOpponentGone();
        }
    }

    onOpponentPresent(opponent) {
        if (this.disconnectTimer) {
            clearTimeout(this.disconnectTimer);
            this.disconnectTimer = null;
            this.handlers.onStatus('');
        }

        if (!this.opponent) {
            this.opponent = { name: opponent.name || 'Guest' };
            this.handlers.onOpponent(this.opponent);
        }

        if (this.phase === MATCH_PHASES.WAITING) {
            if (this.isHost) {
                this.beginCountdown(0);
                this.send('start', { elapsedMs: 0, length: this.matchLength.id });
            } else {
                this.send('hello');
            }
        }
    }

    onOpponentGone() {
        if (this.phase === MATCH_PHASES.FINISHED) {
            this.opponent = null;
            this.handlers.onOpponent(null);
            return;
        }

        if (this.phase === MATCH_PHASES.COUNTDOWN || this.phase === MATCH_PHASES.WAITING) {
            // Not started yet: simply wait for them (or someone with the link) again
            this.opponent = null;
            this.handlers.onOpponent(null);
            this.setPhase(MATCH_PHASES.WAITING);
            return;
        }

        if (!this.disconnectTimer) {
            const seconds = Math.round(BATTLE_CONFIG.disconnectGraceMs / 1000);
            this.handlers.onStatus(`${this.opponent.name} disconnected. Waiting ${seconds}s…`);
            this.disconnectTimer = setTimeout(() => {
                this.disconnectTimer = null;
                this.handlers.onStatus('');
                this.winByForfeit();
            }, BATTLE_CONFIG.disconnectGraceMs);
        }
    }

    // ------------------------------------------
    // Messages from the opponent
    // ------------------------------------------
    onMessage(event, payload) {
        if (typeof payload.s === 'number') {
            this.opponentScore = payload.s;
        }

        switch (event) {
            case 'hello':
                // Guest is (back) in the room; tell it where the match stands
                if (this.isHost && (this.phase === MATCH_PHASES.COUNTDOWN || this.isLive)) {
                    this.send('start', { elapsedMs: Date.now() - this.countdownStartedAt, length: this.matchLength.id });
                }
                break;
            case 'start':
                if (!this.isHost && this.phase === MATCH_PHASES.WAITING) {
                    this.matchLength = findMatchLength(payload.length);
                    this.beginCountdown(Math.max(0, payload.elapsedMs || 0));
                }
                break;
            case 'drop':
                if (this.isLive) this.handlers.onDrop(payload);
                break;
            case 'snap':
                if (this.isLive) this.handlers.onSnapshot(payload);
                break;
            case 'out':
                this.handlers.onOpponentOut();
                if (this.isHost) {
                    this.decide('host', RESULT_REASONS.KO);
                }
                break;
            case 'final':
                if (this.isHost) {
                    this.guestFinalScore = payload.s;
                    if (this.phase === MATCH_PHASES.ENDING && this.finalScoreTimer) {
                        this.decideByScore();
                    }
                }
                break;
            case 'result':
                if (!this.isHost) this.finish(payload);
                break;
            case 'leave':
                if (this.isLive || this.phase === MATCH_PHASES.COUNTDOWN) {
                    this.winByForfeit();
                } else if (this.phase !== MATCH_PHASES.FINISHED) {
                    this.onOpponentGone();
                }
                break;
            case 'rematch':
                if (this.phase === MATCH_PHASES.FINISHED && payload.code) {
                    this.handlers.onRematch(payload.code);
                }
                break;
            case 'decline':
                if (this.isHost && this.phase === MATCH_PHASES.WAITING) {
                    this.handlers.onDecline();
                }
                break;
        }
    }

    beginCountdown(elapsedMs) {
        this.countdownStartedAt = Date.now() - elapsedMs;
        this.playStartsAt = this.countdownStartedAt + BATTLE_CONFIG.countdownMs;
        // Endless never reaches its end time, so the time-up path never runs
        this.matchEndsAt = this.isEndless ? Infinity : this.playStartsAt + this.matchLength.durationMs;
        this.setPhase(MATCH_PHASES.COUNTDOWN);

        // Frames stop in a hidden tab; keep the match clock (and the referee) running anyway
        clearInterval(this.tickTimer);
        this.tickTimer = setInterval(() => this.tick(), 1000);
        // A late join (guest reconnecting) may already be past the countdown
        this.tick();
    }

    // ------------------------------------------
    // My board
    // ------------------------------------------
    sendDrop(drop) {
        if (this.phase === MATCH_PHASES.PLAYING) this.send('drop', drop);
    }

    sendSnapshot(snapshot) {
        if (this.isLive) this.send('snap', snapshot);
    }

    // My board overflowed
    reportOut(score) {
        if (this.phase !== MATCH_PHASES.PLAYING) return;
        this.setPhase(MATCH_PHASES.ENDING);
        this.send('out', { s: score });
        if (this.isHost) {
            this.decide('guest', RESULT_REASONS.KO);
        }
    }

    onTimeUp() {
        this.setPhase(MATCH_PHASES.ENDING);
        if (this.isHost) {
            if (this.guestFinalScore !== null) {
                this.decideByScore();
            } else {
                // Give the guest's own clock a moment to run out too
                this.finalScoreTimer = setTimeout(() => this.decideByScore(), BATTLE_CONFIG.finalScoreWaitMs);
            }
        } else {
            this.send('final', { s: this.handlers.getMyScore() });
        }
    }

    // ------------------------------------------
    // Result (host decides, guest follows)
    // ------------------------------------------
    decideByScore() {
        const hostScore = this.handlers.getMyScore();
        const guestScore = this.guestFinalScore ?? this.opponentScore;
        const winner = hostScore === guestScore ? 'draw' : (hostScore > guestScore ? 'host' : 'guest');
        this.decide(winner, RESULT_REASONS.SCORE, guestScore);
    }

    decide(winner, reason, guestScore = this.opponentScore) {
        if (!this.isHost || this.result) return;
        const result = {
            winner,
            reason,
            scores: { host: this.handlers.getMyScore(), guest: guestScore }
        };
        this.send('result', result);
        this.finish(result);
    }

    // Opponent left or vanished: I win, whichever side I'm on
    winByForfeit() {
        if (this.result) return;
        const myScore = this.handlers.getMyScore();
        this.finish({
            winner: this.role,
            reason: RESULT_REASONS.FORFEIT,
            scores: this.isHost
                ? { host: myScore, guest: this.opponentScore }
                : { host: this.opponentScore, guest: myScore }
        });
    }

    finish(result) {
        if (this.result) return;
        this.result = result;
        clearTimeout(this.finalScoreTimer);
        clearInterval(this.tickTimer);
        clearTimeout(this.disconnectTimer);
        this.disconnectTimer = null;
        this.handlers.onStatus('');
        this.setPhase(MATCH_PHASES.FINISHED);

        const myKey = this.role;
        const theirKey = this.isHost ? 'guest' : 'host';
        this.handlers.onResult({
            outcome: result.winner === 'draw' ? 'draw' : (result.winner === myKey ? 'win' : 'lose'),
            reason: result.reason,
            myScore: result.scores[myKey],
            opponentScore: result.scores[theirKey]
        });
    }

    offerRematch(code) {
        this.send('rematch', { code });
    }

    // announce: tell the opponent (forfeit if the match is running)
    async leave(announce = true) {
        clearTimeout(this.finalScoreTimer);
        clearInterval(this.tickTimer);
        clearTimeout(this.disconnectTimer);
        this.disconnectTimer = null;

        if (!this.channel) return;
        const channel = this.channel;
        this.channel = null;

        if (announce) {
            channel.send({ type: 'broadcast', event: 'leave', payload: {} });
        }
        await this.service.getRealtime().removeChannel(channel);
    }
}
