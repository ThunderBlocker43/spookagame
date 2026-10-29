import p5 from 'p5';
import {DESIGN_WIDTH, DESIGN_HEIGHT, FRUIT_TIERS, THEME} from './config/gameConfig.js';
import { MODES, MODE_LIST } from './config/modesConfig.js';
import { SvgHitboxParser } from './physics/SvgHitboxParser.js';
import { GameSession } from './core/GameSession.js';
import { GAME_STATES } from './core/GameState.js';
import { UIManager } from './ui/UIManager.js';
import { ModeNav } from './ui/ModeNav.js';
import { LeaderboardController } from './controllers/LeaderboardController.js';
import { BattleController } from './controllers/BattleController.js';

const sketch = (p) => {
    const appElement = document.getElementById('app');

    // Global scale factor from design pixels to screen pixels
    let scale = 1;

    // Game Core State & Entities
    let classic;            // the Classic board (GameSession)
    let uiManager;
    let leaderboardController;
    let battleController;
    let modeNav;

    // ==========================================
    // 1. SCALING & VIEWPORT CALCULATION
    // ==========================================
    const computeCanvasSize = () => {
        const rect = appElement
            ? appElement.getBoundingClientRect()
            : { width: window.innerWidth, height: window.innerHeight };

        // Drop Battle pads #app to make room for the opponent's board (0 in Classic)
        const style = appElement ? getComputedStyle(appElement) : null;
        const padX = style ? parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) : 0;
        const padY = style ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) : 0;

        const containerWidth = (rect.width || window.innerWidth) - padX;
        const containerHeight = (rect.height || window.innerHeight) - padY;

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
        classic = new GameSession();
        uiManager = new UIManager();
        leaderboardController = new LeaderboardController(classic.scoreManager, canvas.elt);

        modeNav = new ModeNav(canvas.elt, MODE_LIST, { onSelect: (mode) => selectMode(mode) });
        modeNav.setActive(MODES.CLASSIC);

        battleController = new BattleController({
            leaderboard: leaderboardController,
            uiManager,
            appElement,
            canvasElement: canvas.elt,
            onEnter: () => modeNav.setActive(MODES.BATTLE),
            onExit: () => modeNav.setActive(MODES.CLASSIC),
            requestResize: () => p.windowResized()
        });
        leaderboardController.onChallengeFriend = (name) => battleController.challengeFriend(name);
        leaderboardController.onPlayerChanged = () => battleController.onPlayerChanged();

        // Opened from a Drop Battle invite link?
        battleController.openFromUrl();
    };

    // ==========================================
    // 4. GAME MODES
    // ==========================================
    // Classic stays paused (not reset) while Drop Battle is open.
    const selectMode = (mode) => {
        if (mode === MODES.BATTLE) {
            modeNav.setActive(MODES.BATTLE);
            battleController.open();
        } else if (battleController.isOpen) {
            battleController.exit();
        }
    };

    p.draw = () => {
        // setup() is async (sprite loading); draw can run before it finishes
        if (!classic) return;

        // Delta time for physics and animations
        const dt = Math.min(p.deltaTime / 1000, 1 / 30);

        // Apply design-resolution scaling transform
        p.resetMatrix();
        p.scale(scale);

        // Spooky Halloween background
        p.background(THEME.canvasBackground);

        // Drop Battle match: the canvas shows the player's own battle board
        if (battleController.isMatchVisible) {
            battleController.update(p.deltaTime, dt);
            battleController.render(p, p.vMouseX);
            return;
        }

        // Physics & Game Logic Step (paused behind the Drop Battle lobby)
        if (!battleController.isOpen && classic.update(p.deltaTime, dt)) {
            leaderboardController.onGameOver();
        }

        // Render Pass: container, fruits, particles, aim & preview
        classic.render(p, p.vMouseX);

        // UI Layer (Score, Next fruit preview, Game Over overlay)
        uiManager.render(p, classic.gameState, classic.scoreManager, classic.dropController);
    };

    p.windowResized = () => {
        const { w, h, scale: s } = computeCanvasSize();
        scale = s;
        p.resizeCanvas(w, h);
    };

    // ==========================================
    // 5. INPUT HANDLING
    // ==========================================
    p.mousePressed = () => {
        handleUserAction();
    };

    p.touchStarted = () => {
        handleUserAction();
        return false; // prevent default scrolling behavior on mobile
    };

    p.keyPressed = () => {
        if (!classic || battleController.isOpen) return;

        if (p.key === 'r' || p.key === 'R') {
            classic.restart();
        } else if (p.key === 'd' || p.key === 'D' || p.key === 'h' || p.key === 'H') {
            classic.gameState.toggleHitboxDebug();
        }
    };

    const handleUserAction = () => {
        if (!classic) return;

        if (battleController.isOpen) {
            battleController.onUserAction(p.vMouseX);
            return;
        }

        const { gameState, dropController } = classic;

        // If clicking on the game over screen, restart
        if (gameState.state === GAME_STATES.GAMEOVER) {
            classic.restart();
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
