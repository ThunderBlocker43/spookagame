// ==========================================
// GAME & PHYSICS CONFIGURATION
// ==========================================
// All gameplay, physics parameters, container layout, and fruit tiers
// are defined here in single data-driven structures.

export const DESIGN_WIDTH = 360;
export const DESIGN_HEIGHT = 640;         // Board area (header + container); game logic uses this

// Band below the board for the tier evolution guide; the canvas covers both
export const GUIDE_HEIGHT = 46;
export const CANVAS_HEIGHT = DESIGN_HEIGHT + GUIDE_HEIGHT;

// Canvas backing-store resolution cap. p5 defaults to ceil(devicePixelRatio),
// i.e. 3-4x on high-end phones (up to ~5M pixels redrawn every frame). 2x stays
// sharp (the sprites are rasterised well below that anyway) at a fraction of the cost.
export const MAX_PIXEL_DENSITY = 2;

export const PHYSICS_CONFIG = {
    gravity: 1.4,             // World gravity scale (Y axis)
    friction: 0.18,           // Surface friction for realistic rolling and stacking
    frictionStatic: 0.3,      // Static friction to keep fruit stacks stable
    frictionAir: 0.008,       // Air drag
    restitution: 0.15,        // Bounciness (low restitution keeps piles from jittering)
    density: 0.002,           // Base density for realistic mass scaling with volume
    positionIterations: 10,   // Solver position iterations for high stability
    velocityIterations: 10,   // Solver velocity iterations
};

export const CONTAINER_CONFIG = {
    x: 25,                    // Left X coordinate of container
    y: 130,                   // Top Y coordinate of container walls
    width: 310,               // Inner width of the container
    height: 480,              // Height of the container
    wallThickness: 24,        // Thickness of boundaries to prevent tunneling
    dangerLineY: 170,         // Y-level above which settled fruits trigger Game Over
    dangerGraceTimeMs: 1600   // Grace period (ms) an unsettled fruit can stay above line
};

export const DROP_CONFIG = {
    dropY: 75,                // Y position where player aims and drops
    dropCooldownMs: 500,      // Minimum delay between drops in milliseconds
    initialSpawnTiers: [0, 1, 2, 3, 4], // Tiers available for random drops (Cherry to Orange)
};

// ==========================================
// SPOOKA HALLOWEEN COLOR THEME
// ==========================================
export const THEME = {
    // Canvas & Web Backgrounds
    pageBackground: '#0b0813',         // Midnight abyss
    canvasBackground: '#130d20',       // Deep spooky purple-black canvas background

    // Play Container
    containerBackground: '#1c142b',    // Dark haunted play area interior
    containerWall: '#352449',          // Gothic stone boundary walls
    containerWallBorder: '#4d3568',    // Muted purple wall trim
    dangerLineNormal: '#993344',       // Idle danger threshold line
    dangerLinePulse: '#ff3700',        // Pulsing pumpkin danger warning line
    dangerText: '#ff6600',             // Glowing danger alert label
    dangerZoneFlash: 'rgba(255, 30, 0, 0.22)', // Flashing danger region

    // Aiming & Drop Preview
    aimLine: 'rgba(190, 150, 245, 0.4)', // Spectral purple-white dashed drop guide

    // HUD & Top Cards (Score & Next Preview)
    cardBackground: '#221636',        // Dark crypt panel background
    cardBorder: '#4a3366',            // Gothic border
    cardLabelText: '#a795be',         // Spectral lilac header labels
    cardValueText: '#f8f4ff',         // Ghostly bone white for primary score
    cardBestScoreText: '#ffaa33',     // Warm pumpkin gold for high score

    // Debug Hitbox Indicator
    debugOn: '#39ff14',               // Slime green when debug mode active
    debugOff: '#6c5a82',              // Dim purple-gray when debug inactive

    // Evolution Bar (Footer)
    evolutionBarBackground: '#1c132b',
    evolutionBarBorder: '#412b5b',

    // Game Over Screen Modal
    modalOverlay: 'rgba(8, 4, 15, 0.85)', // Shadowy veil
    modalBackground: '#1d122d',           // Haunted mausoleum card
    modalBorder: '#ff7518',               // Jack-o'-lantern orange border
    modalTitle: '#ff7518',                // Vibrant pumpkin orange GAME OVER
    modalScoreLabel: '#cec2df',           // Ethereal light purple text
    modalScoreValue: '#ffaa33',           // Amber gold score numbers
    modalButton: '#ff6200',               // Pumpkin orange restart button
    modalButtonText: '#ffffff',           // Crisp white button text

    // Particles & Effects
    celebrationParticle: '#ff8800',       // Pumpkin spark burst
};

// ==========================================
// FRUIT TIERS & HITBOX CONFIGURATION
// ==========================================
// To customize a fruit:
// - Adjust `radius`, `score`, `name`, `color`
// - Customize `hitbox`:
//     shape: 'svg' | 'circle' | 'polygon' | 'rectangle'
//     samples: number of radial contour samples (default: 28)
//     smoothingPasses: smoothing iterations for realistic rolling (default: 2)
//     radius / width / height / vertices
//     offset: { x: 0, y: 0 } (relative to sprite center)
//     scale: 1.0 (multiplier for hitbox size relative to sprite)
// - Optionally assign `sprite: 'path/to/image.svg'` or use built-in procedural graphics
export const FRUIT_TIERS = [
    {
        tier: 0,
        name: 'rotten_cherry',
        radius: 14,
        score: 1,
        color: '#e63946',
        leafColor: '#2a9d8f',
        hitbox: {
            shape: 'circle',
            radius: 14,
            offset: { x: 0, y: 0 },
            scale: 1.0
        },
        sprite: 'assets/rotten_cherry.svg'
    },
    {
        tier: 1,
        name: 'rotten_cherries',
        radius: 20,
        score: 3,
        color: '#ff4d6d',
        leafColor: '#38b000',
        hitbox: {
            shape: 'svg',
            samples: 28,
            smoothingPasses: 2,
            offset: { x: 0, y: 0 },
            scale: 1.0
        },
        sprite: 'assets/rotten_cherries.svg'
    },
    {
        tier: 2,
        name: 'rotten_pear',
        radius: 27,
        score: 6,
        color: '#9b5de5',
        leafColor: '#70e000',
        hitbox: {
            shape: 'circle',
            radius: 27,
            offset: { x: 0, y: 0 },
            scale: 1.0
        },
        sprite: 'assets/rotten_pear.svg'
    },
    {
        tier: 3,
        name: 'rotten_apple',
        radius: 35,
        score: 10,
        color: '#f77f00',
        leafColor: '#38b000',
        hitbox: {
            shape: 'svg',
            samples: 28,
            smoothingPasses: 2,
            offset: { x: 0, y: 0 },
            scale: 1.0
        },
        sprite: 'assets/rotten_apple.svg'
    },
    {
        tier: 4,
        name: 'squash',
        radius: 44,
        score: 15,
        color: '#fb8500',
        leafColor: '#2b9348',
        hitbox: {
            shape: 'circle',
            radius: 44,
            offset: { x: 0, y: 0 },
            scale: 1.0
        },
        sprite: 'assets/squash.svg'
    },
    {
        tier: 5,
        name: 'pumpkin',
        radius: 54,
        score: 21,
        color: '#d90429',
        leafColor: '#55a630',
        hitbox: {
            shape: 'circle',
            radius: 54,
            offset: { x: 0, y: 0 },
            scale: 1.0
        },
        sprite: 'assets/pumpkin.svg'
    },
    {
        tier: 7,
        name: 'vampire',
        radius: 80,
        score: 28,
        color: '#d4e09b',
        leafColor: '#2d6a4f',
        hitbox: {
            shape: 'circle',
            radius: 64,
            offset: { x: 0, y: 0 },
            scale: 1.0
        },
        sprite: 'assets/vampire.svg'
    },
    {
        tier: 7,
        name: 'weird fruit',
        radius: 75,
        score: 36,
        color: '#ffb5a7',
        leafColor: '#40916c',
        hitbox: {
            shape: 'circle',
            radius: 75,
            offset: { x: 0, y: 0 },
            scale: 1.0
        },
        sprite: 'assets/weird-fruit.svg'
    },
    {
        tier: 8,
        name: 'rounded pumpkin',
        radius: 87,
        score: 45,
        color: '#ffbe0b',
        leafColor: '#1b4332',
        hitbox: {
            shape: 'circle',
            radius: 87,
            offset: { x: 0, y: 0 },
            scale: 1.0
        },
        sprite: 'assets/rounded-pumpkin.svg'
    },
    {
        tier: 9,
        name: 'another pumpkin',
        radius: 100,
        score: 55,
        color: '#90be6d',
        leafColor: '#1b4332',
        hitbox: {
            shape: 'circle',
            radius: 100,
            offset: { x: 0, y: 0 },
            scale: 1.0
        },
        sprite: 'assets/another-pumpkin.svg'
    },
    {
        tier: 10,
        name: 'big pumpkin',
        radius: 115,
        score: 66,
        color: '#2d6a4f',
        leafColor: '#1b4332',
        hitbox: {
            shape: 'circle',
            radius: 115,
            offset: { x: 0, y: 0 },
            scale: 1.0
        },
        sprite: 'assets/big-pumpkin.svg'
    }
];
