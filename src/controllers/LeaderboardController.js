import { PlayerProfile } from '../core/PlayerProfile.js';
import { LeaderboardService } from '../core/LeaderboardService.js';
import { LeaderboardPanel } from '../ui/LeaderboardPanel.js';
import { LEADERBOARD_CONFIG } from '../config/leaderboardConfig.js';

const ERROR_MESSAGES = {
    invalid_username: 'Use 3–16 letters, numbers, spaces, dots, dashes or underscores.',
    username_taken: 'That name is already taken. Try another one.',
    rate_limited: 'Too many tries. Wait a few seconds and try again.',
    not_registered: 'Join the leaderboard first.',
    friend_not_found: 'No player with that name.',
    friend_self: "That's you!",
    friend_limit: 'Your friends list is full (100).'
};

export const BOARDS = {
    ALL_TIME: 'allTime',
    WEEKLY: 'weekly',
    SEASON: 'season',
    FRIENDS: 'friends',
    HISTORY: 'history'
};

const BOARD_TABS = [
    { id: BOARDS.ALL_TIME, label: 'All-time' },
    { id: BOARDS.WEEKLY, label: 'Weekly' },
    // Hidden until seasons launch: flip LEADERBOARD_CONFIG.showSeasonalBoard
    ...(LEADERBOARD_CONFIG.showSeasonalBoard ? [{ id: BOARDS.SEASON, label: 'Season' }] : []),
    { id: BOARDS.FRIENDS, label: 'Friends' },
    { id: BOARDS.HISTORY, label: 'History' }
];

export class LeaderboardController {
    constructor(scoreManager, canvasElement) {
        this.scoreManager = scoreManager;
        this.profile = new PlayerProfile();
        this.service = new LeaderboardService();
        this.promptDismissed = false;
        this.activeBoard = BOARDS.ALL_TIME;

        // Best game score played before the player picked a name (sent when they join)
        this.unsubmittedBest = 0;

        this.panel = new LeaderboardPanel(canvasElement, {
            boards: BOARD_TABS,
            showSeason: LEADERBOARD_CONFIG.showSeasonalBoard,
            onSelectBoard: (board) => this.selectBoard(board),
            onJoin: () => this.openNameDialog(),
            onSkip: () => this.handleSkip(),
            onSubmitName: (name) => this.claimUsername(name),
            onAddFriend: (name) => this.addFriend(name),
            onRemoveFriend: (name) => this.removeFriend(name),
            suggestName: () => PlayerProfile.generateUsername()
        });

        // Old local best stays on this device until it has been uploaded
        this.legacyHighScore = this.profile.loadLegacyHighScore();
        this.scoreManager.highScore = Math.max(this.scoreManager.highScore, this.legacyHighScore);

        this.init();
    }

    async init() {
        this.updatePlayer();

        if (!this.service.isConfigured) {
            this.panel.setStatus('Leaderboard offline.');
            return;
        }

        this.refresh();

        if (this.profile.hasUsername) {
            try {
                const player = await this.service.fetchPlayer(this.profile.playerId);
                if (player) {
                    this.scoreManager.highScore = Math.max(this.scoreManager.highScore, player.score);
                }
                if (this.legacyHighScore > (player?.score || 0)) {
                    this.submit(0, this.legacyHighScore);
                }
            } catch {
                this.panel.setStatus('Could not reach the leaderboard.');
            }
        }
    }

    selectBoard(board) {
        this.activeBoard = board;
        this.panel.showBoard(board, this.profile.hasUsername);
        this.refresh();
    }

    async refresh() {
        const board = this.activeBoard;
        const { playerId, username, hasUsername } = this.profile;

        if ((board === BOARDS.FRIENDS || board === BOARDS.HISTORY) && !hasUsername) {
            this.panel.renderScores([], username, board === BOARDS.FRIENDS
                ? 'Join the leaderboard to add friends.'
                : 'Join the leaderboard to keep a history of your best scores.');
            return;
        }

        try {
            let entries;
            if (board === BOARDS.WEEKLY) entries = await this.service.fetchWeeklyScores();
            else if (board === BOARDS.SEASON) entries = await this.service.fetchSeasonScores();
            else if (board === BOARDS.FRIENDS) entries = await this.service.fetchFriendsScores(playerId);
            else if (board === BOARDS.HISTORY) entries = await this.service.fetchHistory(playerId);
            else entries = await this.service.fetchTopScores();

            // The player may have switched tabs while this was loading
            if (board !== this.activeBoard) return;

            if (board === BOARDS.FRIENDS) {
                this.panel.renderFriends(entries);
            } else if (board === BOARDS.HISTORY) {
                this.panel.renderHistory(entries);
            } else if (board === BOARDS.WEEKLY) {
                this.panel.renderScores(entries, username, 'No scores this week yet.');
                this.panel.setStatus(`${this.panel.statusText} ${LEADERBOARD_CONFIG.weeklyResetText}`.trim());
            } else if (board === BOARDS.SEASON) {
                this.panel.renderScores(entries, username, 'No scores this season yet.');
            } else {
                this.panel.renderScores(entries, username);
            }
        } catch {
            if (board === this.activeBoard) {
                this.panel.setStatus('Could not reach the leaderboard.');
            }
        }
    }

    onGameOver() {
        if (!this.service.isConfigured) return;

        const score = this.scoreManager.currentScore;
        if (this.profile.hasUsername) {
            this.submit(score);
        } else {
            this.unsubmittedBest = Math.max(this.unsubmittedBest, score);
            if (!this.promptDismissed) {
                this.openNameDialog();
            }
        }
    }

    // Record a finished game (and/or an old local best); the server keeps the max
    async submit(score, legacyScore = 0) {
        try {
            const best = await this.service.submitScore(
                this.profile.playerId,
                this.profile.username,
                score,
                legacyScore
            );
            this.onScoreStored(best);
        } catch {
            this.panel.setStatus('Score not saved. Check your connection.');
        }
    }

    openNameDialog() {
        const best = this.scoreManager.highScore;
        this.panel.openNameDialog({
            title: best > 0 ? 'Save your score' : 'Join the leaderboard',
            text: best > 0
                ? `Pick a name to put your best score of ${best} on the leaderboard.`
                : 'Pick a name for the leaderboard.',
            suggestedName: PlayerProfile.generateUsername()
        });
    }

    handleSkip() {
        // Don't nag again this session; the panel's Join button stays available
        this.promptDismissed = true;
        this.updatePlayer();
    }

    async claimUsername(rawName) {
        const name = PlayerProfile.normalizeUsername(rawName);
        if (!PlayerProfile.isValidUsername(name)) {
            return ERROR_MESSAGES.invalid_username;
        }

        try {
            const best = await this.service.submitScore(
                this.profile.playerId,
                name,
                this.unsubmittedBest,
                this.legacyHighScore
            );
            this.profile.setUsername(name);
            this.onScoreStored(best);
            return null;
        } catch (error) {
            return ERROR_MESSAGES[error.message] || 'Could not reach the leaderboard. Try again.';
        }
    }

    async addFriend(rawName) {
        const name = PlayerProfile.normalizeUsername(rawName);
        if (!PlayerProfile.isValidUsername(name)) {
            return ERROR_MESSAGES.friend_not_found;
        }

        try {
            await this.service.addFriend(this.profile.playerId, name);
            this.refresh();
            return null;
        } catch (error) {
            return ERROR_MESSAGES[error.message] || 'Could not reach the leaderboard. Try again.';
        }
    }

    async removeFriend(name) {
        try {
            await this.service.removeFriend(this.profile.playerId, name);
        } catch {
            this.panel.setStatus('Could not remove friend. Try again.');
            return;
        }
        this.refresh();
    }

    onScoreStored(best) {
        this.scoreManager.highScore = Math.max(this.scoreManager.highScore, best);
        this.profile.clearLegacyHighScore();
        this.legacyHighScore = 0;
        this.unsubmittedBest = 0;
        this.updatePlayer();
        this.refresh();
    }

    updatePlayer() {
        const canJoin = this.service.isConfigured && !this.profile.hasUsername;
        this.panel.setPlayer(this.profile.username, canJoin);
        this.panel.showBoard(this.activeBoard, this.profile.hasUsername);
    }
}
