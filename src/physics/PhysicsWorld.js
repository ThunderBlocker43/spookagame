import Matter from 'matter-js';
import { PHYSICS_CONFIG, CONTAINER_CONFIG } from '../config/gameConfig.js';

export class PhysicsWorld {
    constructor(onFruitCollision) {
        this.onFruitCollision = onFruitCollision;

        // Create Matter.js engine
        this.engine = Matter.Engine.create({
            positionIterations: PHYSICS_CONFIG.positionIterations,
            velocityIterations: PHYSICS_CONFIG.velocityIterations,
            constraintIterations: 2,
            enableSleeping: false
        });

        this.world = this.engine.world;
        this.world.gravity.y = PHYSICS_CONFIG.gravity;
        this.world.gravity.x = 0;

        this.staticBodies = [];
        this.setupContainerBoundaries();
        this.setupCollisionListener();
    }

    setupContainerBoundaries() {
        const { x, y, width, height, wallThickness } = CONTAINER_CONFIG;
        const halfThick = wallThickness / 2;

        const wallOptions = {
            isStatic: true,
            friction: PHYSICS_CONFIG.friction,
            restitution: PHYSICS_CONFIG.restitution,
            label: 'ContainerWall'
        };

        // Left wall
        const leftWall = Matter.Bodies.rectangle(
            x - halfThick,
            y + height / 2,
            wallThickness,
            height,
            wallOptions
        );

        // Right wall
        const rightWall = Matter.Bodies.rectangle(
            x + width + halfThick,
            y + height / 2,
            wallThickness,
            height,
            wallOptions
        );

        // Floor / bottom wall
        const floor = Matter.Bodies.rectangle(
            x + width / 2,
            y + height + halfThick,
            width + wallThickness * 2,
            wallThickness,
            wallOptions
        );

        this.staticBodies = [leftWall, rightWall, floor];
        Matter.World.add(this.world, this.staticBodies);
    }

    setupCollisionListener() {
        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            const pairs = event.pairs;
            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                const bodyA = pair.bodyA;
                const bodyB = pair.bodyB;

                const fruitA = bodyA.gameFruit || (bodyA.parent && bodyA.parent.gameFruit);
                const fruitB = bodyB.gameFruit || (bodyB.parent && bodyB.parent.gameFruit);

                if (fruitA && fruitB && this.onFruitCollision) {
                    // Calculate contact midpoint
                    let contactX = (bodyA.position.x + bodyB.position.x) / 2;
                    let contactY = (bodyA.position.y + bodyB.position.y) / 2;

                    if (pair.collision && pair.collision.supports && pair.collision.supports.length > 0) {
                        contactX = pair.collision.supports[0].x;
                        contactY = pair.collision.supports[0].y;
                    }

                    this.onFruitCollision(fruitA, fruitB, { x: contactX, y: contactY });
                }
            }
        });
    }

    addBody(body) {
        Matter.World.add(this.world, body);
    }

    removeBody(body) {
        Matter.World.remove(this.world, body);
    }

    update(deltaMs = 1000 / 60) {
        // Step the physics engine with a capped delta for consistent physics
        const cappedDelta = Math.min(deltaMs, 1000 / 30);
        Matter.Engine.update(this.engine, cappedDelta);
    }

    clearDynamicBodies() {
        // Keep static boundaries, remove all fruit bodies
        const allBodies = Matter.Composite.allBodies(this.world);
        const dynamicBodies = allBodies.filter((b) => !b.isStatic);
        dynamicBodies.forEach((b) => Matter.World.remove(this.world, b));
    }
}
