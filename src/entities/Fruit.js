import Matter from 'matter-js';
import { FRUIT_TIERS, PHYSICS_CONFIG } from '../config/gameConfig.js';

let nextFruitId = 1;

export class Fruit {
    constructor(tier, x, y, isMergingSpawn = false) {
        this.id = nextFruitId++;
        this.tier = tier;
        this.config = FRUIT_TIERS[tier] || FRUIT_TIERS[0];
        this.isMerged = false;
        this.createdAt = Date.now();

        // Pop animation scale (starts smaller when merged/spawned and pops up)
        this.renderScale = isMergingSpawn ? 0.3 : 0.8;
        this.targetScale = 1.0;

        // Create Matter.js physical body based on data-driven hitbox configuration
        this.spriteOffset = { x: 0, y: 0 };
        this.body = this.createHitboxBody(x, y);
        this.body.gameFruit = this;

        // Ensure all compound parts reference this fruit for merge collisions
        if (this.body.parts && this.body.parts.length > 0) {
            for (let i = 0; i < this.body.parts.length; i++) {
                this.body.parts[i].gameFruit = this;
            }
        }
    }

    createHitboxBody(x, y) {
        const hitbox = this.config.hitbox || { shape: 'circle', radius: this.config.radius };
        const offset = hitbox.offset || { x: 0, y: 0 };
        const scale = hitbox.scale !== undefined ? hitbox.scale : 1.0;
        const r = this.config.radius;

        const bodyOptions = {
            friction: PHYSICS_CONFIG.friction,
            frictionStatic: PHYSICS_CONFIG.frictionStatic,
            frictionAir: PHYSICS_CONFIG.frictionAir,
            restitution: PHYSICS_CONFIG.restitution,
            density: PHYSICS_CONFIG.density,
            label: `Fruit_${this.config.name}_T${this.tier}`
        };

        const posX = x + offset.x;
        const posY = y + offset.y;

        // 1. Exact SVG / contour silhouette polygon geometry
        const svgVertices = this.config.svgVertices || hitbox.svgVertices;
        if (svgVertices && Array.isArray(svgVertices) && svgVertices.length >= 3) {
            const spriteSize = r * 2;
            const scaledVertices = svgVertices.map((v) => ({
                x: v.x * spriteSize * scale,
                y: v.y * spriteSize * scale
            }));

            // Calculate centroid to ensure rendered sprite stays perfectly aligned around center of mass
            const centroid = Matter.Vertices.centre(scaledVertices);
            this.spriteOffset = { x: -centroid.x, y: -centroid.y };

            const body = Matter.Bodies.fromVertices(posX, posY, [scaledVertices], bodyOptions);
            if (body) {
                return body;
            }
        }

        // 2. Custom manual polygon vertices
        if (hitbox.shape === 'polygon' && Array.isArray(hitbox.vertices) && hitbox.vertices.length >= 3) {
            const scaledVertices = hitbox.vertices.map((v) => ({
                x: v.x * scale,
                y: v.y * scale
            }));
            const centroid = Matter.Vertices.centre(scaledVertices);
            this.spriteOffset = { x: -centroid.x, y: -centroid.y };
            return Matter.Bodies.fromVertices(posX, posY, [scaledVertices], bodyOptions);
        } else if (hitbox.shape === 'rectangle') {
            const w = (hitbox.width || r * 2) * scale;
            const h = (hitbox.height || r * 2) * scale;
            return Matter.Bodies.rectangle(posX, posY, w, h, bodyOptions);
        } else {
            // Default to circle hitbox
            const radius = (hitbox.radius || r) * scale;
            return Matter.Bodies.circle(posX, posY, radius, bodyOptions);
        }
    }

    update(dt = 1 / 60) {
        // Smoothly interpolate pop-in animation scale
        if (this.renderScale < this.targetScale) {
            this.renderScale += (this.targetScale - this.renderScale) * (18 * dt);
            if (Math.abs(this.targetScale - this.renderScale) < 0.01) {
                this.renderScale = this.targetScale;
            }
        }
    }

    render(p, showHitbox = false) {
        const pos = this.body.position;
        const angle = this.body.angle;
        const r = this.config.radius;

        p.push();
        p.translate(pos.x, pos.y);
        p.rotate(angle);
        p.scale(this.renderScale);

        // Draw Sprite or Procedural Graphic
        if (this.config.spriteImage) {
            p.imageMode(p.CENTER);
            p.image(this.config.spriteImage, this.spriteOffset.x, this.spriteOffset.y, r * 2, r * 2);
        } else {
            this.renderProceduralFruit(p, r);
        }

        p.pop();

        // Debug Hitbox visualization
        if (showHitbox) {
            this.renderDebugHitbox(p);
        }
    }

    renderProceduralFruit(p, r) {
        p.push();
        p.ellipseMode(p.RADIUS);

        // Main body
        p.noStroke();
        p.fill(this.config.color);
        p.ellipse(0, 0, r, r);

        // Cute highlight gloss
        p.fill(255, 255, 255, 90);
        p.ellipse(-r * 0.35, -r * 0.35, r * 0.3, r * 0.18);

        // Cute Face
        const eyeOffset = r * 0.35;
        const eyeSize = Math.max(2.5, r * 0.12);

        // Eyes
        p.fill(30);
        p.ellipse(-eyeOffset, 0, eyeSize, eyeSize);
        p.ellipse(eyeOffset, 0, eyeSize, eyeSize);

        // Eye reflections
        p.fill(255);
        p.ellipse(-eyeOffset - eyeSize * 0.2, -eyeSize * 0.2, eyeSize * 0.4, eyeSize * 0.4);
        p.ellipse(eyeOffset - eyeSize * 0.2, -eyeSize * 0.2, eyeSize * 0.4, eyeSize * 0.4);

        // Rosy cheeks
        p.fill(255, 100, 100, 110);
        p.ellipse(-eyeOffset - eyeSize * 0.6, eyeSize * 0.8, eyeSize * 0.9, eyeSize * 0.5);
        p.ellipse(eyeOffset + eyeSize * 0.6, eyeSize * 0.8, eyeSize * 0.9, eyeSize * 0.5);

        // Smile
        p.noFill();
        p.stroke(30);
        p.strokeWeight(Math.max(1.2, r * 0.06));
        p.arc(0, eyeSize * 0.2, r * 0.3, r * 0.25, 0.1, Math.PI - 0.1);

        // Leaf / Stem at the top
        p.noStroke();
        p.fill(this.config.leafColor || '#2d6a4f');
        p.ellipse(0, -r * 0.9, r * 0.22, r * 0.12);

        p.pop();
    }

    renderDebugHitbox(p) {
        p.push();
        // Slime green translucent fill with crisp outline
        p.stroke(57, 255, 20, 240);
        p.strokeWeight(1.8);
        p.fill(57, 255, 20, 45);

        // Render each physical collision part (handles decomposed concave compound bodies)
        const parts = this.body.parts && this.body.parts.length > 1
            ? this.body.parts.slice(1)
            : [this.body];

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.vertices && part.vertices.length > 0) {
                p.beginShape();
                for (let j = 0; j < part.vertices.length; j++) {
                    const v = part.vertices[j];
                    p.vertex(v.x, v.y);
                }
                p.endShape(p.CLOSE);
            }
        }

        // Center crosshair (center of mass / rotation pivot)
        p.stroke(255, 50, 80);
        p.strokeWeight(2);
        const pos = this.body.position;
        p.line(pos.x - 4, pos.y, pos.x + 4, pos.y);
        p.line(pos.x, pos.y - 4, pos.x, pos.y + 4);

        p.pop();
    }
}
