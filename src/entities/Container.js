import { CONTAINER_CONFIG, THEME } from '../config/gameConfig.js';

export class Container {
    constructor() {
        this.config = CONTAINER_CONFIG;
    }

    render(p, dangerWarningRatio = 0) {
        const { x, y, width, height, wallThickness, dangerLineY } = this.config;

        p.push();

        // 1. Container Interior Background
        p.noStroke();
        p.fill(THEME.containerBackground);
        p.rect(x, y, width, height, 0, 0, 8, 8);

        // 2. Danger Line
        p.push();
        if (dangerWarningRatio > 0) {
            // Pulsing warning color when an item is staying above line
            const pulse = (Math.sin(p.millis() * 0.015) + 1) * 0.5;
            p.stroke(255, 84, 0, 180 + 75 * pulse);
            p.strokeWeight(2.5);
        } else {
            p.stroke(THEME.dangerLineNormal);
            p.strokeWeight(1.5);
        }

        // Draw dashed danger line
        const dashLen = 6;
        const gapLen = 4;
        let curX = x;
        while (curX < x + width) {
            p.line(curX, dangerLineY, Math.min(curX + dashLen, x + width), dangerLineY);
            curX += dashLen + gapLen;
        }

        // Danger icon / label
        if (dangerWarningRatio > 0) {
            p.noStroke();
            p.fill(THEME.dangerText);
            p.textSize(10);
            p.textStyle(p.BOLD);
            p.textAlign(p.RIGHT, p.BOTTOM);
            p.text('DANGER!', x + width - 6, dangerLineY - 3);
        }
        p.pop();

        // 3. Container Walls and Floor (Solid Boundaries)
        p.fill(THEME.containerWall);
        p.stroke(THEME.containerWallBorder);
        p.strokeWeight(1.5);

        // Left wall
        p.rect(x - wallThickness, y, wallThickness, height + wallThickness, 8, 0, 0, 8);
        // Right wall
        p.rect(x + width, y, wallThickness, height + wallThickness, 0, 8, 8, 0);
        // Floor
        p.rect(x - wallThickness, y + height, width + wallThickness * 2, wallThickness, 0, 0, 8, 8);

        p.pop();
    }
}
