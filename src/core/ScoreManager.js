export class ScoreManager {
    constructor() {
        this.currentScore = 0;
        // Seeded and persisted by LeaderboardController (server-stored best)
        this.highScore = 0;
    }

    addScore(points) {
        this.currentScore += points;
        if (this.currentScore > this.highScore) {
            this.highScore = this.currentScore;
        }
    }

    reset() {
        this.currentScore = 0;
    }
}
