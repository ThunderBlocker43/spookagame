export class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3.5;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed - 1.0;
        this.radius = 3 + Math.random() * 4;
        this.life = 1.0;
        this.decay = 0.03 + Math.random() * 0.02;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.12; // slight gravity
        this.life -= this.decay;
        return this.life > 0;
    }

    render(p) {
        p.push();
        p.noStroke();
        const alpha = Math.max(0, this.life * 255);
        p.fill(this.color);
        p.ellipseMode(p.RADIUS);
        p.ellipse(this.x, this.y, this.radius * this.life, this.radius * this.life);
        p.pop();
    }
}
