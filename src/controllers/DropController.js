import { DROP_CONFIG, CONTAINER_CONFIG, FRUIT_TIERS, THEME } from '../config/gameConfig.js';
import { Fruit } from '../entities/Fruit.js';

export class DropController {
    // random: () => [0, 1). Drop Battle passes a seeded one so both players get the same pieces.
    constructor(physicsWorld, onFruitDropped, random = Math.random) {
        this.physicsWorld = physicsWorld;
        this.onFruitDropped = onFruitDropped;
        this.random = random;
        this.lastDropTime = 0;

        this.currentTier = this.getRandomTier();
        this.nextTier = this.getRandomTier();

        this.aimX = CONTAINER_CONFIG.x + CONTAINER_CONFIG.width / 2;
        this.dropY = DROP_CONFIG.dropY;
    }

    getRandomTier() {
        const pool = DROP_CONFIG.initialSpawnTiers || [0, 1, 2];
        const idx = Math.floor(this.random() * pool.length);
        return pool[idx];
    }

    getClampedX(x, tier) {
        const fruitConfig = FRUIT_TIERS[tier] || FRUIT_TIERS[0];
        const r = fruitConfig.radius;
        const minX = CONTAINER_CONFIG.x + r + 4;
        const maxX = CONTAINER_CONFIG.x + CONTAINER_CONFIG.width - r - 4;
        return Math.max(minX, Math.min(x, maxX));
    }

    updateAim(virtualX) {
        this.aimX = this.getClampedX(virtualX, this.currentTier);
    }

    canDrop() {
        return Date.now() - this.lastDropTime >= DROP_CONFIG.dropCooldownMs;
    }

    drop() {
        if (!this.canDrop()) {
            return null;
        }

        const fruit = new Fruit(this.currentTier, this.aimX, this.dropY, false);
        this.physicsWorld.addBody(fruit.body);

        this.lastDropTime = Date.now();
        this.currentTier = this.nextTier;
        this.nextTier = this.getRandomTier();

        if (this.onFruitDropped) {
            this.onFruitDropped(fruit);
        }

        return fruit;
    }

    reset() {
        this.lastDropTime = 0;
        this.currentTier = this.getRandomTier();
        this.nextTier = this.getRandomTier();
        this.aimX = CONTAINER_CONFIG.x + CONTAINER_CONFIG.width / 2;
    }

    render(p, showHitbox = false) {
        const fruitConfig = FRUIT_TIERS[this.currentTier] || FRUIT_TIERS[0];
        const r = fruitConfig.radius;
        const x = this.aimX;
        const y = this.dropY;

        p.push();

        // 1. Aim Guide Line (Spectral Lavender)
        p.stroke(THEME.aimLine);
        p.strokeWeight(1.5);
        const dashLen = 5;
        const gapLen = 4;
        let curY = y + r + 4;
        const bottomY = CONTAINER_CONFIG.y + CONTAINER_CONFIG.height;

        while (curY < bottomY) {
            p.line(x, curY, x, Math.min(curY + dashLen, bottomY));
            curY += dashLen + gapLen;
        }

        // 2. Aiming Fruit Preview
        p.translate(x, y);

        // Alpha fade if cooling down
        const readyRatio = Math.min(1, (Date.now() - this.lastDropTime) / DROP_CONFIG.dropCooldownMs);
        if (readyRatio < 1) {
            p.tint(255, 120 + 135 * readyRatio);
        }

        if (fruitConfig.spriteImage) {
            p.imageMode(p.CENTER);
            p.image(fruitConfig.spriteImage, 0, 0, r * 2, r * 2);
        } else {
            // Procedural preview
            p.ellipseMode(p.RADIUS);
            p.noStroke();
            p.fill(fruitConfig.color);
            p.ellipse(0, 0, r, r);

            // Highlight
            p.fill(255, 255, 255, 90);
            p.ellipse(-r * 0.35, -r * 0.35, r * 0.3, r * 0.18);

            // Eyes & smile
            const eyeOffset = r * 0.35;
            const eyeSize = Math.max(2.5, r * 0.12);
            p.fill(30);
            p.ellipse(-eyeOffset, 0, eyeSize, eyeSize);
            p.ellipse(eyeOffset, 0, eyeSize, eyeSize);

            p.noFill();
            p.stroke(30);
            p.strokeWeight(Math.max(1.2, r * 0.06));
            p.arc(0, eyeSize * 0.2, r * 0.3, r * 0.25, 0.1, Math.PI - 0.1);

            p.noStroke();
            p.fill(fruitConfig.leafColor || '#2d6a4f');
            p.ellipse(0, -r * 0.9, r * 0.22, r * 0.12);
        }

        // Debug Hitbox on Aiming Fruit
        if (showHitbox) {
            p.stroke(57, 255, 20, 240);
            p.strokeWeight(1.8);
            p.fill(57, 255, 20, 45);

            const svgVertices = fruitConfig.svgVertices || (fruitConfig.hitbox && fruitConfig.hitbox.svgVertices);
            if (svgVertices && Array.isArray(svgVertices) && svgVertices.length >= 3) {
                const spriteSize = r * 2;
                const scale = (fruitConfig.hitbox && fruitConfig.hitbox.scale !== undefined) ? fruitConfig.hitbox.scale : 1.0;
                p.beginShape();
                for (let j = 0; j < svgVertices.length; j++) {
                    const v = svgVertices[j];
                    p.vertex(v.x * spriteSize * scale, v.y * spriteSize * scale);
                }
                p.endShape(p.CLOSE);
            } else {
                const hitbox = fruitConfig.hitbox || {};
                const offset = hitbox.offset || { x: 0, y: 0 };
                const scale = hitbox.scale !== undefined ? hitbox.scale : 1.0;
                p.ellipse(offset.x, offset.y, r * scale, r * scale);
            }
        }

        p.pop();
    }
}
