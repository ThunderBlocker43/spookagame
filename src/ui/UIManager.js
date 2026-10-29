import { FRUIT_TIERS, CONTAINER_CONFIG, DESIGN_WIDTH, DESIGN_HEIGHT, GUIDE_HEIGHT, CANVAS_HEIGHT, THEME } from '../config/gameConfig.js';
import { GAME_STATES } from '../core/GameState.js';

export class UIManager {
    constructor() {}

    // Drop Battle passes { battle: true }: no BEST score and no Game Over/restart modal
    render(p, gameState, scoreManager, dropController, { battle = false } = {}) {
        p.push();

        // 1. Top HUD
        this.renderHeader(p, scoreManager, dropController, gameState.showHitboxDebug, !battle);

        // 2. Danger Warning Overlay
        if (gameState.dangerRatio > 0 && gameState.state === GAME_STATES.PLAYING) {
            this.renderDangerWarning(p, gameState.dangerRatio);
        }

        // 3. Evolution Tier Bar at the bottom
        this.renderEvolutionBar(p);

        // 4. Game Over Screen
        if (gameState.state === GAME_STATES.GAMEOVER && !battle) {
            this.renderGameOver(p, scoreManager);
        }

        p.pop();
    }

    renderHeader(p, scoreManager, dropController, isDebug, showBest = true) {
        p.push();

        // Score Card (Top Left)
        p.fill(THEME.cardBackground);
        p.stroke(THEME.cardBorder);
        p.strokeWeight(1.5);
        p.rect(CONTAINER_CONFIG.x, 15, 120, 48, 8);

        p.noStroke();
        p.fill(THEME.cardLabelText);
        p.textSize(10);
        p.textAlign(p.LEFT, p.TOP);
        p.text('SCORE', CONTAINER_CONFIG.x + 10, 20);

        p.fill(THEME.cardValueText);
        p.textSize(18);
        p.textStyle(p.BOLD);
        p.text(scoreManager.currentScore, CONTAINER_CONFIG.x + 10, 36);

        // High Score indicator
        p.textStyle(p.NORMAL);
        if (showBest) {
            p.fill(THEME.cardBestScoreText);
            p.textSize(9);
            p.text(`BEST: ${scoreManager.highScore}`, CONTAINER_CONFIG.x + 65, 20);
        }

        // Next Fruit Preview Card (Top Right)
        const nextCardX = CONTAINER_CONFIG.x + CONTAINER_CONFIG.width - 65;
        p.fill(THEME.cardBackground);
        p.stroke(THEME.cardBorder);
        p.strokeWeight(1.5);
        p.rect(nextCardX, 15, 65, 48, 8);

        p.noStroke();
        p.fill(THEME.cardLabelText);
        p.textSize(10);
        p.textAlign(p.CENTER, p.TOP);
        p.text('NEXT', nextCardX + 32, 20);

        // Draw preview of next fruit
        const nextConfig = FRUIT_TIERS[dropController.nextTier] || FRUIT_TIERS[0];
        this.renderTierIcon(p, nextConfig, nextCardX + 32, 46, 30);

        // Debug Hitbox Indicator (Top Center)
        p.noStroke();
        p.fill(isDebug ? THEME.debugOn : THEME.debugOff);
        p.textSize(9);
        p.textAlign(p.CENTER, p.CENTER);
        p.text(`[D] Hitbox: ${isDebug ? 'ON' : 'OFF'}`, DESIGN_WIDTH / 2, 25);

        p.pop();
    }

    renderDangerWarning(p, ratio) {
        p.push();
        const flashAlpha = Math.sin(p.millis() * 0.012) * 45 + 45;
        p.fill(255, 60, 0, flashAlpha * ratio);
        p.noStroke();
        p.rect(
            CONTAINER_CONFIG.x,
            CONTAINER_CONFIG.dangerLineY,
            CONTAINER_CONFIG.width,
            CONTAINER_CONFIG.height - (CONTAINER_CONFIG.dangerLineY - CONTAINER_CONFIG.y)
        );
        p.pop();
    }

    // Tier sprite (the same image the playfield uses), coloured circle as fallback
    renderTierIcon(p, tierConfig, x, y, size) {
        p.push();
        if (tierConfig.spriteImage) {
            p.imageMode(p.CENTER);
            p.image(tierConfig.spriteImage, x, y, size, size);
        } else {
            p.noStroke();
            p.fill(tierConfig.color);
            p.ellipseMode(p.CENTER);
            p.ellipse(x, y, size * 0.8, size * 0.8);
        }
        p.pop();
    }

    // Evolution guide in its own band under the container: every tier at the same,
    // readable size in equal slots, smallest to largest, on a dark panel so the
    // sprites' outlines stand out
    renderEvolutionBar(p) {
        p.push();
        const margin = 6;
        const panelY = DESIGN_HEIGHT + 2;
        const panelH = GUIDE_HEIGHT - 6;
        const totalFruits = FRUIT_TIERS.length;
        const slotW = (DESIGN_WIDTH - margin * 2) / totalFruits;
        const iconSize = Math.min(slotW - 2, panelH - 8);
        const centerY = panelY + panelH / 2;

        p.stroke(THEME.evolutionBarBorder);
        p.strokeWeight(1);
        p.fill(THEME.evolutionBarBackground);
        p.rect(margin, panelY, DESIGN_WIDTH - margin * 2, panelH, 10);

        for (let i = 0; i < totalFruits; i++) {
            this.renderTierIcon(p, FRUIT_TIERS[i], margin + slotW * (i + 0.5), centerY, iconSize);
        }
        p.pop();
    }

    renderGameOver(p, scoreManager) {
        p.push();

        // Dim dark background overlay
        p.fill(0, 0, 0, 190);
        p.noStroke();
        p.rect(0, 0, DESIGN_WIDTH, CANVAS_HEIGHT);

        // Modal Box
        const modalW = 260;
        const modalH = 200;
        const modalX = (DESIGN_WIDTH - modalW) / 2;
        const modalY = (DESIGN_HEIGHT - modalH) / 2;

        p.fill(THEME.modalBackground);
        p.stroke(THEME.modalBorder);
        p.strokeWeight(2.5);
        p.rect(modalX, modalY, modalW, modalH, 16);

        // Game Over Text
        p.noStroke();
        p.fill(THEME.modalTitle);
        p.textSize(26);
        p.textStyle(p.BOLD);
        p.textAlign(p.CENTER, p.TOP);
        p.text('GAME OVER', DESIGN_WIDTH / 2, modalY + 24);

        // Score display
        p.fill(THEME.modalScoreLabel);
        p.textSize(14);
        p.textStyle(p.NORMAL);
        p.text(`Final Score: ${scoreManager.currentScore}`, DESIGN_WIDTH / 2, modalY + 68);

        p.fill(THEME.modalScoreValue);
        p.text(`Best Score: ${scoreManager.highScore}`, DESIGN_WIDTH / 2, modalY + 92);

        // Restart button
        const btnW = 160;
        const btnH = 40;
        const btnX = (DESIGN_WIDTH - btnW) / 2;
        const btnY = modalY + 130;

        p.fill(THEME.modalButton);
        p.noStroke();
        p.rect(btnX, btnY, btnW, btnH, 10);

        p.fill(THEME.modalButtonText);
        p.textSize(15);
        p.textStyle(p.BOLD);
        p.textAlign(p.CENTER, p.CENTER);
        p.text('PLAY AGAIN (R)', DESIGN_WIDTH / 2, btnY + btnH / 2);

        p.pop();
    }
}
