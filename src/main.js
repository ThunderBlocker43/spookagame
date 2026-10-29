import p5 from 'p5';
import {DESIGN_WIDTH, DESIGN_HEIGHT, FRUIT_TIERS, THEME} from './config/gameConfig.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { SvgHitboxParser } from './physics/SvgHitboxParser.js';
import { Container } from './entities/Container.js';
import { DropController } from './controllers/DropController.js';
import { MergeController } from './controllers/MergeController.js';
import { ScoreManager } from './core/ScoreManager.js';
import { GameState, GAME_STATES } from './core/GameState.js';
import { UIManager } from './ui/UIManager.js';
import { LeaderboardController } from './controllers/LeaderboardController.js';

const sketch = (p) => {
    const appElement = document.getElementById('app');

    // Global scale factor from design pixels to screen pixels
    let scale = 1;

    // Game Core State & Entities
    let physicsWorld;
    let container;
    let scoreManager;
    let dropController;
    let mergeController;
    let gameState;
    let uiManager;
    let leaderboardController;

    const activeFruits = [];
    const particles = [];

    // ==========================================
    // 1. SCALING & VIEWPORT CALCULATION
    // ==========================================
    const computeCanvasSize = () => {
        const rect = appElement
            ? appElement.getBoundingClientRect()
            : { width: window.innerWidth, height: window.innerHeight };

        const containerWidth = rect.width || window.innerWidth;
        const containerHeight = rect.height || window.innerHeight;

        const scaleFactor = Math.min(
            containerWidth / DESIGN_WIDTH,
            containerHeight / DESIGN_HEIGHT
        );

        const w = Math.max(1, Math.floor(DESIGN_WIDTH * scaleFactor));
        const h = Math.max(1, Math.floor(DESIGN_HEIGHT * scaleFactor));

        return {
            w,
            h,
            scale: w / DESIGN_WIDTH
        };
    };

    // ==========================================
    // 2. VIRTUAL INPUT & COORDINATE HELPERS
    // ==========================================
    const getMouseX = () => p.mouseX / scale;
    const getMouseY = () => p.mouseY / scale;

    const getVirtualTouches = () => {
        return (p.touches || []).map((t) => ({
            ...t,
            x: t.x / scale,
            y: t.y / scale
        }));
    };

    Object.defineProperty(p, 'vMouseX', { get: getMouseX, configurable: true });
    Object.defineProperty(p, 'vMouseY', { get: getMouseY, configurable: true });
    Object.defineProperty(p, 'vTouches', { get: getVirtualTouches, configurable: true });
    Object.defineProperty(p, 'vWidth', { get: () => DESIGN_WIDTH, configurable: true });
    Object.defineProperty(p, 'vHeight', { get: () => DESIGN_HEIGHT, configurable: true });

    // ==========================================
    // 3. P5 LIFECYCLE HOOKS
    // ==========================================
    p.setup = async () => {
        // Load sprite assets and extract smooth, rollable SVG hitboxes asynchronously once at setup
        await Promise.all(
            FRUIT_TIERS.map(async (tier) => {
                if (tier.sprite) {
                    tier.spriteImage = await p.loadImage(tier.sprite);
                    if (tier.sprite.endsWith('.svg') || tier.hitbox?.shape === 'svg') {
                        const options = {
                            samples: tier.hitbox?.samples || 28,
                            smoothingPasses: tier.hitbox?.smoothingPasses !== undefined ? tier.hitbox.smoothingPasses : 2,
                            alphaThreshold: tier.hitbox?.alphaThreshold || 25
                        };
                        const vertices = SvgHitboxParser.generateHitboxFromImage(tier.spriteImage, options);
                        if (vertices && vertices.length >= 3) {
                            tier.svgVertices = vertices;
                        }
                    }
                }
            })
        );

        const { w, h, scale: s } = computeCanvasSize();
        scale = s;

        const canvas = p.createCanvas(w, h);
        if (appElement) {
            canvas.parent(appElement);
        }

        // Initialize game architecture
        scoreManager = new ScoreManager();
        container = new Container();
        uiManager = new UIManager();
        leaderboardController = new LeaderboardController(scoreManager, canvas.elt);

        // Setup physics with merge collision listener
        physicsWorld = new PhysicsWorld((fruitA, fruitB, contact) => {
            mergeController.onFruitCollision(fruitA, fruitB, contact);
        });

        mergeController = new MergeController(physicsWorld, scoreManager, particles, activeFruits);

        dropController = new DropController(physicsWorld, (newFruit) => {
            activeFruits.push(newFruit);
        });

        gameState = new GameState(scoreManager, physicsWorld, dropController);
    };

    p.draw = () => {
        // Delta time for physics and animations
        const dt = Math.min(p.deltaTime / 1000, 1 / 30);

        // Apply design-resolution scaling transform
        p.resetMatrix();
        p.scale(scale);

        // Spooky Halloween background
        p.background(THEME.canvasBackground);

        // Physics & Game Logic Step
        if (gameState.state === GAME_STATES.PLAYING) {
            physicsWorld.update(p.deltaTime);
            mergeController.processPendingMerges();

            for (let i = 0; i < activeFruits.length; i++) {
                activeFruits[i].update(dt);
            }

            gameState.checkGameOverConditions(activeFruits, dt);

            if (gameState.state === GAME_STATES.GAMEOVER) {
                leaderboardController.onGameOver();
            }
        }

        // Update Particle system
        for (let i = particles.length - 1; i >= 0; i--) {
            if (!particles[i].update()) {
                particles.splice(i, 1);
            }
        }

        // --- Render Pass ---
        // 1. Container Walls & Interior
        container.render(p, gameState.dangerRatio);

        // 2. Active Fruits inside Container
        for (let i = 0; i < activeFruits.length; i++) {
            activeFruits[i].render(p, gameState.showHitboxDebug);
        }

        // 3. Merge Effect Particles
        for (let i = 0; i < particles.length; i++) {
            particles[i].render(p);
        }

        // 4. Drop Aim & Preview
        if (gameState.state === GAME_STATES.PLAYING) {
            dropController.updateAim(p.vMouseX);
            dropController.render(p, gameState.showHitboxDebug);
        }

        // 5. UI Layer (Score, Next fruit preview, Game Over overlay)
        uiManager.render(p, gameState, scoreManager, dropController);
    };

    p.windowResized = () => {
        const { w, h, scale: s } = computeCanvasSize();
        scale = s;
        p.resizeCanvas(w, h);
    };

    // ==========================================
    // 4. INPUT HANDLING
    // ==========================================
    p.mousePressed = () => {
        handleUserAction();
    };

    p.touchStarted = () => {
        handleUserAction();
        return false; // prevent default scrolling behavior on mobile
    };

    p.keyPressed = () => {
        if (p.key === 'r' || p.key === 'R') {
            gameState.restart(activeFruits, particles);
        } else if (p.key === 'd' || p.key === 'D' || p.key === 'h' || p.key === 'H') {
            gameState.toggleHitboxDebug();
        }
    };

    const handleUserAction = () => {
        // If clicking on the game over screen, restart
        if (gameState.state === GAME_STATES.GAMEOVER) {
            gameState.restart(activeFruits, particles);
            return;
        }

        // In playing state, trigger fruit drop
        if (gameState.state === GAME_STATES.PLAYING) {
            dropController.updateAim(p.vMouseX);
            dropController.drop();
        }
    };
};

new p5(sketch);
