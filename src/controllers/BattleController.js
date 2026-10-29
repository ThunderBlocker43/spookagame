import { DROP_CONFIG } from '../config/gameConfig.js';
import { BATTLE_CONFIG } from '../config/battleConfig.js';
import { GameSession } from '../core/GameSession.js';
import { GAME_STATES } from '../core/GameState.js';
import { createSeededRandom } from '../core/SeededRandom.js';
import { BattleService } from '../core/BattleService.js';
import { BattleMatch, MATCH_PHASES, RESULT_REASONS } from '../core/BattleMatch.js';
import { BattlePanel } from '../ui/BattlePanel.js';
import { BattleHud } from '../ui/BattleHud.js';
import { OpponentView } from '../ui/OpponentView.js';

// ==========================================
// BATTLE CONTROLLER (Drop Battle: lobby, invites, match lifecycle)
// ==========================================

const ERROR_MESSAGES = {
    battle_not_found: 'This invite link is not valid. Ask your friend for a new one.',
    battle_expired: 'This invite has expired. Ask your friend for a new link.',
    battle_full: 'This match already has two players.',
    battle_over: 'This match has already finished.',
    battle_private: 'This challenge was sent to someone else.',
    battle_duplicate: 'This match is already open in another tab.',
    rate_limited: 'Too many tries. Wait a few seconds and try again.',
    friend_not_found: 'That player is not on your friends list.',
    not_registered: 'Join the leaderboard first.',
    not_configured: 'Drop Battle needs the online leaderboard, which is offline right now.'
};

const errorText = (error) => ERROR_MESSAGES[error?.message || error] || 'Could not reach the game server. Check your connection.';

const URL_PARAM = 'battle';

export class BattleController {
    // onEnter/onExit: battle mode was entered from elsewhere / back to Classic
    // requestResize: re-fit the main canvas
    constructor({ leaderboard, uiManager, appElement, canvasElement, onEnter, onExit, requestResize }) {
        this.leaderboard = leaderboard;
        this.profile = leaderboard.profile;
        this.service = new BattleService(leaderboard.service);
        this.uiManager = uiManager;
        this.hud = new BattleHud();
        this.onEnter = onEnter;
        this.onExit = onExit;

        this.isOpen = false;        // battle mode selected (lobby or match)
        this.match = null;
        this.session = null;        // my board
        this.mirror = null;         // opponent's board
        this.seed = 0;
        this.opponentName = '';
        this.friendName = null;     // set while waiting on a private challenge
        this.rematchCode = null;    // rematch offered by the opponent
        this.endBanner = '';
        this.lastSnapshotAt = 0;
        this.boardDirty = false;
        this.declinedInvites = new Set();
        this.opponentView = null;

        this.panel = new BattlePanel(appElement, canvasElement, {
            onCreateLink: () => this.createMatch(),
            onChallenge: (name) => this.createMatch(name),
            onJoinLeaderboard: () => this.leaderboard.openNameDialog(),
            onLeave: () => this.leave(),
            isMatchRunning: () => this.isMatchRunning,
            onAcceptInvite: (code) => this.acceptInvite(code),
            onDeclineInvite: (code) => this.declineInvite(code),
            onLayout: requestResize
        });

        // Opponent wins right away instead of waiting out the disconnect grace
        window.addEventListener('pagehide', () => this.match?.leave(true));

        this.startInvitePolling();
    }

    // Main canvas shows my battle board (countdown, match, result)
    get isMatchVisible() {
        return this.panel.matchVisible;
    }

    get isMatchRunning() {
        const phase = this.match?.phase;
        return phase === MATCH_PHASES.COUNTDOWN || phase === MATCH_PHASES.PLAYING || phase === MATCH_PHASES.ENDING;
    }

    get rules() {
        const seconds = BATTLE_CONFIG.dropTimerMs / 1000;
        const minutes = BATTLE_CONFIG.matchDurationMs / 60000;
        return `Live 1v1, ${minutes} minutes. Overflow and you lose. If both of you survive, the highest score wins. You have ${seconds} seconds to drop each piece.`;
    }

    // ------------------------------------------
    // Entry points
    // ------------------------------------------
    open() {
        this.isOpen = true;
        if (this.match) return; // already in a lobby or match
        this.showMenu();
    }

    // ?battle=<code> link: join straight away. Returns true if the page was opened with one.
    openFromUrl() {
        const url = new URL(window.location.href);
        const code = url.searchParams.get(URL_PARAM);
        if (!code) return false;

        // Reloading must not re-join a finished match
        url.searchParams.delete(URL_PARAM);
        history.replaceState(null, '', url);

        this.enter();
        this.join(code);
        return true;
    }

    // Entered without going through the mode picker (link, invite, Friends tab)
    enter() {
        this.isOpen = true;
        this.onEnter();
    }

    challengeFriend(name) {
        if (this.isMatchRunning) return;
        this.enter();
        if (!this.match) this.showMenu();
        this.createMatch(name);
    }

    // Leaderboard name changed (e.g. just joined): the friends list may now be available
    onPlayerChanged() {
        if (this.panel.isMenuOpen) this.refreshFriends();
    }

    async showMenu() {
        this.panel.showMenu({ rules: this.rules, onBack: () => this.exit() });
        this.refreshFriends();
    }

    async refreshFriends() {
        if (!this.service.isConfigured) {
            this.panel.renderFriends([], { message: ERROR_MESSAGES.not_configured });
            return;
        }
        if (!this.profile.hasUsername) {
            this.panel.renderFriends([], {
                message: 'Join the leaderboard to challenge friends. Invite links work without joining.',
                showJoin: true
            });
            return;
        }
        this.panel.renderFriends([], { message: 'Loading friends…' });
        try {
            const entries = await this.leaderboard.service.fetchFriendsScores(this.profile.playerId);
            // Online friends first, then by name
            entries.sort((a, b) => (b.online === true) - (a.online === true) || a.username.localeCompare(b.username));
            this.panel.renderFriends(entries);
        } catch {
            this.panel.renderFriends([], { message: errorText() });
        }
    }

    // Leave whatever is going on and go back to Classic
    async exit() {
        this.isOpen = false;
        await this.teardownMatch(true);
        this.service.disconnectIfIdle();
        this.panel.closeDialog();
        this.onExit();
    }

    // ------------------------------------------
    // Creating and joining
    // ------------------------------------------
    async createMatch(friendName = null) {
        if (!this.service.isConfigured) {
            this.panel.setError(ERROR_MESSAGES.not_configured);
            return;
        }

        this.panel.setBusy(true);
        this.panel.setError('');
        try {
            const battle = await this.service.createBattle(this.profile.playerId, friendName);
            await this.teardownMatch(true);
            this.friendName = friendName;
            this.startMatch(battle.battle_code, 'host', battle.battle_seed);
            this.showHostWaiting();
        } catch (error) {
            this.panel.setBusy(false);
            this.panel.setError(errorText(error));
        }
    }

    async join(code) {
        this.panel.showMessage({ title: 'Joining match…', text: '' });
        if (!this.service.isConfigured) {
            this.showJoinError('not_configured');
            return;
        }

        try {
            const battle = await this.service.joinBattle(code, this.profile.playerId);
            await this.teardownMatch(true);
            this.friendName = null;
            this.startMatch(code, battle.battle_role, battle.battle_seed);
            if (battle.battle_role === 'host') {
                // Opened their own link: just keep waiting for an opponent
                this.showHostWaiting();
            } else {
                this.opponentName = battle.host_name;
                this.showGuestWaiting();
            }
        } catch (error) {
            this.showJoinError(error);
        }
    }

    showJoinError(error) {
        this.panel.showMessage({
            title: 'Can’t join this match',
            text: errorText(error),
            back: { label: 'Back to Classic', onClick: () => this.exit() },
            action: { label: 'Drop Battle menu', onClick: () => this.showMenu() }
        });
    }

    get inviteLink() {
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set(URL_PARAM, this.match.code);
        return url.toString();
    }

    showHostWaiting(note = '') {
        this.panel.showWaiting({
            link: this.inviteLink,
            friendName: this.friendName,
            onCancel: () => this.cancelLobby()
        });
        this.panel.setError(note);
    }

    showGuestWaiting(note = '') {
        this.panel.showMessage({
            title: `Waiting for ${this.opponentName}`,
            text: 'You’re in! The match starts as soon as both of you are connected.',
            back: { label: 'Cancel', onClick: () => this.cancelLobby() }
        });
        this.panel.setError(note);
    }

    async cancelLobby() {
        await this.teardownMatch(true);
        this.showMenu();
    }

    // ------------------------------------------
    // Match lifecycle
    // ------------------------------------------
    startMatch(code, role, seed) {
        this.seed = seed;
        this.opponentName = '';
        this.rematchCode = null;
        this.match = new BattleMatch(this.service, {
            code,
            role,
            myName: this.profile.username || 'Guest',
            handlers: {
                onPhase: (phase) => this.onPhase(phase),
                onOpponent: (info) => this.onOpponent(info),
                onDrop: (drop) => this.onOpponentDrop(drop),
                onSnapshot: (snapshot) => this.onOpponentSnapshot(snapshot),
                onOpponentOut: () => this.freeze(this.mirror),
                onResult: (result) => this.onResult(result),
                onStatus: (text) => this.panel.setStatus(text),
                onRematch: (rematchCode) => this.onRematchOffer(rematchCode),
                onDecline: () => this.onDecline(),
                onError: (code) => this.onMatchError(code),
                getMyScore: () => this.session?.scoreManager.currentScore || 0
            }
        });
        this.match.connect();
    }

    // Fresh boards with the shared seed, so both players get the same pieces
    createBoards() {
        this.session = new GameSession({
            random: createSeededRandom(this.seed),
            onDrop: (fruit) => this.onMyDrop(fruit)
        });
        this.mirror = new GameSession({ random: createSeededRandom(this.seed), isMirror: true });
        this.lastSnapshotAt = 0;
        this.boardDirty = false;

        if (!this.opponentView) {
            this.opponentView = new OpponentView(this.panel.opponentViewElement);
        }
        this.opponentView.setSession(this.mirror);
    }

    onOpponent(info) {
        if (info) {
            this.opponentName = info.name;
            this.panel.setOpponent(info.name);
        } else if (this.match?.phase === MATCH_PHASES.FINISHED && !this.rematchCode) {
            this.panel.setRematch(`${this.opponentName} left.`, null);
        }
    }

    onPhase(phase) {
        switch (phase) {
            case MATCH_PHASES.WAITING:
                // Opponent left before the start: back to the waiting screen
                if (this.isMatchVisible) {
                    this.panel.hideMatch();
                    const note = `${this.opponentName || 'Your opponent'} left before the start.`;
                    if (this.match.isHost) this.showHostWaiting(note);
                    else this.showGuestWaiting(note);
                }
                break;
            case MATCH_PHASES.COUNTDOWN:
                this.createBoards();
                this.endBanner = '';
                this.panel.closeDialog();
                this.panel.showMatch(this.opponentName);
                break;
            case MATCH_PHASES.ENDING:
                this.endBanner = this.endBanner || 'TIME!';
                this.freeze(this.session);
                break;
            case MATCH_PHASES.FINISHED:
                this.freeze(this.session);
                this.freeze(this.mirror);
                break;
        }
    }

    freeze(session) {
        if (session) {
            session.gameState.state = GAME_STATES.GAMEOVER;
        }
    }

    onResult(result) {
        const name = this.opponentName || 'Your opponent';
        const texts = {
            [RESULT_REASONS.KO]: result.outcome === 'win' ? `${name}'s stack overflowed!` : 'Your stack overflowed.',
            [RESULT_REASONS.SCORE]: result.outcome === 'draw' ? 'Time’s up with equal scores.' : 'Time’s up! Highest score wins.',
            [RESULT_REASONS.FORFEIT]: result.outcome === 'win' ? `${name} left the match.` : 'You left the match.'
        };

        // Either player may close it; the link stops working once the match is over
        this.service.closeBattle(this.match.code, this.profile.playerId).catch(() => {});

        this.panel.showResult({ ...result, text: texts[result.reason] }, name, {
            onRematch: () => this.offerRematch(),
            onBack: () => this.exit()
        });
        if (!this.match.opponent) {
            this.panel.setRematch(`${name} left.`, null);
        }
    }

    async offerRematch() {
        this.panel.setActionBusy(true);
        try {
            const battle = await this.service.createBattle(this.profile.playerId);
            const opponentName = this.opponentName;
            this.match.offerRematch(battle.battle_code);
            await this.teardownMatch(false);
            this.friendName = opponentName;
            this.startMatch(battle.battle_code, 'host', battle.battle_seed);
            this.showHostWaiting();
        } catch (error) {
            this.panel.setActionBusy(false);
            this.panel.setRematch(errorText(error), { label: 'Rematch', onClick: () => this.offerRematch() });
        }
    }

    onRematchOffer(code) {
        this.rematchCode = code;
        this.panel.setRematch(`${this.opponentName} wants a rematch!`, {
            label: 'Accept rematch',
            onClick: () => this.join(code)
        });
    }

    onDecline() {
        const name = this.friendName || 'Your friend';
        this.teardownMatch(false);
        this.panel.showMessage({
            title: 'Challenge declined',
            text: `${name} can’t play right now.`,
            back: { label: 'Back to Classic', onClick: () => this.exit() },
            action: { label: 'Drop Battle menu', onClick: () => this.showMenu() }
        });
    }

    onMatchError(code) {
        this.panel.hideMatch();
        this.showJoinError(code);
        this.match = null;
    }

    // Leave button on the match card (a running match is forfeited: the
    // opponent's game declares them the winner on our "leave")
    leave() {
        this.exit();
    }

    // announce: tell the opponent we're gone (and close a lobby nobody joined)
    async teardownMatch(announce) {
        const match = this.match;
        this.match = null;
        this.panel.hideMatch();
        if (!match) return;

        // Host leaving kills the link. A guest leaving before the start frees its
        // seat; once running, the host's result closes the match.
        const notStarted = match.phase === MATCH_PHASES.CONNECTING || match.phase === MATCH_PHASES.WAITING;
        if (announce && match.isHost && match.phase !== MATCH_PHASES.FINISHED) {
            this.service.closeBattle(match.code, this.profile.playerId).catch(() => {});
        } else if (announce && !match.isHost && notStarted) {
            this.service.closeBattle(match.code, this.profile.playerId, true).catch(() => {});
        }
        await match.leave(announce);
    }

    // ------------------------------------------
    // Per-frame (called from the main sketch while the match is visible)
    // ------------------------------------------
    update(deltaMs, dt) {
        const match = this.match;
        if (!match || !this.session) return;

        match.tick();

        if (match.phase === MATCH_PHASES.PLAYING) {
            const drop = this.session.dropController;
            if (Date.now() - this.turnStartedAt >= BATTLE_CONFIG.dropTimerMs) {
                // Out of time: drop it where it's aimed
                drop.drop();
            }

            if (this.session.update(deltaMs, dt)) {
                this.endBanner = 'OVERFLOW!';
                match.reportOut(this.session.scoreManager.currentScore);
            }
            this.syncSnapshot();
        } else if (match.phase !== MATCH_PHASES.COUNTDOWN) {
            // Keep particles fading on a frozen board
            this.session.update(deltaMs, dt);
        }

        // The mirror's own merges are only a preview; the score comes from the opponent
        if (match.phase === MATCH_PHASES.COUNTDOWN || match.phase === MATCH_PHASES.PLAYING) {
            this.panel.setClock(match.timeRemainingMs);
        }
        this.panel.setOpponentScore(match.opponentScore);
    }

    // The forced-drop clock starts once the piece can actually be dropped
    get turnStartedAt() {
        const drop = this.session.dropController;
        return Math.max(drop.lastDropTime + DROP_CONFIG.dropCooldownMs, this.match.playStartsAt);
    }

    render(p, aimX) {
        if (!this.session) return;
        const session = this.session;
        const match = this.match;

        session.render(p, aimX);
        this.uiManager.render(p, session.gameState, session.scoreManager, session.dropController, { battle: true });

        if (!match) return;
        if (match.phase === MATCH_PHASES.PLAYING) {
            const remaining = BATTLE_CONFIG.dropTimerMs - (Date.now() - this.turnStartedAt);
            this.hud.renderDropTimer(p, session.dropController.aimX, session.dropController.currentTier,
                Math.min(BATTLE_CONFIG.dropTimerMs, remaining), BATTLE_CONFIG.dropTimerMs);
        } else if (match.phase === MATCH_PHASES.COUNTDOWN) {
            this.hud.renderCountdown(p, match.countdownRemainingMs);
        } else if (match.phase === MATCH_PHASES.ENDING) {
            this.hud.renderBanner(p, this.endBanner);
        }
    }

    onUserAction(aimX) {
        if (this.isMatchVisible && this.match?.phase === MATCH_PHASES.PLAYING && this.session) {
            this.session.dropController.updateAim(aimX);
            this.session.dropController.drop();
        }
    }

    // ------------------------------------------
    // Sync: my board out, opponent's board in
    // ------------------------------------------
    onMyDrop(fruit) {
        const drop = this.session.dropController;
        this.boardDirty = true;
        this.match.sendDrop({
            x: Math.round(drop.aimX * 10) / 10,
            t: fruit.tier,
            c: drop.currentTier,
            n: drop.nextTier,
            s: this.session.scoreManager.currentScore
        });
    }

    // A full snapshot every snapshotIntervalMs while anything moves, plus one once it settles
    syncSnapshot() {
        const now = Date.now();
        if (now - this.lastSnapshotAt < BATTLE_CONFIG.snapshotIntervalMs) return;

        const settled = this.session.isSettled;
        if (settled && !this.boardDirty) return;

        const drop = this.session.dropController;
        this.match.sendSnapshot({
            f: this.session.takeSnapshot(),
            s: this.session.scoreManager.currentScore,
            c: drop.currentTier,
            n: drop.nextTier
        });
        this.lastSnapshotAt = now;
        this.boardDirty = !settled;
    }

    onOpponentDrop({ x, t, c, n }) {
        if (!this.mirror) return;
        this.mirror.applyDrop(t, x, c, n);
        this.opponentView.aimX = x;
    }

    onOpponentSnapshot({ f, c, n }) {
        if (!this.mirror || !Array.isArray(f)) return;
        this.mirror.applySnapshot(f);
        this.mirror.dropController.currentTier = c;
        this.mirror.dropController.nextTier = n;
    }

    // ------------------------------------------
    // Friend challenges (polled; no socket needed while just browsing)
    // ------------------------------------------
    startInvitePolling() {
        const poll = () => {
            if (document.visibilityState === 'visible') this.pollInvites();
        };
        setInterval(poll, BATTLE_CONFIG.invitePollMs);
        document.addEventListener('visibilitychange', poll);
        poll();
    }

    async pollInvites() {
        if (!this.service.isConfigured || !this.profile.hasUsername) return;

        let invites;
        try {
            invites = await this.service.heartbeat(this.profile.playerId);
        } catch {
            return;
        }

        const shown = this.panel.shownInviteCode;
        const open = invites.filter((invite) => !this.declinedInvites.has(invite.battle_code));
        if (shown && !open.some((invite) => invite.battle_code === shown)) {
            // Challenger cancelled or it expired
            this.panel.hideInvite();
        }

        // Don't interrupt a lobby or match in progress
        if (this.match || this.panel.shownInviteCode || open.length === 0) return;
        this.panel.showInvite(open[0].battle_code, open[0].host_name);
    }

    acceptInvite(code) {
        this.panel.hideInvite();
        if (this.isMatchRunning) return;
        this.enter();
        this.join(code);
    }

    declineInvite(code) {
        this.panel.hideInvite();
        this.declinedInvites.add(code);
        this.service.closeBattle(code, this.profile.playerId).catch(() => {});
        this.service.sendOnce(code, 'decline', {}).catch(() => {});
    }
}
