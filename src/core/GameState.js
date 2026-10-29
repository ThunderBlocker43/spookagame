import { CONTAINER_CONFIG, DESIGN_HEIGHT, DESIGN_WIDTH } from '../config/gameConfig.js';

export const GAME_STATES = {
    PLAYING: 'PLAYING',
    GAMEOVER: 'GAMEOVER'
};

export class GameState {
    constructor(scoreManager, physicsWorld, dropController) {
        this.scoreManager = scoreManager;
        this.physicsWorld = physicsWorld;
        this.dropController = dropController;

        this.state = GAME_STATES.PLAYING;
        this.dangerTimer = 0;
        this.dangerRatio = 0;
        this.showHitboxDebug = false;
    }

    toggleHitboxDebug() {
        this.showHitboxDebug = !this.showHitboxDebug;
        return this.showHitboxDebug;
    }

    checkGameOverConditions(activeFruits, dt = 1 / 60) {
        if (this.state !== GAME_STATES.PLAYING) return;

        const now = Date.now();
        const { dangerLineY, dangerGraceTimeMs } = CONTAINER_CONFIG;
        let fruitViolatingDangerLine = false;

        for (let i = 0; i < activeFruits.length; i++) {
            const fruit = activeFruits[i];
            const body = fruit.body;

            // 1. Boundary escape check (prevent tunneling through walls)
            if (
                body.position.y > DESIGN_HEIGHT + 30 ||
                body.position.x < -30 ||
                body.position.x > DESIGN_WIDTH + 30
            ) {
                this.state = GAME_STATES.GAMEOVER;
                return;
            }

            // 2. Danger line check
            // Only evaluate fruits that have been in play for at least 1.5 seconds (grace period for freshly dropped fruit)
            const ageMs = now - fruit.createdAt;
            if (ageMs > 1500) {
                // Highest point of the actual collision shape, as currently rotated.
                // (position - config.radius assumed an upright circle the size of the
                // sprite box and fired up to ~40px early for tall/tilted pieces.)
                const topEdge = body.bounds.min.y;
                const isStationary = Math.abs(body.velocity.y) < 1.0 && Math.abs(body.velocity.x) < 1.5;

                if (topEdge < dangerLineY && isStationary) {
                    fruitViolatingDangerLine = true;
                }
            }
        }

        if (fruitViolatingDangerLine) {
            this.dangerTimer += dt * 1000;
            this.dangerRatio = Math.min(1, this.dangerTimer / dangerGraceTimeMs);

            if (this.dangerTimer >= dangerGraceTimeMs) {
                this.state = GAME_STATES.GAMEOVER;
            }
        } else {
            // Cool down danger timer
            this.dangerTimer = Math.max(0, this.dangerTimer - dt * 2000);
            this.dangerRatio = this.dangerTimer / dangerGraceTimeMs;
        }
    }

    restart(activeFruits, particlesList) {
        // Clear all active fruit bodies from physics
        this.physicsWorld.clearDynamicBodies();

        // Clear active lists
        activeFruits.length = 0;
        particlesList.length = 0;

        // Reset state
        this.scoreManager.reset();
        this.dropController.reset();
        this.dangerTimer = 0;
        this.dangerRatio = 0;
        this.state = GAME_STATES.PLAYING;
    }
}
