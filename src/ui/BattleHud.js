import { FRUIT_TIERS, DROP_CONFIG, DESIGN_WIDTH, DESIGN_HEIGHT, THEME } from '../config/gameConfig.js';

// ==========================================
// BATTLE HUD (in-canvas Drop Battle overlays on the player's own board)
// ==========================================

export class BattleHud {
    // Shrinking ring around the held piece; turns red in the last 1.5 s
    renderDropTimer(p, aimX, tier, remainingMs, totalMs) {
        const ratio = Math.max(0, Math.min(1, remainingMs / totalMs));
        const r = (FRUIT_TIERS[tier] || FRUIT_TIERS[0]).radius + 7;
        const urgent = remainingMs <= 1500;

        p.push();
        p.noFill();
        p.strokeWeight(3);
        p.stroke(THEME.cardBorder);
        p.ellipse(aimX, DROP_CONFIG.dropY, r * 2, r * 2);
        p.stroke(urgent ? THEME.dangerLinePulse : THEME.cardBestScoreText);
        p.arc(aimX, DROP_CONFIG.dropY, r * 2, r * 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);

        p.noStroke();
        p.fill(urgent ? THEME.dangerText : THEME.cardLabelText);
        p.textSize(11);
        p.textStyle(p.BOLD);
        // Seconds beside the ring, on the side with more room
        const onLeft = aimX > DESIGN_WIDTH / 2;
        p.textAlign(onLeft ? p.RIGHT : p.LEFT, p.CENTER);
        p.text((remainingMs / 1000).toFixed(1), aimX + (onLeft ? -r - 5 : r + 5), DROP_CONFIG.dropY);
        p.pop();
    }

    renderCountdown(p, remainingMs) {
        const seconds = Math.ceil(remainingMs / 1000);
        const pulse = 1 - (remainingMs % 1000) / 1000;
        this.renderBanner(p, seconds > 0 ? String(seconds) : 'GO!', 56 + pulse * 16, 120);
    }

    renderBanner(p, text, size = 34, dim = 150) {
        p.push();
        p.noStroke();
        p.fill(0, 0, 0, dim);
        p.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
        p.fill(THEME.modalTitle);
        p.textSize(size);
        p.textStyle(p.BOLD);
        p.textAlign(p.CENTER, p.CENTER);
        p.text(text, DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2);
        p.pop();
    }
}
