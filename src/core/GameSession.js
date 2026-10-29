import Matter from 'matter-js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { Container } from '../entities/Container.js';
import { Fruit } from '../entities/Fruit.js';
import { DropController } from '../controllers/DropController.js';
import { MergeController } from '../controllers/MergeController.js';
import { ScoreManager } from './ScoreManager.js';
import { GameState, GAME_STATES } from './GameState.js';

// ==========================================
// GAME SESSION (one board: physics, fruits, score, state)
// ==========================================
// Classic owns one session. Drop Battle owns two: the player's own board and a
// read-only mirror of the opponent's board, driven by network events.

export class GameSession {
    // random: piece RNG (seeded in Drop Battle)
    // onDrop: called after the player drops a piece
    // onMerge(tier, isMaxTier) / onDangerStart: sound effect hooks
    // isMirror: board is a replay of someone else's game and never ends by itself
    constructor({ random = Math.random, onDrop = null, onMerge = null, onDangerStart = null, isMirror = false } = {}) {
        this.onDangerStart = onDangerStart;
        this.isMirror = isMirror;
        this.activeFruits = [];
        this.particles = [];

        this.scoreManager = new ScoreManager();
        this.container = new Container();

        // Setup physics with merge collision listener
        this.physicsWorld = new PhysicsWorld((fruitA, fruitB, contact) => {
            this.mergeController.onFruitCollision(fruitA, fruitB, contact);
        });

        this.mergeController = new MergeController(this.physicsWorld, this.scoreManager, this.particles, this.activeFruits, onMerge);

        this.dropController = new DropController(this.physicsWorld, (newFruit) => {
            this.activeFruits.push(newFruit);
            if (onDrop) {
                onDrop(newFruit);
            }
        }, random);

        this.gameState = new GameState(this.scoreManager, this.physicsWorld, this.dropController);
    }

    get isPlaying() {
        return this.gameState.state === GAME_STATES.PLAYING;
    }

    // Steps physics and game logic. Returns true on the frame the game ends.
    update(deltaMs, dt) {
        let ended = false;

        if (this.isPlaying) {
            this.physicsWorld.update(deltaMs);
            this.mergeController.processPendingMerges();

            for (let i = 0; i < this.activeFruits.length; i++) {
                this.activeFruits[i].update(dt);
            }

            const wasSafe = this.gameState.dangerRatio === 0;
            this.gameState.checkGameOverConditions(this.activeFruits, dt);
            if (wasSafe && this.gameState.dangerRatio > 0 && this.onDangerStart) {
                this.onDangerStart();
            }

            if (this.isMirror) {
                // Only the danger warning is used; the real game decides when it ends
                this.gameState.state = GAME_STATES.PLAYING;
            } else {
                ended = this.gameState.state === GAME_STATES.GAMEOVER;
            }
        }

        // Update Particle system
        for (let i = this.particles.length - 1; i >= 0; i--) {
            if (!this.particles[i].update()) {
                this.particles.splice(i, 1);
            }
        }

        return ended;
    }

    render(p, aimX) {
        // 1. Container Walls & Interior
        this.container.render(p, this.gameState.dangerRatio);

        // 2. Active Fruits inside Container
        for (let i = 0; i < this.activeFruits.length; i++) {
            this.activeFruits[i].render(p, this.gameState.showHitboxDebug);
        }

        // 3. Merge Effect Particles
        for (let i = 0; i < this.particles.length; i++) {
            this.particles[i].render(p);
        }

        // 4. Drop Aim & Preview
        if (this.isPlaying) {
            this.dropController.updateAim(aimX);
            this.dropController.render(p, this.gameState.showHitboxDebug);
        }
    }

    restart() {
        this.gameState.restart(this.activeFruits, this.particles);
    }

    // ------------------------------------------
    // Network sync (Drop Battle)
    // ------------------------------------------
    // Flat, quantised list of every fruit: tier, x, y, angle and velocities.
    takeSnapshot() {
        const fruits = [];
        for (let i = 0; i < this.activeFruits.length; i++) {
            const fruit = this.activeFruits[i];
            if (fruit.isMerged) continue;
            const body = fruit.body;
            fruits.push(
                fruit.tier,
                Math.round(body.position.x * 10),
                Math.round(body.position.y * 10),
                Math.round(body.angle * 1000),
                Math.round(body.velocity.x * 100),
                Math.round(body.velocity.y * 100),
                Math.round(body.angularVelocity * 1000)
            );
        }
        return fruits;
    }

    get isSettled() {
        return this.activeFruits.every((fruit) => fruit.body.speed < 0.05 && Math.abs(fruit.body.angularVelocity) < 0.002);
    }

    // Replaces the board with a snapshot from takeSnapshot()
    applySnapshot(fruits) {
        this.physicsWorld.clearDynamicBodies();
        this.mergeController.pendingMerges = [];
        this.activeFruits.length = 0;

        for (let i = 0; i + 6 < fruits.length; i += 7) {
            const fruit = new Fruit(fruits[i], fruits[i + 1] / 10, fruits[i + 2] / 10, false);
            fruit.renderScale = 1;
            fruit.createdAt = 0; // already settled in, counts for the danger line straight away
            Matter.Body.setPosition(fruit.body, { x: fruits[i + 1] / 10, y: fruits[i + 2] / 10 });
            Matter.Body.setAngle(fruit.body, fruits[i + 3] / 1000);
            Matter.Body.setVelocity(fruit.body, { x: fruits[i + 4] / 100, y: fruits[i + 5] / 100 });
            Matter.Body.setAngularVelocity(fruit.body, fruits[i + 6] / 1000);
            this.physicsWorld.addBody(fruit.body);
            this.activeFruits.push(fruit);
        }
    }

    // Replays someone else's drop: tier at x, then their next two pieces
    applyDrop(tier, x, currentTier, nextTier) {
        const drop = this.dropController;
        drop.currentTier = tier;
        drop.updateAim(x);
        drop.lastDropTime = 0;
        drop.drop();
        drop.currentTier = currentTier;
        drop.nextTier = nextTier;
    }
}
