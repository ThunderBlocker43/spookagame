import { FRUIT_TIERS, CONTAINER_CONFIG, THEME } from '../config/gameConfig.js';
import { Fruit } from '../entities/Fruit.js';
import { Particle } from '../entities/Particle.js';

export class MergeController {
    constructor(physicsWorld, scoreManager, particlesList, activeFruitsList) {
        this.physicsWorld = physicsWorld;
        this.scoreManager = scoreManager;
        this.particlesList = particlesList;
        this.activeFruitsList = activeFruitsList;
        this.pendingMerges = [];
    }

    onFruitCollision(fruitA, fruitB, contactPoint) {
        // Only merge if neither has already merged and tiers match
        if (!fruitA || !fruitB || fruitA.isMerged || fruitB.isMerged) {
            return;
        }

        if (fruitA.tier !== fruitB.tier) {
            return;
        }

        // Mark immediately to prevent double processing in the same physics frame
        fruitA.isMerged = true;
        fruitB.isMerged = true;

        this.pendingMerges.push({
            fruitA,
            fruitB,
            contactPoint,
            tier: fruitA.tier
        });
    }

    processPendingMerges() {
        if (this.pendingMerges.length === 0) return;

        const merges = [...this.pendingMerges];
        this.pendingMerges = [];

        for (let i = 0; i < merges.length; i++) {
            const { fruitA, fruitB, contactPoint, tier } = merges[i];

            // Remove old fruits from physics world
            this.physicsWorld.removeBody(fruitA.body);
            this.physicsWorld.removeBody(fruitB.body);

            // Remove from active fruits list
            const idxA = this.activeFruitsList.indexOf(fruitA);
            if (idxA !== -1) this.activeFruitsList.splice(idxA, 1);
            const idxB = this.activeFruitsList.indexOf(fruitB);
            if (idxB !== -1) this.activeFruitsList.splice(idxB, 1);

            const nextTier = tier + 1;
            const spawnX = Math.max(
                CONTAINER_CONFIG.x + 20,
                Math.min(contactPoint.x, CONTAINER_CONFIG.x + CONTAINER_CONFIG.width - 20)
            );
            const spawnY = Math.max(
                CONTAINER_CONFIG.y + 20,
                Math.min(contactPoint.y, CONTAINER_CONFIG.y + CONTAINER_CONFIG.height - 20)
            );

            if (nextTier < FRUIT_TIERS.length) {
                const nextConfig = FRUIT_TIERS[nextTier];

                // Spawn new upgraded fruit
                const upgradedFruit = new Fruit(nextTier, spawnX, spawnY, true);
                this.physicsWorld.addBody(upgradedFruit.body);
                this.activeFruitsList.push(upgradedFruit);

                // Add score
                this.scoreManager.addScore(nextConfig.score);

                // Spawn celebratory particles
                this.spawnMergeParticles(spawnX, spawnY, nextConfig.color, 12);
            } else {
                // Max tier merge bonus!
                this.scoreManager.addScore(200);
                this.spawnMergeParticles(spawnX, spawnY, THEME.celebrationParticle, 25);
            }
        }
    }

    spawnMergeParticles(x, y, color, count = 10) {
        for (let i = 0; i < count; i++) {
            this.particlesList.push(new Particle(x, y, color));
        }
    }
}
