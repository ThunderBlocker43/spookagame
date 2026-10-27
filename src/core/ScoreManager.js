export class ScoreManager {
    constructor() {
        this.currentScore = 0;
        this.highScore = this.loadHighScore();
    }

    loadHighScore() {
        try {
            const saved = localStorage.getItem('spooka_high_score') || localStorage.getItem('suika_high_score');
            return saved ? parseInt(saved, 10) || 0 : 0;
        } catch {
            return 0;
        }
    }

    saveHighScore() {
        try {
            localStorage.setItem('spooka_high_score', this.highScore.toString());
        } catch {
            // LocalStorage might be disabled or restricted
        }
    }

    addScore(points) {
        this.currentScore += points;
        if (this.currentScore > this.highScore) {
            this.highScore = this.currentScore;
            this.saveHighScore();
        }
    }

    reset() {
        this.currentScore = 0;
    }
}
