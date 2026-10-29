import { PlayerProfile } from '../core/PlayerProfile.js';
import { LeaderboardService } from '../core/LeaderboardService.js';
import { LeaderboardPanel } from '../ui/LeaderboardPanel.js';

const ERROR_MESSAGES = {
    invalid_username: 'Use 3–16 letters, numbers, spaces, dots, dashes or underscores.',
    username_taken: 'That name is already taken. Try another one.',
    rate_limited: 'Too many tries. Wait a few seconds and try again.'
};

export class LeaderboardController {
    constructor(scoreManager, canvasElement) {
        this.scoreManager = scoreManager;
        this.profile = new PlayerProfile();
        this.service = new LeaderboardService();
        this.promptDismissed = false;

        this.panel = new LeaderboardPanel(canvasElement, {
            onJoin: () => this.openNameDialog(),
            onSkip: () => this.handleSkip(),
            onSubmitName: (name) => this.claimUsername(name),
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
                    this.submit();
                }
            } catch {
                this.panel.setStatus('Could not reach the leaderboard.');
            }
        }
    }

    async refresh() {
        try {
            const entries = await this.service.fetchTopScores(10);
            this.panel.renderScores(entries, this.profile.username);
        } catch {
            this.panel.setStatus('Could not reach the leaderboard.');
        }
    }

    onGameOver() {
        if (!this.service.isConfigured) return;

        if (this.profile.hasUsername) {
            this.submit();
        } else if (!this.promptDismissed) {
            this.openNameDialog();
        }
    }

    // Upload the best score this device knows about; the server keeps the max
    async submit() {
        try {
            const best = await this.service.submitScore(
                this.profile.playerId,
                this.profile.username,
                this.scoreManager.highScore
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
            const best = await this.service.submitScore(this.profile.playerId, name, this.scoreManager.highScore);
            this.profile.setUsername(name);
            this.onScoreStored(best);
            return null;
        } catch (error) {
            return ERROR_MESSAGES[error.message] || 'Could not reach the leaderboard. Try again.';
        }
    }

    onScoreStored(best) {
        this.scoreManager.highScore = Math.max(this.scoreManager.highScore, best);
        this.profile.clearLegacyHighScore();
        this.legacyHighScore = 0;
        this.updatePlayer();
        this.refresh();
    }

    updatePlayer() {
        const canJoin = this.service.isConfigured && !this.profile.hasUsername;
        this.panel.setPlayer(this.profile.username, canJoin);
    }
}
